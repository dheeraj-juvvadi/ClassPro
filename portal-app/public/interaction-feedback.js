'use strict';
globalThis.anonFeedback = (() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let enabled = true, timer, lastTap = 0;
  function haptic(success = false) {
    if (!enabled || reduced.matches || document.hidden || !navigator.vibrate) return;
    try { navigator.vibrate(success ? [12, 35, 12] : 8); } catch {}
  }
  function enter(node) {
    if (!node || reduced.matches || !node.animate) return;
    const base = node.id === 'action-feedback' ? 'translateX(-50%) ' : '';
    node.animate([{ opacity: .35, transform: base + 'translateY(6px)' }, { opacity: 1, transform: base + 'translateY(0)' }], { duration: 180, easing: 'ease-out' });
  }
  function success(text, vibrate = true) {
    const toast = document.getElementById('action-feedback');
    clearTimeout(timer); toast.textContent = text; toast.hidden = false; enter(toast);
    if (vibrate) haptic(true);
    timer = setTimeout(() => { toast.hidden = true; }, 3200);
  }
  document.addEventListener('click', event => {
    if (!event.isTrusted || !event.target.closest('#planner-nav button, #planner-menu > summary, #use-student-portal, #refresh, #settings-sync, #calculate-attendance, .academic-month button')) return;
    if (performance.now() - lastTap < 150) return;
    lastTap = performance.now(); haptic();
  });
  return { enter, success, setHaptics(value) { enabled = value; }, clear() { clearTimeout(timer); document.getElementById('action-feedback').hidden = true; } };
})();
