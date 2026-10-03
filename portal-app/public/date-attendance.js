'use strict';

globalThis.dateAttendance = (() => {
  const model = anonScheduleModel;
  const get = id => document.getElementById(id);
  let courses = [], source = null, selected = {}, action = 'leave', mode = 'leave', focusCode = '';
  let today = model.clock('Asia/Kolkata'), filters = {};
  let removedCount = 0, editedDay = '', changedClasses = 0, rangeAnchor = '', rangeStart = '', rangeEnd = '';
  let step = 'dates', requestedRange = null, opener = null, excludedDates = new Set();
  let rangeComplete = false;
  let applied = null;
  const shortDate = key => key ? model.parse(key)?.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) || '' : '';
  function showStep(value, focus = false) {
    step = value;
    get('projection-dialog').dataset.step = value;
    get('projection-dialog').querySelector('.date-planner-input').hidden = value !== 'dates';
    get('projection-outlook').hidden = value !== 'results';
    get('projection-dialog').querySelector('.date-planner-footer').hidden = value !== 'results';
    get('projection-change').hidden = value !== 'results';
    const activeMode = value === 'results' ? requestedRange?.action || mode : mode;
    const copy = {
      leave: ['Planning a break?', 'Pick the days you’ll be away.', 'After your break.'],
      attend: ['Planning to attend?', 'Pick the days you’ll attend.', 'After attending.'],
      od: ['Correcting an OD?', 'Pick past dates to estimate your correction.', 'After your OD correction.'],
    }[activeMode];
    get('projection-dialog').dataset.mode = activeMode;
    get('projection-title').textContent = 'Plan attendance';
    get('projection-intro').textContent = value === 'results' ? 'Your estimated attendance.' : copy[1];
    if (focus) {
      get('projection-title').focus({ preventScroll: true });
      get('projection-dialog').scrollTop = 0;
    }
  }
  function yesterdayKey() {
    const date = new Date(today); date.setDate(date.getDate() - 1); return model.key(date);
  }
  function updateAssumption() {
    const from = get('projection-from'), through = get('projection-through');
    const ongoing = requestedRange?.action === mode && requestedRange.start < model.key(today) && requestedRange.end >= model.key(today);
    from.min = mode === 'od' ? '' : ongoing ? requestedRange.start : model.key(today);
    from.max = through.max = mode === 'od' ? yesterdayKey() : '';
    through.min = mode === 'od' ? from.value : [from.value, model.key(today)].sort().at(-1);
    const start = model.parse(from.value);
    let text;
    if (mode === 'od') text = 'Past dates only. Corrections are capped at recorded absences.';
    else if (start && model.key(start) > model.key(today)) {
      start.setDate(start.getDate() - 1);
      const unchanged = requestedRange?.action === mode && requestedRange.start === from.value && requestedRange.end === through.value;
      const custom = unchanged && Object.entries(selected).some(([key, value]) => key >= model.key(today) && key < from.value
        && (planAction(value) === 'leave' || typeof value === 'object' && Object.keys(value.classes).length));
      text = custom ? 'Your custom days before this range are included.'
        : `Assuming you attend until ${start.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}.`;
    } else if (start && model.key(start) < model.key(today)) text = 'This range is already underway. Estimating from today using your recorded attendance.';
    else text = mode === 'attend' ? 'Your attendance plan starts today.' : 'Your leave starts today.';
    get('projection-assumption').textContent = text;
  }
  function syncRangeInputs() {
    const fallback = mode === 'od' ? yesterdayKey() : model.key(today);
    const range = requestedRange?.action === mode ? requestedRange : null;
    const valid = key => key && (mode === 'od' ? key < model.key(today) : key >= model.key(today));
    get('projection-mode').value = mode;
    get('projection-from').value = range?.start || (valid(rangeStart) ? rangeStart : fallback);
    get('projection-through').value = range?.end || (valid(rangeEnd || rangeStart) ? rangeEnd || rangeStart : fallback);
    updateAssumption();
  }
  function rangeError(message = '') {
    get('projection-range-error').textContent = message;
    get('projection-range-error').hidden = !message;
  }
  const planAction = value => typeof value === 'object' && value ? value.action : value;
  const node = (tag, text) => { const item = document.createElement(tag); item.textContent = text; return item; };
  function syncBounds() {
    const dates = Object.keys(selected).sort();
    rangeStart = dates[0] || '';
    rangeEnd = dates.at(-1) || '';
    requestedRange = dates.length ? { start: rangeStart, end: rangeEnd, action: mode } : null;
  }
  function removeDate(key) {
    delete selected[key]; excludedDates.add(key); removedCount = 0; rangeAnchor = '';
    syncBounds();
  }
  const calendar = createDatePlannerCalendar({
    onToggle(key) {
      if (action === 'od' ? key >= model.key(today) : key < model.key(today)) return;
      if (rangeComplete) {
        if (selected[key]) removeDate(key);
        else { selected[key] = action; excludedDates.delete(key); }
      } else if (!rangeAnchor) {
        rangeAnchor = key; selected = { [key]: action }; excludedDates.clear();
      } else {
        const [start, end] = [rangeAnchor, key].sort();
        if ((model.parse(end) - model.parse(start)) / 86400000 >= 400) {
          rangeError('Choose a range of up to 400 days.'); calendar.update(calendarState()); return;
        }
        selected = {};
        for (let date = model.parse(start); model.key(date) <= end; date.setDate(date.getDate() + 1)) selected[model.key(date)] = action;
        rangeAnchor = ''; rangeComplete = true;
      }
      syncBounds();
      rangeError(); removedCount = 0; syncRangeInputs(); render(); describeDate(key);
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
    get('projection-day-editor').scrollIntoView({ block: 'start' });
  }
  function describeDate(key) {
    const date = model.parse(key);
    if (!date) return;
    const state = model.dayState(source, date);
    const label = date.toLocaleDateString('en', { month: 'short', day: 'numeric' });
    const hours = model.classes(source, date, filters).reduce((sum, entry) => sum + anonHomeModel.hours(entry), 0);
    const event = state.label && !/^(instructional day|teaching day|holiday)$/i.test(state.label) ? ` · ${state.label}` : '';
    get('projection-date-detail').textContent = `${label} · ${state.kind === 'teaching' ? `${state.dayOrder ? 'DO ' + state.dayOrder + ' · ' : ''}${hours}h` : state.kind === 'holiday' ? 'Holiday' : 'Unconfirmed'}${event}`;
  }
  function reconcileDates() {
    const expired = requestedRange && requestedRange.action !== 'od' && requestedRange.end < model.key(today);
    if (expired) {
      requestedRange = null; excludedDates.clear(); rangeAnchor = ''; rangeStart = ''; rangeEnd = '';
      showStep('dates');
    }
    const previous = Object.keys(selected).length;
    changedClasses = 0;
    selected = Object.fromEntries(Object.entries(selected).filter(([key, value]) => {
      const date = model.parse(key);
      if (!date) return false;
      if (model.dayState(source, date).kind !== 'teaching') return key >= model.key(today) || planAction(value) === 'od';
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
    syncBounds();
    if (expired) syncRangeInputs();
    else updateAssumption();
  }
  function setAction(value) {
    action = value;
    rangeAnchor = '';
    for (const button of get('date-actions').querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.action === action));
  }
  function setMode(value) {
    mode = value; get('projection-mode').value = value;
    setAction(value); showStep(step);
  }
  function calendarState() {
    return { today, source, action, selected: Object.fromEntries(Object.entries(selected).map(([key, value]) => [key, planAction(value)])) };
  }
  function render() {
    calendar.update(calendarState());
    get('projection-date-picker').hidden = !!editedDay;
    get('projection-day-editor').hidden = !editedDay;
    if (editedDay) dayEditor.render({ key: editedDay, plan: selected[editedDay], entries: model.classes(source, model.parse(editedDay), filters), past: editedDay < model.key(today) });
    const result = dateProjection.calculate(courses, source, selected, today, filters, requestedRange);
    const selectedCount = Object.keys(selected).length;
    if (!selectedCount && !requestedRange) { rangeStart = ''; rangeEnd = ''; rangeAnchor = ''; }
    if (step === 'results') {
      const range = result.range;
      const beforeFuture = range?.action !== 'od' && range?.before && range.before >= model.key(today);
      const customBefore = result.courses.some(course => course.beforeImpact?.miss > 0);
      const unknownBefore = result.unknown.some(key => key >= model.key(today) && key < range?.start);
      const context = beforeFuture ? customBefore ? ' · Includes your custom days' : unknownBefore ? ' · Known dates only'
        : ` · Attending until ${shortDate(range.before)}` : range?.beforeElapsed ? ' · Remaining dates from today' : '';
      get('projection-intro').textContent = range ? `${shortDate(range.start)}–${shortDate(range.end)}${context}` : 'Your estimated attendance.';
      get('projection-result-date').textContent = range ? `On ${shortDate(range.end)}` : 'After changes';
    }
    get('projection-range-start').textContent = shortDate(rangeStart) || 'Start date';
    get('projection-range-end').textContent = rangeAnchor ? 'End date' : shortDate(rangeEnd || rangeStart) || 'End date';
    get('projection-range').dataset.selecting = rangeAnchor ? 'end' : 'start';
    get('projection-action-hint').textContent = rangeAnchor ? 'Select the end date. Teaching days in between are included.'
      : selectedCount ? 'Tap a selected date to remove it. Edit its classes below.' : 'Select a start date, then an end date. One day works too.';
    get('projection-count').textContent = selectedCount;
    get('projection-clear').disabled = !selectedCount && !requestedRange;
    const selections = get('projection-selections');
    const focusKey = selections.contains(document.activeElement) ? document.activeElement.dataset.date : '';
    selections.replaceChildren();
    if (!selectedCount) selections.append(node('p', 'Your selected days appear here.'));
    for (const [key, value] of Object.entries(selected).sort()) {
      if (model.dayState(source, model.parse(key)).kind !== 'teaching') continue;
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
      : result.unknown.length ? `${result.unknown.length} dates have no verified calendar. Incomplete estimates are shown as —.`
      : selectedCount ? `${selectedCount} ${selectedCount === 1 ? 'date' : 'dates'} selected. Open a date to customize its classes.` : '';
    if (removedCount) get('projection-period').textContent += ` Updated records cleared ${removedCount} unavailable ${removedCount === 1 ? 'date' : 'dates'}.`;
    if (changedClasses) get('projection-period').textContent += ` ${changedClasses} class edits were reset after the timetable changed.`;
    renderDatePlannerResults(result, focusCode, selectedCount);
    anonLeaves.update({ result, selected, source, today, filters, mode });
  }
  function calculate() {
    if (!Object.keys(selected).length) return;
    rangeComplete = true; rangeAnchor = ''; syncBounds(); render();
    const result = dateProjection.calculate(courses, source, selected, today, filters, requestedRange);
    if (result.error) { rangeError(result.error); return; }
    applied = structuredClone({ selected, range: requestedRange, mode });
    academicUI.refreshAttendance(courses);
    opener = null; get('projection-dialog').close(); anonHome.navigate('attendance');
  }
  get('projection-range-form').addEventListener('submit', event => {
    event.preventDefault();
    const start = get('projection-from').value, end = get('projection-through').value;
    const changed = requestedRange?.start !== start || requestedRange?.end !== end || requestedRange?.action !== mode;
    const proposed = changed ? {} : selected;
    if (mode === 'od' && (start >= model.key(today) || end >= model.key(today))) {
      rangeError('Choose dates before today for an OD correction.'); return;
    }
    if (mode !== 'od' && (end < model.key(today) || changed && start < model.key(today))) {
      rangeError('Choose today or a future start date.'); return;
    }
    if (changed) {
      const first = model.parse(start), last = model.parse(end);
      if (first && last) for (let date = first, count = 0; date <= last && count < 400; date.setDate(date.getDate() + 1), count++) {
        proposed[model.key(date)] = mode;
      }
    }
    const range = { start, end, action: mode };
    const result = dateProjection.calculate(courses, source, proposed, today, filters, range);
    if (result.error) { rangeError(result.error); return; }
    if (changed) excludedDates.clear();
    selected = proposed; requestedRange = range; rangeStart = start; rangeEnd = end;
    editedDay = ''; rangeAnchor = ''; removedCount = 0; changedClasses = 0;
    rangeError(); setAction(mode); rangeComplete = true; calculate();
  });
  get('projection-mode').addEventListener('change', () => {
    selected = {}; requestedRange = null; excludedDates.clear();
    rangeComplete = false;
    rangeStart = ''; rangeEnd = ''; rangeAnchor = ''; editedDay = ''; removedCount = 0; changedClasses = 0;
    setMode(get('projection-mode').value); rangeError(); syncRangeInputs(); render();
  });
  get('projection-from').addEventListener('change', updateAssumption);
  get('projection-through').addEventListener('change', updateAssumption);
  get('projection-change').addEventListener('click', () => { showStep('dates', true); syncRangeInputs(); render(); });
  get('projection-customize').addEventListener('toggle', () => {
    if (get('projection-customize').open && get('projection-dialog').open) calendar.open(model.parse(rangeStart) || today);
  });
  get('projection-review-custom').addEventListener('click', () => {
    if (!Object.keys(selected).length && !requestedRange) { rangeError('Choose a date or customize a day first.'); return; }
    rangeError(); calculate();
  });
  get('projection-dialog').addEventListener('close', () => {
    const target = opener; opener = null;
    if (target?.isConnected) target.focus({ preventScroll: true });
  });
  for (const button of get('date-actions').querySelectorAll('button')) button.addEventListener('click', () => {
    if (mode === button.dataset.action) return;
    selected = {}; requestedRange = null; excludedDates.clear(); rangeComplete = false;
    rangeStart = ''; rangeEnd = ''; rangeAnchor = ''; editedDay = '';
    setMode(button.dataset.action); syncRangeInputs(); rangeError(); render();
    calendar.today(mode === 'od' ? model.parse(yesterdayKey()) : today);
  });
  get('projection-today').addEventListener('click', () => calendar.today(today));
  get('projection-clear').addEventListener('click', () => { selected = {}; requestedRange = null; excludedDates.clear(); rangeComplete = false; removedCount = 0; changedClasses = 0; editedDay = ''; rangeAnchor = ''; rangeStart = ''; rangeEnd = ''; rangeError(); syncRangeInputs(); render(); });
  get('close-projection').addEventListener('click', () => get('projection-dialog').close());
  get('projection-done').addEventListener('click', () => get('projection-dialog').close());
  return {
    projection(data) {
      if (!applied) return null;
      if (applied.mode !== 'od' && applied.range?.end < model.key(today)) {
        applied = null; return null;
      }
      const result = dateProjection.calculate(data, source, applied.selected, today, filters, applied.range);
      const range = applied.range;
      const label = { leave: 'After planned leave', attend: 'After planned attendance', od: 'After OD correction' }[applied.mode];
      const dates = range ? `${shortDate(range.start)}–${shortDate(range.end)}` : '';
      return { result, summary: `${label}${dates ? ` · ${dates}` : ''}` };
    },
    resetProjection() { applied = null; academicUI.refreshAttendance(courses); },
    openDay(date) {
      const key = model.key(date);
      if (model.dayState(source, date).kind !== 'teaching') return;
      setMode(key < model.key(today) ? 'od' : 'attend');
      selected[key] ||= { action, classes: {} };
      rangeComplete = true;
      requestedRange = null; excludedDates.delete(key);
      this.open('', date, true);
      get('projection-customize').open = true;
      calendar.open(date); editDay(key);
    },
    update(data, schedule, date, activeFilters) {
      courses = data; source = schedule; today = new Date(date); filters = activeFilters;
      reconcileDates();
      if (applied) academicUI.refreshAttendance(courses);
      if (get('projection-dialog').open || document.body.dataset.page === 'leaves') render();
    },
    clock(date) {
      if (model.key(date) === model.key(today)) return;
      today = new Date(date); reconcileDates();
      if (applied) academicUI.refreshAttendance(courses);
      if (get('projection-dialog').open || document.body.dataset.page === 'leaves') render();
    },
    open(code = '', date = null, preserve = false) {
      opener = document.activeElement;
      focusCode = code; editedDay = ''; rangeAnchor = '';
      if (!preserve && date && model.dayState(source, date).kind === 'teaching' && model.key(date) >= model.key(today)) {
        selected[model.key(date)] = 'leave'; setMode('leave'); requestedRange = null; excludedDates.delete(model.key(date));
      }
      const dates = Object.keys(selected).sort();
      rangeStart = requestedRange?.start || dates[0] || ''; rangeEnd = requestedRange?.end || dates.at(-1) || '';
      rangeComplete = !!dates.length;
      showStep('dates'); rangeError(); syncRangeInputs(); get('projection-customize').open = true;
      render(); get('projection-dialog').showModal();
      calendar.open(date || model.parse(rangeStart) || (mode === 'od' ? model.parse(yesterdayKey()) : today));
    },
    clear() {
      applied = null; academicUI.refreshAttendance(courses);
      courses = []; source = null; selected = {}; removedCount = 0; changedClasses = 0; editedDay = ''; rangeAnchor = ''; rangeStart = ''; rangeEnd = ''; focusCode = ''; filters = {};
      requestedRange = null; excludedDates.clear(); opener = null; step = 'dates'; rangeError();
      rangeComplete = false; anonLeaves.clear();
      today = model.clock('Asia/Kolkata');
      setMode('leave'); syncRangeInputs(); get('projection-dialog').close();
      get('projection-customize').open = false; get('projection-date-picker').hidden = false; get('projection-day-editor').hidden = true;
      calendar.clear(); dayEditor.clear(); get('projection-result').replaceChildren(); get('projection-selections').replaceChildren();
      get('projection-period').textContent = ''; get('projection-count').textContent = '0'; get('projection-clear').disabled = true;
      get('projection-range-start').textContent = ''; get('projection-range-end').textContent = ''; get('projection-range').dataset.selecting = 'start';
      get('projection-action-hint').textContent = 'Select a start date, then an end date. One day works too.';
      get('projection-result-date').textContent = 'After changes';
      get('projection-summary').textContent = ''; get('projection-date-detail').textContent = '';
    },
  };
})();
