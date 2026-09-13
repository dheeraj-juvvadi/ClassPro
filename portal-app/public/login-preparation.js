'use strict';

// One short-lived challenge per form. No credentials enter this cache.
globalThis.createLoginPreparation = function ({ prepare, now = Date.now, ttl = 60000 }) {
  let pending = null;
  function preload() {
    if (pending && now() - pending.started < ttl) return pending.promise;
    // Let an in-flight request settle before replacing its portal challenge.
    if (pending && !pending.settled) return pending.promise;
    const entry = { started: now(), settled: false };
    pending = entry;
    entry.promise = Promise.resolve().then(prepare).then(value => {
      entry.settled = true;
      return value;
    }, error => {
      entry.settled = true;
      if (pending === entry) pending = null;
      throw error;
    });
    return entry.promise;
  }
  async function take() {
    let entry;
    let value;
    do {
      const promise = preload();
      entry = pending;
      value = await promise;
      if (pending === entry) pending = null;
    } while (now() - entry.started >= ttl);
    return value;
  }
  return { preload, take, clear: () => { pending = null; } };
};
