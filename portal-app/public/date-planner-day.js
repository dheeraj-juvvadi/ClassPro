'use strict';

globalThis.createDatePlannerDay = ({ onBack, onChange, onBulk }) => {
  const root = document.getElementById('projection-day-editor');
  const make = (tag, text, className = '') => {
    const el = document.createElement(tag); el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const button = (text, action) => {
    const el = make('button', text); el.type = 'button'; el.addEventListener('click', action); return el;
  };
  function render({ key, plan, entries, past }) {
    const active = root.contains(document.activeElement) ? document.activeElement.dataset.control : null;
    const scroller = matchMedia('(max-width: 720px)').matches ? root.closest('.date-planner-layout') : root.closest('.date-planner-input');
    const oldScroll = scroller.scrollTop;
    root.replaceChildren();
    root.append(button('← Dates', onBack));
    const title = make('h3', anonScheduleModel.parse(key).toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'long' }));
    title.id = 'projection-day-title'; title.tabIndex = -1;
    const actionLabel = { attend: 'Attend', leave: 'Miss', od: 'OD', none: 'No correction' }[plan.action];
    root.append(title, make('p', past ? 'Select classes for OD correction. Unselected classes stay unchanged.'
      : `All classes start selected for ${actionLabel}. Unselect to ${plan.action === 'leave' ? 'attend' : 'miss'} a class, or customize its hours.`, 'day-editor-help'));
    const bulk = make('div', undefined, 'day-editor-bulk');
    for (const [value, label] of past ? [['none', 'No correction'], ['od', 'OD all']] : [['attend', 'Attend all'], ['leave', 'Miss all'], ['od', 'OD all']]) {
      const item = button(label, () => onBulk(value));
      item.dataset.control = 'bulk-' + value; bulk.append(item);
    }
    root.append(bulk);
    if (!entries.length) root.append(make('p', 'No confirmed classes for the selected batch on this day.', 'day-editor-help'));
    entries.forEach((entry, index) => {
      const id = dateProjection.entryKey(entry), total = anonHomeModel.hours(entry);
      const value = plan.classes?.[id] || { mode: plan.action };
      const mode = value.mode || 'attend';
      const row = make('article', undefined, 'day-editor-class'); row.dataset.entry = id;
      const classLabel = make('label', undefined, 'day-class-select');
      const included = make('input'); included.type = 'checkbox'; included.dataset.control = 'include-' + index;
      included.checked = past ? mode === 'od' : mode === plan.action || mode === 'partial';
      included.setAttribute('aria-label', `Select ${entry.title || entry.code} for ${actionLabel}`);
      included.addEventListener('change', () => onChange(id, { mode: included.checked ? past ? 'od' : plan.action : past ? 'none' : plan.action === 'leave' ? 'attend' : 'leave' }));
      classLabel.append(included, make('span', entry.title || entry.code));
      row.append(make('p', `${entry.start} – ${entry.end} · ${total}h`, 'day-editor-time'), classLabel, make('p', [entry.code, entry.room].filter(Boolean).join(' · '), 'day-editor-room'));
      const label = make('label', 'Attendance'); label.htmlFor = `day-class-${index}`;
      const select = make('select'); select.id = label.htmlFor; select.dataset.control = 'mode-' + index;
      const options = past ? [['none', 'No correction'], ['od', 'OD correction']] : [['attend', 'Attend'], ['leave', 'Miss'], ['od', 'OD'], ['partial', 'Part of this class']];
      for (const [value, text] of options) select.append(new Option(text, value));
      select.value = options.some(([item]) => item === mode) ? mode : 'none';
      select.addEventListener('change', () => onChange(id, { mode: select.value, hours: select.value === 'partial' ? 0 : total }));
      row.append(label, select);
      if (mode === 'partial' || past && mode === 'od') {
        const countLabel = make('label', past ? 'Hours to correct' : 'Hours attended'); countLabel.htmlFor = `day-hours-${index}`;
        const count = make('select'); count.id = countLabel.htmlFor; count.dataset.control = 'hours-' + index;
        for (let hours = 0; hours <= total; hours++) count.append(new Option(`${hours} of ${total}h`, String(hours)));
        count.value = String(value.hours ?? total);
        count.addEventListener('change', () => onChange(id, { mode, hours: Number(count.value) }));
        row.append(countLabel, count);
      }
      root.append(row);
    });
    root.append(make('p', 'Use the counted hours in your timetable. OD corrections cannot exceed recorded absences.', 'day-editor-help'));
    if (active) [...root.querySelectorAll('[data-control]')].find(el => el.dataset.control === active)?.focus({ preventScroll: true });
    scroller.scrollTop = oldScroll;
  }
  return { render, clear() { root.replaceChildren(); } };
};
