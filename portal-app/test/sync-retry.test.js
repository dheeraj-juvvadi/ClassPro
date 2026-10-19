import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

const EXAM = () => ({ entries: [{ code: 'SYN1', title: 'Sample course', date: '2026-11-20',
  session: 'FN', period: '11_2026', periodLabel: 'Nov 2026', provisional: true }],
  stale: false, checkedAt: new Date().toISOString(), source: 'Student Portal' });

const base = t0 => ({ updatedAt: new Date(t0).toISOString(),
  attendance: { data: [{ code: 'SYN1', title: 'Sample course', present: 9, conducted: 10, percent: 90 }] },
  marks: { data: [] }, schedule: { entries: [] }, courses: {}, connections: { portal: { connected: true } },
  exams: EXAM(), warnings: [] });

async function boot() {
  const app = express();
  app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url))));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(6000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const current = Date.now();
  const cached = { ...base(current), syncedAt: current - 60000,
    sync: { syncedAt: current - 60000, nextAt: current + 3600000, due: false,
      retry: { id: 'cyc-1', pending: true, at: current + 120000, sources: ['portal'], exhausted: false },
      examRetry: null } };
  await page.addInitScript(data => {
    localStorage.setItem('anon-reports-cache', JSON.stringify(data));
    localStorage.setItem('anon.consent.v1', 'declined');
    localStorage.setItem('anon.analytics-choice.v1', 'decline');
  }, cached);
  await page.clock.install();
  // Freezes both the clock and the timers; deadlines below are derived from
  // the page's frozen Date.now() so runFor advances are deterministic.
  await page.clock.pauseAt(new Date(Date.now() + 100));
  return { server, browser, page, errors, origin };
}

const retryUrls = urls => urls.filter(url => /\?retry=/.test(url));

test('deadline retry fires once after 60s, exhaustion never loops, never touches exams', { timeout: 45000 }, async context => {
  const tracked = { reports: 'armed' };
  const { server, browser, page, errors, origin } = await boot();
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); browser.close(); }));
  // Frozen page time; all deadlines hang off it so runFor is deterministic.
  const at = (await page.evaluate(() => Date.now())) + 60000;
  const reportSync = () => tracked.reports === 'armed'
    ? { retry: { id: 'cyc-1', pending: true, at, sources: ['portal'], exhausted: false }, examRetry: null }
    : tracked.reports === 'recovered' ? { retry: null, examRetry: null }
      : { retry: { id: 'cyc-1', pending: false, at, sources: ['portal'], exhausted: true }, examRetry: null };
  const reportURLs = [], examURLs = [];
  await page.route('**/api/session', route => route.fulfill({ json: { authenticated: true, authMode: 'http' } }));
  await page.route('**/api/reports*', route => {
    reportURLs.push(route.request().url());
    return route.fulfill({ json: { ...base(at - 1000),
      sync: { syncedAt: at - 1000, nextAt: at + 3600000, due: false, ...reportSync() } } });
  });
  await page.route('**/api/exams*', route => {
    examURLs.push(route.request().url());
    return route.fulfill({ json: { exams: EXAM(), connections: { portal: { connected: true } }, retry: null } });
  });
  await page.goto(`${origin}/#attendance`);
  await page.waitForFunction(() => authenticated && !busy && !reportLoad);
  const label = () => page.evaluate(() => document.getElementById('sync-notice-label').textContent);
  await page.waitForFunction(() => document.getElementById('sync-notice-label').textContent ===
    'Retrying Student Portal in 1 minute…');
  // Pending metadata means armed, not syncing: Sync is not disabled.
  // 59 seconds: not yet.
  await page.clock.runFor(58900);
  assert.equal(await page.locator('#refresh').isDisabled(), false, 'Sync stays enabled during cooldown');
  assert.equal(retryUrls(reportURLs).length, 0);
  assert.equal(await label(), 'Retrying Student Portal in 1 minute…');
  // At/after the deadline: exactly one Portal retry, source-filtered.
  const portalRetry = page.waitForRequest('**/api/reports?retry=cyc-1&wait=1');
  tracked.reports = 'recovered';
  await page.clock.runFor(4000);
  const portalRequest = await portalRetry;
  await page.waitForTimeout(50);
  assert.equal(new URL(portalRequest.url()).searchParams.get('wait'), '1');
  assert.equal(retryUrls(reportURLs).length, 1);
  await page.waitForFunction(() => readReportsCache()?.exams?.entries?.[0]?.date === '2026-11-20');
  await page.clock.runFor(6000);
  await page.waitForFunction(() => document.getElementById('sync-notice').hidden);
  assert.equal(examURLs.length, 0, 'report syncs and retries never fetch exams');
  // Second failure: source-specific exhaustion, and no more retries for minutes.
  tracked.reports = 'exhausted';
  await page.evaluate(() => loadReports({ silent: true }));
  await page.waitForFunction(() => document.getElementById('sync-notice').dataset.state === 'error');
  assert.equal(await label(), 'Student Portal retry didn’t recover · will try again at the next scheduled sync.');
  await page.clock.runFor(420000);
  assert.equal(retryUrls(reportURLs).length, 1, 'no repeated retry after exhaustion');
  assert.equal(examURLs.length, 0, 'no exam traffic at any point');
  assert.deepEqual(errors, []);
});

test('offline defers the retry, coming online resumes it, logout cancels pending metadata', { timeout: 45000 }, async context => {
  const tracked = { reports: 'armed' };
  const { server, browser, page, errors, origin } = await boot();
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); browser.close(); }));
  const at = (await page.evaluate(() => Date.now())) + 60000;
  const reportSync = () => tracked.reports === 'armed'
    ? { retry: { id: 'cyc-1', pending: true, at, sources: ['portal'], exhausted: false }, examRetry: null }
    : { retry: null, examRetry: null };
  const reportURLs = [], examURLs = [];
  await page.route('**/api/session', route => route.fulfill({ json: { authenticated: true, authMode: 'http' } }));
  await page.route('**/api/reports*', route => {
    reportURLs.push(route.request().url());
    return route.fulfill({ json: { ...base(at - 1000),
      sync: { syncedAt: at - 1000, nextAt: at + 3600000, due: false, ...reportSync() } } });
  });
  await page.route('**/api/exams*', route => {
    examURLs.push(route.request().url());
    return route.fulfill({ json: { exams: EXAM(), connections: { portal: { connected: true } }, retry: null } });
  });
  await page.goto(`${origin}/#attendance`);
  await page.waitForFunction(() => authenticated && !busy && !reportLoad);
  // Offline at every tick past the deadline: no retry request, notice stays.
  await page.context().setOffline(true);
  await page.clock.runFor(61000);
  assert.equal(retryUrls(reportURLs).length, 0, 'deferred while offline');
  assert.match(await page.locator('#sync-notice-label').innerText(), /Retrying/);
  // Back online: the first tick resumes the one allowance — still source-specific.
  const retried = page.waitForRequest('**/api/reports?retry=cyc-1&wait=1');
  tracked.reports = 'recovered';
  await page.context().setOffline(false);
  const onlineRequest = await retried;
  await page.waitForTimeout(50);
  assert.equal(retryUrls(reportURLs).length, 1, 'exactly one retry consumed');
  assert.equal(new URL(onlineRequest.url()).searchParams.get('force'), null, 'retry never uses force');
  // Recovery response clears the notice once outcomes settle.
  await page.clock.runFor(6000);
  await page.waitForFunction(() => document.getElementById('sync-notice').hidden);
  // Logout resets deadlines and generation: nothing may retry after sign-out.
  await page.evaluate(() => { clearReportsCache(); showLogin(); });
  const before = retryUrls(reportURLs).length + retryUrls(examURLs).length;
  await page.context().setOffline(false);
  await page.clock.runFor(120000);
  await page.waitForTimeout(50);
  assert.equal(retryUrls(reportURLs).length + retryUrls(examURLs).length, before, 'no retry traffic after logout');
  assert.equal(retryUrls(examURLs).length, 0);
  assert.deepEqual(errors, []);
});

test('hidden tab defers the retry, focus resumes it without a duplicate', { timeout: 45000 }, async context => {
  const tracked = { reports: 'armed' };
  const { server, browser, page, errors, origin } = await boot();
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); browser.close(); }));
  const at = (await page.evaluate(() => Date.now())) + 60000;
  const reportSync = () => tracked.reports === 'armed'
    ? { retry: { id: 'cyc-1', pending: true, at, sources: ['portal'], exhausted: false }, examRetry: null }
    : { retry: null, examRetry: null };
  const reportURLs = [];
  await page.route('**/api/session', route => route.fulfill({ json: { authenticated: true, authMode: 'http' } }));
  await page.route('**/api/reports*', route => {
    reportURLs.push(route.request().url());
    return route.fulfill({ json: { ...base(at - 1000),
      sync: { syncedAt: at - 1000, nextAt: at + 3600000, due: false, ...reportSync() } } });
  });
  await page.route('**/api/exams*', route => route.fulfill({ json: { exams: EXAM(),
    connections: { portal: { connected: true } }, retry: null } }));
  await page.goto(`${origin}/#attendance`);
  await page.waitForFunction(() => authenticated && !busy && !reportLoad);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.runFor(61000);
  assert.equal(retryUrls(reportURLs).length, 0, 'deferred while hidden');
  assert.match(await page.locator('#sync-notice-label').innerText(), /Retrying/);
  // Visible again: a focus event alone resumes the one allowance.
  const retried = page.waitForRequest('**/api/reports?retry=cyc-1&wait=1');
  tracked.reports = 'recovered';
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    window.dispatchEvent(new Event('focus'));
  });
  await retried;
  await page.waitForTimeout(50);
  assert.equal(retryUrls(reportURLs).length, 1, 'exactly one retry consumed');
  await page.clock.runFor(180000);
  assert.equal(retryUrls(reportURLs).length, 1, 'settled ID is never reused');
  assert.deepEqual(errors, []);
});

test('settled same-ID metadata wins and the consumed ID is never reused', { timeout: 45000 }, async context => {
  const tracked = { reports: 'armed' };
  const { server, browser, page, errors, origin } = await boot();
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); browser.close(); }));
  const at = (await page.evaluate(() => Date.now())) + 60000;
  const reportURLs = [];
  await page.route('**/api/session', route => route.fulfill({ json: { authenticated: true, authMode: 'http' } }));
  await page.route('**/api/reports*', route => {
    reportURLs.push(route.request().url());
    if (/\?retry=/.test(route.request().url())) tracked.reports = 'exhausted';
    const retry = tracked.reports === 'armed'
      ? { id: 'cyc-1', pending: true, at, sources: ['portal'], exhausted: false }
      : { id: 'cyc-1', pending: false, at, sources: ['portal'], exhausted: true };
    return route.fulfill({ json: { ...base(at - 1000),
      sync: { syncedAt: at - 1000, nextAt: at + 3600000, due: false, retry, examRetry: null } } });
  });
  await page.route('**/api/exams*', route => route.fulfill({ json: { exams: EXAM(),
    connections: { portal: { connected: true } }, retry: null } }));
  await page.goto(`${origin}/#attendance`);
  await page.waitForFunction(() => authenticated && !busy && !reportLoad);
  // The deadline fires the one allowance; the attempt fails and the server
  // settles the SAME id as exhausted. Server truth must win over the armed
  // copy the browser still holds.
  const retried = page.waitForRequest('**/api/reports?retry=cyc-1&wait=1');
  await page.clock.runFor(61000);
  await retried;
  await page.waitForFunction(() => document.getElementById('sync-notice').dataset.state === 'error');
  assert.equal(retryUrls(reportURLs).length, 1);
  assert.equal(await page.locator('#sync-notice-label').innerText(),
    'Student Portal retry didn’t recover · will try again at the next scheduled sync.');
  await page.clock.runFor(300000);
  assert.equal(retryUrls(reportURLs).length, 1, 'consumed ID is never reused');
  assert.deepEqual(errors, []);
});

test('failed retry request backs off, then recovers without further traffic', { timeout: 45000 }, async context => {
  const tracked = { attempts: 0 };
  const { server, browser, page, errors, origin } = await boot();
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); browser.close(); }));
  const at = (await page.evaluate(() => Date.now())) + 60000;
  const reportURLs = [];
  await page.route('**/api/session', route => route.fulfill({ json: { authenticated: true, authMode: 'http' } }));
  await page.route('**/api/reports*', route => {
    reportURLs.push(route.request().url());
    if (/\?retry=/.test(route.request().url())) {
      tracked.attempts++;
      // The first attempt never gets a response; the allowance may still
      // have been consumed server-side. Only later metadata settles that.
      if (tracked.attempts === 1) return route.abort('failed');
      return route.fulfill({ json: { ...base(at - 1000),
        sync: { syncedAt: at - 1000, nextAt: at + 3600000, due: false, retry: null, examRetry: null } } });
    }
    return route.fulfill({ json: { ...base(at - 1000), sync: { syncedAt: at - 1000,
      nextAt: at + 3600000, due: false,
      retry: { id: 'cyc-1', pending: true, at, sources: ['portal'], exhausted: false }, examRetry: null } } });
  });
  await page.route('**/api/exams*', route => route.fulfill({ json: { exams: EXAM(),
    connections: { portal: { connected: true } }, retry: null } }));
  await page.goto(`${origin}/#attendance`);
  await page.waitForFunction(() => authenticated && !busy && !reportLoad);
  const first = page.waitForRequest('**/api/reports?retry=cyc-1&wait=1');
  await page.clock.runFor(61000);
  await first;
  await page.waitForTimeout(200);
  assert.equal(retryUrls(reportURLs).length, 1);
  const ordinary = () => reportURLs.filter(url => !/\?retry=/.test(url)).length;
  const ordinaryBefore = ordinary();
  // Inside the 120s backoff the same deadline must not spin.
  await page.clock.runFor(100000);
  await page.waitForTimeout(100);
  assert.equal(retryUrls(reportURLs).length, 1, 'no spin while backing off');
  assert.equal(ordinary(), ordinaryBefore, 'no ordinary sync inside retry backoff');
  const second = page.waitForRequest('**/api/reports?retry=cyc-1&wait=1');
  await page.clock.runFor(40000);
  await second;
  await page.waitForTimeout(100);
  assert.equal(retryUrls(reportURLs).length, 2, 'one attempt after backoff');
  await page.clock.runFor(180000);
  assert.equal(retryUrls(reportURLs).length, 2, 'settled ID is never reused');
  await page.waitForFunction(() => document.getElementById('sync-notice').hidden);
  assert.deepEqual(errors, []);
});

test('stale Endsem warning is filtered from report feedback and cache', { timeout: 45000 }, async context => {
  const { server, browser, page, errors, origin } = await boot();
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); browser.close(); }));
  const at = (await page.evaluate(() => Date.now())) + 60000;
  const examURLs = [];
  await page.route('**/api/session', route => route.fulfill({ json: { authenticated: true, authMode: 'http' } }));
  await page.route('**/api/reports*', route => route.fulfill({ json: { ...base(at - 1000),
    warnings: ['Endsem dates could not refresh. Open Endsem dates to retry.'],
    sync: { syncedAt: at - 1000, nextAt: at + 3600000, due: false, retry: null, examRetry: null } } }));
  await page.route('**/api/exams*', route => {
    examURLs.push(route.request().url());
    return route.fulfill({ json: { exams: EXAM(), connections: { portal: { connected: true } }, retry: null } });
  });
  await page.goto(`${origin}/#attendance`);
  await page.waitForFunction(() => authenticated && !busy && !reportLoad);
  await page.waitForFunction(() => readReportsCache()?.exams?.entries?.[0]?.date === '2026-11-20');
  assert.deepEqual(await page.evaluate(() => readReportsCache().warnings), [],
    'historical exam warning never enters the cache');
  await page.clock.runFor(6000);
  await page.waitForFunction(() => document.getElementById('sync-notice').hidden);
  assert.equal(examURLs.length, 0, 'filtered warning triggers no exam fetch');
  assert.deepEqual(errors, []);
});

test('stale examRetry metadata is ignored; no Endsem notice or traffic', { timeout: 45000 }, async context => {
  const { server, browser, page, errors, origin } = await boot();
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); browser.close(); }));
  const at = (await page.evaluate(() => Date.now())) + 60000;
  const examURLs = [];
  const staleExam = { id: 'old-e', pending: true, at, sources: ['exams'], exhausted: false };
  await page.route('**/api/session', route => route.fulfill({ json: { authenticated: true, authMode: 'http' } }));
  await page.route('**/api/reports*', route => route.fulfill({ json: { ...base(at - 1000),
    sync: { syncedAt: at - 1000, nextAt: at + 3600000, due: false, retry: null, examRetry: staleExam } } }));
  await page.route('**/api/exams*', route => {
    examURLs.push(route.request().url());
    return route.fulfill({ json: { exams: EXAM(), connections: { portal: { connected: true } }, retry: null } });
  });
  await page.goto(`${origin}/#attendance`);
  await page.waitForFunction(() => authenticated && !busy && !reportLoad);
  await page.clock.runFor(120000);
  await page.waitForTimeout(100);
  assert.equal(examURLs.length, 0, 'stale exam metadata schedules nothing');
  assert.equal(await page.evaluate(() => document.getElementById('sync-notice').hidden), true);
  assert.doesNotMatch(await page.evaluate(() => document.getElementById('sync-notice-label').textContent), /Endsem/);
  assert.deepEqual(errors, []);
});

test('manual Sync ignores examRetry metadata and never fetches exams', { timeout: 45000 }, async context => {
  const { server, browser, page, errors, origin } = await boot();
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); browser.close(); }));
  const at = (await page.evaluate(() => Date.now())) + 60000;
  const staleExam = { id: 'old-e', pending: true, at, sources: ['exams'], exhausted: false };
  const examURLs = [];
  await page.route('**/api/session', route => route.fulfill({ json: { authenticated: true, authMode: 'http' } }));
  await page.route('**/api/reports*', route => route.fulfill({ json: { ...base(at - 1000),
    sync: { syncedAt: at - 1000, nextAt: at + 3600000, due: false, retry: null, examRetry: staleExam } } }));
  await page.route('**/api/exams*', route => {
    examURLs.push(route.request().url());
    return route.fulfill({ json: { exams: EXAM(), connections: { portal: { connected: true } }, retry: null } });
  });
  await page.goto(`${origin}/#attendance`);
  await page.waitForFunction(() => authenticated && !busy && !reportLoad);
  await page.evaluate(() => loadReports({ force: true }));
  await page.waitForTimeout(100);
  assert.equal(examURLs.length, 0, 'manual sync never fetches exams');
  assert.equal(await page.evaluate(() => readReportsCache()?.exams?.entries?.[0]?.date), '2026-11-20',
    'saved dates bundled in reports remain');
  assert.doesNotMatch(await page.evaluate(() => document.getElementById('sync-notice-label').textContent), /Endsem/);
  assert.deepEqual(errors, []);
});

test('busy queue followup preserves the retry instead of forcing a full cycle', { timeout: 45000 }, async context => {
  const tracked = { retries: 0 };
  const { server, browser, page, errors, origin } = await boot();
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); browser.close(); }));
  const at = (await page.evaluate(() => Date.now())) + 60000;
  const armed = { id: 'cyc-1', pending: true, at, sources: ['portal'], exhausted: false };
  const reportURLs = [];
  await page.route('**/api/session', route => route.fulfill({ json: { authenticated: true, authMode: 'http' } }));
  await page.route('**/api/reports*', route => {
    const url = route.request().url();
    reportURLs.push(url);
    if (/\?retry=/.test(url)) {
      tracked.retries++;
      if (tracked.retries === 1) {
        return route.fulfill({ json: { ...base(at - 1000), sync: { syncedAt: at - 1000,
          nextAt: at + 5000, due: false, retry: armed, examRetry: null,
          pending: true, state: 'busy', waitForCompletion: false } } });
      }
      return route.fulfill({ json: { ...base(at - 1000),
        sync: { syncedAt: at - 1000, nextAt: at + 3600000, due: false, retry: null, examRetry: null } } });
    }
    return route.fulfill({ json: { ...base(at - 1000),
      sync: { syncedAt: at - 1000, nextAt: at + 3600000, due: false, retry: armed, examRetry: null } } });
  });
  await page.route('**/api/exams*', route => route.fulfill({ json: { exams: EXAM(),
    connections: { portal: { connected: true } }, retry: null } }));
  await page.goto(`${origin}/#attendance`);
  await page.waitForFunction(() => authenticated && !busy && !reportLoad);
  const first = page.waitForRequest('**/api/reports?retry=cyc-1&wait=1');
  await page.clock.runFor(61000);
  await first;
  const second = page.waitForRequest('**/api/reports?retry=cyc-1&wait=1');
  await page.clock.runFor(15000);
  await second;
  await page.waitForTimeout(100);
  assert.equal(retryUrls(reportURLs).length, 2, 'followup re-issues the retry');
  assert.equal(new URL(retryUrls(reportURLs)[1]).searchParams.get('retry'), 'cyc-1');
  assert.equal(reportURLs.some(url => url.includes('force=1')), false, 'busy followup never forces a full cycle');
  await page.clock.runFor(180000);
  assert.equal(retryUrls(reportURLs).length, 2, 'settled ID is never reused');
  await page.waitForFunction(() => document.getElementById('sync-notice').hidden);
  assert.deepEqual(errors, []);
});

test('exhausted report retry never mentions Endsem dates', { timeout: 45000 }, async context => {
  const { server, browser, page, errors, origin } = await boot();
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); browser.close(); }));
  const at = (await page.evaluate(() => Date.now())) + 60000;
  const examURLs = [];
  await page.route('**/api/session', route => route.fulfill({ json: { authenticated: true, authMode: 'http' } }));
  await page.route('**/api/reports*', route => route.fulfill({ json: { ...base(at - 1000),
    warnings: ['Endsem dates could not refresh. Open Endsem dates to retry.'],
    sync: { syncedAt: at - 1000, nextAt: at + 3600000, due: false, examRetry: null,
      retry: { id: 'cyc-1', pending: false, at, sources: ['portal'], exhausted: true } } } }));
  await page.route('**/api/exams*', route => {
    examURLs.push(route.request().url());
    return route.fulfill({ json: { exams: EXAM(), connections: { portal: { connected: true } }, retry: null } });
  });
  await page.goto(`${origin}/#attendance`);
  await page.waitForFunction(() => authenticated && !busy && !reportLoad);
  await page.waitForFunction(() => document.getElementById('sync-notice').dataset.state === 'error');
  assert.equal(await page.locator('#sync-notice-label').innerText(),
    'Student Portal retry didn’t recover · will try again at the next scheduled sync.');
  await page.clock.runFor(180000);
  assert.equal(examURLs.length, 0, 'exhaustion schedules no exam traffic');
  assert.deepEqual(errors, []);
});
