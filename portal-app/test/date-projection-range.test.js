import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/attendance-math.js';
import '../public/home-model.js';
import '../public/schedule-model.js';
import '../public/date-projection.js';

const projection = globalThis.dateProjection;
const baseline = [{ code: 'A', present: 60, conducted: 80 }];
const date = key => new Date(`${key}T12:00:00`);
const key = value => globalThis.anonScheduleModel.key(value);
function days(start, end) {
  const result = [];
  for (const value = date(start); value <= date(end); value.setDate(value.getDate() + 1)) result.push(key(value));
  return result;
}
function slot(overrides = {}) {
  return { code: 'A', title: 'Algebra', room: '101', dayOrder: 'daily', start: '09:00', end: '11:00', hours: 2, ...overrides };
}
function calendar(start, end, entries = [slot()]) {
  return { timezone: 'Asia/Kolkata', entries,
    calendar: days(start, end).map(date => ({ date, kind: 'teaching', dayOrder: 'daily' })) };
}
const leave = (start, end) => Object.fromEntries(days(start, end).map(key => [key, 'leave']));
const impact = (attend = 0, miss = 0, od = 0) => ({ attend, miss, od });
const prediction = (present, conducted, percentage, neededToTarget, canMiss) =>
  ({ valid: true, present, conducted, percentage, neededToTarget, canMiss });

test('range: October 15–25 attends today through October 14 from the original baseline', () => {
  const source = calendar('2026-10-01', '2026-10-25');
  const selected = leave('2026-10-15', '2026-10-25');
  const original = structuredClone({ source, selected, baseline });
  const result = projection.calculate(baseline, source, selected, new Date('2026-10-01T23:59:00'), {},
    { start: '2026-10-15', end: '2026-10-25' });
  assert.equal(result.error, undefined);
  assert.deepEqual(result.range, { start: '2026-10-15', end: '2026-10-25', before: '2026-10-14' });
  assert.deepEqual(result.unknown, []);
  const course = result.courses[0];
  assert.deepEqual(course.beforeImpact, impact(28));
  assert.deepEqual(course.duringImpact, impact(0, 22));
  assert.deepEqual(course.impact, impact(28, 22));
  // Before: 88/108. After: 88/130. Both predictions keep recorded present=60.
  assert.deepEqual(course.beforePrediction, prediction(60, 108, 81.48, 0, 9));
  assert.deepEqual(course.prediction, prediction(60, 130, 67.69, 38, 0));
  assert.deepEqual({ source, selected, baseline }, original);
});

test('range: a leave starting today has the unchanged recorded before checkpoint', () => {
  const result = projection.calculate(baseline, calendar('2026-10-15', '2026-10-15'),
    { '2026-10-15': 'leave' }, date('2026-10-15'), {}, { start: '2026-10-15', end: '2026-10-15' });
  assert.equal(result.range.before, '2026-10-14');
  assert.deepEqual(result.courses[0].beforeImpact, impact());
  assert.deepEqual(result.courses[0].duringImpact, impact(0, 2));
  assert.deepEqual(result.courses[0].beforePrediction, prediction(60, 80, 75, 0, 0));
  assert.deepEqual(result.courses[0].prediction, prediction(60, 82, 73.17, 6, 0));
});

test('range: holidays and known no-class days contribute zero through the explicit end', () => {
  const source = calendar('2026-10-01', '2026-10-05');
  source.calendar[1].kind = 'holiday';
  source.calendar[3].dayOrder = 'no-classes';
  source.calendar[4].kind = 'holiday';
  const result = projection.calculate(baseline, source, leave('2026-10-03', '2026-10-05'), date('2026-10-01'), {},
    { start: '2026-10-03', end: '2026-10-05' });
  assert.deepEqual(result.unknown, []);
  assert.equal(result.range.end, '2026-10-05');
  assert.deepEqual(result.courses[0].beforeImpact, impact(2));
  assert.deepEqual(result.courses[0].duringImpact, impact(0, 2));
  assert.deepEqual(result.courses[0].beforePrediction, prediction(60, 82, 75.61, 0, 0));
  assert.deepEqual(result.courses[0].prediction, prediction(60, 84, 73.81, 4, 0));
});

test('range: partial classes, custom preleave days, and filters apply without leaking beyond end', () => {
  const morning = slot({ allocation: 'regular', batch: 'X' });
  const afternoon = slot({ start: '13:00', end: '15:00', allocation: 'regular', batch: 'X' });
  const source = calendar('2026-10-01', '2026-10-04', [morning, afternoon,
    slot({ batch: 'Y', allocation: 'regular' }), slot({ batch: 'X', allocation: 'extra' })]);
  const selected = {
    '2026-10-01': { action: 'leave', classes: { [projection.entryKey(morning)]: { mode: 'partial', hours: 1 } } },
    '2026-10-03': { action: 'attend', classes: { [projection.entryKey(morning)]: { mode: 'partial', hours: 1 } } },
    '2026-10-04': { action: 'attend', classes: { [projection.entryKey(morning)]: 'leave' } },
    '2026-10-06': 'leave',
  };
  const result = projection.calculate(baseline, source, selected, date('2026-10-01'), { batch: 'X', allocation: 'regular' },
    { start: '2026-10-03', end: '2026-10-04' });
  assert.deepEqual(result.unknown, []);
  const course = result.courses[0];
  assert.deepEqual(course.beforeImpact, impact(5, 3));
  assert.deepEqual(course.duringImpact, impact(5, 3));
  assert.deepEqual(course.impact, impact(10, 6));
  assert.deepEqual(course.beforePrediction, prediction(60, 88, 73.86, 4, 0));
  assert.deepEqual(course.prediction, prediction(60, 96, 72.92, 8, 0));
});

for (const missing of [['2026-10-03'], ['2026-10-05'], ['2026-10-02'], days('2026-10-01', '2026-10-05')]) {
  test(`range: unknown coverage includes ${missing.join(', ')} without invented hours`, () => {
    const source = calendar('2026-10-01', '2026-10-05');
    source.calendar = source.calendar.filter(day => !missing.includes(day.date));
    const result = projection.calculate(baseline, source, leave('2026-10-03', '2026-10-05'), date('2026-10-01'), {},
      { start: '2026-10-03', end: '2026-10-05' });
    assert.deepEqual(result.unknown, missing);
    assert.deepEqual(result.range, { start: '2026-10-03', end: '2026-10-05', before: '2026-10-02' });
    const before = missing.length === 5 ? 0 : missing[0] === '2026-10-02' ? 2 : 4;
    const during = missing.length === 5 ? 0 : missing[0] === '2026-10-02' ? 6 : 4;
    assert.deepEqual(result.courses[0].beforeImpact, impact(before));
    assert.deepEqual(result.courses[0].duringImpact, impact(0, during));
    assert.deepEqual(result.courses[0].impact, impact(before, during));
    assert.equal(result.courses[0].prediction.present, 60);
    assert.equal(result.courses[0].prediction.conducted, 80 + before + during);
  });
}

for (const endKind of ['holiday', 'no-classes']) {
  test(`range: checks unknown trailing dates even when explicit end is ${endKind}`, () => {
    const source = calendar('2026-10-01', '2026-10-05');
    source.calendar[4] = { date: '2026-10-05', kind: endKind === 'holiday' ? 'holiday' : 'teaching', dayOrder: 'none' };
    source.calendar.splice(3, 1);
    const result = projection.calculate(baseline, source, leave('2026-10-03', '2026-10-05'), date('2026-10-01'), {},
      { start: '2026-10-03', end: '2026-10-05' });
    assert.deepEqual(result.unknown, ['2026-10-04']);
    assert.deepEqual(result.courses[0].impact, impact(4, 2));
    assert.deepEqual(result.courses[0].prediction, prediction(60, 86, 74.42, 2, 0));
  });
}

test('range: an entirely unknown schedule still enumerates every date through end', () => {
  const result = projection.calculate(baseline, [], {}, date('2026-10-01'), {}, { start: '2026-10-03', end: '2026-10-05' });
  assert.deepEqual(result.unknown, days('2026-10-01', '2026-10-05'));
  assert.deepEqual(result.courses[0].impact, impact());
  assert.deepEqual(result.courses[0].beforeImpact, impact());
  assert.deepEqual(result.courses[0].duringImpact, impact());
});

test('range: OD corrects original recorded absences independently at both checkpoints', () => {
  const morning = slot();
  const source = calendar('2026-09-30', '2026-10-02', [morning]);
  const selected = {
    '2026-09-30': { action: 'attend', classes: { [projection.entryKey(morning)]: { mode: 'od', hours: 1 } } },
    '2026-10-02': 'leave',
  };
  const result = projection.calculate([{ code: 'A', present: 18, conducted: 22 }], source, selected, date('2026-10-01'), {},
    { start: '2026-10-02', end: '2026-10-02' });
  const course = result.courses[0];
  assert.deepEqual(course.beforeImpact, impact(2, 0, 1));
  assert.deepEqual(course.duringImpact, impact(0, 2));
  assert.deepEqual(course.impact, impact(2, 2, 1));
  assert.deepEqual(course.beforePrediction, prediction(19, 24, 87.5, 0, 4));
  assert.deepEqual(course.prediction, prediction(19, 26, 80.77, 0, 2));
});

test('range: rollover into leave projects only today onward, not a historical before checkpoint', () => {
  const source = calendar('2026-10-14', '2026-10-18');
  const selected = { ...leave('2026-10-15', '2026-10-18'), '2026-10-14': 'od' };
  const result = projection.calculate(baseline, source, selected, date('2026-10-17'), {},
    { start: '2026-10-15', end: '2026-10-18' });
  assert.equal(result.error, undefined);
  assert.deepEqual(result.range, { start: '2026-10-15', end: '2026-10-18', before: '2026-10-14', beforeElapsed: true });
  assert.deepEqual(result.courses[0].beforeImpact, impact(0, 0, 2));
  assert.deepEqual(result.courses[0].duringImpact, impact(0, 4));
  assert.equal(result.courses[0].beforePrediction, null);
  assert.deepEqual(result.courses[0].prediction, prediction(62, 84, 73.81, 4, 0));
});

test('range: legacy calls infer first missed checkpoint and preserve total selected-day semantics', () => {
  const source = calendar('2026-10-01', '2026-10-06');
  const selected = { '2026-10-03': 'leave', '2026-10-05': 'leave', '2026-10-06': 'attend' };
  const result = projection.calculate(baseline, source, selected, date('2026-10-01'));
  assert.deepEqual(result.range, { start: '2026-10-03', end: '2026-10-06', before: '2026-10-02' });
  assert.deepEqual(result.courses[0].beforeImpact, impact(4));
  assert.deepEqual(result.courses[0].duringImpact, impact(4, 4));
  assert.deepEqual(result.courses[0].impact, impact(8, 4));
  assert.deepEqual(result.courses[0].beforePrediction, prediction(60, 84, 76.19, 0, 1));
  assert.deepEqual(result.courses[0].prediction, prediction(60, 92, 73.91, 4, 0));
});

test('range: legacy empty plans do not add today or invent a checkpoint', () => {
  const result = projection.calculate(baseline, calendar('2026-10-01', '2026-10-03'), {}, date('2026-10-01'));
  assert.equal(result.range, undefined);
  assert.deepEqual(result.courses[0].impact, impact());
  assert.deepEqual(result.courses[0].beforePrediction, prediction(60, 80, 75, 0, 0));
});

for (const range of [
  { start: '2026-02-30', end: '2026-10-05' },
  { start: '2026-10-03', end: '2026-13-01' },
  { start: '2026-10-3', end: '2026-10-05' },
  { start: '2026-10-03T12:00:00', end: '2026-10-05' },
  { start: '2026-10-05', end: '2026-10-03' },
  { start: '2026-09-28', end: '2026-09-30' },
  { start: '2026-10-03', end: '2026-10-05', action: 'unexpected' },
  { start: '2026-09-30', end: '2026-10-01', action: 'od' },
  { start: '2026-09-30', end: '2026-10-05', action: 'od' },
  { start: '2026-10-03' }, {}, false,
]) {
  test(`range: invalid or expired range ${JSON.stringify(range)} returns no forecasts`, () => {
    const result = projection.calculate(baseline, calendar('2026-10-01', '2026-10-05'), {}, date('2026-10-01'), {}, range);
    assert.equal(typeof result.error, 'string');
    assert.ok(result.error.length > 0);
    assert.deepEqual(result.courses, []);
  });
}

test('range: invalid today and invalid selected dates return errors rather than forecasts', () => {
  const source = calendar('2026-10-01', '2026-10-05');
  for (const [today, selected] of [[new Date(NaN), {}], [date('2026-10-01'), { '2026-02-30': 'leave' }]]) {
    const result = projection.calculate(baseline, source, selected, today, {}, { start: '2026-10-03', end: '2026-10-05' });
    assert.equal(typeof result.error, 'string');
    assert.deepEqual(result.courses, []);
  }
});

function offsetKey(start, offset) {
  const value = date(start);
  value.setDate(value.getDate() + offset);
  return key(value);
}

test('range: 400 inclusive calendar dates are supported without truncating the last day', () => {
  const today = '2026-10-01';
  const end = offsetKey(today, 399);
  const source = calendar(today, end);
  const result = projection.calculate(baseline, source, { [end]: 'leave' }, date(today), {}, { start: end, end });
  assert.equal(result.error, undefined);
  assert.deepEqual(result.courses[0].beforeImpact, impact(798));
  assert.deepEqual(result.courses[0].duringImpact, impact(0, 2));
  assert.deepEqual(result.courses[0].prediction, prediction(60, 880, 97.5, 0, 264));
});

test('range: explicit past OD corrects only selected recorded absences with no future hours', () => {
  const source = calendar('2026-09-01', '2026-09-05');
  const selected = { '2026-09-01': 'od', '2026-09-02': 'od', '2026-09-03': 'od', '2026-09-05': 'od' };
  const result = projection.calculate([{ code: 'A', present: 18, conducted: 22 }], source, selected, date('2026-10-01'), {},
    { start: '2026-09-02', end: '2026-09-03', action: 'od' });
  assert.equal(result.error, undefined);
  assert.deepEqual(result.range, { start: '2026-09-02', end: '2026-09-03', before: '2026-09-01', action: 'od', beforeElapsed: true });
  assert.deepEqual(result.unknown, []);
  assert.deepEqual(result.courses[0].beforeImpact, impact());
  assert.deepEqual(result.courses[0].duringImpact, impact(0, 0, 4));
  assert.deepEqual(result.courses[0].impact, impact(0, 0, 4));
  assert.equal(result.courses[0].beforePrediction, null);
  assert.deepEqual(result.courses[0].prediction, prediction(22, 22, 100, 0, 7));
});

test('range: past OD coverage checks unknown dates without inventing corrections', () => {
  const source = calendar('2026-09-01', '2026-09-05');
  source.calendar = source.calendar.filter(day => !['2026-09-02', '2026-09-05'].includes(day.date));
  source.calendar[1].kind = 'holiday';
  const selected = { '2026-09-01': 'od', '2026-09-03': 'od', '2026-09-04': 'od' };
  const result = projection.calculate(baseline, source, selected, date('2026-10-01'), {},
    { start: '2026-09-01', end: '2026-09-05', action: 'od' });
  assert.deepEqual(result.unknown, ['2026-09-02', '2026-09-05']);
  assert.deepEqual(result.courses[0].duringImpact, impact(0, 0, 4));
  assert.deepEqual(result.courses[0].prediction, prediction(64, 80, 80, 0, 5));
});

test('range: partial past OD is capped at original recorded absences', () => {
  const entry = slot();
  const selected = { '2026-09-01': 'od', '2026-09-02': { action: 'none', classes: {
    [projection.entryKey(entry)]: { mode: 'od', hours: 1 },
  } } };
  const result = projection.calculate([{ code: 'A', present: 21, conducted: 22 }], calendar('2026-09-01', '2026-09-02'),
    selected, date('2026-10-01'), {}, { start: '2026-09-01', end: '2026-09-02', action: 'od' });
  assert.deepEqual(result.courses[0].duringImpact, impact(0, 0, 3));
  assert.deepEqual(result.courses[0].prediction, prediction(22, 22, 100, 0, 7));
});

test('range: past OD checks its own 400-day horizon rather than distance from today', () => {
  const start = '2020-01-01';
  const end = offsetKey(start, 399);
  const source = calendar(start, end);
  const result = projection.calculate(baseline, source, { [start]: 'od', [end]: 'od' }, date('2026-10-01'), {},
    { start, end, action: 'od' });
  assert.equal(result.error, undefined);
  assert.deepEqual(result.unknown, []);
  assert.deepEqual(result.courses[0].impact, impact(0, 0, 4));
  const tooLong = projection.calculate(baseline, source, {}, date('2026-10-01'), {},
    { start, end: offsetKey(start, 400), action: 'od' });
  assert.match(tooLong.error, /400/);
  assert.deepEqual(tooLong.courses, []);
});

test('range: an unknown past OD interval does not invent absent or attended hours', () => {
  const result = projection.calculate(baseline, [], {}, date('2026-10-01'), {},
    { start: '2026-09-01', end: '2026-09-03', action: 'od' });
  assert.deepEqual(result.unknown, days('2026-09-01', '2026-09-03'));
  assert.deepEqual(result.courses[0].impact, impact());
  assert.equal(result.courses[0].beforePrediction, null);
  assert.deepEqual(result.courses[0].prediction, prediction(60, 80, 75, 0, 0));
});

for (const action of ['leave', 'attend']) {
  test(`range: ${action} metadata is returned without changing future traversal`, () => {
    const selected = { '2026-10-03': action };
    const result = projection.calculate(baseline, calendar('2026-10-01', '2026-10-03'), selected, date('2026-10-01'), {},
      { start: '2026-10-03', end: '2026-10-03', action });
    assert.equal(result.range.action, action);
    assert.deepEqual(result.courses[0].beforeImpact, impact(4));
    assert.deepEqual(result.courses[0].duringImpact, action === 'leave' ? impact(0, 2) : impact(2));
    assert.deepEqual(result.courses[0].prediction, action === 'leave' ? prediction(60, 86, 74.42, 2, 0) : prediction(60, 86, 76.74, 0, 2));
  });
}

for (const explicit of [true, false]) {
  test(`range: ${explicit ? 'explicit' : 'legacy'} traversal beyond 400 dates errors, never forecasts a truncated range`, () => {
    const today = '2026-10-01';
    const end = offsetKey(today, 400);
    const source = calendar(today, end);
    const result = projection.calculate(baseline, source, { [end]: 'leave' }, date(today), {}, explicit ? { start: end, end } : null);
    assert.match(result.error, /400/);
    assert.deepEqual(result.courses, []);
  });
}
