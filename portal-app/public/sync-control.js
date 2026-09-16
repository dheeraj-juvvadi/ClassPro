'use strict';
globalThis.anonSyncControl = {
  active: 0,
  started: 0,
  timer: null,
  begin() {
    clearTimeout(this.timer);
    if (!this.active) this.started = performance.now();
    this.active++;
    this.paint(true);
  },
  end() {
    this.active = Math.max(0, this.active - 1);
    if (this.active) return;
    this.timer = setTimeout(() => { if (!this.active) this.paint(false); }, Math.max(0, 650 - (performance.now() - this.started)));
  },
  paint(running) {
    for (const id of ['refresh', 'settings-sync']) {
      const button = document.getElementById(id);
      button.classList.toggle('syncing', running);
      button.disabled = running;
      button.setAttribute('aria-busy', String(running));
      button.setAttribute('aria-label', running ? 'Syncing reports' : 'Sync reports');
    }
  },
};
