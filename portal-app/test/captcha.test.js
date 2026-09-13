import test from 'node:test';
import assert from 'node:assert/strict';
import { selectCandidate, MIN_CONFIDENCE, MIN_VOTES } from '../src/captcha.js';

test('selectCandidate refuses anything without corroboration or confidence', () => {
  assert.equal(selectCandidate(), null);
  assert.equal(selectCandidate([]), null);
  assert.equal(selectCandidate(null), null);
  assert.equal(selectCandidate([{ answer: 'aaaa1', votes: 6, confidence: 0 }]), null);
  assert.equal(selectCandidate([{ answer: 'zzzz9', votes: 1, confidence: 99 }]), null);
  assert.equal(selectCandidate([{ answer: 'bbbb2', votes: 6, confidence: 12 }]), null);
});

test('model predictions require both mean and weakest-character confidence', () => {
  const good = { answer: 'aB3dE6', engine: 'ddddocr', confidence: 98, minCharConfidence: 95 };
  assert.equal(selectCandidate([good]), good);
  for (const change of [
    { confidence: 89 }, { minCharConfidence: 79 }, { minCharConfidence: undefined },
    { confidence: NaN }, { answer: '' }, { answer: '<html>' },
  ]) assert.equal(selectCandidate([{ ...good, ...change }]), null);
});

test('selectCandidate requires a finite confidence at the threshold', () => {
  const at = { answer: 'edge1', votes: MIN_VOTES, confidence: MIN_CONFIDENCE };
  assert.equal(selectCandidate([at]), at);
  assert.equal(selectCandidate([{ answer: 'edge2', votes: 2, confidence: MIN_CONFIDENCE - 0.1 }]), null);
  for (const confidence of [Number.NaN, Number.POSITIVE_INFINITY, undefined, null, '90', {}]) {
    assert.equal(selectCandidate([{ answer: 'xxxx1', votes: 9, confidence }]), null, String(confidence));
  }
});

test('selectCandidate ignores ordering and picks the best eligible candidate', () => {
  const ineligible = { answer: 'bad11', votes: 5, confidence: 12 };
  const eligible = { answer: 'good2', votes: 2, confidence: 88 };
  assert.equal(selectCandidate([ineligible, eligible]), eligible);
  assert.equal(selectCandidate([eligible, ineligible]), eligible);
});

test('selectCandidate ranks by votes then confidence then answer deterministically', () => {
  const low = { answer: 'cccc3', votes: 2, confidence: 70 };
  const high = { answer: 'dddd4', votes: 3, confidence: 66 };
  assert.equal(selectCandidate([low, high]), high);
  const weaker = { answer: 'eeee5', votes: 3, confidence: 66 };
  const stronger = { answer: 'ffff6', votes: 3, confidence: 80 };
  assert.equal(selectCandidate([weaker, stronger]), stronger);
  const first = { answer: 'aaaa7', votes: 2, confidence: 70 };
  const second = { answer: 'bbbb8', votes: 2, confidence: 70 };
  assert.equal(selectCandidate([second, first]), selectCandidate([first, second]));
  assert.equal(selectCandidate([second, first]).answer, 'aaaa7');
});
