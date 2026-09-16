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
  for (const [hour, expected] of [[0,'Goodnight'],[4,'Goodnight'],[5,'Good morning'],[12,'Good morning'],[17,'Good evening'],[22,'Goodnight']]) {
    assert.equal(anonGreeting(name, new Date(2026,8,16,hour)), `${expected}, Dheeraj.`);
  }
  assert.equal(anonGreeting('ANANYA RAO', new Date(2026,8,16,9)), 'Good morning, Ananya.');
  assert.equal(anonGreeting('', new Date(2026,8,16,9)), 'Good morning.');
});

test('each profile gets exactly three stable distinct extras without requests', () => {
  const profile = { name: 'JUVVADI DHEERAJ CHANDRA', regNo: 'TEST123' };
  const selected = anonGreetings.select(profile);
  assert.equal(selected.length, 3);
  assert.equal(new Set(selected).size, 3);
  assert.deepEqual(anonGreetings.select(profile), selected);
  assert.equal(selected.some(line => /\{name\}|Night shift|Midnight maths|Still waking|Tomorrow already/.test(line)), false);
  for (const line of selected) assert.match(line, /Dheeraj/);
  for (const line of selected) assert.equal((line.match(/Dheeraj/g) || []).length, 1);
  assert.equal(anonGreetings.select(null).length, 3);
  assert.equal(anonGreetings.select({}).some(line => line.includes('{name}')), false);
});
test('fixed first hour changes to assigned extra locally at each boundary', () => {
  const extras = ['You again?', 'Back already?', 'Still here?'];
  const at = (hour, minute = 0) => anonGreeting('Dheeraj', new Date(2026, 8, 16, hour, minute), extras);
  assert.equal(at(5), 'Good morning, Dheeraj.');
  assert.equal(at(5,59), 'Good morning, Dheeraj.');
  assert.equal(at(6), extras[0]);
  assert.equal(at(12), extras[0]);
  assert.equal(at(16,59), extras[0]);
  assert.equal(at(17), 'Good evening, Dheeraj.');
  assert.equal(at(18), extras[1]);
  assert.equal(at(22), 'Goodnight, Dheeraj.');
  assert.equal(at(23), extras[2]);
  assert.equal(at(0), extras[2]);
  assert.equal(at(4,59), extras[2]);
});
