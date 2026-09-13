/* ClassPro portal OCR controller (main thread).
   Owned file: portal-app/public/client-ocr.js
   Exposes window.portalOcr = { preload(), solve(dataUrl), metrics }.
   The worker lives at /ocr-worker.js and reads only /ocr/ assets. No
   credentials, cookies, or form values are ever passed to the worker.
   There is no server fallback: if the worker cannot run, solve() rejects
   honestly and the login form stays exactly as the backend wrote it. */
(function () {
  'use strict';

  const WORKER_URL = '/ocr-worker.js';
  const INIT_TIMEOUT_MS = 60000;
  const SOLVE_TIMEOUT_MS = 20000;
  const MODEL_HEIGHT = 64;
  const STATUS_ID = 'ocr-status';

  const state = {
    worker: null,
    nextId: 1,
    pending: new Map(),
    preloadPromise: null,
    info: null,
    dead: false
  };

  const metrics = {
    available: null,
    ready: false,
    initMs: null,
    warmMs: null,
    charsetLength: null,
    solves: 0,
    failures: 0,
    lastInferenceMs: null,
    lastAnswerLength: null,
    lastError: null,
    updatedAt: null
  };

  function stamp() {
    metrics.updatedAt = Date.now();
  }

  function status(text) {
    const node = document.getElementById(STATUS_ID);
    if (node) node.textContent = text;
  }

  function host() {
    if (typeof window === 'undefined') return null;
    if (typeof window.Worker !== 'function') return null;
    return window;
  }

  function describe(error) {
    const raw = error && error.message ? error.message : String(error);
    return raw.replace(/\s+/g, ' ').slice(0, 200) || 'unknown error';
  }

  let initReported = false;

  function reportMetric(event, fields) {
    const sink = typeof window !== 'undefined' ? window.portalTestMetric : null;
    if (typeof sink !== 'function') return;
    try {
      sink(event, fields);
    } catch (ignored) { /* a broken metric sink must never break OCR */ }
  }

  function reportInit(event, fields) {
    if (initReported) return;
    initReported = true;
    reportMetric(event, fields);
  }

  function settle(id, outcome) {
    const entry = state.pending.get(id);
    if (!entry) return;
    state.pending.delete(id);
    clearTimeout(entry.timer);
    if (outcome.ok) entry.resolve(outcome);
    else entry.reject(new Error(outcome.error || 'OCR request failed'));
  }

  function shutdown(message) {
    let initInFlight = false;
    state.pending.forEach((entry) => {
      if (entry.type === 'init') initInFlight = true;
    });
    if (initInFlight) reportInit('model_error', { ok: false });
    state.dead = true;
    metrics.available = false;
    metrics.ready = false;
    metrics.lastError = message || 'worker stopped';
    stamp();
    const error = new Error('OCR unavailable: ' + (message || 'worker stopped'));
    state.pending.forEach((entry) => {
      clearTimeout(entry.timer);
      entry.reject(error);
    });
    state.pending.clear();
    if (state.worker) {
      try { state.worker.terminate(); } catch (ignored) { /* already gone */ }
      state.worker = null;
    }
    status('Captcha recognition unavailable on this device. Enter the code shown.');
  }

  function onWorkerMessage(event) {
    const message = event && event.data ? event.data : {};
    if (!message.id) return;
    settle(message.id, message);
  }

  function spawn() {
    if (state.worker) return state.worker;
    if (state.dead || !host()) return null;
    let worker;
    try {
      worker = new window.Worker(WORKER_URL);
    } catch (error) {
      shutdown('worker could not start (' + describe(error) + ')');
      return null;
    }
    worker.onmessage = onWorkerMessage;
    worker.onerror = (event) => {
      const detail = event && event.message ? event.message : 'worker error';
      shutdown(describe(detail));
    };
    state.worker = worker;
    return worker;
  }

  function request(payload, timeoutMs, transfer) {
    const worker = spawn();
    if (!worker) return Promise.reject(new Error('OCR unavailable: no usable worker'));
    const id = state.nextId;
    state.nextId += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const entry = state.pending.get(id);
        state.pending.delete(id);
        if (entry) {
          metrics.failures += 1;
          metrics.lastError = 'timeout after ' + timeoutMs + ' ms';
          stamp();
          entry.reject(new Error('OCR timed out after ' + timeoutMs + ' ms'));
        }
        if (payload.type === 'init') shutdown('initialization timed out');
      }, timeoutMs);
      state.pending.set(id, { resolve: resolve, reject: reject, timer: timer, type: payload.type });
      try {
        worker.postMessage(Object.assign({ id: id }, payload), transfer || []);
      } catch (error) {
        settle(id, { ok: false, error: describe(error) });
      }
    });
  }

  function readyText() {
    const parts = ['Captcha recognition ready'];
    if (metrics.initMs !== null) parts.push('init ' + Math.round(metrics.initMs) + ' ms');
    if (metrics.warmMs !== null) parts.push('warm ' + Math.round(metrics.warmMs) + ' ms');
    if (metrics.lastInferenceMs !== null) parts.push('last ' + Math.round(metrics.lastInferenceMs) + ' ms');
    return parts.join(' · ');
  }

  function preload() {
    if (state.preloadPromise) return state.preloadPromise;
    const preloadStarted = performance.now();
    initReported = false;
    if (!host()) {
      reportInit('model_error', { ok: false });
      shutdown('Web Workers are not available');
      state.preloadPromise = Promise.reject(new Error('OCR unavailable: Web Workers are not available'));
      return state.preloadPromise;
    }
    metrics.available = null;
    status('Preparing captcha recognition…');
    const pending = request({ type: 'init' }, INIT_TIMEOUT_MS).then((info) => {
      metrics.available = true;
      metrics.ready = true;
      metrics.initMs = typeof info.initMs === 'number' ? info.initMs : null;
      metrics.warmMs = typeof info.warmMs === 'number' ? info.warmMs : null;
      metrics.charsetLength = typeof info.chars === 'number' ? info.chars : null;
      metrics.lastError = null;
      stamp();
      status(readyText());
      metrics.totalReadyMs = Math.round(performance.now() - preloadStarted);
      reportInit('model_ready', { initializationMs: metrics.initMs,
        durationMs: metrics.totalReadyMs, modelDownloadMs: info.modelDownloadMs,
        runtimeSetupMs: info.runtimeSetupMs, warmMs: info.warmMs, downloadBytes: info.downloadBytes });
      return info;
    }).catch((error) => {
      reportInit('model_error', { ok: false });
      metrics.failures += 1;
      metrics.lastError = describe(error);
      stamp();
      state.preloadPromise = null;
      throw error;
    });
    state.preloadPromise = pending;
    return pending;
  }

  function isAllowedSource(dataUrl) {
    return dataUrl.indexOf('data:image/') === 0 || dataUrl.indexOf('blob:') === 0;
  }

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('captcha image could not be decoded'));
      image.src = dataUrl;
    });
  }

  function toPixels(image) {
    const naturalWidth = image.naturalWidth || image.width;
    const naturalHeight = image.naturalHeight || image.height;
    if (!naturalWidth || !naturalHeight) throw new Error('captcha image has no dimensions');
    const width = Math.max(1, Math.floor((naturalWidth * MODEL_HEIGHT) / naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = MODEL_HEIGHT;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('canvas 2d context unavailable');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, MODEL_HEIGHT);
    context.drawImage(image, 0, 0, width, MODEL_HEIGHT);
    const rgba = context.getImageData(0, 0, width, MODEL_HEIGHT).data;
    const pixels = new Float32Array(width * MODEL_HEIGHT);
    for (let source = 0, target = 0; target < pixels.length; source += 4, target += 1) {
      const gray = 0.299 * rgba[source] + 0.587 * rgba[source + 1] + 0.114 * rgba[source + 2];
      pixels[target] = gray / 127.5 - 1;
    }
    return { pixels: pixels, width: width };
  }

  function solve(dataUrl) {
    if (typeof dataUrl !== 'string' || !dataUrl) {
      return Promise.reject(new Error('solve needs an image data URL'));
    }
    if (!isAllowedSource(dataUrl)) {
      return Promise.reject(new Error('solve accepts data:image/ or blob: sources only'));
    }
    return preload().then(() => loadImage(dataUrl)).then((image) => {
      const prepared = toPixels(image);
      metrics.solves += 1;
      const payload = { type: 'solve', pixels: prepared.pixels, width: prepared.width };
      return request(payload, SOLVE_TIMEOUT_MS, [prepared.pixels.buffer]);
    }).then((result) => {
      metrics.lastInferenceMs = typeof result.inferenceMs === 'number' ? result.inferenceMs : null;
      metrics.lastAnswerLength = result.answer ? result.answer.length : 0;
      metrics.lastError = null;
      stamp();
      status(readyText());
      return result;
    }).catch((error) => {
      metrics.failures += 1;
      metrics.lastError = describe(error);
      stamp();
      if (metrics.available) status('Verification failed on this device. Please retry.');
      throw error;
    });
  }

  const api = { preload: preload, solve: solve, metrics: metrics };
  Object.defineProperty(api, 'available', {
    enumerable: true,
    get: function () { return metrics.available; }
  });
  window.portalOcr = api;
})();
