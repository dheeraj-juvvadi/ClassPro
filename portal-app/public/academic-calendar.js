'use strict';

globalThis.createAcademicCalendar = ({ container, source, now, onSelect }) => {
  const model = classproScheduleModel;
  let month = new Date(now().getFullYear(), now().getMonth(), 1, 12);
  let selected = now();
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  function button(text, label, action) {
    const node = el('button', text); node.type = 'button';
    node.setAttribute('aria-label', label); node.addEventListener('click', action);
    return node;
  }
  function render() {
    const active = container.contains(document.activeElement) ? document.activeElement.getAttribute('aria-label') : null;
    container.replaceChildren();
    const header = el('div', undefined, 'calendar-heading');
    header.append(button('←', 'Previous month', () => { month.setMonth(month.getMonth() - 1); render(); }),
      el('strong', month.toLocaleDateString('en', { month: 'long', year: 'numeric' })),
      button('→', 'Next month', () => { month.setMonth(month.getMonth() + 1); render(); }));
    const grid = el('div', undefined, 'academic-month');
    grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', 'Academic calendar dates');
    for (const day of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) grid.append(el('span', day, 'month-weekday'));
    for (let i = 0; i < month.getDay(); i++) grid.append(el('span'));
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    for (let day = 1; day <= count; day++) {
      const date = new Date(month.getFullYear(), month.getMonth(), day, 12);
      const state = model.dayState(source(), date);
      const label = state.kind === 'holiday' ? 'Holiday' : state.dayOrder ? `DO ${state.dayOrder}` : 'Unknown';
      const exam = /exam|assessment|test/i.test(state.label || '');
      const cell = button('', `${date.toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' })}. ${label}`, () => { selected = date; render(); });
      cell.dataset.date = model.key(date); cell.dataset.kind = exam ? 'exam' : state.kind;
      cell.setAttribute('aria-pressed', String(model.key(date) === model.key(selected)));
      if (model.key(date) === model.key(now())) cell.setAttribute('aria-current', 'date');
      cell.append(el('span', String(day)), el('small', label)); grid.append(cell);
    }
    const state = model.dayState(source(), selected);
    const detail = el('section', undefined, 'calendar-detail'); detail.setAttribute('aria-live', 'polite');
    detail.append(el('h3', selected.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long' })),
      el('p', [state.dayOrder && `Day order ${state.dayOrder}`, state.label || (state.kind === 'unknown' ? 'Calendar unavailable for this date.' : state.kind === 'holiday' ? 'Holiday · no classes.' : 'Teaching day')].filter(Boolean).join(' · ')));
    const classes = model.classes(source(), selected);
    for (const entry of classes) detail.append(el('p', `${entry.start}–${entry.end} · ${entry.title}`, 'calendar-period'));
    detail.append(button('View this day’s classes ↗', 'View selected day classes', () => onSelect(new Date(selected))));
    container.append(header, grid, el('p', 'Day order · Holiday · Exam / assessment · Unknown', 'calendar-legend'), detail,
      el('p', 'Dates follow the Ratio-D academic calendar. Unlisted dates remain unconfirmed.', 'quiet'));
    if (active) [...container.querySelectorAll('button')].find(node => node.getAttribute('aria-label') === active)?.focus();
  }
  return { render, reset() { selected = now(); month = new Date(selected.getFullYear(), selected.getMonth(), 1, 12); render(); } };
};
