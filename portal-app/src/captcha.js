import sharp from 'sharp';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PortalError } from './parsers.js';
import { recognizeWithModel } from './ocr-worker.js';

const exec = promisify(execFile);

// Conservative heuristic thresholds, not calibrated. They deliberately favour
// refusing a challenge over submitting a guess: an answer must be produced by
// MIN_VOTES recognition variants and carry a finite mean confidence of at least
// MIN_CONFIDENCE. One lucky high-confidence misread is not enough.
export const MIN_VOTES = 2;
export const MIN_CONFIDENCE = 65;

// Picks the best corroborated candidate regardless of where it sits in the
// input order, so an ineligible high-vote guess cannot shadow an eligible one.
// Returns null when nothing clears the thresholds.
export function selectCandidate(candidates) {
  const eligible = (Array.isArray(candidates) ? candidates : [])
    .filter(candidate => candidate
      && Number.isFinite(candidate.confidence)
      && /^[A-Za-z0-9]{4,8}$/.test(candidate.answer)
      && (candidate.engine === 'ddddocr'
        ? candidate.confidence >= 90 && Number.isFinite(candidate.minCharConfidence) && candidate.minCharConfidence >= 80
        : candidate.confidence >= MIN_CONFIDENCE && candidate.votes >= MIN_VOTES))
    .sort((a, b) => (b.votes || 0) - (a.votes || 0)
      || b.confidence - a.confidence
      || (a.answer < b.answer ? -1 : a.answer > b.answer ? 1 : 0));
  return eligible[0] || null;
}

// All recognition is local. Never send login images or credentials to third parties.
export async function recognizeCaptcha(image) {
  if (process.env.PORTAL_OCR_ENGINE !== 'tesseract') return recognizeWithModel(image);
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'portal-ocr-')));
  const input = Buffer.from(image.replace(/^data:image\/[^;]+;base64,/, ''), 'base64');
  const votes = new Map();
  try {
    for (const [variant, threshold] of [['gray', null], ['binary', 150]]) {
      let pipeline = sharp(input).flatten({ background: '#fff' }).resize({ width: 875 }).grayscale().normalize();
      if (threshold !== null) pipeline = pipeline.threshold(threshold);
      const file = join(dir, `${variant}.png`);
      await writeFile(file, await pipeline.png().toBuffer(), { mode: 0o600 });
      for (const mode of ['7', '8', '13']) {
        const { stdout } = await exec(process.env.TESSERACT_PATH || 'tesseract', [
          file, 'stdout', '--psm', mode, '-c', 'tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 'tsv',
        ], { timeout: 10000, maxBuffer: 128000 });
        const words = stdout.trim().split('\n').slice(1).map(line => line.split('\t'))
          .filter(parts => parts[0] === '5' && parts[11]?.trim());
        const answer = words.map(parts => parts[11].trim()).join('');
        if (!/^[A-Za-z0-9]{4,8}$/.test(answer)) continue;
        const confidence = words.reduce((sum, parts) => sum + Math.max(0, Number(parts[10]) || 0), 0) / words.length;
        const entry = votes.get(answer) || { answer, votes: 0, confidenceSum: 0, confidence: 0 };
        entry.votes++;
        entry.confidenceSum += confidence;
        entry.confidence = entry.confidenceSum / entry.votes;
        votes.set(answer, entry);
      }
    }
    const candidates = [...votes.values()].sort((a, b) => b.votes - a.votes || b.confidence - a.confidence);
    if (!candidates.length) throw new PortalError('CAPTCHA_UNREADABLE', 'Could not read this challenge. Please retry.', 422);
    return candidates;
  } catch (error) {
    if (error.code === 'ENOENT') throw new PortalError('OCR_UNAVAILABLE', 'The backend OCR engine is not installed.', 503);
    throw error;
  } finally { await rm(dir, { recursive: true, force: true }); }
}
