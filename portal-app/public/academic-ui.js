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
    heading.append(create('h3', '', course.title || course.code || 'Course'));
    const metric = create('div', 'attendance-main-metric');
    metric.setAttribute('role', 'group');
    metric.setAttribute('aria-label', status.hours === null ? status.label : `${status.label}: ${status.hours} hours`);
    const amount = create('div', 'attendance-margin-value');
    amount.append(create('strong', '', status.hours === null ? '—' : `${status.tone === 'risk' ? '−' : ''}${status.hours}`));
    if (status.hours !== null) amount.append(create('span', '', 'h'));
    metric.append(amount);
    const record = create('div', 'attendance-record');
    const absent = Number.isInteger(course.present) && Number.isInteger(course.conducted) && course.conducted >= course.present
      ? course.conducted - course.present : course.absent;
    if (status.hours !== null) {
      const counts = create('span', 'attendance-recorded-hours');
      counts.append(create('strong', '', `${course.present} / ${course.conducted}h`), document.createTextNode(' attended'));
      record.append(counts);
    }
    const rate = create('span', 'attendance-recorded-rate');
    const percentage = create('span', 'attendance-percent');
    percentage.append(document.createTextNode(status.percentage.replace('%', '')));
    if (status.percent !== undefined) percentage.append(create('small', '', '%'));
    rate.append(percentage);
    const delta = course.change24h?.points;
    if (status.hours !== null && Number.isFinite(delta)) {
      const points = Number(delta.toFixed(1)) || 0;
      const change = create('span', `attendance-change ${points > 0 ? 'positive' : points < 0 ? 'negative' : 'unchanged'}`);
      const description = `${points > 0 ? '+' : ''}${points} percentage points · past 24 hours`;
      const value = create('span', 'attendance-change-value', `${points > 0 ? '+' : points < 0 ? '−' : ''}${Math.abs(points).toFixed(1)}`);
      value.setAttribute('aria-hidden', 'true');
      value.append(create('small', '', 'pp'));
      change.title = description;
      change.append(value, create('span', 'sr-only', description));
      rate.append(change);
    }
    record.append(rate);
    if (status.hours === null) record.append(create('span', 'attendance-record-unknown',
      course.present === 0 && course.conducted === 0 ? 'No attendance recorded' : 'Attendance unavailable'));
    const details = create('details', 'attendance-details');
    const summary = create('summary', 'attendance-summary');
    summary.append(heading, record, metric);
    if (status.percent !== undefined) {
      const rail = create('span', 'attendance-rail');
      rail.setAttribute('role', 'meter');
      rail.setAttribute('aria-label', `${course.title || course.code || 'Course'} attendance`);
      rail.setAttribute('aria-valuemin', '0');
      rail.setAttribute('aria-valuemax', '100');
      rail.setAttribute('aria-valuenow', String(status.percent));
      rail.setAttribute('aria-valuetext', `${status.percentage} attendance; target 75%.`);
      const fill = create('span', 'attendance-rail-fill');
      fill.style.width = `${status.percent}%`;
      rail.append(fill, create('span', 'attendance-rail-target'));
      summary.append(rail);
    }
    const body = create('div', 'attendance-detail-body');
    body.append(create('p', 'attendance-explanation sr-only', status.detail));
    const metadata = create('dl', 'attendance-course-meta');
    const fields = [['Course code', course.code], ['Hours attended', course.present], ['Hours missed', absent],
      ['Hours conducted', course.conducted], ['Faculty', course.faculty], ['Room', course.room],
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
    const target = create('p', 'attendance-target-key');
    const marker = create('span', ''); marker.setAttribute('aria-hidden', 'true');
    target.append(marker, document.createTextNode('75% target'));
    const list = create('div', 'attendance-rows');
    data.forEach((course, index) => list.append(courseCard(course, statuses[index], schedule)));
    container.append(target, list);
    get('calculate-attendance').disabled = !data.length;
  }
  function renderRecovery(course, card, schedule, filters = {}, date = anonScheduleModel.clock('Asia/Kolkata')) {
    for (const old of card.querySelectorAll('.recovery-date, .recovery-assumption')) old.remove();
    const recovery = courseDetails.recovery(course, schedule, date, filters);
    const target = card.querySelector('.attendance-detail-body') || card;
    if (recovery?.date) {
      const date = recovery.date.toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' });
      target.append(create('p', 'recovery-date sr-only', `Can be recovered by ${date}`), create('p', 'recovery-assumption sr-only', 'If you attend every upcoming selected class.'));
    } else if (recovery?.unavailable) target.append(create('p', 'recovery-assumption sr-only', 'Recovery date needs a confirmed timetable and calendar.'));
  }
  get('calculate-attendance').addEventListener('click', () => dateAttendance.open());
  function plan(code, hours, date) { dateAttendance.open(code, date); }
  return { renderAttendance, renderRecovery, margin, plan, clear() { courses = []; selected = null; get('projection-dialog').close(); } };
})();
