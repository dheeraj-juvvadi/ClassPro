import { chromium } from 'playwright';
import { load } from 'cheerio';
import { parseAttendance, parseMarks, parseComponents, PortalError } from './parsers.js';
import { observeLogin } from './login-diagnostics.js';

const ORIGIN = 'https://sp.srmist.edu.in';
const BASE = `${ORIGIN}/srmiststudentportal/`;
const LOGIN = `${BASE}students/loginManager/youLogin.jsp`;
const SHELL = `${BASE}students/template/HRDSystem.jsp`;
let browserPromise;
async function browser() {
  if (!browserPromise) browserPromise = chromium.launch({
    headless: process.env.HEADED !== '1',
    executablePath: process.env.PORTAL_BROWSER_PATH || chromium.executablePath(),
    args: process.env.PORTAL_BROWSER_COMPAT !== '0'
      ? ['--disable-blink-features=AutomationControlled'] : [],
  })
    .then(instance => {
      console.log(JSON.stringify({ event: 'portal_browser_started', version: instance.version(), platform: process.platform, headless: process.env.HEADED !== '1' }));
      return instance;
    })
    .catch(error => { browserPromise = null; throw error; });
  const instance = await browserPromise;
  if (!instance.isConnected()) { browserPromise = null; return browser(); }
  return instance;
}

export class PortalSession {
  authenticated = false;
  cache = null;
  async open() {
    await this.context?.close();
    this.context = await (await browser()).newContext(process.env.PORTAL_TIMEZONE ? { timezoneId: process.env.PORTAL_TIMEZONE } : {});
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(15000);
    this.page.setDefaultNavigationTimeout(30000);
    await this.page.goto(LOGIN, { waitUntil: 'domcontentloaded' });
    await this.page.locator('#login_form').waitFor();
    return this.captcha();
  }
  async refreshChallenge() {
    await this.page.goto(LOGIN, { waitUntil: 'domcontentloaded' });
    await this.page.locator('#login_form').waitFor();
    return this.captcha();
  }
  async captcha() {
    const img = this.page.locator('#secure_captcha');
    await img.waitFor({ state: 'visible' });
    await this.page.waitForFunction(() => {
      const image = document.querySelector('#secure_captcha');
      return image?.complete && image.naturalWidth > 0;
    });
    this.challengeCookies = await this.context.cookies(`${ORIGIN}/srmiststudentportal/LoginServlet`);
    return `data:image/png;base64,${(await img.screenshot()).toString('base64')}`;
  }
  async prepareCaptcha(answer) {
    if (!this.page || this.authenticated) throw new PortalError('SESSION_EXPIRED', 'Load a fresh challenge.', 401);
    const field = this.page.locator('#captcha');
    await field.fill('');
    await field.pressSequentially(answer, { delay: 90 });
  }
  async login(account, password, captcha, log) {
    if (this.authenticated) return { authenticated: true };
    if (!this.page) throw new PortalError('SESSION_EXPIRED', 'Load a fresh CAPTCHA first.', 401);
    const observation = await observeLogin(this.page, {
      account: account.trim().replace(/@srmist\.edu\.in$/i, ''), password, captcha, challengeCookies: this.challengeCookies,
    }, log);
    try {
      const result = await this.submitLogin(account, password, captcha, log);
      await observation.finish(result.authenticated ? 'authenticated' : result.error.code);
      return result;
    } catch (error) {
      await observation.finish(error.name === 'TimeoutError' ? 'timeout' : 'failed');
      throw error;
    } finally { observation.close(); }
  }
  async submitLogin(account, password, captcha, log) {
    if (this.authenticated) return { authenticated: true };
    if (!this.page) throw new PortalError('SESSION_EXPIRED', 'Load a fresh CAPTCHA first.', 401);
    // The portal observes keyboard events when constructing its submission payload.
    // Fill alone changes values without those events. Use the normal typing path.
    for (const [selector, value] of [
      ['#username', account.trim().replace(/@srmist\.edu\.in$/i, '')],
      ['#password', password], ['#captcha', captcha],
    ]) {
      if (selector === '#captcha' && await this.page.locator(selector).inputValue() === value) continue;
      await this.page.locator(selector).fill('');
      await this.page.locator(selector).pressSequentially(value, { delay: 90 });
    }
    const submit = () => Promise.all([
      this.page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      this.page.locator('#btnLogin').click(),
    ]);
    if (process.env.PORTAL_SUBMISSION_TRANSPORT === 'http') {
      const { submitThroughHttp } = await import('./submission-transport.js');
      await submitThroughHttp(this.page, submit, log);
    } else {
      await submit();
    }
    const success = new URL(this.page.url()).origin === ORIGIN
      && await this.page.locator('#userHomePage #hdnFormId').count() > 0
      && await this.page.locator('#login_form').count() === 0;
    if (success) { this.authenticated = true; return { authenticated: true }; }
    if (await this.page.locator('#password').count()) await this.page.locator('#password').fill('');
    const content = (await this.page.locator('body').innerText()).toLowerCase();
    const limited = /concurrent|maximum.*session|session.*limit/.test(content);
    const challenged = /invalid captcha|captcha[^\n]*(?:incorrect|mismatch|invalid)/.test(content);
    const emptyId = /net\s*id should not be empty/.test(content);
    const invalid = /invalid (?:net\s*id|password|credentials)|incorrect password/.test(content);
    const code = limited ? 'SESSION_LIMIT' : challenged ? 'CAPTCHA_INVALID' : emptyId ? 'PORTAL_FORM_REJECTED' : invalid ? 'LOGIN_REJECTED' : 'LOGIN_FAILED';
    const message = limited ? 'Student Portal reported a session limit. Sign out of its other sessions, then retry.'
      : challenged ? 'The CAPTCHA was not accepted. Try the new image.'
      : emptyId ? 'Student Portal rejected the submitted NetID field. The login adapter needs updating.'
      : invalid ? 'Student Portal rejected sign-in with an invalid-credentials message. CAPTCHA acceptance has not been confirmed.'
      : 'Student Portal did not complete sign-in. The cause has not been confirmed.';
    let image;
    try { image = await this.captcha(); } catch { /* Unexpected portal response requires a new login. */ }
    return { authenticated: false, error: { code, message }, ...(image ? { captcha: image } : {}) };
  }
  async report(path, body) {
    const result = await this.page.evaluate(async ({ url, fields }) => {
      const response = await fetch(url, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(fields), signal: AbortSignal.timeout(20000),
      });
      return { status: response.status, html: await response.text(), url: response.url };
    }, { url: `${BASE}students/report/${path}`, fields: body });
    if (result.status === 401 || /youLogin\.jsp|LoginServlet/.test(result.url)
      || load(result.html)('#login_form').length > 0) {
      this.authenticated = false;
      this.cache = null;
      throw new PortalError('SESSION_EXPIRED', 'Your Student Portal session expired. Sign in again.', 401);
    }
    if (result.status !== 200) throw new PortalError('PORTAL_UNAVAILABLE', 'Student Portal could not load this report.', 502);
    return result.html;
  }
  async reports() {
    if (!this.authenticated) throw new PortalError('SESSION_EXPIRED', 'Sign in to Student Portal.', 401);
    if (this.cache && Date.now() - this.cachedAt < 60000) return this.cache;
    // Load a current shell so CSRF fields are refreshed with the same browser session.
    await this.page.goto(SHELL, { waitUntil: 'domcontentloaded' });
    if (await this.page.locator('#login_form').count() || !await this.page.locator('#userHomePage').count()) {
      this.authenticated = false;
      this.cache = null;
      throw new PortalError('SESSION_EXPIRED', 'Your session expired. Sign in again.', 401);
    }
    const fields = await this.page.evaluate(() => ({
      filter: '', hdnFormDetails: document.querySelector('#hdnFormDetails')?.value,
      csrfPreventionSalt: document.querySelector('#csrfPreventionSalt')?.value,
    }));
    // The live portal can render an empty salt and submit it successfully.
    // Preserve that value, but reject a missing element/layout change.
    if (!fields.hdnFormDetails || typeof fields.csrfPreventionSalt !== 'string') {
      throw new PortalError('PORTAL_CHANGED', 'Student Portal changed its report form. Please try again later.', 502);
    }
    const result = { attendance: { data: [] }, marks: { data: [] }, updatedAt: new Date().toISOString() };
    for (const [name, id, file, parse] of [
      ['attendance', '9', 'studentAttendanceDetails.jsp', parseAttendance],
      ['marks', '13', 'studentInternalMarkDetails.jsp', parseMarks],
    ]) {
      try {
        result[name].data = parse(await this.report(file, { ...fields, iden: id }));
      } catch (error) {
        if (error.code === 'SESSION_EXPIRED') throw error;
        result[name].error = { code: error.code || 'PORTAL_UNAVAILABLE', message: error.code ? error.message : 'Student Portal could not load this report. Try again.' };
      }
    }
    for (const mark of result.marks.data) {
      mark.components = [];
      if (!mark.subjectId || mark.detailStatus === null) {
        mark.detailsError = 'No assessment breakdown is published for this course.';
        delete mark.subjectId;
        delete mark.detailStatus;
        continue;
      }
      try {
        mark.components = parseComponents(await this.report('studentInternalMarkDetailsInner.jsp', {
          iden: '1', hdnSubjectId: mark.subjectId, status: mark.detailStatus,
        }));
      } catch (error) {
        if (error.code === 'SESSION_EXPIRED') throw error;
        mark.detailsError = 'Assessment details are temporarily unavailable.';
      }
      delete mark.subjectId;
      delete mark.detailStatus;
    }
    // Partial failures can be retried immediately; cache only a complete fetch.
    if (!result.attendance.error && !result.marks.error && !result.marks.data.some(m => m.detailsError)) {
      this.cache = result;
      this.cachedAt = Date.now();
    }
    return result;
  }
  async close() {
    this.challengeCookies = null;
    this.authenticated = false;
    this.cache = null;
    await this.context?.close();
  }
}

export async function closeBrowser() {
  if (browserPromise) await (await browserPromise).close();
  browserPromise = null;
}
