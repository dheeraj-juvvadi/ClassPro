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
    if (!prediction.valid || prediction.percentage === null) return { text: 'No hours yet', label: 'Not recorded', hours: null, tone: 'neutral', percentage: '—', detail: 'Your margin appears once attendance is recorded.' };
    const required = prediction.neededToTarget;
    return { text: required ? `Required: ${required}h` : `Margin: ${prediction.canMiss}h`,
      label: required ? 'Required' : 'Margin', hours: required || prediction.canMiss,
      tone: required ? 'risk' : prediction.canMiss === 0 ? 'caution' : 'healthy',
      percent: prediction.percentage,
      percentage: `${Number(prediction.percentage.toFixed(1))}%`,
      detail: required ? `Attend ${required} consecutive hours to reach 75%.` : `You can miss ${prediction.canMiss} hours and remain at 75%.` };
  }
  function courseCard(course, status, schedule) {
    const card = create('article', `attendance-row ${status.tone}`);
    card.dataset.course = course.code || course.title;
    const heading = create('div', 'attendance-course-heading');
    heading.append(create('p', 'attendance-course-code', course.code || 'Course'),
      create('h3', '', course.title || course.code));
    const metric = create('div', 'attendance-main-metric');
    metric.setAttribute('role', 'group');
    metric.setAttribute('aria-label', status.hours === null ? status.label : `${status.label}: ${status.hours} hours`);
    const amount = create('div', 'attendance-margin-value');
    amount.append(create('strong', '', status.hours ?? '—'));
    if (status.hours !== null) amount.append(create('span', '', 'h'));
    metric.append(amount);
    const record = create('div', 'attendance-record');
    const counts = create('p', '');
    const absent = Number.isInteger(course.present) && Number.isInteger(course.conducted) && course.conducted >= course.present
      ? course.conducted - course.present : course.absent;
    for (const [label, value] of [['attended', course.present], ['missed', absent]]) {
      const pair = create('span', '');
      pair.append(create('strong', '', value ?? '—'), document.createTextNode(` ${label}`)); counts.append(pair);
    }
    const percentage = create('span', 'attendance-percent');
    percentage.append(document.createTextNode(status.percentage.replace('%', '')));
    if (status.percent !== undefined) percentage.append(create('small', '', '%'));
    record.append(percentage, counts);
    const details = create('details', 'attendance-details');
    const summary = create('summary', 'attendance-summary');
    summary.append(heading, metric, record);
    const body = create('div', 'attendance-detail-body');
    body.append(create('p', 'attendance-explanation', status.detail));
    const delta = course.change24h?.points;
    if (Number.isFinite(delta)) body.append(create('p', `attendance-change ${delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'unchanged'}`,
      `${delta > 0 ? '+' : ''}${Number(delta.toFixed(1))} percentage points · past 24 hours`));
    const metadata = create('dl', 'attendance-course-meta');
    const fields = [['Hours conducted', course.conducted], ['Faculty', course.faculty], ['Room', course.room],
      ['Course type', course.type], ['Credits', course.credits], ['Slot', course.slot]];
    for (const [label, value] of fields) {
      const text = value == null ? '' : courseDetails.clean(String(value));
      if (!text) continue;
      const item = create('div', ''); item.append(create('dt', '', label), create('dd', '', text)); metadata.append(item);
    }
    body.append(metadata);
    details.append(summary, body); card.append(details);
    renderRecovery(course, card, anonScheduleModel.normalize(schedule));
    return card;
  }
  function renderAttendance(data, container, schedule) {
    courses = data;
    if (!data.length) { get('calculate-attendance').disabled = true; return; }
    const statuses = data.map(course => margin(course.present, course.conducted));
    const list = create('div', 'attendance-rows');
    data.forEach((course, index) => list.append(courseCard(course, statuses[index], schedule)));
    container.append(list);
    get('calculate-attendance').disabled = !data.length;
  }
  function renderRecovery(course, card, schedule, filters = {}, date = anonScheduleModel.clock('Asia/Kolkata')) {
    for (const old of card.querySelectorAll('.recovery-date, .recovery-assumption')) old.remove();
    const recovery = courseDetails.recovery(course, schedule, date, filters);
    const target = card.querySelector('.attendance-detail-body') || card;
    if (recovery?.date) {
      const date = recovery.date.toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' });
      target.append(create('p', 'recovery-date', `Can be recovered by ${date}`), create('p', 'recovery-assumption', 'If you attend every upcoming selected class.'));
    } else if (recovery?.unavailable) target.append(create('p', 'recovery-assumption', 'Recovery date needs a confirmed timetable and calendar.'));
  }
  get('calculate-attendance').addEventListener('click', () => dateAttendance.open());
  function plan(code, hours, date) { dateAttendance.open(code, date); }
  return { renderAttendance, renderRecovery, margin, plan, clear() { courses = []; selected = null; get('projection-dialog').close(); } };
})();
