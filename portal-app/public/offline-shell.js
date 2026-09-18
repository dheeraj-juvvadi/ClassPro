'use strict';
(() => {
  if (!('serviceWorker' in navigator) || !globalThis.isSecureContext || location.search.includes('preview=')) return;
  const register = () => {
    if (!navigator.onLine) { addEventListener('online', register, { once: true }); return; }
    if (document.hidden) {
      const resume = () => {
        if (document.hidden) return;
        document.removeEventListener('visibilitychange', resume);
        register();
      };
      document.addEventListener('visibilitychange', resume);
      return;
    }
    const login = document.getElementById('login-form');
    if (login?.getAttribute('aria-busy') === 'true') { setTimeout(register, 1500); return; }
    navigator.serviceWorker.register('/service-worker.js', { scope: '/', updateViaCache: 'none' })
      .catch(() => { /* The app remains usable if storage or installation fails. */ });
  };
  const schedule = () => {
    if ('requestIdleCallback' in window) requestIdleCallback(register, { timeout: 5000 });
    else setTimeout(register, 1000);
  };
  if (document.readyState === 'complete') schedule();
  else addEventListener('load', schedule, { once: true });
})();
