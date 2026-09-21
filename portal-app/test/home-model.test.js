import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/attendance-math.js';
import '../public/home-model.js';

test('home insight cards contain only remaining periods from today', () => {
  const early = { code: 'EARLY', start: '08:00', end: '09:00' };
  const featured = { code: 'LAB', start: '10:00', end: '11:00' };
  const later = { code: 'LAB', start: '14:00', end: '15:00' };
  const last = { code: 'LAST', start: '16:00', end: '17:00' };
  assert.deepEqual(anonHomeModel.remainingCards([early, last, featured, later], featured, 580), [later, last]);
  assert.deepEqual(anonHomeModel.remainingCards([featured], featured, 580), []);
  assert.deepEqual(anonHomeModel.remainingCards([early], null, 580), []);
});

test('a class remains through its end minute and disappears the following minute', () => {
  const classes = [{ code: 'DS', start: '14:00', end: '15:00' }];
  assert.equal(anonHomeModel.remainingClasses(classes, 14 * 60 + 59).length, 1);
  assert.equal(anonHomeModel.remainingClasses(classes, 15 * 60).length, 1);
  assert.equal(anonHomeModel.remainingClasses(classes, 15 * 60 + 1).length, 0);
  assert.equal(anonHomeModel.remainingCards(classes, null, 15 * 60).length, 1);
  assert.equal(anonHomeModel.remainingCards(classes, null, 15 * 60 + 1).length, 0);
});

test('adjacent slots merge only for the same subject and location', () => {
  const slot = { day: 1, code: 'DS', title: 'Data Structures', room: 'Lab 3' };
  const entries = [
    { ...slot, start: '11:30', end: '12:30' },
    { ...slot, start: '10:30', end: '11:30' },
    { ...slot, room: 'Lab 4', start: '12:30', end: '13:30' },
    { ...slot, day: 2, start: '10:30', end: '11:30' },
  ];
  const day = anonHomeModel.today(entries, new Date(2026, 8, 14));
  assert.equal(day.length, 2);
  assert.equal(day[0].start, '10:30');
  assert.equal(day[0].end, '12:30');
  assert.equal(entries[1].end, '11:30');
});

test('schedule validation rejects invalid days, times and durations', () => {
  const entry = { day: 1, code: 'DS', title: 'Data Structures', room: 'Lab 3', start: '10:30', end: '12:30' };
  assert.ok(anonHomeModel.valid(entry));
  for (const invalid of [{ day: 7 }, { start: '25:00' }, { end: '10:00' }, { code: '' }, { title: ' ' }]) {
    assert.ok(!anonHomeModel.valid({ ...entry, ...invalid }));
  }
});

test('insights distinguish positive, zero and required attendance hours', () => {
  assert.equal(anonHomeModel.insight({ present: 18, conducted: 22 }).margin, 'Margin: 2h');
  assert.equal(anonHomeModel.insight({ present: 13, conducted: 19 }).margin, 'Required: 5h');
  assert.equal(anonHomeModel.insight({ present: 19, conducted: 25 }).tone, 'caution');
  assert.equal(anonHomeModel.insight({ present: 0, conducted: 0 }).percentage, '—');
});
