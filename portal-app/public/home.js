'use strict';

globalThis.classproHome = (() => {
  const model = globalThis.classproHomeModel;
  const planner = globalThis.classproScheduleModel;
  let schedule = [];
  let studentName = '';
  let greetingExtras = [];
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
    for (const field of ['batch']) {
      const select = get(`${field}-filter`);
      const values = [...new Set((reportedSchedule?.entries || schedule).map(entry => entry[field]).filter(Boolean))].sort();
      select.replaceChildren(new Option(`All ${field === 'batch' ? 'batches' : 'allocations'}`, ''), ...values.map(value => new Option(value, value)));
      if (!values.includes(filters[field])) filters[field] = '';
      select.value = filters[field];
      select.disabled = !values.length;
      select.parentElement.hidden = !values.length;
    }
  }
  for (const field of ['batch']) get(`${field}-filter`).addEventListener('change', event => { filters[field] = event.target.value; render(); });
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
    get('home-title').textContent = anonGreeting(studentName, preview ? date : planner.clock('Asia/Kolkata'), greetingExtras);
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
    const title = element('h2', '', next?.title || (reportedSchedule ? 'No next class confirmed.' : schedule.length ? 'No upcoming classes.' : 'Timetable unavailable.'));
    title.id = 'next-class-title';
    card.append(title);
    if (next) {
      card.append(element('p', 'class-time', `${next.start} → ${next.end}`));
      card.append(element('p', 'class-room', next.room));
      if (courseDetails.clean(next.faculty)) card.append(element('p', 'class-room', courseDetails.clean(next.faculty)));
      const course = attendance.find(subject => subject.code === next.code);
      const insight = course && model.insight(course);
      const stats = element('div', 'next-class-stats');
      for (const [label, value] of [['Duration', `${model.hours(next)}h`],
        ['Attendance', insight?.percentage || '—'], ['75% target', insight?.margin || 'No record']]) {
        const stat = element('div', '');
        stat.append(element('span', '', label), element('strong', '', value));
        stats.append(stat);
      }
      card.append(stats);

    } else card.append(element('p', 'class-room', reportedSchedule ? 'A verified teaching calendar is needed to place timetable periods on dates.' : 'Refresh reports or sign in again to load your SRM timetable.'));
    const bottom = element('div', 'next-class-bottom');
    const following = nextClasses[nextIndex + 1];
    bottom.append(element('p', '', next && following ? `Next · ${following.title} · ${following.start}` : next ? 'Last class of the day' : 'Your attendance'));
    const action = element('button', 'class-arrow', '↗');
    action.type = 'button';
    action.setAttribute('aria-label', 'View attendance');
    action.addEventListener('click', () => page('attendance'));
    bottom.append(action);
    card.append(bottom);
    renderInsights(classes);
    const state = describe(day);
    get('today-title').textContent = planner.key(day) === planner.key(date) ? 'Today’s classes' : day.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'short' });
    get('schedule-source').textContent = state.label;
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
      description.append(element('h3', '', entry.title), element('p', '', `${entry.room ? entry.room + ' · ' : ''}${model.hours(entry)}h`));
      if (courseDetails.clean(entry.faculty)) description.append(element('p', '', courseDetails.clean(entry.faculty)));
      const course = attendance.find(subject => subject.code === entry.code);
      const insight = course && model.insight(course);
      row.append(times, description, element('span', `timeline-status ${ongoing ? 'healthy' : insight?.tone || ''}`, ongoing ? 'Ongoing' : insight?.percentage || ''));
      if (insight) description.append(element('p', `course-margin ${insight.tone}`, insight.margin));

      list.append(row);
    }
    if (!classes.length) {
      const state = describe(selectedDate || now());
      list.append(element('li', 'home-empty', state.kind === 'holiday' ? `${state.label} · no classes.` : state.kind === 'unknown' ? 'No confirmed classes for this date.' : 'No classes for this date and filter selection.'));
    }
  }

  function renderSchedule() {
    const list = get('schedule-entries');
    list.replaceChildren();
    get('schedule-help').textContent = 'Your classes by day order. Scroll sideways to see every day order. Dates follow the Ratio-D academic calendar.';
    const entries = [...(reportedSchedule?.entries || schedule)].sort((a, b) =>
      String(a.dayOrder || a.day).localeCompare(String(b.dayOrder || b.day)) || a.start.localeCompare(b.start));
    renderTimetableSvg(list, entries);
  }

  function openSchedule() {
    get('planner-menu').open = false;
    renderSchedule();
    get('schedule-dialog').showModal();
  }

  const monthCalendar = createAcademicCalendar({ container: get('academic-calendar'), source, now });
  get('open-calendar').addEventListener('click', () => {
    get('planner-menu').open = false; monthCalendar.reset(); get('calendar-dialog').showModal();
  });
  get('close-calendar').addEventListener('click', () => get('calendar-dialog').close());

  get('open-schedule').addEventListener('click', () => page('attendance'));
  get('close-schedule').addEventListener('click', () => get('schedule-dialog').close());
  get('open-accounts').addEventListener('click', () => {
    get('planner-menu').open = false;
    get('accounts-dialog').showModal();
  });
  get('close-accounts').addEventListener('click', () => get('accounts-dialog').close());
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
  const refreshClock = () => { if (!get('home-view').hidden && !document.hidden) render(); };
  setInterval(refreshClock, 60000);
  document.addEventListener('visibilitychange', refreshClock);
  window.addEventListener('focus', refreshClock);

  return {
    profile(profile) { studentName = profile?.name || ''; greetingExtras = anonGreetings.select(profile); render(); },
    enter() { render(); page('home'); },
    clear() { studentName = ''; greetingExtras = []; attendance = []; reportError = ''; reportedSchedule = null; scheduleInvalid = false; selectedDate = null; filters.allocation = ''; filters.batch = ''; get('schedule-dialog').close(); get('calendar-dialog').close(); get('academic-calendar').replaceChildren(); updateFilters(); },
    update(report, scheduleReport) {
      attendance = Array.isArray(report?.data) ? report.data : [];
      reportError = report?.error?.message || '';
      reportedSchedule = planner.normalize(scheduleReport);
      scheduleInvalid = scheduleReport != null && !reportedSchedule;
      dateAttendance.update(attendance, reportedSchedule, now(), filters);
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
      return { schedule: { timezone: 'Asia/Kolkata', calendarSource: 'Sample calendar',
        entries: schedule.map(({ day, ...entry }) => ({ ...entry, dayOrder: '1', hours: model.hours(entry) })),
        calendar: [{ date: '2026-09-14', kind: 'teaching', dayOrder: '1' }] },
        profile: { name: 'Sample student', program: 'Computer Science', semester: '5' },
        monthly: [{ month: 'Aug-2026', present: 49, absent: 11 }, { month: 'Sep-2026', present: 21, absent: 5 }],
        attendance: { data: [
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
