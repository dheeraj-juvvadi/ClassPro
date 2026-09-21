'use strict';

globalThis.createScheduleCalendar = ({ container, date, describe, onSelect }) => {
  const model = globalThis.anonScheduleModel;
  let selected = new Date(date);
  let weekStart = startOfWeek(date);
  function startOfWeek(value) {
    const copy = new Date(value);
    copy.setDate(copy.getDate() - copy.getDay());
    copy.setHours(12, 0, 0, 0);
    return copy;
  }
  function addDays(value, count) {
    const copy = new Date(value);
    copy.setDate(copy.getDate() + count);
    return copy;
  }
  function button(label, action) {
    const control = document.createElement('button');
    control.type = 'button';
    control.textContent = label;
    control.addEventListener('click', action);
    return control;
  }
  function render() {
    const focusedDate = container.contains(document.activeElement) ? document.activeElement.dataset.date : null;
    const focusedAction = container.contains(document.activeElement) ? document.activeElement.dataset.action : null;
    container.replaceChildren();
    const heading = document.createElement('div');
    heading.className = 'calendar-heading';
    const label = document.createElement('div');
    label.className = 'calendar-label';
    const title = document.createElement('h2');
    title.className = 'calendar-month';
    title.textContent = addDays(weekStart, 3).toLocaleDateString('en', { month: 'long', year: 'numeric' });
    const range = document.createElement('p');
    range.className = 'calendar-range';
    range.textContent = `${weekStart.toLocaleDateString('en', { month: 'short', day: 'numeric' })} – ${addDays(weekStart, 6).toLocaleDateString('en', { month: 'short', day: 'numeric' })}`;
    label.setAttribute('aria-live', 'polite');
    label.append(title, range);
    const controls = document.createElement('div');
    controls.className = 'calendar-controls';
    for (const [label, offset, arrow] of [['Previous week', -7, '←'], ['Next week', 7, '→']]) {
      const control = button(arrow, () => { weekStart = addDays(weekStart, offset); render(); });
      control.setAttribute('aria-label', label);
      control.dataset.action = label;
      controls.append(control);
    }
    const today = button('Today', () => select(date));
    today.dataset.action = 'Today';
    controls.append(today);
    heading.append(label, controls);
    const strip = document.createElement('div');
    strip.className = 'calendar-week';
    strip.setAttribute('role', 'group');
    strip.setAttribute('aria-label', 'Choose a calendar day');
    for (let offset = 0; offset < 7; offset++) {
      const day = addDays(weekStart, offset);
      const control = button('', () => select(day));
      const description = describe(day);
      control.dataset.date = model.key(day);
      control.dataset.kind = description.kind;
      control.setAttribute('aria-pressed', String(model.key(day) === model.key(selected)));
      control.setAttribute('aria-label', `${day.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}. ${description.label}`);
      if (model.key(day) === model.key(date)) control.setAttribute('aria-current', 'date');
      for (const [index, text] of [day.toLocaleDateString('en', { weekday: 'short' }), String(day.getDate()), description.kind === 'unknown' ? '—' : description.short].entries()) {
        const line = document.createElement('span');
        line.className = ['calendar-day-name', 'calendar-day-number', 'calendar-day-kind'][index];
        line.textContent = text;
        if (index === 2) line.title = description.label;
        control.append(line);
      }
      strip.append(control);
    }
    container.append(heading, strip);
    const focus = [...container.querySelectorAll('button')].find(control => focusedDate ? control.dataset.date === focusedDate : focusedAction && control.dataset.action === focusedAction);
    focus?.focus();
  }
  function select(value) {
    selected = new Date(value);
    weekStart = startOfWeek(value);
    render();
    onSelect(new Date(selected));
  }
  render();
  return { render, reset(value) { date = new Date(value); select(value); }, today(value) { date = new Date(value); render(); } };
};
