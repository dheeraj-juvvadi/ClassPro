import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/attendance-math.js';

const { predict } = globalThis.attendanceMath;

test('exact 75% needs nothing and cannot miss', () => {
  const result = predict({ present: 75, conducted: 100, attend: 0, miss: 0, od: 0, target: 75 });
  assert.equal(result.valid, true);
  assert.equal(result.percentage, 75);
  assert.equal(result.neededToTarget, 0);
  assert.equal(result.canMiss, 0);
  assert.equal(result.present, 75);
  assert.equal(result.conducted, 100);
});

test('exact 75% from a non-round ratio is not rounded up', () => {
  const result = predict({ present: 3, conducted: 4, target: 75 });
  assert.equal(result.valid, true);
  assert.equal(result.percentage, 75);
  assert.equal(result.neededToTarget, 0);
  assert.equal(result.canMiss, 0);
});

test('just under 75% reports hours needed to recover', () => {
  const result = predict({ present: 74, conducted: 100, target: 75 });
  assert.equal(result.valid, true);
  assert.equal(result.percentage, 74);
  assert.equal(result.neededToTarget, 4);
  assert.equal(result.canMiss, 0);
  const after = predict({ present: 74 + 4, conducted: 100 + 4, target: 75 });
  assert.equal(after.percentage, 75);
});

test('hours needed never over-counts on a boundary ratio', () => {
  const result = predict({ present: 1, conducted: 2, target: 75 });
  assert.equal(result.percentage, 50);
  assert.equal(result.neededToTarget, 2);
  const exact = predict({ present: 3, conducted: 4, target: 75 });
  assert.equal(exact.neededToTarget, 0);
});

test('canMiss counts whole missable hours above target', () => {
  const result = predict({ present: 80, conducted: 100, target: 75 });
  assert.equal(result.canMiss, 6);
  const stillAbove = predict({ present: 80, conducted: 106, target: 75 });
  assert.equal(stillAbove.percentage, 75.47);
  const justBelow = predict({ present: 80, conducted: 107, target: 75 });
  assert.equal(justBelow.percentage, 74.77);
});

test('future attend and miss hours move the projection', () => {
  const result = predict({ present: 30, conducted: 40, attend: 10, miss: 0, target: 75 });
  assert.equal(result.percentage, 80);
  assert.equal(result.present, 30);
  assert.equal(result.conducted, 50);
  const withMiss = predict({ present: 30, conducted: 40, attend: 10, miss: 10, target: 75 });
  assert.equal(withMiss.percentage, 66.67);
  assert.equal(withMiss.conducted, 60);
});

test('target 100 is reachable only with no existing absences', () => {
  const impossible = predict({ present: 50, conducted: 100, target: 100 });
  assert.equal(impossible.valid, true);
  assert.equal(impossible.percentage, 50);
  assert.equal(impossible.neededToTarget, null);
  assert.equal(impossible.canMiss, 0);

  const perfect = predict({ present: 100, conducted: 100, target: 100 });
  assert.equal(perfect.percentage, 100);
  assert.equal(perfect.neededToTarget, 0);
  assert.equal(perfect.canMiss, 0);
});

test('zero base hours give a null projection', () => {
  const result = predict({ present: 0, conducted: 0, attend: 0, miss: 0, target: 75 });
  assert.equal(result.valid, true);
  assert.equal(result.percentage, null);
  assert.equal(result.neededToTarget, null);
  assert.equal(result.canMiss, 0);
  assert.equal(result.present, 0);
  assert.equal(result.conducted, 0);
});

test('zero base hours project once future hours exist', () => {
  const result = predict({ present: 0, conducted: 0, attend: 4, miss: 0, target: 75 });
  assert.equal(result.valid, true);
  assert.equal(result.percentage, 100);
  assert.equal(result.conducted, 4);
  const mixed = predict({ present: 0, conducted: 0, attend: 3, miss: 1, target: 75 });
  assert.equal(mixed.percentage, 75);
  assert.equal(mixed.neededToTarget, 0);
});

test('OD corrects recorded absences, capped at conducted minus present', () => {
  const partial = predict({ present: 60, conducted: 100, od: 10, target: 75 });
  assert.equal(partial.present, 70);
  assert.equal(partial.conducted, 100);
  assert.equal(partial.percentage, 70);

  const capped = predict({ present: 60, conducted: 100, od: 50, target: 75 });
  assert.equal(capped.present, 100);
  assert.equal(capped.percentage, 100);
  assert.equal(capped.neededToTarget, 0);

  const noAbsences = predict({ present: 40, conducted: 40, od: 5, target: 75 });
  assert.equal(noAbsences.present, 40);
  assert.equal(noAbsences.percentage, 100);

  const cappedPlusFuture = predict({ present: 60, conducted: 100, od: 40, attend: 0, miss: 10, target: 75 });
  assert.equal(cappedPlusFuture.present, 100);
  assert.equal(cappedPlusFuture.conducted, 110);
  assert.equal(cappedPlusFuture.percentage, 90.91);
});

test('OD on zero base hours cannot invent conducted hours', () => {
  const result = predict({ present: 0, conducted: 0, od: 5, target: 75 });
  assert.equal(result.valid, true);
  assert.equal(result.present, 0);
  assert.equal(result.conducted, 0);
  assert.equal(result.percentage, null);
});

test('target defaults to 75', () => {
  const result = predict({ present: 74, conducted: 100 });
  assert.equal(result.percentage, 74);
  assert.equal(result.neededToTarget, 4);
});

test('invalid input returns valid false with an error', () => {
  const badInputs = [
    undefined,
    null,
    'present: 75',
    { conducted: 10 },
    { present: 10 },
    { present: -1, conducted: 10 },
    { present: 1.5, conducted: 10 },
    { present: '75', conducted: 100 },
    { present: 10, conducted: 5 },
    { present: 5, conducted: 10, attend: -1 },
    { present: 5, conducted: 10, miss: 0.5 },
    { present: 5, conducted: 10, od: -2 },
    { present: 5, conducted: 10, target: 0 },
    { present: 5, conducted: 10, target: 101 },
    { present: 5, conducted: 10, target: -75 },
    { present: 5, conducted: 10, target: '75' },
    { present: 5, conducted: 10, target: Number.NaN },
  ];
  for (const input of badInputs) {
    const result = predict(input);
    assert.equal(result.valid, false, `expected invalid for ${JSON.stringify(input)}`);
    assert.equal(typeof result.error, 'string');
    assert.ok(result.error.length > 0);
    assert.equal(result.percentage, undefined);
  }
});

test('predict is pure and does not mutate its input', () => {
  const input = { present: 60, conducted: 100, attend: 4, miss: 2, od: 5, target: 75 };
  const snapshot = JSON.stringify(input);
  predict(input);
  assert.equal(JSON.stringify(input), snapshot);
});
