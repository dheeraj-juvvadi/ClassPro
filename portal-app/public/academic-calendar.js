'use strict';

// Month-grid and selection pattern adapted from OpenSourceUI MonthPickerCalendar.
globalThis.createAcademicCalendar = ({ container, source, now }) => {
  const model = classproScheduleModel;
  let month, selected;
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
  function shift(delta) {
    month = new Date(month.getFullYear(), month.getMonth() + delta, 1, 12);
    selected = new Date(month.getFullYear(), month.getMonth(), Math.min(selected.getDate(), new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()), 12);
    render();
  }
  function render() {
    const active = container.contains(document.activeElement) ? document.activeElement.getAttribute('aria-label') : null;
    container.replaceChildren();
    const layout = el('div', undefined, 'calendar-layout');
    const panel = el('section', undefined, 'calendar-picker');
    const header = el('div', undefined, 'calendar-heading');
    const title = el('h3', month.toLocaleDateString('en', { month: 'long', year: 'numeric' }));
    title.id = 'calendar-month-title';
    const controls = el('div');
    controls.append(button('‹', 'Previous month', () => shift(-1)), button('Today', 'Return to today', reset), button('›', 'Next month', () => shift(1)));
    header.append(title, controls);
    const grid = el('div', undefined, 'academic-month');
    grid.setAttribute('role', 'group'); grid.setAttribute('aria-labelledby', title.id);
    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) grid.append(el('span', day, 'month-weekday'));
    for (let i = 0; i < (month.getDay() + 6) % 7; i++) grid.append(el('span'));
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    for (let day = 1; day <= count; day++) {
      const date = new Date(month.getFullYear(), month.getMonth(), day, 12);
      const state = model.dayState(source(), date);
      const exam = /exam|assessment|test/i.test(state.label || '');
      const label = state.kind === 'holiday' ? 'Holiday' : state.dayOrder ? `DO ${state.dayOrder}` : '—';
      const cell = button('', `${date.toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' })}. ${label === '—' ? 'Unconfirmed' : label}${exam ? '. Exam' : ''}`, () => { selected = date; render(); });
      cell.dataset.date = model.key(date); cell.dataset.kind = exam ? 'exam' : state.kind;
      cell.setAttribute('aria-pressed', String(model.key(date) === model.key(selected)));
      if (model.key(date) === model.key(now())) cell.setAttribute('aria-current', 'date');
      cell.append(el('span', String(day)), el('small', label)); grid.append(cell);
    }
    const legend = el('div', undefined, 'calendar-legend');
    for (const [kind, label] of [['teaching', 'Teaching'], ['holiday', 'Holiday'], ['exam', 'Exam'], ['unknown', 'Unconfirmed']]) {
      const item = el('span', label); item.dataset.kind = kind; legend.append(item);
    }
    panel.append(header, grid, legend);
    const state = model.dayState(source(), selected);
    const detail = el('section', undefined, 'calendar-detail'); detail.setAttribute('aria-live', 'polite');
    detail.append(el('p', selected.toLocaleDateString('en', { weekday: 'long' }), 'calendar-weekday'),
      el('strong', String(selected.getDate()).padStart(2, '0'), 'calendar-date-number'),
      el('p', selected.toLocaleDateString('en', { month: 'long', year: 'numeric' }), 'calendar-selected-month'),
      el('h3', state.dayOrder ? `Day order ${state.dayOrder}` : state.kind === 'holiday' ? 'Holiday' : 'Not confirmed'));
    const label = courseDetails.clean(state.label);
    if (label && !/^(day order \w+|teaching day|holiday)$/i.test(label)) detail.append(el('p', label, 'calendar-event'));
    if (state.kind === 'unknown') detail.append(el('p', 'No academic calendar entry for this date.', 'calendar-event'));
    layout.append(panel, detail); container.append(layout);
    if (active) [...container.querySelectorAll('button')].find(node => node.getAttribute('aria-label') === active)?.focus();
  }
  function reset() { selected = now(); month = new Date(selected.getFullYear(), selected.getMonth(), 1, 12); render(); }
  return { render, reset };
};
