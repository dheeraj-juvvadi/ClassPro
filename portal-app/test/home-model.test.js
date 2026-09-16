import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/attendance-math.js';
import '../public/home-model.js';

test('adjacent slots merge only for the same subject and location', () => {
  const slot = { day: 1, code: 'DS', title: 'Data Structures', room: 'Lab 3' };
  const entries = [
    { ...slot, start: '11:30', end: '12:30' },
    { ...slot, start: '10:30', end: '11:30' },
    { ...slot, room: 'Lab 4', start: '12:30', end: '13:30' },
    { ...slot, day: 2, start: '10:30', end: '11:30' },
  ];
  const day = classproHomeModel.today(entries, new Date(2026, 8, 14));
  assert.equal(day.length, 2);
  assert.equal(day[0].start, '10:30');
  assert.equal(day[0].end, '12:30');
  assert.equal(entries[1].end, '11:30');
});

test('schedule validation rejects invalid days, times and durations', () => {
  const entry = { day: 1, code: 'DS', title: 'Data Structures', room: 'Lab 3', start: '10:30', end: '12:30' };
  assert.ok(classproHomeModel.valid(entry));
  for (const invalid of [{ day: 7 }, { start: '25:00' }, { end: '10:00' }, { code: '' }, { title: ' ' }]) {
    assert.ok(!classproHomeModel.valid({ ...entry, ...invalid }));
  }
});

test('insights distinguish positive, zero and required attendance hours', () => {
  assert.equal(classproHomeModel.insight({ present: 18, conducted: 22 }).margin, 'Margin: 2h');
  assert.equal(classproHomeModel.insight({ present: 13, conducted: 19 }).margin, 'Recover: 5h');
  assert.equal(classproHomeModel.insight({ present: 19, conducted: 25 }).tone, 'caution');
  assert.equal(classproHomeModel.insight({ present: 0, conducted: 0 }).percentage, '—');
});
