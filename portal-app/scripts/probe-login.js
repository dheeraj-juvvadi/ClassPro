import { readFile, writeFile } from 'node:fs/promises';
import { PortalSession, closeBrowser } from '../src/portal.js';
import { recognizeCaptcha, selectCandidate } from '../src/captcha.js';
import { closeOcrWorker } from '../src/ocr-worker.js';

const session = new PortalSession();
try {
  const image = await session.open();
  await writeFile('/tmp/classpro-live-captcha.png', Buffer.from(image.split(',')[1], 'base64'), { mode: 0o600 });
  const candidates = await recognizeCaptcha(image);
  console.log(JSON.stringify({ stage: 'recognition', candidates: candidates.map(c => ({ length: c.answer.length, votes: c.votes, confidence: c.confidence })) }));
  if (process.env.TRY_LOGIN !== '1') process.exitCode = 2;
  else {
    const dir = process.env.PORTAL_TEST_CREDENTIAL_DIR;
    if (!dir) throw new Error('Credential directory required');
    const account = (await readFile(`${dir}/account.txt`, 'utf8')).trim();
    const password = await readFile(`${dir}/password.txt`, 'utf8');
    const candidate = selectCandidate(candidates);
    if (!candidate) throw new Error('CAPTCHA did not meet recognition thresholds');
    const result = await session.login(account, password, candidate.answer);
    console.log(JSON.stringify({ stage: 'login', authenticated: result.authenticated, error: result.error, path: new URL(session.page.url()).pathname }));
    if (result.authenticated) {
      const reports = await session.reports();
      console.log(JSON.stringify({ stage: 'reports', attendance: reports.attendance.data.length, marks: reports.marks.data.length,
        components: reports.marks.data.map(m => m.components.length), errors: [reports.attendance.error, reports.marks.error] }));
    }
  }
} catch (error) { console.log(JSON.stringify({ error: error.code || error.name, message: error.message.slice(0,400) })); process.exitCode = 1; }
finally { closeOcrWorker(); await session.close(); await closeBrowser(); }
