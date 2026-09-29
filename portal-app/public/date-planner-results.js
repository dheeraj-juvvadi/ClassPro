'use strict';

globalThis.renderDatePlannerResults = (result, focusCode, selectedCount) => {
  const output = document.getElementById('projection-result');
  const status = document.getElementById('projection-summary');
  if (!output || !status) return;
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const available = prediction => prediction?.valid === true && Number.isFinite(prediction.percentage);
  const percentage = prediction => available(prediction) ? `${prediction.percentage.toFixed(1)}%` : '—';
  const dateLabel = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
    const date = new Date(`${value}T12:00:00`);
    return Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
  };
  const hours = value => Number.isFinite(value) && value >= 0 ? `${value} h` : '—';
  const rows = [...output.querySelectorAll('.date-projection-course')];
  const expanded = new Set(rows.filter(row => row.open).map(row => row.dataset.course));
  const activeRow = output.contains(document.activeElement)
    ? document.activeElement.closest('.date-projection-course') : null;
  const activeCode = activeRow?.dataset.course;
  const range = result?.range;
  const action = ['attend', 'od'].includes(range?.action) ? range.action : 'leave';
  const beforeText = action === 'attend' ? 'Before attending' : 'Before leave';
  const afterText = action === 'attend' ? 'After attending' : 'After leave';
  const unknown = Array.isArray(result?.unknown) ? result.unknown : [];
  const error = typeof result?.error === 'string' ? result.error : '';
  const hasPlan = Boolean(selectedCount || (range?.start && range?.end));
  const beforeUnknown = unknown.some(date => !range?.before || date <= range.before);
  const rawCourses = Array.isArray(result?.courses) ? result.courses : [];
  const courses = rawCourses.map((course, index) => {
    course = course || {};
    const current = globalThis.attendanceMath?.predict({ present: course.present, conducted: course.conducted });
    const baselineKnown = available(current);
    const before = baselineKnown && !error && !beforeUnknown && !range?.beforeElapsed
      ? course.beforePrediction : null;
    const after = baselineKnown && hasPlan && !error && !unknown.length ? course.prediction : null;
    return { course, code: String(course.code ?? `unavailable-${index}`), current, before, after, baselineKnown };
  }).sort((a, b) => Number(b.code === focusCode) - Number(a.code === focusCode));
  const missingBaseline = courses.some(item => !item.baselineKnown);
  const missingPrediction = courses.some(item => !available(item.after));
  status.textContent = error || (!courses.length ? 'Your courses will appear here when attendance is available.'
    : !hasPlan ? 'Select dates to compare your attendance.'
    : unknown.length ? 'Some dates are unavailable. Incomplete estimates are shown as —.'
    : missingBaseline ? 'Recorded attendance hours are unavailable for some courses. Their estimates are shown as —.'
    : missingPrediction ? 'Some attendance estimates are unavailable and are shown as —.' : '');
  const fragment = document.createDocumentFragment();
  const summaries = new Map();
  for (const item of courses) {
    const { course, code, current, before, after, baselineKnown } = item;
    const risk = available(after) && (after.neededToTarget > 0 || after.percentage < 75);
    const row = make('details', 'date-projection-course');
    row.dataset.course = code;
    row.open = expanded.has(code);
    if (risk) row.dataset.tone = 'risk';
    else if (!available(after)) row.dataset.tone = 'unknown';
    const summary = make('summary', 'date-result-heading');
    const name = make('strong', 'date-result-name', course.title || 'Unnamed course');
    const value = make('b', 'date-result-percentage', percentage(after));
    const expand = make('span', 'date-result-expand');
    expand.setAttribute('aria-hidden', 'true');
    summary.append(name, value, expand);
    if (risk) summary.append(make('span', 'date-planner-sr', 'Below the 75% minimum.'));
    else if (!available(after)) summary.append(make('span', 'date-planner-sr', 'Attendance estimate unavailable.'));
    const breakdown = make('div', 'date-result-breakdown');
    const checkpoints = make('dl', 'date-result-checkpoints');
    const beforeLabel = dateLabel(range?.before);
    const afterLabel = dateLabel(range?.end);
    const checkpointValues = action === 'od' ? [
      ['Recorded', current], ['After OD correction', after],
    ] : [
      ['Today', current],
      [beforeLabel ? `${beforeLabel} · ${beforeText}` : beforeText, before],
      [afterLabel ? `${afterLabel} · ${afterText}` : afterText, after],
    ];
    for (const [label, prediction] of checkpointValues) {
      const checkpoint = make('div', '');
      const amount = make('dd', '', percentage(prediction));
      if (!available(prediction)) amount.append(make('span', 'date-planner-sr', 'Unavailable'));
      checkpoint.append(make('dt', '', label), amount);
      checkpoints.append(checkpoint);
    }
    breakdown.append(checkpoints);
    const duringUnknown = unknown.some(date => !range?.start || !range?.end || (date >= range.start && date <= range.end));
    const beforeImpact = !error && !beforeUnknown && !range?.beforeElapsed ? course.beforeImpact : null;
    const duringImpact = !error && !duringUnknown ? course.duringImpact : null;
    const startLabel = dateLabel(range?.start);
    const duringLabel = range?.beforeElapsed
      ? action === 'leave' ? 'during the rest of your break' : 'during the remaining selected dates'
      : startLabel && afterLabel ? `during ${startLabel}–${afterLabel}` : 'during your plan';
    const impact = make('p', 'date-result-impact');
    const impactLines = [];
    if (action !== 'od') {
      const beforePeriod = action === 'leave' ? 'before your break' : 'before the selected dates';
      impactLines.push(`${hours(beforeImpact?.attend)} attended ${beforePeriod}.`);
      if (action === 'attend') {
        impactLines.push(`${hours(duringImpact?.attend)} attended ${duringLabel}.`);
        impactLines.push(`${hours(duringImpact?.miss)} missed ${duringLabel}.`);
      } else {
        impactLines.push(`${hours(duringImpact?.miss)} missed ${duringLabel}.`);
        if (duringImpact?.attend > 0) impactLines.push(`${hours(duringImpact.attend)} attended ${duringLabel}.`);
      }
    }
    if (action === 'od' || course.impact?.od > 0) {
      const odHours = !error && !unknown.length ? course.impact?.od : null;
      impactLines.push(`${hours(odHours)} of OD corrections requested; capped at recorded absences.`);
    }
    impactLines.forEach((line, index) => {
      if (index) impact.append(make('br', ''));
      impact.append(document.createTextNode(line));
    });
    breakdown.append(impact);
    const unavailable = !baselineKnown ? 'Recorded attendance hours are unavailable for this course.'
      : error ? 'This plan could not be calculated. Check your dates and try again.'
      : unknown.length ? 'Missing dates are not counted. Incomplete checkpoints are shown as —.'
      : !available(after) ? 'A complete attendance estimate is not available for this course.'
      : action !== 'od' && range?.beforeElapsed ? action === 'leave'
        ? 'Before-leave attendance is unavailable because your break has already started.'
        : 'Attendance before the selected dates is unavailable because those dates have already started.'
      : action !== 'od' && !available(before) ? `${beforeText} attendance is unavailable.` : '';
    if (unavailable) breakdown.append(make('p', 'date-result-unavailable', unavailable));
    if (risk) breakdown.append(make('p', 'date-result-risk', 'Below the 75% minimum.'));
    row.append(summary, breakdown);
    fragment.append(row);
    summaries.set(code, summary);
  }
  output.replaceChildren(fragment);
  if (activeCode && summaries.has(activeCode)) summaries.get(activeCode).focus({ preventScroll: true });
};
