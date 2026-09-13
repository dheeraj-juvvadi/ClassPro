import test from 'node:test';
import assert from 'node:assert/strict';
import { PortalSession } from '../src/portal.js';
import { PortalError } from '../src/parsers.js';

const base = 'https://sp.srmist.edu.in/srmiststudentportal/';
const shell = `${base}students/template/HRDSystem.jsp`;
const attendanceFile = 'studentAttendanceDetails.jsp';
const marksFile = 'studentInternalMarkDetails.jsp';
const detailsFile = 'studentInternalMarkDetailsInner.jsp';
const fields = { filter: '', hdnFormDetails: 'synthetic-form', csrfPreventionSalt: 'synthetic-salt' };
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
const table = (headers, rows = []) => `<table><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</table>`;
const attendance = table(['Code', 'Description', 'Max. hours', 'Att. hours', 'Absent hours', 'Total Percentage'], [['SYN101', 'Synthetic Logic', '20', '15', '5', '75%']]);
const marks = (rows = []) => table(['Code', 'Description', 'Mark / Max. Mark', 'Details'], rows);
const markRow = (status = 17, subject = '123') => ['SYN101', 'Synthetic Logic', '18 / 20', `<button onclick="${escape(`funViewComponentWiseMarks('${subject}','SYN101','Synthetic Logic',${status})`)}">View</button>`];
const components = table(['Entered on', 'Component', 'Mark / Max. Mark'], [['01 Jan 2000', 'Synthetic Quiz', '18 / 20']]);
const attendanceDTO = [{ code: 'SYN101', title: 'Synthetic Logic', conducted: 20, present: 15, absent: 5, percentage: 75 }];
const componentDTO = [{ name: 'Synthetic Quiz', enteredOn: '01 Jan 2000', scored: 18, total: 20 }];
const response = (html, extra = {}) => ({ status: 200, html, ...extra });

// Never open a browser or execute a fetch: every page response is controlled here.
function fixture(responses, options = {}) {
  const session = new PortalSession();
  const calls = [];
  let cursor = 0;
  session.authenticated = true;
  session.page = {
    async goto(url, config) { calls.push({ kind: 'goto', url, config }); },
    locator(selector) {
      assert.ok(['#login_form', '#userHomePage'].includes(selector));
      return { async count() { return selector === '#login_form' ? Number(options.loginForm || false) : Number(options.home !== false); } };
    },
    async evaluate(callback, args) {
      assert.equal(typeof callback, 'function');
      if (args === undefined) {
        calls.push({ kind: 'fields' });
        return { ...(options.fields || fields) };
      }
      calls.push({ kind: 'report', ...args });
      assert.ok(cursor < responses.length, 'Unexpected report request');
      const next = responses[cursor++];
      if (next instanceof Error) throw next;
      return { url: args.url, ...next };
    },
  };
  return { session, calls, requests: () => calls.filter(call => call.kind === 'report'), consumed: () => cursor };
}
const request = (file, data) => ({ kind: 'report', url: `${base}students/report/${file}`, fields: data });
const expired = error => error instanceof PortalError && error.code === 'SESSION_EXPIRED' && error.status === 401;

test('assembles the report DTO using iden 9, 13, then each numeric detail status', async () => {
  const f = fixture([response(attendance), response(marks([markRow(0), markRow(17, '456')])), response(components), response(components)]);
  const result = await f.session.reports();
  assert.deepEqual(f.calls, [
    { kind: 'goto', url: shell, config: { waitUntil: 'domcontentloaded' } },
    { kind: 'fields' },
    request(attendanceFile, { ...fields, iden: '9' }),
    request(marksFile, { ...fields, iden: '13' }),
    request(detailsFile, { iden: '1', hdnSubjectId: '123', status: '0' }),
    request(detailsFile, { iden: '1', hdnSubjectId: '456', status: '17' }),
  ]);
  const markDTO = { code: 'SYN101', title: 'Synthetic Logic', scored: 18, total: 20, components: componentDTO };
  assert.deepEqual(result, { attendance: { data: attendanceDTO }, marks: { data: [markDTO, markDTO] }, updatedAt: result.updatedAt });
  assert.equal(new Date(result.updatedAt).toISOString(), result.updatedAt);
  assert.equal(f.consumed(), 4);
});

test('attendance failure preserves marks and details and is retried immediately', async () => {
  const f = fixture([
    response('Maintenance', { status: 503 }), response(marks([markRow()])), response(components),
    response(attendance), response(marks()),
  ]);
  const partial = await f.session.reports();
  assert.deepEqual(partial.attendance, { data: [], error: { code: 'PORTAL_UNAVAILABLE', message: 'Student Portal could not load this report.' } });
  assert.deepEqual(partial.marks.data[0].components, componentDTO);
  assert.equal(f.session.cache, null);
  const recovered = await f.session.reports();
  assert.deepEqual(recovered.attendance, { data: attendanceDTO });
  assert.equal(f.requests().length, 5);
  assert.equal(f.session.cache, recovered);
});

test('marks parse failure preserves attendance and issues no details request', async () => {
  const f = fixture([response(attendance), response('<h1>Unknown report</h1>')]);
  const result = await f.session.reports();
  assert.deepEqual(result.attendance, { data: attendanceDTO });
  assert.deepEqual(result.marks, { data: [], error: { code: 'PARSE_ERROR', message: 'Required marks headers were not found.' } });
  assert.equal(f.requests().length, 2);
  assert.equal(f.session.cache, null);
});

test('transport errors produce a safe partial report error', async () => {
  const f = fixture([new Error('private transport diagnostics'), response(marks())]);
  const result = await f.session.reports();
  assert.deepEqual(result.attendance, { data: [], error: { code: 'PORTAL_UNAVAILABLE', message: 'Student Portal could not load this report. Try again.' } });
  assert.deepEqual(result.marks, { data: [] });
  assert.equal(f.session.cache, null);
});

test('a failed breakdown preserves its mark and continues to later courses', async () => {
  const f = fixture([response(attendance), response(marks([markRow(), markRow(0, '456')])), response('Unavailable', { status: 500 }), response(components)]);
  const result = await f.session.reports();
  assert.deepEqual(result.marks.data[0], { code: 'SYN101', title: 'Synthetic Logic', scored: 18, total: 20, components: [], detailsError: 'Assessment details are temporarily unavailable.' });
  assert.deepEqual(result.marks.data[1].components, componentDTO);
  assert.equal(f.requests().length, 4);
  assert.equal(f.session.cache, null);
});

test('missing subjects and invalid handlers never trigger details requests', async () => {
  const noHandler = ['SYN101', 'Synthetic Logic', '18 / 20', ''];
  const f = fixture([response(attendance), response(marks([noHandler, markRow(17, ''), markRow('badStatus')]))]);
  const result = await f.session.reports();
  assert.equal(f.requests().length, 2);
  assert.equal(result.marks.data.length, 3);
  for (const mark of result.marks.data) {
    assert.deepEqual(mark, { code: 'SYN101', title: 'Synthetic Logic', scored: 18, total: 20, components: [], detailsError: 'No assessment breakdown is published for this course.' });
  }
  assert.equal(f.session.cache, null);
});

test('a complete report reuses the same DTO without any page work', async () => {
  const f = fixture([response(attendance), response(marks([markRow()])), response(components)]);
  const first = await f.session.reports();
  const calls = f.calls.length;
  assert.equal(await f.session.reports(), first);
  assert.equal(f.calls.length, calls);
});

test('an old cache refreshes reports and reads current shell fields', async () => {
  const freshFields = { ...fields, csrfPreventionSalt: 'refreshed-salt' };
  const f = fixture([response(attendance), response(marks())], { fields: freshFields });
  const stale = { old: true };
  f.session.cache = stale;
  f.session.cachedAt = 0;
  const result = await f.session.reports();
  assert.notEqual(result, stale);
  assert.equal(f.session.cache, result);
  assert.deepEqual(f.requests().map(call => call.fields), [{ ...freshFields, iden: '9' }, { ...freshFields, iden: '13' }]);
});

test('expired report responses invalidate authentication and cached data', async t => {
  const cases = [
    ['HTTP 401', response('Unauthorized', { status: 401 })],
    ['login JSP redirect', response('', { url: `${base}students/loginManager/youLogin.jsp` })],
    ['login servlet redirect', response('', { url: `${base}LoginServlet` })],
    ['double quoted login form', response('<form id="login_form"></form>')],
    ['single quoted login form', response("<form ID = 'login_form'></form>")],
  ];
  for (const [name, controlled] of cases) {
    await t.test(name, async () => {
      const f = fixture([controlled]);
      f.session.cache = { stale: true };
      await assert.rejects(f.session.report(attendanceFile, fields), expired);
      assert.equal(f.session.authenticated, false);
      assert.equal(f.session.cache, null);
    });
  }
});

test('expiration at any report stage aborts assembly and later requests', async t => {
  const complete = [response(attendance), response(marks([markRow()])), response(components)];
  for (const stage of [0, 1, 2]) {
    await t.test(`request ${stage + 1}`, async () => {
      const responses = complete.slice();
      responses[stage] = response('<form id="login_form"></form>');
      const f = fixture(responses);
      await assert.rejects(f.session.reports(), expired);
      assert.equal(f.requests().length, stage + 1);
      assert.equal(f.session.authenticated, false);
      assert.equal(f.session.cache, null);
    });
  }
});

test('an unauthenticated session cannot return cached data', async () => {
  const f = fixture([]);
  f.session.authenticated = false;
  f.session.cache = { stale: true };
  f.session.cachedAt = Date.now();
  await assert.rejects(f.session.reports(), expired);
  assert.deepEqual(f.calls, []);
});

test('an expired shell stops before fields or report requests', async t => {
  for (const options of [{ loginForm: true }, { home: false }]) {
    await t.test(JSON.stringify(options), async () => {
      const f = fixture([], options);
      await assert.rejects(f.session.reports(), expired);
      assert.equal(f.session.authenticated, false);
      assert.equal(f.calls.length, 1);
    });
  }
});

test('an empty salt rendered by the portal is preserved in report requests', async () => {
  const emptySalt = { ...fields, csrfPreventionSalt: '' };
  const f = fixture([response(attendance), response(marks())], { fields: emptySalt });
  const result = await f.session.reports();
  assert.deepEqual(result.attendance.data, attendanceDTO);
  assert.equal(result.attendance.error, undefined);
  assert.equal(result.marks.error, undefined);
  assert.deepEqual(f.requests().map(call => call.fields.csrfPreventionSalt), ['', '']);
});

test('missing CSRF form fields stop before sending a report', async () => {
  for (const missing of ['hdnFormDetails', 'csrfPreventionSalt']) {
    const f = fixture([], { fields: { ...fields, [missing]: undefined } });
    await assert.rejects(f.session.reports(), error => error instanceof PortalError && error.code === 'PORTAL_CHANGED' && error.status === 502);
    assert.equal(f.requests().length, 0);
  }
});

// Executable regressions: source fixes belong to the integration owner.
test('shell expiration also discards a previous cache', async () => {
  const f = fixture([], { loginForm: true });
  f.session.cache = { stale: true };
  f.session.cachedAt = 0;
  await assert.rejects(f.session.reports(), expired);
  assert.equal(f.session.cache, null);
});

test('parser-detected expiration invalidates the session', async () => {
  const f = fixture([response('<form id=login_form></form>')]);
  f.session.cache = { stale: true };
  f.session.cachedAt = 0;
  await assert.rejects(f.session.reports(), expired);
  assert.equal(f.requests().length, 1);
  assert.equal(f.session.authenticated, false);
  assert.equal(f.session.cache, null);
});
