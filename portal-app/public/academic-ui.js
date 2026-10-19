'use strict';

globalThis.academicUI = (() => {
  let courses = [];
  let selected = null;
  let attendanceView = null;
  let changeTimer = null;
  const changeDay = 24 * 60 * 60 * 1000;
  const get = identifier => document.getElementById(identifier);
  function create(tag, className, text) {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function svgPath(path) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 12 12');
    svg.setAttribute('aria-hidden', 'true');
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.setAttribute('d', path);
    svg.append(line);
    return svg;
  }
  function tileTone(tone) {
    return tone === 'healthy' ? 'good' : tone === 'caution' ? 'edge' : tone;
  }
  function verdict(course, status, schedule, projected) {
    if (status.tone !== 'risk' || projected) return null;
    const recovery = courseDetails.recovery(course, schedule, anonScheduleModel.clock('Asia/Kolkata'), {});
    if (!recovery?.date) return null;
    return `Attend every class until ${recovery.date.toLocaleDateString('en', { day: 'numeric', month: 'short' })}`;
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
      detail: required ? `Attend ${required} more ${required === 1 ? 'hour' : 'hours'} to reach 75% (${present + required} / ${conducted + required}h attended). New classes add to both attended and total hours.`
        : `You can miss ${prediction.canMiss} hours and remain at or above 75%.` };
  }
  function courseCard(course, status, schedule, projected = false) {
    const card = create('article', `attendance-row ${status.tone} ${tileTone(status.tone)} v2`);
    card.dataset.course = course.code || course.title;
    card.dataset.attendanceTone = status.tone;
    if (status.percent !== undefined) card.style.setProperty('--fill', `${status.percent.toFixed(2)}%`);
    if (projected) card.dataset.projected = 'true';
    const heading = create('div', 'attendance-course-heading');
    heading.append(create('h3', '', course.title || course.code || 'Course'));
    const metric = create('div', 'attendance-main-metric');
    metric.setAttribute('role', 'group');
    metric.setAttribute('aria-label', status.hours === null ? status.label : `${status.label}: ${status.hours} hours`);
    const amount = create('div', 'attendance-margin-value');
    amount.append(create('strong', '', status.hours === null ? '—' : `${status.tone === 'risk' ? '−' : ''}${status.hours}`));
    if (status.hours !== null) amount.append(create('span', '', 'hrs'));
    metric.append(amount);
    metric.append(create('span', 'attendance-margin-caption', status.hours === null ? (projected ? 'Unconfirmed' : '')
      : status.tone === 'risk' ? 'to attend' : status.tone === 'caution' ? 'at 75%' : 'can skip'));
    const record = create('div', 'attendance-record');
    const absent = Number.isInteger(course.present) && Number.isInteger(course.conducted) && course.conducted >= course.present
      ? course.conducted - course.present : course.absent;
    if (status.hours !== null) {
      const counts = create('span', 'attendance-recorded-hours');
      counts.append(create('strong', '', `${course.present}/${course.conducted}`), document.createTextNode(' hrs'));
      record.append(counts);
    }
    const rate = create('span', 'attendance-recorded-rate');
    const percentage = create('span', 'attendance-percent');
    percentage.append(document.createTextNode(status.percentage.replace('%', '')));
    if (status.percent !== undefined) percentage.append(create('small', '', '%'));
    rate.append(percentage);
    const daily = Number.isFinite(course.change24h?.points);
    const changeRecord = daily ? course.change24h : course.changeSinceSync;
    const delta = changeRecord?.points;
    const expiresAt = Number.isFinite(changeRecord?.expiresAt) ? changeRecord.expiresAt
      : Number.isFinite(changeRecord?.to) ? changeRecord.to + changeDay : null;
    if (status.hours !== null && Number.isFinite(delta) && (expiresAt === null || expiresAt > Date.now())) {
      const points = Number(delta.toFixed(1)) || 0;
      const change = create('span', `attendance-change ${points > 0 ? 'positive' : points < 0 ? 'negative' : 'unchanged'}`);
      const period = Number.isFinite(changeRecord?.expiresAt) ? 'last attendance update · visible for 24 hours'
        : daily ? 'past 24 hours' : 'since previous sync';
      const description = `${points > 0 ? '+' : ''}${points} percentage points · ${period}`;
      const value = create('span', 'attendance-change-value', `${points > 0 ? '+' : points < 0 ? '−' : ''}${Math.abs(points).toFixed(1)}`);
      value.setAttribute('aria-hidden', 'true');
      if (expiresAt !== null) change.dataset.expiresAt = String(expiresAt);
      change.title = description;
      change.prepend(svgPath(points > 0 ? 'M6 9.5V2.5M2.75 5.5 6 2.25 9.25 5.5' : points < 0 ? 'M6 2.5v7M2.75 6.5 6 9.75 9.25 6.5' : 'M2.75 6h6.5'));
      change.append(value, create('small', '', '24h'), create('span', 'sr-only', description));
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
    // Bottom row: only facts the tile doesn't already say (recovery date, faculty, room, slot).
    const facts = [];
    const verdictText = verdict(course, status, anonScheduleModel.normalize(schedule), projected);
    if (verdictText) facts.push(['attendance-fact attendance-verdict-text', 'M6 2.5v4M6 9.2v.1', verdictText, 'Plan']);
    const clean = value => value == null ? '' : courseDetails.clean(String(value));
    if (clean(course.faculty)) facts.push(['attendance-fact', 'M6 5.6a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM2.3 10.6a3.8 3.8 0 0 1 7.4 0', clean(course.faculty), 'Faculty']);
    if (clean(course.room) && !/unavailable/i.test(course.room)) facts.push(['attendance-fact', 'M6 10.6s3.4-3 3.4-5.6a3.4 3.4 0 0 0-6.8 0c0 2.6 3.4 5.6 3.4 5.6ZM6 6.1a1.1 1.1 0 1 0 0-2.2 1.1 1.1 0 0 0 0 2.2Z', clean(course.room), 'Room']);
    if (clean(course.slot)) facts.push(['attendance-fact', 'M6 10.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM6 3.6V6l1.6 1', `Slot ${clean(course.slot)}`, 'Slot']);
    if (facts.length) {
      const row = create('div', 'attendance-verdict attendance-facts');
      for (const [className, path, text, label] of facts) {
        const item = create('span', className); item.title = label;
        item.append(svgPath(path), create('span', 'sr-only', `${label}: `), create('span', 'attendance-fact-text', text));
        row.append(item);
      }
      summary.append(row);
    }
    const body = create('div', 'attendance-detail-body');
    body.append(create('p', 'attendance-explanation', status.detail));
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
    attendanceView = { container, schedule };
    const projection = dateAttendance.projection(data);
    get('attendance-plan').hidden = !projection;
    get('attendance-plan-summary').textContent = projection ? `${projection.summary} · Estimated` : '';
    get('calculate-attendance').textContent = projection ? 'Edit attendance plan ↗' : 'Plan attendance ↗';
    if (!data.length) { get('calculate-attendance').disabled = true; return; }
    const predictions = new Map((projection?.result.courses || []).map(course => [course.code, course]));
    const unconfirmed = projection && (projection.result.error || projection.result.unknown.length);
    if (unconfirmed) get('attendance-plan-summary').textContent += ' · Calendar incomplete';
    const list = create('div', 'attendance-rows');
    data.forEach(course => {
      let displayed = course;
      if (projection) {
        const planned = predictions.get(course.code), prediction = planned?.prediction;
        displayed = { ...course, change24h: undefined, changeSinceSync: undefined,
          present: !unconfirmed && prediction?.valid ? prediction.present + planned.impact.attend : null,
          conducted: !unconfirmed && prediction?.valid ? prediction.conducted : null };
      }
      list.append(courseCard(displayed, margin(displayed.present, displayed.conducted), schedule, !!projection));
    });
    container.append(list);
    expireChanges();
    get('calculate-attendance').disabled = !data.length;
  }
  function expireChanges() {
    clearTimeout(changeTimer); changeTimer = null;
    if (!attendanceView) return;
    const now = Date.now();
    let next = Infinity;
    for (const badge of attendanceView.container.querySelectorAll('.attendance-change[data-expires-at]')) {
      const expiry = Number(badge.dataset.expiresAt);
      if (expiry <= now) badge.remove();
      else next = Math.min(next, expiry - now);
    }
    if (Number.isFinite(next)) changeTimer = setTimeout(expireChanges, Math.min(next, changeDay));
  }
  document.addEventListener('visibilitychange', expireChanges);
  function renderRecovery(course, card, schedule, filters = {}, date = anonScheduleModel.clock('Asia/Kolkata')) {
    for (const old of card.querySelectorAll('.recovery-date, .recovery-assumption')) old.remove();
    if (card.dataset.projected === 'true') return;
    const recovery = courseDetails.recovery(course, schedule, date, filters);
    const target = card.querySelector('.attendance-detail-body') || card;
    if (recovery?.date) {
      const date = recovery.date.toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' });
      target.append(create('p', 'recovery-date sr-only', `Can be recovered by ${date}`), create('p', 'recovery-assumption sr-only', 'If you attend every upcoming selected class.'));
    } else if (recovery?.unavailable) target.append(create('p', 'recovery-assumption sr-only', 'Recovery date needs a confirmed timetable and calendar.'));
  }
  get('calculate-attendance').addEventListener('click', () => dateAttendance.open());
  function plan(code, hours, date) { dateAttendance.open(code, date); }
  function refreshAttendance(data = courses) {
    if (!attendanceView) return;
    const { container, schedule } = attendanceView;
    const opened = new Set([...container.querySelectorAll('.attendance-details[open]')].map(item => item.closest('[data-course]').dataset.course));
    const focused = document.activeElement?.closest('.attendance-row')?.dataset.course;
    container.replaceChildren(); renderAttendance(data, container, schedule);
    for (const card of container.querySelectorAll('.attendance-row')) {
      if (opened.has(card.dataset.course)) card.querySelector('details').open = true;
      if (focused === card.dataset.course) card.querySelector('summary').focus({ preventScroll: true });
    }
  }
  get('attendance-plan-reset').addEventListener('click', () => {
    dateAttendance.resetProjection(); get('calculate-attendance').focus({ preventScroll: true });
  });
  return { renderAttendance, refreshAttendance, renderRecovery, margin, plan,
    clear() { clearTimeout(changeTimer); changeTimer = null; courses = []; selected = null; attendanceView = null; get('attendance-plan').hidden = true; get('projection-dialog').close(); } };
})();
