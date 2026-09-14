'use strict';

globalThis.createSignInParticles = function (button) {
  const canvas = button.querySelector('canvas');
  const label = button.querySelector('#sign-in-label');
  const status = document.getElementById('sign-in-status');
  const context = canvas.getContext('2d', { alpha: true });
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const economical = (navigator.hardwareConcurrency || 4) <= 4 || navigator.connection?.saveData;
  const interval = economical ? 84 : 50;
  const width = 240;
  const height = 56;
  const colors = ['#748273', '#859281', '#96a28f'];
  const texture = document.createElement('canvas');
  const textureContext = texture.getContext('2d');
  const edgeOffsets = [];
  let seed = 431;
  let active = false;
  let target = .22;
  let current = target;
  let frame = 0;
  let previous = 0;
  let transitionStart = null;
  let transitionFrom = current;

  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  canvas.width = width;
  canvas.height = height;
  texture.width = width;
  texture.height = height;
  for (let index = 0; textureContext && index < (economical ? 600 : 900); index++) {
    const horizontal = random() * width / 4;
    const vertical = random() * height;
    const size = .65 + random() * 1.1;
    textureContext.fillStyle = colors[Math.floor(random() * colors.length)];
    for (let repeat = 0; repeat < 4; repeat++) {
      textureContext.fillRect(horizontal + repeat * width / 4, (vertical + repeat * 17) % height, size, size * .7);
    }
  }
  for (let vertical = 0; vertical < height; vertical += 2) {
    edgeOffsets.push(Math.round(random() * 10 - 5));
  }

  function draw() {
    if (!context || !textureContext) return;
    context.clearRect(0, 0, width, height);
    const boundary = current * (width + 12) - 6;
    for (let row = 0; row < edgeOffsets.length; row++) {
      const revealed = Math.max(0, Math.min(width, Math.round(boundary + edgeOffsets[row])));
      if (revealed) context.drawImage(texture, 0, row * 2, revealed, 2, 0, row * 2, revealed, 2);
    }
  }

  function tick(timestamp) {
    frame = 0;
    if (!active || document.hidden || motion.matches || !context || !textureContext) return;
    if (transitionStart === null) transitionStart = timestamp;
    const elapsed = Math.min(1, (timestamp - transitionStart) / 420);
    if (timestamp - previous >= interval || elapsed === 1) {
      previous = timestamp;
      current = transitionFrom + (target - transitionFrom) * (1 - (1 - elapsed) ** 3);
      draw();
    }
    if (elapsed < 1) frame = requestAnimationFrame(tick);
  }

  function schedule() {
    cancelAnimationFrame(frame);
    frame = 0;
    if (!active || document.hidden || !context || !textureContext || current === target) return;
    if (motion.matches) { current = target; draw(); return; }
    transitionFrom = current;
    transitionStart = null;
    frame = requestAnimationFrame(tick);
  }

  function stage(text, extent) {
    if (!active) return;
    target = Math.max(target, Math.min(1, extent));
    label.textContent = text;
    status.textContent = text;
    if (motion.matches) { current = target; draw(); }
    else schedule();
  }

  function start() {
    active = true;
    target = .22;
    current = .12;
    button.dataset.loading = 'true';
    button.setAttribute('aria-busy', 'true');
    stage('Preparing…', .22);
    draw();
    schedule();
  }

  function stop() {
    active = false;
    cancelAnimationFrame(frame);
    frame = 0;
    target = current = .22;
    delete button.dataset.loading;
    button.removeAttribute('aria-busy');
    label.textContent = 'Sign in';
    status.textContent = '';
    draw();
  }

  document.addEventListener('visibilitychange', schedule);
  motion.addEventListener('change', schedule);
  window.addEventListener('pagehide', stop);
  draw();
  return { start, stage, stop };
};
