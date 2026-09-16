import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/attendance-math.js';
import '../public/home-model.js';
import '../public/schedule-model.js';
import '../public/course-details.js';
import '../public/greeting.js';

test('faculty cleanup drops punctuation placeholders and preserves names', () => {
  assert.equal(courseDetails.clean(' . '), '');
  assert.equal(courseDetails.clean('Dr. A. Kumar .'), 'Dr. A. Kumar');
  assert.equal(courseDetails.clean('TBA'), '');
  assert.equal(courseDetails.clean('Dr.   Meera • Rao'), 'Dr. Meera Rao');
});
test('recovery date needs continuous confirmed dates and future classes', () => {
  const course = { code: 'CS', present: 13, conducted: 19 };
  const entry = { code: 'CS', title: 'Test', room: 'R', dayOrder: '1', start: '10:00', end: '12:00', hours: 2 };
  const calendar = [16,17,18].map(day => ({ date: `2026-09-${day}`, kind: 'teaching', dayOrder: '1' }));
  const source = { entries: [entry], calendar };
  const now = new Date(2026,8,16,9);
  assert.equal(classproScheduleModel.key(courseDetails.recovery(course, source, now).date), '2026-09-18');
  assert.equal(courseDetails.recovery(course, { ...source, calendar: calendar.slice(1) }, now).unavailable, true);
  assert.equal(courseDetails.recovery(course, source, new Date(2026,8,16,11)).unavailable, true);
  assert.equal(courseDetails.recovery({ ...course, present: 19 }, source, now), null);
});
test('approved greetings use name rule and all time boundaries', () => {
  const name = 'JUVVADI DHEERAJ CHANDRA';
  for (const [hour, expected] of [[0,'It’s late'],[4,'It’s late'],[5,'Good morning'],[12,'Good afternoon'],[17,'Good evening'],[22,'It’s late']]) {
    assert.equal(anonGreeting(name, new Date(2026,8,16,hour)), `${expected}, Dheeraj.`);
  }
  assert.equal(anonGreeting('ANANYA RAO', new Date(2026,8,16,9)), 'Good morning, Ananya.');
  assert.equal(anonGreeting('', new Date(2026,8,16,9)), 'Good morning.');
});
