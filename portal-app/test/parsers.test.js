import test from 'node:test';
import assert from 'node:assert/strict';
import { PortalError, parseAttendance, parseMarks, parseComponents } from '../src/parsers.js';

const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const attendanceHeaders = ['Code', 'Description', 'Max. hours', 'Att. hours', 'Absent hours', 'Total Percentage'];
const marksHeaders = ['Code', 'Description', 'Mark / Max. Mark', 'Details'];
const componentHeaders = ['Entered on', 'Component', 'Mark / Max. Mark'];
function table(headers, rows = []) {
  return `<table><thead><tr>${headers.map((label) => `<th>${escape(label)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((value) => `<td>${escape(value)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
function marks(handler = "funViewComponentWiseMarks('123','SYN101','Synthetic Logic',2)", score = '18 / 20') {
  return table(marksHeaders, [['SYN101', 'Synthetic Logic', score, '__BUTTON__']])
    .replace('__BUTTON__', `<button onclick="${escape(handler)}">View</button>`);
}
const parseError = (callback) => assert.throws(callback, (error) => error instanceof PortalError && error.code === 'PARSE_ERROR' && error.status === 422);

test('PortalError carries its public error contract', () => {
  const error = new PortalError('BAD_PAGE', 'Unreadable page');
  assert.ok(error instanceof Error);
  assert.equal(error.name, 'PortalError');
  assert.equal(error.code, 'BAD_PAGE');
  assert.equal(error.message, 'Unreadable page');
  assert.equal(error.status, 422);
  assert.equal(new PortalError('SESSION_EXPIRED', 'Sign in', 401).status, 401);
});

test('attendance uses semantic headers and normalizes whitespace', () => {
  const html = table(attendanceHeaders, [[' SYN101 ', 'Synthetic   Logic', '20', '15', '5', '75%']]);
  assert.deepEqual(parseAttendance(html), [{ code: 'SYN101', title: 'Synthetic Logic', conducted: 20, present: 15, absent: 5, percentage: 75 }]);
});

test('attendance handles reordered columns and ignores monthly and nested tables', () => {
  const monthly = table(['Month', 'Present', 'Absent'], [['July', '10', '2']]);
  const order = [5, 2, 0, 4, 1, 3];
  const row = ['SYN102', 'Synthetic Geometry', '10', '8', '2', '80'];
  const main = table(order.map((index) => attendanceHeaders[index]), [order.map((index) => row[index])]);
  const result = parseAttendance(`<table><tr><td>${monthly}${main}</td></tr></table>`);
  assert.equal(result.length, 1);
  assert.equal(result[0].present, 8);
  assert.equal(result[0].code, 'SYN102');
});

test('attendance rejects invalid and inconsistent numeric counts', () => {
  for (const counts of [['-1', '0', '0', '0'], ['10', '11', '0', '100'], ['10', '7', '2', '70'], ['10x', '8', '2', '80'], ['10', '8', '2', '101'], ['0', '0', '0', '1'], ['Infinity', '8', '2', '80']]) {
    parseError(() => parseAttendance(table(attendanceHeaders, [['SYN', 'Example', ...counts]])));
  }
  assert.equal(parseAttendance(table(attendanceHeaders, [['SYN', 'Example', '0', '0', '0', '0']]))[0].percentage, 0);
});

test('marks extract validated component identifiers without evaluation', () => {
  assert.deepEqual(parseMarks(marks()), [{ code: 'SYN101', title: 'Synthetic Logic', scored: 18, total: 20, subjectId: '123', detailStatus: '2' }]);
  const reordered = table(['Details', 'Mark / Max. Mark', 'Description', 'Code'], [['', '0 / 20', 'Synthetic Logic', 'SYN101']]);
  assert.deepEqual(parseMarks(reordered), [{ code: 'SYN101', title: 'Synthetic Logic', scored: 0, total: 20, subjectId: null, detailStatus: null }]);
});

test('detail status preserves the fourth numeric argument as a string', () => {
  for (const status of ['0', '2', '17']) {
    const [result] = parseMarks(marks(`funViewComponentWiseMarks('123','SYN101','Synthetic Logic',${status})`));
    assert.equal(result.detailStatus, status);
    assert.equal(result.subjectId, '123');
  }
});

test('absence and unpublished marks preserve labels and null scores', () => {
  for (const label of ['Absent', 'AB', 'Not Published', 'Pending', 'N/A', '—', '']) {
    const [result] = parseMarks(marks(undefined, `${label} / 20`));
    assert.equal(result.scored, null);
    assert.equal(result.total, 20);
    assert.equal(result.scoreLabel, label || undefined);
  }
  assert.deepEqual(parseComponents(table(componentHeaders, [['', 'Synthetic Task', 'Unpublished']])), [{ name: 'Synthetic Task', enteredOn: '', scored: null, total: null, scoreLabel: 'Unpublished' }]);
});

test('malformed or mismatched onclick handlers cannot create detail requests', () => {
  for (const handler of [
    "funViewComponentWiseMarks('123','SYN101','Synthetic Logic',2);alert(1)",
    "funViewComponentWiseMarks('123','SYN101','Synthetic Logic',getValue())",
    "funViewComponentWiseMarks('123','SYN101','Synthetic Logic')",
    "funViewComponentWiseMarks('abc','SYN101','Synthetic Logic',2)",
    "funViewComponentWiseMarks('123','OTHER','Synthetic Logic',2)",
    "funViewComponentWiseMarks('123','SYN101','Other title',2)",
    "funViewComponentWiseMarks('123','SYN101','Synthetic Logic',2",
    "funViewComponentWiseMarks('123','SYN101','Synthetic Logic',-1)",
    "funViewComponentWiseMarks('123','SYN101','Synthetic Logic',9007199254740992)",
    '',
    'unrelatedAction()',
  ]) {
    const [result] = parseMarks(marks(handler));
    assert.equal(result.subjectId, null);
    assert.equal(result.detailStatus, null);
    assert.equal(result.scored, 18);
  }
});

test('ambiguous duplicate component handlers produce no detail request', () => {
  const html = marks().replace('</button>', '</button><button onclick="funViewComponentWiseMarks(\'456\',\'SYN101\',\'Synthetic Logic\',3)">Other</button>');
  const [result] = parseMarks(html);
  assert.equal(result.subjectId, null);
  assert.equal(result.detailStatus, null);
});

test('validated handlers support quoting and escaped apostrophes', () => {
  const handler = `return funViewComponentWiseMarks("123", "SYN101", "Synthetic Logic", 2);`;
  assert.equal(parseMarks(marks(handler))[0].subjectId, '123');
  const html = marks("funViewComponentWiseMarks('123','SYN101','Synthetic Logic',2)")
    .replaceAll('Synthetic Logic', "Learner's Logic")
    .replace("'Learner's Logic'", "'Learner\\'s Logic'");
  assert.equal(parseMarks(html)[0].title, "Learner's Logic");
});

test('component headers reorder and retain entered date text', () => {
  const html = table(['Component', 'Mark / Max. Mark', 'Entered on'], [['Synthetic Quiz', '7.5 / 10', '01 Jan 2000']]);
  assert.deepEqual(parseComponents(html), [{ name: 'Synthetic Quiz', enteredOn: '01 Jan 2000', scored: 7.5, total: 10 }]);
});

test('all parsers distinguish recognized empty tables from unknown pages', () => {
  for (const [parse, headers] of [[parseAttendance, attendanceHeaders], [parseMarks, marksHeaders], [parseComponents, componentHeaders]]) {
    assert.deepEqual(parse(table(headers)), []);
    assert.deepEqual(parse(table(headers).replace('<tbody>', `<tbody><tr><td colspan="${headers.length}">No records found</td></tr>`)), []);
    parseError(() => parse('<html><h1>Portal changed</h1></html>'));
    parseError(() => parse(table(headers.slice(1))));
    parseError(() => parse(table(['Month', 'Present'], [['July', '10']])));
    parseError(() => parse(''));
    parseError(() => parse(null));
  }
});

test('all parsers reject a login form even alongside valid data', () => {
  for (const [parse, headers] of [[parseAttendance, attendanceHeaders], [parseMarks, marksHeaders], [parseComponents, componentHeaders]]) {
    assert.throws(() => parse(`<form id="login_form"></form>${table(headers)}`), (error) => error instanceof PortalError && error.code === 'SESSION_EXPIRED' && error.status === 401);
  }
});

test('malformed data rows, duplicate headers, and missing identities fail', () => {
  parseError(() => parseAttendance(table(attendanceHeaders, [['SYN', 'Example', '10']])));
  parseError(() => parseMarks(table([...marksHeaders, 'Code'])));
  parseError(() => parseMarks(table(marksHeaders, [['', 'Example', '2 / 10', '']])));
  parseError(() => parseComponents(table(componentHeaders, [['today', '', '2 / 10']])));
  parseError(() => parseMarks(table(marksHeaders, [['SYN', 'Example', '2 / 10', '']]).replace('<td>SYN</td>', '<td colspan="2">SYN</td>')));
});

test('invalid scores do not become zero or partially parsed numbers', () => {
  for (const value of ['22 / 20', '-2 / 20', '5foo / 20', 'NaN / 20', '5', '5 /', '5 / 10 / 20', 'missing / 20']) {
    parseError(() => parseMarks(marks(undefined, value)));
    parseError(() => parseComponents(table(componentHeaders, [['today', 'Synthetic Quiz', value]])));
  }
});
