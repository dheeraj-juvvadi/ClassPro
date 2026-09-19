'use strict';

globalThis.academicUI = (() => {
  let courses = [];
  let selected = null;
  const get = identifier => document.getElementById(identifier);
  function create(tag, className, text) {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function margin(present, conducted) {
    const prediction = attendanceMath.predict({ present, conducted });
    if (!prediction.valid || prediction.percentage === null) return { text: 'No hours yet', tone: 'neutral', percentage: '—', detail: 'No attendance hours recorded.' };
    const required = prediction.neededToTarget;
    return { text: required ? `Required: ${required}h` : `Margin: ${prediction.canMiss}h`,
      tone: required ? 'risk' : prediction.canMiss === 0 ? 'caution' : 'healthy',
      percentage: `${Number(prediction.percentage.toFixed(1))}%`,
      detail: required ? `Attend ${required} consecutive hours to reach 75%.` : `You can miss ${prediction.canMiss} hours and remain at 75%.` };
  }
  function renderAttendance(data, container, schedule) {
    courses = data;
    const list = create('div', 'attendance-rows');
    for (const course of data) {
      const status = margin(course.present, course.conducted);
      const card = create('article', `attendance-row ${status.tone}`);
      card.dataset.course = course.code;
      const heading = create('div', 'attendance-row-heading');
      const name = create('div');
      name.append(create('h3', '', course.title || course.code), create('p', 'course-code', course.code));
      const badge = create('button', `margin-badge ${status.tone}`, status.text);
      badge.type = 'button';
      badge.title = status.detail;
      badge.setAttribute('aria-label', `${course.title}: ${status.detail} Calculate attendance`);
      badge.addEventListener('click', () => open(course));
      heading.append(name, badge);
      const bottom = create('div', 'attendance-row-bottom');
      const counts = create('dl', 'attendance-counts');
      for (const [label, value] of [['Present', course.present], ['Absent', course.absent], ['Total', course.conducted]]) {
        const pair = create('div', label === 'Absent' ? 'count-absent' : '');
        pair.append(create('dt', '', label), create('dd', '', value ?? '—'));
        counts.append(pair);
      }
      const percentage = create('div', 'attendance-percentage-group');
      percentage.append(create('strong', 'attendance-percent', status.percentage));
      const delta = course.change24h?.points;
      if (Number.isFinite(delta)) {
        const amount = Number(delta.toFixed(1));
        const change = create('span', `attendance-change ${amount > 0 ? 'positive' : amount < 0 ? 'negative' : 'unchanged'}`, `${amount > 0 ? '+' : ''}${amount}%`);
        change.append(create('small', '', ' · 24h'));
        change.title = `${delta > 0 ? '+' : ''}${delta} percentage points since the saved reading near 24 hours ago`;
        change.setAttribute('aria-label', change.title);
        percentage.append(change);
      }
      bottom.append(counts, percentage);
      card.append(heading, bottom);
      const details = [course.faculty, course.room, course.type, course.credits && `${course.credits} credits`].map(value => courseDetails.clean(value)).filter(Boolean);
      if (details.length) card.append(create('p', 'course-metadata', details.join(' · ')));
      renderRecovery(course, card, classproScheduleModel.normalize(schedule));
      list.append(card);
    }
    container.append(list);
    get('calculate-attendance').disabled = !data.length;
  }
  function renderRecovery(course, card, schedule, filters = {}, date = classproScheduleModel.clock('Asia/Kolkata')) {
    for (const old of card.querySelectorAll('.recovery-date, .recovery-assumption')) old.remove();
    const recovery = courseDetails.recovery(course, schedule, date, filters);
    if (recovery?.date) {
      const date = recovery.date.toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' });
      card.append(create('p', 'recovery-date', `Can be recovered by ${date}`), create('p', 'recovery-assumption', 'If you attend every upcoming selected class.'));
    } else if (recovery?.unavailable) card.append(create('p', 'recovery-assumption', 'Recovery date needs a confirmed timetable and calendar.'));
  }
  get('calculate-attendance').addEventListener('click', () => dateAttendance.open());
  function open(course) { dateAttendance.open(course?.code); }
  function plan(code, hours, date) { dateAttendance.open(code, date); }
  return { renderAttendance, renderRecovery, margin, plan, clear() { courses = []; selected = null; get('projection-dialog').close(); } };
})();
