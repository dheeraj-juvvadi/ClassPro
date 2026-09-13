/* ClassPro portal OCR web worker (classic worker).
   Owned file: portal-app/public/ocr-worker.js
   Protocol:
     -> {id, type:'init'}
     <- {id, type:'ready', ok:true, chars, initMs, warmMs}
     -> {id, type:'solve', pixels:Float32Array, width:number}
     <- {id, ok:true, answer, confidence, minCharConfidence, inferenceMs}
   Assets are same-origin under /ocr/. No credentials are ever sent here.
   Errors are reduced to a safe string; no stack or payload echoes. */
'use strict';

const ORT_SCRIPT = '/ocr/ort.wasm.min.js';
const MODEL_URL = '/ocr/portal-alnum.onnx';
const CHARSET_URL = '/ocr/charset.json';
const MODEL_HEIGHT = 64;
const MAX_CLASSES = 63;
const BLANK_INDEX = 0;

let session = null;
let charset = '';
let bootPromise = null;

function safeError(error) {
  const raw = error && error.message ? error.message : String(error);
  return raw.replace(/\s+/g, ' ').slice(0, 200) || 'unknown error';
}

function post(message, transfer) {
  self.postMessage(message, transfer || []);
}

function reply(id, body) {
  post(Object.assign({ id: id }, body));
}

function fail(id, error) {
  reply(id, { ok: false, error: safeError(error) });
}

function loadOrt() {
  if (typeof self.ort !== 'undefined') return;
  self.importScripts(ORT_SCRIPT);
  if (!self.ort) throw new Error('onnxruntime web build did not expose ort');
}

async function loadCharset() {
  const response = await fetch(CHARSET_URL, { cache: 'force-cache' });
  if (!response.ok) throw new Error('charset fetch failed: ' + response.status);
  const payload = await response.json();
  let text = '';
  let list = null;
  if (typeof payload === 'string') text = payload.trim();
  else if (Array.isArray(payload)) list = payload.map((value) => String(value == null ? '' : value));
  else if (payload && typeof payload.charset === 'string') text = payload.charset.trim();
  else if (payload && typeof payload.chars === 'string') text = payload.chars.trim();
  else if (payload && Array.isArray(payload.charset)) list = payload.charset.map((value) => String(value == null ? '' : value));
  else if (payload && Array.isArray(payload.chars)) list = payload.chars.map((value) => String(value == null ? '' : value));
  if (list) {
    if (!list.length) throw new Error('charset.json is empty');
    return { text: list.join(''), list: list };
  }
  if (!text) throw new Error('charset.json is empty');
  return { text: text, list: null };
}

async function createSession() {
  // Begin the model transfer before loading/compiling the inference runtime.
  const modelStarted = performance.now();
  const modelRequest = fetch(MODEL_URL, { cache: 'force-cache' }).then(async response => {
    if (!response.ok) throw new Error('Model download failed');
    const data = await response.arrayBuffer();
    return { data, downloadMs: performance.now() - modelStarted };
  });
  // Attach a rejection handler immediately while importScripts runs.
  modelRequest.catch(() => {});
  const wasmRequest = fetch('/ocr/ort-wasm-simd-threaded.wasm', { cache: 'force-cache' }).then(async response => {
    if (!response.ok) throw new Error('Verification runtime download failed');
    return response.arrayBuffer();
  });
  wasmRequest.catch(() => {});
  loadOrt();
  const ort = self.ort;
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.simd = true;
  ort.env.wasm.wasmPaths = '/ocr/';
  ort.env.logLevel = 'error';
  const runtimeStarted = performance.now();
  const [model, wasmBinary] = await Promise.all([modelRequest, wasmRequest]);
  ort.env.wasm.wasmBinary = wasmBinary;
  const instance = await ort.InferenceSession.create(model.data, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all'
  });
  modelDownloadMs = model.downloadMs;
  runtimeSetupMs = performance.now() - runtimeStarted;
  return instance;
}
let modelDownloadMs = 0;
let runtimeSetupMs = 0;

function inputName() {
  const names = session.inputNames;
  if (!names || !names.length) throw new Error('model exposes no inputs');
  return names[0];
}

function softmax(logits) {
  let max = -Infinity;
  for (let i = 0; i < logits.length; i += 1) if (logits[i] > max) max = logits[i];
  let total = 0;
  const out = new Float64Array(logits.length);
  for (let i = 0; i < logits.length; i += 1) {
    const value = Math.exp(logits[i] - max);
    out[i] = value;
    total += value;
  }
  for (let i = 0; i < out.length; i += 1) out[i] /= total;
  return out;
}

function readShape(dims, expected) {
  if (!dims || dims.length !== 3) throw new Error('unexpected logits rank: ' + (dims ? dims.length : 'none'));
  if (dims[2] === expected) return { steps: dims[0], classes: dims[2] };
  if (dims[1] === expected) return { steps: dims[0], classes: dims[1] };
  throw new Error('unexpected logits shape: ' + dims.join('x'));
}

function decode(raw, steps, classes, firstAxis) {
  let answer = '';
  let sum = 0;
  let min = 1;
  let kept = 0;
  let previous = -1;
  for (let step = 0; step < steps; step += 1) {
    const logits = new Float64Array(classes);
    for (let c = 0; c < classes; c += 1) {
      logits[c] = firstAxis ? raw[step * classes + c] : raw[c * steps + step];
    }
    const probs = softmax(logits);
    let best = 0;
    for (let c = 1; c < classes; c += 1) if (probs[c] > probs[best]) best = c;
    if (best !== BLANK_INDEX && best !== previous) {
      const char = charsetList ? charsetList[best] : charset.charAt(best - charsetOffset);
      if (char) {
        answer += char;
        sum += probs[best];
        if (probs[best] < min) min = probs[best];
        kept += 1;
      }
    }
    previous = best;
  }
  return {
    answer: answer,
    confidence: kept ? 100 * sum / kept : 0,
    minCharConfidence: kept ? 100 * min : 0,
    kept: kept
  };
}

let charsetList = null;
let charsetOffset = 1;

function pixelsFor(width) {
  const pixels = new Float32Array(width * MODEL_HEIGHT);
  return pixels;
}

async function runInference(pixels, width) {
  const ort = self.ort;
  const data = pixels instanceof Float32Array ? pixels : new Float32Array(pixels);
  const expected = width * MODEL_HEIGHT;
  if (data.length !== expected) throw new Error('pixels length ' + data.length + ' != ' + expected);
  const tensor = new ort.Tensor('float32', data, [1, 1, MODEL_HEIGHT, width]);
  const feeds = {};
  feeds[inputName()] = tensor;
  const results = await session.run(feeds);
  const key = session.outputNames[0];
  const output = results[key];
  const dims = Array.from(output.dims || []);
  const shape = readShape(dims, MAX_CLASSES);
  return decode(output.data, shape.steps, shape.classes, dims[2] === shape.classes);
}

async function initialize() {
  if (bootPromise) return bootPromise;
  bootPromise = (async () => {
    const started = Date.now();
    const results = await Promise.all([createSession(), loadCharset()]);
    session = results[0];
    const loaded = results[1];
    charset = loaded.text;
    charsetList = loaded.list && loaded.list.length >= MAX_CLASSES ? loaded.list : null;
    charsetOffset = charsetList ? 0 : 1;
    const initMs = Date.now() - started;
    const warmStarted = Date.now();
    try {
      const warm = pixelsFor(MODEL_HEIGHT);
      await runInference(warm, MODEL_HEIGHT);
    } catch (warmError) { /* warm-up is best effort */ }
    const resources = performance.getEntriesByType('resource');
    return { initMs, warmMs: Date.now() - warmStarted, chars: charset.length,
      modelDownloadMs, runtimeSetupMs,
      downloadBytes: resources.reduce((sum, e) => sum + (e.transferSize || 0), 0) };
  })();
  try {
    return await bootPromise;
  } catch (error) {
    bootPromise = null;
    throw error;
  }
}

function readWidth(value) {
  const width = Math.floor(Number(value));
  if (!isFinite(width) || width < 1) throw new Error('width must be a positive integer');
  if (width > 4096) throw new Error('width ' + width + ' exceeds limit');
  return width;
}

self.onmessage = (event) => {
  const message = event && event.data ? event.data : {};
  const id = message.id;
  const type = message.type;
  if (type === 'init') {
    initialize().then((info) => {
      reply(id, { ok: true, type: 'ready', ...info });
    }).catch((error) => fail(id, error));
    return;
  }
  if (type === 'solve') {
    let width = 0;
    try {
      width = readWidth(message.width);
    } catch (error) {
      fail(id, error);
      return;
    }
    const pixels = message.pixels;
    if (!pixels || typeof pixels.length !== 'number') {
      fail(id, 'solve requires pixels');
      return;
    }
    const started = Date.now();
    initialize().then(() => runInference(pixels, width)).then((result) => {
      reply(id, {
        ok: true,
        answer: result.answer,
        confidence: result.confidence,
        minCharConfidence: result.minCharConfidence,
        inferenceMs: Date.now() - started
      });
    }).catch((error) => fail(id, error));
    return;
  }
  fail(id, 'unknown message type: ' + String(type).slice(0, 40));
};
