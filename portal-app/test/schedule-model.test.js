import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/attendance-math.js';
import '../public/home-model.js';
import '../public/schedule-model.js';

const model = globalThis.classproScheduleModel;
const slot = { code: 'SYN', title: 'Synthetic course', room: 'Test room', start: '10:30', end: '11:30', dayOrder: 'A' };
const report = (entries = [slot], calendar = []) => ({ timezone: 'Asia/Kolkata', entries, calendar });
const teaching = { date: '2026-09-15', kind: 'teaching', dayOrder: 'A' };

test('schedule contract rejects malformed dates, ambiguous recurrence and duplicate dates', () => {
  assert.ok(model.normalize(report()));
  for (const invalid of [null, {}, report([null]), report([{ ...slot, day: 1 }]),
    report([{ ...slot, dayOrder: 1 }]), report([slot], [{ ...teaching, date: '2026-02-30' }]),
    report([slot], [teaching, teaching]), { ...report(), timezone: 'Not/a-zone' },
    report([{ ...slot, allocation: 5 }])]) assert.equal(model.normalize(invalid), null);
});

test('missing calendar is unknown and does not manufacture weekday classes', () => {
  const source = report([{ ...slot, dayOrder: undefined, day: 2 }]);
  assert.equal(model.dayState(source, new Date(2026, 8, 15)).kind, 'unknown');
  assert.deepEqual(model.classes(source, new Date(2026, 8, 15)), []);
  assert.equal(model.next(source, new Date(2026, 8, 14)), null);
});

test('holidays suppress classes and explicit day orders override weekday assumptions', () => {
  const source = report([slot], [{ ...teaching, date: '2026-09-14', kind: 'holiday' }, teaching]);
  assert.equal(model.classes(source, new Date(2026, 8, 14)).length, 0);
  const next = model.next(source, new Date(2026, 8, 14, 15));
  assert.equal(model.key(next.date), '2026-09-15');
  assert.equal(next.unknown, false);
});

test('future known class is marked incomplete when intervening calendar dates are missing', () => {
  const next = model.next(report([slot], [teaching]), new Date(2026, 8, 14, 15));
  assert.equal(next.unknown, true);
});

test('continuous periods merge after allocation and batch filtering without changing input', () => {
  const entries = [
    { ...slot, allocation: 'Theory', batch: 'B1' },
    { ...slot, allocation: 'Theory', batch: 'B1', start: '11:30', end: '12:30' },
    { ...slot, allocation: 'Theory', batch: 'B2', start: '11:30', end: '12:30' },
    { ...slot, allocation: 'Lab', batch: 'B1', start: '12:30', end: '13:30' },
  ];
  const result = model.classes(report(entries, [teaching]), new Date(2026, 8, 15), { allocation: 'Theory', batch: 'B1' });
  assert.equal(result.length, 1);
  assert.equal(result[0].end, '12:30');
  assert.equal(entries[0].end, '11:30');
  const hours = (classproHomeModel.minutes(result[0].end) - classproHomeModel.minutes(result[0].start)) / 60;
  assert.equal(hours, 2);
  assert.equal(attendanceMath.predict({ present: 18, conducted: 22, miss: hours }).percentage, 75);
});

test('manual weekly next class rolls over weekends and year boundaries', () => {
  const manual = [{ ...slot, dayOrder: undefined, day: 1 }];
  const next = model.next(manual, new Date(2026, 11, 31, 20));
  assert.equal(model.key(next.date), '2027-01-04');
  assert.equal(model.dayState(manual, next.date).kind, 'manual');
});

test('next class includes ongoing periods and excludes completed periods', () => {
  const source = report([slot], [teaching]);
  assert.equal(model.next(source, new Date(2026, 8, 15, 11)).code, 'SYN');
  assert.equal(model.next(source, new Date(2026, 8, 15, 11, 30)), null);
});

test('campus time is independent of the device timezone', () => {
  const date = model.clock('Asia/Kolkata', new Date('2026-09-14T20:00:00Z'));
  assert.equal(model.key(date), '2026-09-15');
  assert.equal(date.getHours(), 1);
  assert.equal(date.getMinutes(), 30);
});
