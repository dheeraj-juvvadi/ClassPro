import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../public/sign-in-particles.js', import.meta.url), 'utf8');

function fixture({ reduced = false, canvasAvailable = true } = {}) {
  const frames = new Map();
  const events = {};
  let nextFrame = 0;
  let draws = 0;
  let textureMarks = 0;
  const context = { clearRect() { draws++; }, drawImage() {}, fillRect() {},
    createLinearGradient: () => ({ addColorStop() {} }) };
  const textureContext = { fillRect() { textureMarks++; } };
  const canvas = { getContext: () => canvasAvailable ? context : null };
  const label = { textContent: 'Sign in' };
  const status = { textContent: '' };
  const attributes = {};
  const button = {
    dataset: {}, querySelector: selector => selector === 'canvas' ? canvas : label,
    setAttribute(name, value) { attributes[name] = value; },
    removeAttribute(name) { delete attributes[name]; },
  };
  const motion = { matches: reduced, addEventListener(name, callback) { events.motion = callback; } };
  const document = { hidden: false, getElementById: () => status,
    createElement: () => ({ getContext: () => textureContext }),
    addEventListener(name, callback) { events[name] = callback; } };
  const sandbox = { document, navigator: { hardwareConcurrency: 2 }, matchMedia: () => motion,
    window: { addEventListener(name, callback) { events[name] = callback; } },
    requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame(identifier) { frames.delete(identifier); },
  };
  runInNewContext(source, sandbox);
  const effect = sandbox.createSignInParticles(button);
  return { effect, frames, events, document, motion, button, label, status, attributes,
    draws: () => draws, textureMarks: () => textureMarks };
}

test('particle loop is idle until login and cleans up for retry', () => {
  const state = fixture();
  assert.equal(state.frames.size, 0);
  state.effect.start();
  state.effect.stage('Signing in…', .72);
  assert.equal(state.frames.size, 1);
  assert.equal(state.attributes['aria-busy'], 'true');
  assert.equal(state.status.textContent, 'Signing in…');
  state.effect.stop();
  assert.equal(state.frames.size, 0);
  assert.equal(state.button.dataset.loading, undefined);
  assert.equal(state.label.textContent, 'Sign in');
  state.effect.stage('Stale completion', 1);
  assert.equal(state.label.textContent, 'Sign in');
  state.effect.start();
  assert.equal(state.frames.size, 1);
});

test('hidden pages pause animation and motion changes disable the loop', () => {
  const state = fixture();
  state.effect.start();
  state.document.hidden = true;
  state.events.visibilitychange();
  assert.equal(state.frames.size, 0);
  state.document.hidden = false;
  state.events.visibilitychange();
  assert.equal(state.frames.size, 1);
  state.motion.matches = true;
  state.events.motion();
  assert.equal(state.frames.size, 0);
  const before = state.draws();
  state.effect.stage('Signing in…', .72);
  assert.equal(state.draws(), before + 1);
  state.events.pagehide();
  assert.equal(state.label.textContent, 'Sign in');
});

test('reduced motion and unavailable canvas retain readable status without animation', () => {
  for (const options of [{ reduced: true }, { canvasAvailable: false }]) {
    const state = fixture(options);
    state.effect.start();
    state.effect.stage('Connecting to SRM…', .4);
    assert.equal(state.frames.size, 0);
    assert.equal(state.label.textContent, 'Connecting to SRM…');
    state.effect.stop();
    assert.equal(state.label.textContent, 'Sign in');
  }
});

test('stage transitions stop scheduling frames and reuse the cached texture', () => {
  const state = fixture();
  const initialMarks = state.textureMarks();
  assert.equal(initialMarks, 2400);
  function advance(timestamp) {
    for (const [identifier, callback] of [...state.frames]) {
      state.frames.delete(identifier);
      callback(timestamp);
    }
  }
  state.effect.start();
  advance(0);
  advance(420);
  assert.equal(state.frames.size, 0);
  const settledDraws = state.draws();
  advance(60000);
  assert.equal(state.draws(), settledDraws);
  state.effect.stage('Signing in…', .72);
  assert.equal(state.frames.size, 1);
  advance(60100);
  advance(60520);
  assert.equal(state.frames.size, 0);
  assert.equal(state.textureMarks(), initialMarks);
});
