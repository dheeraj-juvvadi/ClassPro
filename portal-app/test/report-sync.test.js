import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const context = vm.createContext({ Intl, Date });
vm.runInContext(readFileSync(new URL('../public/report-sync.js', import.meta.url), 'utf8'), context);
const next = input => new Date(context.reportSyncSchedule.next(Date.parse(input))).toISOString();
test('sync slots follow IST working hours and evening slots, including midnight', () => {
  assert.equal(next('2026-09-16T07:59:00+05:30'), '2026-09-16T02:30:00.000Z');
  assert.equal(next('2026-09-16T09:00:00+05:30'), '2026-09-16T04:30:00.000Z');
  assert.equal(next('2026-09-16T19:00:00+05:30'), '2026-09-16T15:30:00.000Z');
  assert.equal(next('2026-09-16T21:00:00+05:30'), '2026-09-16T17:30:00.000Z');
  assert.equal(next('2026-09-16T23:00:00+05:30'), '2026-09-17T02:30:00.000Z');
});
