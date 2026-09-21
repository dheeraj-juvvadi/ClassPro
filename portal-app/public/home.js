'use strict';

globalThis.anonHome = (() => {
  const model = globalThis.anonHomeModel;
  const planner = globalThis.anonScheduleModel;
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
  const pages = new Set(['home', 'attendance', 'marks', 'calendar', 'settings', 'schedule']);
  const route = () => pages.has(location.hash.slice(1)) ? location.hash.slice(1) : 'home';
  let launchDestination = null;
  const source = () => reportedSchedule ? schedulePreferences.apply(reportedSchedule) : schedule;
  const get = identifier => document.getElementById(identifier);
  const element = (tag, className, text) => {
    const result = document.createElement(tag);
    result.className = className;
    if (text !== undefined) result.textContent = text;
    return result;
  };
  const now = () => preview ? new Date(2026, 8, 14, 9, 48) : planner.clock(reportedSchedule?.timezone || 'Asia/Kolkata');
  const schedulePreferences = createSchedulePreferences({ onChange() {
    dateAttendance.update(attendance, reportedSchedule ? source() : null, now(), filters);
    refreshRecovery();
    if (!get('calendar-view').hidden) monthCalendar.render();
    render();
  } });
  const reminders = createClassReminders({ notify(title, options) {
    if (preview || globalThis.Notification?.permission !== 'granted') return false;
    new Notification(title, options);
    return true;
  } });

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
  function refreshRecovery() {
    for (const row of get('attendance-content').querySelectorAll('[data-course]')) {
      const course = attendance.find(item => item.code === row.dataset.course);
      if (course) academicUI.renderRecovery(course, row, reportedSchedule ? source() : null, filters, now());
    }
  }
  for (const field of ['batch']) get(`${field}-filter`).addEventListener('change', event => {
    filters[field] = event.target.value;
    dateAttendance.update(attendance, reportedSchedule ? source() : null, now(), filters);
    refreshRecovery(); render();
  });
  updateFilters();

  function page(destination, focus = true, recordHistory = true) {
    if (!pages.has(destination)) return;
    if (recordHistory && route() !== destination) {
      try { history.pushState(null, '', `${location.pathname}${location.search}#${destination}`); } catch {}
    }
    globalThis.anonClientLogs?.capture({ kind: 'page_view', page: destination, consent: true });
    document.title = `${{ home: 'Home', attendance: 'Attendance', marks: 'Marks', calendar: 'Academic calendar', settings: 'Settings', schedule: 'Schedule' }[destination]} · Anon`;
    const previousPage = document.body.dataset.page;
    document.body.dataset.page = destination;
    get('home-view').hidden = destination !== 'home';
    get('reports-view').hidden = !['attendance', 'marks'].includes(destination);
    get('calendar-view').hidden = destination !== 'calendar';
    get('settings-view').hidden = destination !== 'settings';
    get('schedule-view').hidden = destination !== 'schedule';
    if (destination === 'calendar') monthCalendar.reset();
    get('attendance-panel').hidden = destination !== 'attendance';
    get('marks-panel').hidden = destination !== 'marks';
    get('calculate-attendance').hidden = destination !== 'attendance';
    for (const button of document.querySelectorAll('[data-page]')) {
      if (button.dataset.page === destination) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    for (const button of document.querySelectorAll('[data-sidebar-action]')) {
      const route = { 'open-calendar': 'calendar', 'open-accounts': 'settings', 'open-schedule': 'schedule' }[button.dataset.sidebarAction];
      if (route === destination) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    }
    get('reports-title').textContent = destination === 'marks' ? 'Your marks.' : 'Your attendance.';
    const view = { home: 'home-view', calendar: 'calendar-view', settings: 'settings-view', schedule: 'schedule-view' }[destination] || 'reports-view';
    const heading = { home: 'home-title', calendar: 'calendar-title', settings: 'accounts-title', schedule: 'schedule-page-title' }[destination] || 'reports-title';
    if (previousPage !== destination) anonFeedback.enter(get(view));
    if (focus) get(heading).focus();
    get('planner-menu').open = false;
  }

  function render() {
    const date = now();
    get('home-title').textContent = anonGreeting(studentName, preview ? date : planner.clock('Asia/Kolkata'), greetingExtras);
    get('home-date').textContent = new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
    const day = selectedDate || date;
    const classes = planner.classes(source(), day, filters);
    const minute = date.getHours() * 60 + date.getMinutes();
    const todayClasses = planner.classes(source(), date, filters);
    const remaining = model.remainingClasses(todayClasses, minute);
    const next = remaining[0] ? { ...remaining[0], date } : null;
    reminders.check(planner.next(source(), date, filters), date);
    const sameDay = Boolean(next);
    const confirmed = planner.dayState(source(), date).kind !== 'unknown' && !reportError;
    const card = get('next-class-card');
    card.replaceChildren();
    const top = element('div', 'next-class-top');
    top.append(element('span', 'planner-eyebrow', next?.unknown ? 'Next known class' : 'Next class'));
    const ongoing = sameDay && model.minutes(next.start) <= minute;
    const laterToday = sameDay && model.minutes(next.start) - minute > 120;
    top.append(element(laterToday ? 'strong' : 'span', 'class-countdown', next ? ongoing ? 'Ongoing' : sameDay ? laterToday ? 'Today' : `Starts in ${model.minutes(next.start) - minute} min` : next.date.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' }) : ''));
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

    } else {
      if (confirmed) {
        title.textContent = 'You are done for the day';
        card.append(sunflowerArt());
      } else card.append(element('p', 'class-room', reportedSchedule ? 'A verified teaching calendar is needed to place timetable periods on dates.' : 'Refresh reports or sign in again to load your SRM timetable.'));
    }
    const bottom = element('div', 'next-class-bottom');
    const following = remaining[1];
    bottom.append(element('p', '', next && following ? `Next · ${following.title} · ${following.start}` : next ? 'Last class of the day' : 'Your attendance'));
    const action = element('button', 'class-arrow', '↗');
    action.type = 'button';
    action.setAttribute('aria-label', 'View attendance');
    action.addEventListener('click', () => page('attendance'));
    bottom.append(action);
    card.append(bottom);
    renderInsights(remaining, confirmed);
    const state = describe(day);
    get('today-title').textContent = planner.key(day) === planner.key(date) ? 'Today’s classes' : day.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'short' });
    get('schedule-source').textContent = state.label;
    const viewingToday = planner.key(day) === planner.key(date);
    renderTimeline(viewingToday ? model.remainingClasses(classes, minute) : classes, viewingToday ? minute : -1);
    calendar.today(date);
  }

  function sunflowerArt() {
    const art = element('span', 'ascii-art ascii-art--sunflower');
    art.setAttribute('aria-hidden', 'true');
    return art;
  }

  function renderInsights(remaining, confirmed) {
    const container = get('home-insights');
    container.replaceChildren();
    if (!remaining.length) { container.hidden = true; return; }
    const upcoming = remaining.slice(1, 3);
    for (let index = 0; index < Math.max(1, Math.min(2, remaining.length)); index++) {
      const entry = upcoming[index];
      if (entry) {
        const course = attendance.find(course => course.code === entry.code);
        const insight = model.insight(course || {});
        const card = element('button', `insight-card ${insight.tone}`);
        card.type = 'button';
        card.setAttribute('aria-label', `${entry.title}: Today ${entry.start} to ${entry.end}. ${insight.detail || insight.margin}`);
        card.append(element('span', 'insight-class-time', `${entry.start} → ${entry.end}`), element('span', 'planner-eyebrow', entry.title), element('span', 'insight-percentage', insight.percentage), element('span', 'insight-margin', insight.margin));
        card.addEventListener('click', () => page('attendance'));
        container.append(card);
      } else {
        const card = element('div', `insight-card insight-empty${remaining.length === 1 ? ' insight-empty-wide' : ''}`);
        const art = sunflowerArt();
        card.append(art, element('span', 'insight-margin', !confirmed ? 'Schedule unavailable' : remaining.length === 1 ? 'You have only 1 class for the day' : 'You have only 2 classes left'));
        container.append(card);
      }
    }
    container.hidden = false;
  }

  function renderTimeline(classes, minute) {
    get('today-count').textContent = `${classes.length} ${classes.length === 1 ? 'class' : 'classes'}`;
    const list = get('today-classes');
    list.replaceChildren();
    for (const entry of classes) {
      const ongoing = model.minutes(entry.start) <= minute && model.minutes(entry.end) >= minute;
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
      const empty = element('li', 'home-empty', state.kind === 'holiday' ? `${state.label} · no classes.` : state.kind === 'unknown' ? 'No confirmed classes for this date.' : 'No classes for this date and filter selection.');
      if (state.kind !== 'unknown') { empty.prepend(sunflowerArt()); empty.prepend(element('p', 'day-done-caption', 'Done for the day.')); }
      list.append(empty);
    }
  }

  function renderSchedule() {
    const list = get('schedule-entries');
    list.replaceChildren();
    get('schedule-help').textContent = 'Your classes by day order. Scroll sideways to see every day order. Dates follow the academic calendar.';
    const entries = [...(reportedSchedule?.entries || schedule)].sort((a, b) =>
      String(a.dayOrder || a.day).localeCompare(String(b.dayOrder || b.day)) || a.start.localeCompare(b.start));
    renderTimetableSvg(list, entries);
  }

  function openSchedule() {
    get('planner-menu').open = false;
    renderSchedule();
    get('schedule-dialog').showModal();
  }

  const monthCalendar = createAcademicCalendar({ container: get('academic-calendar'), source, now, filters });
  get('open-calendar').addEventListener('click', () => page('calendar'));
  get('open-schedule').addEventListener('click', () => page('schedule'));

  get('close-schedule').addEventListener('click', () => get('schedule-dialog').close());
  get('open-accounts').addEventListener('click', () => page('settings'));
  for (const button of document.querySelectorAll('[data-page]')) button.addEventListener('click', () => page(button.dataset.page));
  for (const button of document.querySelectorAll('[data-sidebar-action]')) {
    button.addEventListener('click', () => get(button.dataset.sidebarAction).click());
  }
  document.addEventListener('click', event => {
    if (!get('planner-menu').contains(event.target)) get('planner-menu').open = false;
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && get('planner-menu').open) {
      get('planner-menu').open = false;
      get('planner-menu').querySelector('summary').focus();
    }
  });
  const refreshClock = () => {
    if (!document.body.classList.contains('planner') || document.hidden) return;
    dateAttendance.clock(now());
    if (!get('home-view').hidden) render();
    else { const date = now(); reminders.check(planner.next(source(), date, filters), date); }
  };
  const scheduleClock = () => setTimeout(() => { refreshClock(); scheduleClock(); }, 60000 - (Date.now() % 60000) + 20);
  scheduleClock();
  document.addEventListener('visibilitychange', refreshClock);
  window.addEventListener('focus', refreshClock);
  window.addEventListener('popstate', () => {
    if (document.body.classList.contains('planner') && (!location.hash || pages.has(location.hash.slice(1)))) page(route(), true, false);
  });
  window.addEventListener('hashchange', () => {
    if (pages.has(location.hash.slice(1)) && document.body.classList.contains('planner') && document.body.dataset.page !== route()) page(route(), true, false);
  });
  const applyLaunch = () => {
    if (!launchDestination || !document.body.classList.contains('planner') || document.querySelector('dialog[open]')) return;
    const destination = launchDestination;
    launchDestination = null;
    page(destination);
  };
  document.addEventListener('close', applyLaunch, true);
  if (typeof globalThis.launchQueue?.setConsumer === 'function') {
    globalThis.launchQueue.setConsumer(params => {
      try {
        const url = new URL(params.targetURL);
        if (url.origin !== location.origin || url.pathname !== '/') return;
        const destination = url.hash.slice(1);
        // Opening the app icon keeps the current section; shortcuts choose one.
        if (!pages.has(destination)) return;
        launchDestination = destination;
        applyLaunch();
      } catch {}
    });
  }

  return {
    scheduleIdentity(profile) { schedulePreferences.identity(profile); },
    reminders(enabled) { reminders.enable(enabled); },
    profile(profile) { studentName = profile?.name || ''; greetingExtras = anonGreetings.select(profile); render(); },
    enter() {
      render();
      if (launchDestination) {
        try { history.replaceState(null, '', `${location.pathname}${location.search}#${launchDestination}`); } catch {}
      }
      page(launchDestination || route(), true, false);
      launchDestination = null;
    },
    clear() { reminders.clear(); schedulePreferences.clear(); studentName = ''; greetingExtras = []; attendance = []; reportError = ''; reportedSchedule = null; scheduleInvalid = false; selectedDate = null; filters.allocation = ''; filters.batch = ''; get('schedule-dialog').close(); get('calendar-view').hidden = true; get('settings-view').hidden = true; get('schedule-view').hidden = true; get('academic-calendar').replaceChildren(); updateFilters(); },
    update(report, scheduleReport) {
      attendance = Array.isArray(report?.data) ? report.data : [];
      reportError = report?.error?.message || '';
      reportedSchedule = planner.normalize(scheduleReport);
      schedulePreferences.update(reportedSchedule);
      scheduleInvalid = scheduleReport != null && !reportedSchedule;
      selectedDate = null;
      updateFilters();
      dateAttendance.update(attendance, reportedSchedule ? source() : null, now(), filters);
      refreshRecovery();
      if (!get('calendar-view').hidden) monthCalendar.render();
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
        courses: { DS: { credits: 4 }, CN: { credits: 3 }, OS: { credits: 4 } },
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
