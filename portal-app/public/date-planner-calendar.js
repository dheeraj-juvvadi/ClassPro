'use strict';

globalThis.createDatePlannerCalendar = ({ onToggle, onFocus }) => {
  const calendar = document.getElementById('projection-calendar');
  const loading = document.getElementById('projection-calendar-loading');
  const retry = document.getElementById('projection-calendar-retry');
  const model = anonScheduleModel;
  let ready = false, pending = null, snapshot = null, shownMonth = '', animation;
  const key = date => date.toISOString().slice(0, 10);
  function decorate() {
    const month = calendar.querySelector('calendar-month');
    if (!snapshot || !month.shadowRoot) return;
    let prefix = '';
    for (const button of month.shadowRoot.querySelectorAll('button[part]')) {
      const value = button.getAttribute('part').match(/date-(\d{4}-\d{2}-\d{2})/)?.[1];
      if (!value) continue;
      prefix ||= value.slice(0, 7);
      const date = model.parse(value), day = model.dayState(snapshot.source, date);
      const kind = day.kind === 'teaching' ? `Day order ${day.dayOrder || 'unconfirmed'}` : day.kind === 'holiday' ? 'Holiday' : 'Unconfirmed';
      const label = `${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}, ${kind}${day.label ? ', ' + day.label : ''}${snapshot.selected[value] ? ', selected ' + snapshot.selected[value] : ''}`;
      button.setAttribute('aria-label', label); button.title = label;
    }
    if (prefix && prefix !== shownMonth) {
      if (shownMonth && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        animation?.cancel();
        animation = month.animate([{ opacity: .5, transform: `translateX(${prefix > shownMonth ? 5 : -5}px)` }, { opacity: 1, transform: 'translateX(0)' }], { duration: 150, easing: 'ease-out' });
      }
      shownMonth = prefix;
    }
  }
  function apply() {
    if (!ready || !snapshot) return;
    const state = snapshot;
    calendar.today = model.key(state.today);
    calendar.value = Object.keys(state.selected).sort().join(' ');
    calendar.isDateDisallowed = date => {
      const value = key(date);
      return state.action === 'od' ? value >= model.key(state.today) : value < model.key(state.today);
    };
    calendar.getDayParts = date => {
      const value = key(date), action = state.selected[value];
      const day = model.dayState(state.source, model.parse(value));
      const previous = new Date(date); previous.setUTCDate(previous.getUTCDate() - 1);
      const next = new Date(date); next.setUTCDate(next.getUTCDate() + 1);
      const start = action && (date.getUTCDay() === 1 || date.getUTCDate() === 1 || !state.selected[key(previous)]);
      const end = action && (date.getUTCDay() === 0 || next.getUTCMonth() !== date.getUTCMonth() || !state.selected[key(next)]);
      return `date-${value} ${action ? 'plan-' + action + ' plan-selected' : ''} ${start ? 'plan-start' : ''} ${end ? 'plan-end' : ''} ${day.kind} ${day.dayOrder ? 'do-' + day.dayOrder : ''}`;
    };
    // Include action/year in the component's date labels without replacing its
    // keyboard navigation or focus handling.
    calendar.updated.then(async () => {
      const month = calendar.querySelector('calendar-month');
      await month.updated;
      if (snapshot !== state) return;
      decorate();
    });
  }
  async function load() {
    if (ready) return;
    if (pending) return pending;
    loading.hidden = false; retry.hidden = true;
    loading.textContent = 'Opening your calendar…';
    pending = (async () => {
      try {
        await import(calendar.dataset.src);
        ready = true;
        // A component may load after sign-out or a dialog close.
        if (!snapshot) calendar.isDateDisallowed = () => true;
        apply();
        await calendar.updated;
        const month = calendar.querySelector('calendar-month'); await month.updated;
        new MutationObserver(decorate).observe(month.shadowRoot, { childList: true, subtree: true, attributes: true, attributeFilter: ['part'] });
        calendar.hidden = false; loading.hidden = true;
      } catch {
        loading.textContent = 'Your calendar couldn’t load. Check your connection and try again.';
        retry.hidden = false;
      } finally { pending = null; }
    })();
    return pending;
  }
  calendar.addEventListener('change', () => {
    const values = new Set(calendar.value.trim().split(/\s+/).filter(Boolean));
    const previous = Object.keys(snapshot?.selected || {});
    const changed = [...values].find(date => !previous.includes(date)) || previous.find(date => !values.has(date));
    if (changed) onToggle(changed);
  });
  calendar.addEventListener('focusday', event => {
    if (event.detail instanceof Date) onFocus(key(event.detail));
  });
  retry.addEventListener('click', load);
  return {
    async open(date) {
      await load();
      if (ready && snapshot) calendar.focusedDate = model.key(date);
    },
    update(state) { snapshot = { ...state, selected: { ...state.selected } }; apply(); },
    today(date) { if (ready) { calendar.focusedDate = model.key(date); calendar.updated.then(() => calendar.focus()); } },
    clear() {
      snapshot = null;
      if (ready) { calendar.value = ''; calendar.isDateDisallowed = () => true; calendar.getDayParts = () => ''; }
    },
  };
};
