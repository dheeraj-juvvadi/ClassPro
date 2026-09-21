'use strict';

globalThis.dateAttendance = (() => {
  const model = anonScheduleModel;
  const get = id => document.getElementById(id);
  let courses = [], source = null, selected = {}, action = 'leave', focusCode = '';
  let today = model.clock('Asia/Kolkata'), filters = {};
  let removedCount = 0, editedDay = '', changedClasses = 0, rangeAnchor = '', rangeStart = '', rangeEnd = '';
  const planAction = value => typeof value === 'object' && value ? value.action : value;
  const node = (tag, text) => { const item = document.createElement(tag); item.textContent = text; return item; };
  function removeDate(key) {
    delete selected[key]; removedCount = 0; rangeAnchor = '';
    const dates = Object.keys(selected).sort();
    rangeStart = dates[0] || ''; rangeEnd = dates.at(-1) || '';
  }
  const calendar = createDatePlannerCalendar({
    onToggle(key) {
      if (selected[key]) {
        removeDate(key);
      } else if (!rangeAnchor) {
        rangeAnchor = key; rangeStart = key; rangeEnd = '';
        if (!selected[key] || planAction(selected[key]) !== action) selected[key] = action;
      } else {
        [rangeStart, rangeEnd] = [rangeAnchor, key].sort();
        for (const day of source?.calendar || []) {
          if (day.date < rangeStart || day.date > rangeEnd || day.kind !== 'teaching' || day.date < model.key(today) && action !== 'od') continue;
          if (!selected[day.date] || planAction(selected[day.date]) !== action) selected[day.date] = action;
        }
        rangeAnchor = '';
      }
      removedCount = 0; render(); describeDate(key);
    },
    onFocus: key => describeDate(key),
  });
  const dayEditor = createDatePlannerDay({
    onBack() {
      const key = editedDay; editedDay = ''; render();
      get('projection-selections').querySelector(`button[data-date="${key}"]`)?.focus({ preventScroll: true });
    },
    onChange(id, value) { selected[editedDay].classes[id] = value; render(); },
    onBulk(action, changes = {}) {
      const plan = selected[editedDay];
      if (action) { plan.action = action; plan.classes = {}; }
      else Object.assign(plan.classes, changes);
      render();
    },
  });
  function editDay(key) {
    if (!selected[key]) return;
    if (typeof selected[key] === 'string') selected[key] = { action: selected[key], classes: {} };
    rangeAnchor = ''; editedDay = key; render();
    get('projection-day-title').focus({ preventScroll: true });
    const selector = matchMedia('(max-width: 720px)').matches ? '.date-planner-layout' : '.date-planner-input';
    get('projection-day-editor').closest(selector).scrollTop = 0;
  }
  function describeDate(key) {
    const date = model.parse(key);
    if (!date) return;
    const state = model.dayState(source, date);
    const label = date.toLocaleDateString('en', { month: 'short', day: 'numeric' });
    const hours = model.classes(source, date, filters).reduce((sum, entry) => sum + anonHomeModel.hours(entry), 0);
    get('projection-date-detail').textContent = `${label} · ${state.kind === 'teaching' ? `${state.dayOrder ? 'Day order ' + state.dayOrder + ' · ' : ''}${hours} class hours` : state.kind === 'holiday' ? 'Holiday' : 'Calendar unverified'}`;
  }
  function reconcileDates() {
    const previous = Object.keys(selected).length;
    changedClasses = 0;
    selected = Object.fromEntries(Object.entries(selected).filter(([key, value]) => {
      const date = model.parse(key);
      if (!date || model.dayState(source, date).kind !== 'teaching') return false;
      if (value && typeof value === 'object') {
        const entries = model.classes(source, date, filters);
        const valid = new Set(entries.map(entry => dateProjection.entryKey(entry)));
        for (const id of Object.keys(value.classes)) {
          if (!valid.has(id) || key < model.key(today) && value.classes[id].mode !== 'od') {
            delete value.classes[id]; changedClasses++;
          }
        }
        if (key < model.key(today) && value.action !== 'od') value.action = 'none';
        return key >= model.key(today) || entries.some(entry => dateProjection.hours(value, entry, true).od > 0);
      }
      return key >= model.key(today) || value === 'od';
    }));
    removedCount = previous - Object.keys(selected).length;
    if (!selected[editedDay]) editedDay = '';
    if (rangeAnchor && !selected[rangeAnchor]) rangeAnchor = '';
  }
  function setAction(value) {
    action = value;
    rangeAnchor = '';
    get('projection-dialog').dataset.mode = value;
    for (const button of get('date-actions').querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.action === action));
  }
  function render() {
    calendar.update({ today, source, action, selected: Object.fromEntries(Object.entries(selected).map(([key, value]) => [key, planAction(value)])) });
    get('projection-date-picker').hidden = !!editedDay;
    get('projection-day-editor').hidden = !editedDay;
    if (editedDay) dayEditor.render({ key: editedDay, plan: selected[editedDay], entries: model.classes(source, model.parse(editedDay), filters), past: editedDay < model.key(today) });
    const result = dateProjection.calculate(courses, source, selected, today, filters);
    const selectedCount = Object.keys(selected).length;
    if (!selectedCount) { rangeStart = ''; rangeEnd = ''; rangeAnchor = ''; }
    const shortDate = key => key ? model.parse(key).toLocaleDateString('en', { day: 'numeric', month: 'short' }) : 'Choose date';
    get('projection-range-start').textContent = shortDate(rangeStart);
    get('projection-range-end').textContent = rangeAnchor ? 'Choose end date' : shortDate(rangeEnd || rangeStart);
    get('projection-range').dataset.selecting = rangeAnchor ? 'end' : 'start';
    get('projection-action-hint').textContent = rangeAnchor ? 'Select the end date. Teaching days in between are included.'
      : selectedCount ? 'Tap a selected date to remove it. Edit its classes below.' : 'Select a start date, then an end date. One day works too.';
    get('projection-count').textContent = selectedCount;
    get('projection-clear').disabled = !selectedCount;
    const selections = get('projection-selections');
    const focusKey = selections.contains(document.activeElement) ? document.activeElement.dataset.date : '';
    selections.replaceChildren();
    if (!selectedCount) selections.append(node('p', 'Your selected days appear here.'));
    for (const [key, value] of Object.entries(selected).sort()) {
      const label = model.parse(key).toLocaleDateString('en', { month: 'short', day: 'numeric' });
      const group = node('div', ''); group.className = 'date-selected-item';
      const action = planAction(value);
      const actionLabel = typeof value === 'object' && Object.keys(value.classes).length ? 'Custom' : action === 'od' ? 'OD' : action === 'leave' ? 'Miss' : 'Attend';
      const edit = node('button', ''); edit.type = 'button'; edit.dataset.date = key;
      const dateLabel = node('span', label);
      const details = node('small', `${model.classes(source, model.parse(key), filters).length} classes · ${actionLabel}`);
      const arrow = node('span', '›'); arrow.setAttribute('aria-hidden', 'true');
      edit.append(dateLabel, details, arrow);
      edit.setAttribute('aria-label', `Edit classes for ${label}`);
      edit.addEventListener('click', () => editDay(key));
      const remove = node('button', '×'); remove.type = 'button'; remove.dataset.date = key;
      remove.setAttribute('aria-label', `Remove ${label}`);
      remove.addEventListener('click', () => { removeDate(key); render(); });
      group.append(edit, remove); selections.append(group);
    }
    if (focusKey) (selections.querySelector(`[data-date="${focusKey}"]`) || selections.querySelector('button') || get('projection-today')).focus();
    get('projection-period').textContent = !source ? 'Timetable unavailable. Refresh reports to load it.'
      : !source.entries.length ? 'No included classes. Review your optional periods in Schedule.'
      : result.unknown.length ? `${result.unknown.length} dates have no verified calendar. Results include known dates only.`
      : selectedCount ? `${selectedCount} ${selectedCount === 1 ? 'date' : 'dates'} selected. Open a date to customize its classes.` : '';
    if (removedCount) get('projection-period').textContent += ` Updated records cleared ${removedCount} unavailable ${removedCount === 1 ? 'date' : 'dates'}.`;
    if (changedClasses) get('projection-period').textContent += ` ${changedClasses} class edits were reset after the timetable changed.`;
    renderDatePlannerResults(result, focusCode, selectedCount);
  }
  for (const button of get('date-actions').querySelectorAll('button')) button.addEventListener('click', () => {
    setAction(button.dataset.action);
    render();
  });
  get('projection-today').addEventListener('click', () => calendar.today(today));
  get('projection-clear').addEventListener('click', () => { selected = {}; removedCount = 0; changedClasses = 0; editedDay = ''; rangeAnchor = ''; rangeStart = ''; rangeEnd = ''; render(); });
  get('close-projection').addEventListener('click', () => get('projection-dialog').close());
  get('projection-done').addEventListener('click', () => get('projection-dialog').close());
  return {
    openDay(date) {
      const key = model.key(date);
      if (model.dayState(source, date).kind !== 'teaching') return;
      setAction(key < model.key(today) ? 'od' : 'attend');
      selected[key] ||= { action, classes: {} };
      this.open('', date, true);
      editDay(key);
    },
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
    open(code = '', date = null, preserve = false) {
      focusCode = code; editedDay = ''; rangeAnchor = '';
      if (!preserve && date && model.dayState(source, date).kind === 'teaching' && model.key(date) >= model.key(today)) {
        selected[model.key(date)] = 'leave'; setAction('leave');
      }
      const dates = Object.keys(selected).sort(); rangeStart = dates[0] || ''; rangeEnd = dates.at(-1) || '';
      render(); get('projection-dialog').showModal(); calendar.open(date || today);
    },
    clear() {
      courses = []; source = null; selected = {}; removedCount = 0; changedClasses = 0; editedDay = ''; rangeAnchor = ''; rangeStart = ''; rangeEnd = ''; focusCode = ''; filters = {};
      setAction('leave'); get('projection-dialog').close();
      calendar.clear(); dayEditor.clear(); get('projection-result').replaceChildren(); get('projection-selections').replaceChildren();
      get('projection-period').textContent = '';
      get('projection-summary').textContent = ''; get('projection-date-detail').textContent = '';
    },
  };
})();
