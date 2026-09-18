'use strict';

globalThis.dateAttendance = (() => {
  const model = classproScheduleModel;
  const get = id => document.getElementById(id);
  let courses = [], source = null, selected = {}, action = 'leave', focusCode = '';
  let today = model.clock('Asia/Kolkata'), month = new Date(today), filters = {};
  let removedCount = 0;
  const node = (tag, text) => { const item = document.createElement(tag); item.textContent = text; return item; };
  function reconcileDates() {
    const previous = Object.keys(selected).length;
    selected = Object.fromEntries(Object.entries(selected).filter(([key, value]) => {
      const date = model.parse(key);
      return date && model.dayState(source, date).kind === 'teaching' && (key >= model.key(today) || value === 'od');
    }));
    removedCount = previous - Object.keys(selected).length;
  }
  function setAction(value) {
    action = value;
    for (const button of get('date-actions').querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.action === action));
  }
  function render() {
    get('projection-month').textContent = month.toLocaleDateString('en', { month: 'long', year: 'numeric' });
    const grid = get('projection-calendar');
    const focused = grid.contains(document.activeElement) ? document.activeElement.dataset.date : null;
    grid.replaceChildren();
    for (const day of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) grid.append(node('span', day));
    const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
    for (let i = 0; i < first.getDay(); i++) grid.append(node('span', ''));
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    for (let day = 1; day <= count; day++) {
      const date = new Date(month.getFullYear(), month.getMonth(), day, 12);
      const key = model.key(date), state = model.dayState(source, date);
      const button = node('button', ''); button.type = 'button'; button.dataset.date = key;
      button.append(node('strong', day), node('small', selected[key] || (state.dayOrder ? `DO ${state.dayOrder}` : state.kind === 'holiday' ? 'Off' : '—')));
      button.disabled = state.kind !== 'teaching' || key < model.key(today) && action !== 'od';
      button.setAttribute('aria-pressed', String(Boolean(selected[key])));
      button.setAttribute('aria-label', `${date.toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' })}, ${state.dayOrder ? 'day order ' + state.dayOrder : state.kind}${selected[key] ? ', ' + selected[key] : ''}`);
      button.addEventListener('click', () => { if (selected[key] === action) delete selected[key]; else selected[key] = action; render(); });
      grid.append(button);
    }
    if (focused) {
      const previous = grid.querySelector(`[data-date="${focused}"]`);
      (previous && !previous.disabled ? previous : grid.querySelector('button:not(:disabled)') || get('projection-next')).focus();
    }
    const result = dateProjection.calculate(courses, source, selected, today, filters);
    const output = get('projection-result'); output.replaceChildren();
    const selectedCount = Object.keys(selected).length;
    get('projection-period').textContent = !source?.entries.length ? 'Timetable unavailable. Refresh reports to load it.'
      : result.unknown.length ? `${result.unknown.length} dates have no verified calendar. Results include known dates only.`
      : `${selectedCount} ${selectedCount === 1 ? 'date' : 'dates'} selected · ${selectedCount ? 'Projected attendance below' : 'Choose dates to calculate your margin'}`;
    if (removedCount) get('projection-period').textContent += ` Updated records cleared ${removedCount} unavailable ${removedCount === 1 ? 'date' : 'dates'}.`;
    const ordered = [...result.courses].sort((a, b) => Number(b.code === focusCode) - Number(a.code === focusCode));
    for (const course of ordered) {
      const prediction = course.prediction;
      const card = node('article', ''); card.className = 'date-projection-course';
      card.append(node('h3', course.title || course.code));
      if (!prediction.valid || prediction.percentage === null) card.append(node('p', 'No attendance hours recorded.'));
      else {
        const before = academicUI.margin(course.present, course.conducted);
        card.append(node('strong', `${before.percentage} → ${prediction.percentage}%`));
        card.append(node('p', prediction.neededToTarget ? `Required: ${prediction.neededToTarget}h` : `Margin: ${prediction.canMiss}h`));
        card.append(node('small', `${course.impact.attend}h attend · ${course.impact.miss}h leave · ${course.impact.od}h OD selected`));
      }
      output.append(card);
    }
  }
  for (const button of get('date-actions').querySelectorAll('button')) button.addEventListener('click', () => {
    setAction(button.dataset.action);
    render();
  });
  for (const [id, offset] of [['projection-prev', -1], ['projection-next', 1]]) get(id).addEventListener('click', () => { month = new Date(month.getFullYear(), month.getMonth() + offset, 1); render(); });
  get('projection-clear').addEventListener('click', () => { selected = {}; removedCount = 0; render(); });
  get('close-projection').addEventListener('click', () => get('projection-dialog').close());
  return {
    update(data, schedule, date, activeFilters) {
      courses = data; source = schedule; today = new Date(date); filters = activeFilters;
      reconcileDates();
      if (get('projection-dialog').open) render();
    },
    clock(date) {
      if (model.key(date) === model.key(today)) return;
      today = new Date(date); reconcileDates();
      if (get('projection-dialog').open) render();
    },
    open(code = '', date = null) {
      focusCode = code; month = new Date(date || today);
      if (date && model.dayState(source, date).kind === 'teaching' && model.key(date) >= model.key(today)) {
        selected[model.key(date)] = 'leave'; setAction('leave');
      }
      render(); get('projection-dialog').showModal();
    },
    clear() {
      courses = []; source = null; selected = {}; removedCount = 0; focusCode = ''; filters = {};
      setAction('leave'); get('projection-dialog').close();
      get('projection-result').replaceChildren(); get('projection-calendar').replaceChildren();
      get('projection-period').textContent = '';
    },
  };
})();
