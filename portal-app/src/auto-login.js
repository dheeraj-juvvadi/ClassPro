import { recognizeCaptcha, selectCandidate } from './captcha.js';

// Retry challenges only. Password/unknown failures must never cause a retry loop.
export async function autoLogin(portal, account, password, solve = recognizeCaptcha) {
  const started = performance.now();
  if (portal.authenticated) return { authenticated: true, reused: true };
  for (let attempt = 1; attempt <= 2; attempt++) {
    const image = attempt === 1 ? await portal.open() : await portal.refreshChallenge();
    let candidates;
    try { candidates = await solve(image); }
    catch (error) {
      if (error.code !== 'CAPTCHA_UNREADABLE') throw error;
      if (attempt < 2) continue;
      return { authenticated: false, error: { code: 'CHALLENGE_FAILED', message: 'Automatic verification could not read the portal challenge. Please retry.' } };
    }
    const candidate = selectCandidate(candidates);
    if (!candidate) {
      if (attempt < 2) continue;
      return { authenticated: false, error: { code: 'CHALLENGE_FAILED', message: 'Automatic verification could not confidently read the portal challenge. Please retry.' } };
    }
    const result = await portal.login(account, password, candidate.answer);
    if (result.authenticated) return { authenticated: true, elapsedMs: Math.round(performance.now() - started) };
    if (result.error?.code !== 'CAPTCHA_INVALID' || attempt === 2) {
      return { authenticated: false, error: result.error || { code: 'LOGIN_FAILED', message: 'Student Portal could not complete sign-in.' } };
    }
  }
}
