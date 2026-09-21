'use strict';

globalThis.anonAdmission = (() => {
  function retryAfter(value) {
    if (!value?.trim()) return 0;
    const seconds = Number(value);
    const milliseconds = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now();
    return Number.isFinite(milliseconds) ? Math.max(0, milliseconds) : 0;
  }

  async function request(action, onWait = () => {}, deadline = performance.now() + 60000) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await action();
      } catch (error) {
        // Only the backend admission boundary can promise no work has started.
        const rejected = error.retryable === true && (
          error.status === 503 && ['SERVER_BUSY', 'CAPACITY'].includes(error.code) ||
          error.status === 429 && error.code === 'RATE_LIMIT');
        const delay = Math.max(error.retryAfterMs || 0, Math.min(1000 * 2 ** attempt, 8000))
          + 250 + Math.floor(Math.random() * 750);
        if (!rejected || attempt >= 4 || performance.now() + delay >= deadline) throw error;
        onWait(delay);
        await new Promise(resolve => setTimeout(resolve, delay));
        if (performance.now() >= deadline) throw error;
      }
    }
  }
  return { request, retryAfter };
})();
