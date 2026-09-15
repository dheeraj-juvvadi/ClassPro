'use strict';

globalThis.classproHome = (() => {
  const model = globalThis.classproHomeModel;
  const planner = globalThis.classproScheduleModel;
  const storageKey = 'classpro-weekly-schedule-v1';
  let schedule = [];
  let attendance = [];
  let preview = false;
  let reportError = '';
  let reportedSchedule = null;
  let scheduleInvalid = false;
  let selectedDate = null;
  const filters = { allocation: '', batch: '' };
  const source = () => reportedSchedule || schedule;
  const get = identifier => document.getElementById(identifier);
  const element = (tag, className, text) => {
    const result = document.createElement(tag);
    result.className = className;
    if (text !== undefined) result.textContent = text;
    return result;
  };
  const now = () => preview ? new Date(2026, 8, 14, 9, 48) : planner.clock(reportedSchedule?.timezone || 'Asia/Kolkata');
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (Array.isArray(saved)) schedule = saved.filter(entry => model.valid(entry)).slice(0, 100);
  } catch {}

  function describe(date) {
    const state = planner.dayState(source(), date);
    if (state.kind === 'holiday') return { ...state, label: state.label || 'Holiday', short: 'Holiday' };
    if (state.kind === 'teaching') return { ...state, label: state.dayOrder ? `Day order ${state.dayOrder}` : 'Teaching day · day order unavailable', short: state.dayOrder ? `DO ${state.dayOrder}` : 'Class day' };
    if (state.kind === 'manual') return { ...state, label: 'Manual weekly plan · holidays and day orders unverified', short: 'Manual' };
    return { ...state, label: 'Calendar unavailable for this date', short: 'Unknown' };
  }
  const calendar = createScheduleCalendar({ container: get('schedule-calendar'), date: now(), describe,
    onSelect(date) { selectedDate = date; render(); } });

  function updateFilters() {
    for (const field of ['allocation', 'batch']) {
      const select = get(`${field}-filter`);
      const values = [...new Set((reportedSchedule?.entries || schedule).map(entry => entry[field]).filter(Boolean))].sort();
      select.replaceChildren(new Option(`All ${field === 'batch' ? 'batches' : 'allocations'}`, ''), ...values.map(value => new Option(value, value)));
      if (!values.includes(filters[field])) filters[field] = '';
      select.value = filters[field];
      select.disabled = !values.length;
    }
  }
  for (const field of ['allocation', 'batch']) get(`${field}-filter`).addEventListener('change', event => { filters[field] = event.target.value; render(); });
  updateFilters();

  function page(destination, focus = true) {
    document.body.dataset.page = destination;
    get('home-view').hidden = destination !== 'home';
    get('reports-view').hidden = destination === 'home';
    get('attendance-panel').hidden = destination !== 'attendance';
    get('marks-panel').hidden = destination !== 'marks';
    get('calculate-attendance').hidden = destination !== 'attendance';
    for (const button of document.querySelectorAll('[data-page]')) {
      if (button.dataset.page === destination) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    get('reports-title').textContent = destination === 'marks' ? 'Your marks.' : 'Your attendance.';
    if (focus) get(destination === 'home' ? 'home-title' : 'reports-title').focus();
    get('planner-menu').open = false;
  }

  function render() {
    const date = now();
    get('home-title').textContent = date.getHours() < 12 ? 'Good morning.' : date.getHours() < 17 ? 'Good afternoon.' : 'Good evening.';
    get('home-date').textContent = new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
    const day = selectedDate || date;
    const classes = planner.classes(source(), day, filters);
    const minute = date.getHours() * 60 + date.getMinutes();
    const next = planner.next(source(), date, filters);
    const sameDay = next && planner.key(next.date) === planner.key(date);
    const nextClasses = next ? planner.classes(source(), next.date, filters) : [];
    const nextIndex = nextClasses.findIndex(entry => entry.start === next?.start && entry.code === next?.code);
    const card = get('next-class-card');
    card.replaceChildren();
    const top = element('div', 'next-class-top');
    top.append(element('span', 'planner-eyebrow', next?.unknown ? 'Next known class' : 'Next class'));
    const ongoing = sameDay && model.minutes(next.start) <= minute;
    top.append(element('span', 'class-countdown', next ? ongoing ? 'Ongoing' : sameDay ? `Starts in ${model.minutes(next.start) - minute} min` : next.date.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' }) : ''));
    card.append(top);
    const title = element('h2', '', next?.title || (reportedSchedule ? 'No next class confirmed.' : schedule.length ? 'No upcoming classes.' : 'Make room for your day.'));
    title.id = 'next-class-title';
    card.append(title);
    if (next) {
      card.append(element('p', 'class-time', `${next.start} → ${next.end}`));
      card.append(element('p', 'class-room', next.room));
    } else card.append(element('p', 'class-room', reportedSchedule ? 'A verified teaching calendar is needed to place timetable periods on dates.' : 'Add your manual weekly schedule to see what’s next.'));
    const bottom = element('div', 'next-class-bottom');
    const following = nextClasses[nextIndex + 1];
    bottom.append(element('p', '', next && following ? `Next · ${following.title} · ${following.start}` : next ? 'Last class of the day' : 'Your weekly planner'));
    const action = element('button', 'class-arrow', '↗');
    action.type = 'button';
    action.setAttribute('aria-label', next ? 'View weekly schedule' : 'Add your schedule');
    action.addEventListener('click', openSchedule);
    bottom.append(action);
    card.append(bottom);
    renderInsights(classes);
    const state = describe(day);
    get('today-title').textContent = planner.key(day) === planner.key(date) ? 'Today’s classes' : day.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'short' });
    get('schedule-source').textContent = `${scheduleInvalid ? 'Schedule report unavailable. ' : ''}${state.label}${next?.unknown ? ' · Gaps before the next known class are unverified.' : ''}`;
    renderTimeline(classes, planner.key(day) === planner.key(date) ? minute : -1);
    calendar.today(date);
  }

  function renderInsights(classes) {
    const container = get('home-insights');
    container.replaceChildren();
    const todaysCodes = new Set(classes.map(entry => entry.code));
    const ordered = [...attendance].sort((first, second) => Number(todaysCodes.has(second.code)) - Number(todaysCodes.has(first.code)));
    for (const course of ordered.slice(0, 2)) {
      const insight = model.insight(course);
      const card = element('button', `insight-card ${insight.tone}`);
      card.type = 'button';
      card.setAttribute('aria-label', `${course.title}: ${insight.percentage}. ${insight.detail || insight.margin}`);
      card.append(element('span', 'planner-eyebrow', course.title), element('span', 'insight-percentage', insight.percentage), element('span', 'insight-margin', insight.margin));
      card.addEventListener('click', () => page('attendance'));
      container.append(card);
    }
    if (!ordered.length) container.append(element('p', 'home-empty', reportError || 'Your attendance insights will appear once reports are loaded.'));
  }

  function renderTimeline(classes, minute) {
    get('today-count').textContent = `${classes.length} ${classes.length === 1 ? 'class' : 'classes'}`;
    const list = get('today-classes');
    list.replaceChildren();
    for (const entry of classes) {
      const ongoing = model.minutes(entry.start) <= minute && model.minutes(entry.end) > minute;
      const row = element('li', ongoing ? 'timeline-row ongoing' : 'timeline-row');
      const times = element('div', 'timeline-times');
      times.append(element('time', '', entry.start), element('time', '', entry.end));
      const description = element('div', 'timeline-description');
      description.append(element('h3', '', entry.title), element('p', '', entry.room));
      const course = attendance.find(subject => subject.code === entry.code);
      const insight = course && model.insight(course);
      row.append(times, description, element('span', `timeline-status ${ongoing ? 'healthy' : insight?.tone || ''}`, ongoing ? 'Ongoing' : insight?.percentage || ''));
      if (course) {
        const hours = (model.minutes(entry.end) - model.minutes(entry.start)) / 60;
        const plan = element('button', 'period-plan', `Plan ${hours}h ↗`);
        plan.type = 'button';
        plan.setAttribute('aria-label', `Plan attendance for ${entry.title}, ${hours} hours`);
        plan.addEventListener('click', () => academicUI.plan(course.code, hours));
        description.append(plan);
      }
      if (entry.allocation || entry.batch) description.append(element('p', '', [entry.allocation, entry.batch].filter(Boolean).join(' · ')));
      list.append(row);
    }
    if (!classes.length) {
      const state = describe(selectedDate || now());
      list.append(element('li', 'home-empty', state.kind === 'holiday' ? `${state.label} · no classes.` : state.kind === 'unknown' ? 'No verified calendar for this date. Open Schedule to view available periods or set up a manual plan.' : 'No classes for this date and filter selection.'));
    }
  }

  function saveSchedule(next) {
    try {
      if (!preview) localStorage.setItem(storageKey, JSON.stringify(next));
      schedule = next;
      get('schedule-error').textContent = '';
      renderSchedule();
      render();
      return true;
    } catch {
      get('schedule-error').textContent = 'Could not save on this device. Check your browser storage settings.';
      return false;
    }
  }

  function renderSchedule() {
    const list = get('schedule-entries');
    list.replaceChildren();
    get('schedule-form').hidden = Boolean(reportedSchedule);
    get('schedule-help').textContent = reportedSchedule ? 'Reported timetable. Calendar dates appear only when supplied by your provider. Allocation and batch filters apply on Home.' : 'Manual weekly plan, saved on this device. Holidays and day orders are unavailable. Add one entry for the full class duration.';
    for (const [index, entry] of (reportedSchedule?.entries || schedule).entries()) {
      const row = element('li', 'schedule-entry');
      const day = entry.dayOrder ? `Day order ${entry.dayOrder}` : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][entry.day];
      row.append(element('span', '', [day, `${entry.start}–${entry.end}`, entry.title, entry.allocation, entry.batch].filter(Boolean).join(' · ')));
      const remove = element('button', '', '×');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Remove ${entry.title}, ${day} ${entry.start}`);
      remove.addEventListener('click', () => saveSchedule(schedule.filter((entry, position) => position !== index)));
      if (!reportedSchedule) row.append(remove);
      list.append(row);
    }
    if (!(reportedSchedule?.entries || schedule).length) list.append(element('li', 'quiet', 'No classes added yet.'));
  }

  function openSchedule() {
    get('planner-menu').open = false;
    get('schedule-error').textContent = '';
    renderSchedule();
    get('schedule-dialog').showModal();
  }

  get('open-schedule').addEventListener('click', openSchedule);
  get('close-schedule').addEventListener('click', () => get('schedule-dialog').close());
  get('open-subjects').addEventListener('click', () => page('attendance'));
  for (const button of document.querySelectorAll('[data-page]')) button.addEventListener('click', () => page(button.dataset.page));
  document.addEventListener('click', event => {
    if (!get('planner-menu').contains(event.target)) get('planner-menu').open = false;
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && get('planner-menu').open) {
      get('planner-menu').open = false;
      get('planner-menu').querySelector('summary').focus();
    }
  });
  get('schedule-form').addEventListener('submit', event => {
    event.preventDefault();
    const entry = { day: Number(get('schedule-day').value), code: get('schedule-code').value.trim(),
      title: get('schedule-name').value.trim(), start: get('schedule-start').value,
      end: get('schedule-end').value, room: get('schedule-room').value.trim() };
    if (!model.valid(entry)) { get('schedule-error').textContent = 'Complete every field and choose an end time after the start.'; return; }
    if (schedule.length >= 100) { get('schedule-error').textContent = 'Remove an entry before adding more classes.'; return; }
    if (schedule.some(existing => existing.day === entry.day && entry.start < existing.end && entry.end > existing.start)) {
      get('schedule-error').textContent = 'This overlaps another class. Check the start and end times.';
      return;
    }
    if (saveSchedule([...schedule, entry])) get('schedule-form').reset();
  });
  setInterval(() => { if (!get('home-view').hidden && !document.hidden) render(); }, 60000);

  return {
    enter() { render(); page('home'); },
    clear() { attendance = []; reportError = ''; reportedSchedule = null; scheduleInvalid = false; selectedDate = null; filters.allocation = ''; filters.batch = ''; get('schedule-dialog').close(); updateFilters(); },
    update(report, scheduleReport) {
      attendance = Array.isArray(report?.data) ? report.data : [];
      reportError = report?.error?.message || '';
      reportedSchedule = planner.normalize(scheduleReport);
      scheduleInvalid = scheduleReport != null && !reportedSchedule;
      selectedDate = null;
      updateFilters();
      calendar.reset(now());
      render();
    },
    preview() {
      preview = true;
      get('home-preview-note').hidden = false;
      schedule = [
        { day: 1, code: 'DS', title: 'Data Structures', start: '10:30', end: '12:30', room: 'Lab 3 · Tech Block' },
        { day: 1, code: 'OS', title: 'Operating Systems', start: '12:30', end: '13:30', room: 'Room 204' },
        { day: 1, code: 'CN', title: 'Computer Networks', start: '14:30', end: '15:30', room: 'Lab 1 · Main Block' },
        { day: 1, code: 'DM', title: 'Discrete Mathematics', start: '17:00', end: '18:00', room: 'Room 301' },
      ];
      return { attendance: { data: [
        { code: 'DS', title: 'Data Structures', present: 18, conducted: 22, absent: 4, percentage: 82 },
        { code: 'CN', title: 'Computer Networks', present: 13, conducted: 19, absent: 6, percentage: 68 },
        { code: 'OS', title: 'Operating Systems', present: 20, conducted: 22, absent: 2, percentage: 91 },
        { code: 'DM', title: 'Discrete Mathematics', present: 19, conducted: 25, absent: 6, percentage: 76 },
      ] }, marks: { data: [
        { code: 'DS', title: 'Data Structures', scored: 43, total: 50, components: [{ name: 'Cycle test 1', scored: 18, total: 20 }, { name: 'Lab evaluation', scored: 25, total: 30 }] },
        { code: 'CN', title: 'Computer Networks', scored: 32, total: 50, components: [{ name: 'Cycle test 1', scored: 12, total: 20 }, { name: 'Lab evaluation', scored: 20, total: 30 }] },
        { code: 'OS', title: 'Operating Systems', scored: 54, total: 60, components: [{ name: 'Cycle test 1', scored: 27, total: 30 }, { name: 'Lab evaluation', scored: 27, total: 30 }] },
      ] } };
    },
  };
})();
