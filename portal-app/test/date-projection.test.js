import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/attendance-math.js';
import '../public/home-model.js';
import '../public/schedule-model.js';
import '../public/date-projection.js';

const courses = [{ code: 'CS', present: 18, conducted: 22 }];
const source = { entries: [{ code: 'CS', title: 'Course', room: 'Room', dayOrder: '1', start: '08:00', end: '09:40', hours: 2 }],
  calendar: [13, 14, 15].map(day => ({ date: `2026-09-${day}`, kind: 'teaching', dayOrder: '1' })) };
const today = new Date(2026, 8, 14);

test('leave uses counted timetable hours and includes intervening attended days', () => {
  const result = dateProjection.calculate(courses, source, { '2026-09-15': 'leave' }, today);
  assert.deepEqual(result.courses[0].impact, { attend: 2, miss: 2, od: 0 });
  assert.equal(result.courses[0].prediction.percentage, 76.92);
});
test('past OD corrects absences without adding conducted hours', () => {
  const result = dateProjection.calculate(courses, source, { '2026-09-13': 'od' }, today);
  assert.equal(result.courses[0].prediction.percentage, 90.91);
  assert.equal(result.courses[0].prediction.conducted, 22);
});
test('holidays and unknown dates never manufacture attendance hours', () => {
  const result = dateProjection.calculate(courses, { ...source, calendar: [{ date: '2026-09-15', kind: 'holiday' }] }, { '2026-09-15': 'leave' }, today);
  assert.deepEqual(result.unknown, ['2026-09-14']);
  assert.deepEqual(result.courses[0].impact, { attend: 0, miss: 0, od: 0 });
});
