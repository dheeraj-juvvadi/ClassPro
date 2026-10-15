'use strict';

globalThis.anonLeaves = (() => {
  const get = id => document.getElementById(id);
  const node = (tag, text, className) => {
    const item = document.createElement(tag);
    if (text !== undefined) item.textContent = text;
    if (className) item.className = className;
    return item;
  };
  let snapshot = null;
  const number = value => Number(value.toFixed(2));
  function update({ result, selected, source, today, filters, mode }) {
    const model = anonScheduleModel, dates = Object.keys(selected).sort();
    const totals = new Map();
    for (const date of dates) for (const entry of model.classes(source, model.parse(date), filters)) {
      const impact = dateProjection.hours(selected[date], entry, date < model.key(today));
      const previous = totals.get(entry.code) || { attend: 0, miss: 0, od: 0 };
      for (const field of ['attend', 'miss', 'od']) previous[field] += impact[field];
      totals.set(entry.code, previous);
    }
    if (result.manual) {
      totals.clear();
      for (const course of result.courses) totals.set(course.code, course.impact);
    }
    const field = mode === 'od' ? 'od' : mode === 'attend' ? 'attend' : 'miss';
    const holidays = result.manual ? 0 : dates.filter(date => model.dayState(source, model.parse(date)).kind === 'holiday').length;
    const unknown = result.manual ? 0 : dates.filter(date => model.dayState(source, model.parse(date)).kind === 'unknown').length;
    const short = date => model.parse(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    snapshot = {
      title: mode === 'od' ? 'OD corrections' : mode === 'attend' ? 'Attendance plan' : 'Leaves',
      hoursLabel: mode === 'od' ? 'OD hours' : mode === 'attend' ? 'Attended hours' : 'Missed hours',
      range: dates.length ? dates[0] === dates.at(-1) ? short(dates[0]) : `${short(dates[0])} – ${short(dates.at(-1))}` : '',
      summary: dates.length ? `${dates.length} ${dates.length === 1 ? 'day' : 'days'} · ${result.manual ? 'Entered hours' : `${holidays} ${holidays === 1 ? 'holiday' : 'holidays'}${unknown ? ` · ${unknown} unconfirmed` : ''}`}` : '',
      error: result.error || '',
      rows: result.courses.map(course => ({ ...course, hours: number(totals.get(course.code)?.[field] || 0),
        rate: dates.length && !result.error && !result.unknown.length && course.prediction?.valid
          && Number.isFinite(course.prediction.percentage) ? course.prediction.percentage : null,
      })).filter(course => course.hours > 0 || unknown),
    };
    get('projection-live-meta').textContent = snapshot.summary;
    get('projection-live-hours').replaceChildren(...snapshot.rows.map(course => {
      const row = node('div', undefined, 'projection-hours-row'); row.dataset.course = course.code;
      row.append(node('span', course.title || course.code), node('strong', `${course.hours}h`));
      return row;
    }));
    get('projection-live-hours').setAttribute('aria-label', snapshot.hoursLabel);
    get('projection-review-custom').disabled = !dates.length || !!result.error;
    render();
  }
  function render() {
    const state = snapshot;
    get('leaves-title').textContent = state?.title || 'Leaves';
    get('leaves-range').textContent = state?.range || '';
    get('leaves-meta').textContent = state?.summary || '';
    get('leaves-empty').hidden = !!state?.rows.length;
    get('leaves-empty').textContent = state?.range ? 'No confirmed hours' : 'No dates selected';
    get('leaves-rows').replaceChildren(...(state?.rows || []).map(course => {
      const row = node('article', undefined, 'attendance-row leaves-row'); row.dataset.course = course.code;
      const heading = node('div', undefined, 'attendance-course-heading');
      heading.append(node('h3', course.title || course.code));
      const metric = node('div', undefined, 'attendance-main-metric');
      const prediction = course.prediction;
      const required = course.rate === null ? null : prediction.neededToTarget;
      const hours = course.rate === null ? null : required || prediction.canMiss;
      row.classList.toggle('risk', required > 0);
      metric.setAttribute('aria-label', hours === null ? 'Projection unconfirmed'
        : required ? `Attend ${hours} hours to reach 75%` : `Can still miss ${hours} hours`);
      const value = node('span', undefined, 'attendance-margin-value');
      value.append(node('strong', hours === null ? '—' : `${required ? '−' : ''}${hours}`));
      if (hours !== null) value.append(node('span', 'h'));
      metric.append(value);
      const record = node('div', undefined, 'attendance-record');
      record.append(node('span', course.rate === null ? '—' : `${course.rate.toFixed(1)}%`, 'attendance-percent'));
      record.setAttribute('aria-label', course.rate === null ? 'Projection unconfirmed' : `Projected attendance ${course.rate.toFixed(1)} percent`);
      row.append(heading, metric, record);
      return row;
    }));
  }
  get('leaves-edit').addEventListener('click', () => dateAttendance.open('', null, true));
  get('leaves-back').addEventListener('click', () => anonHome.navigate('attendance'));
  return { update, render, title: () => snapshot?.title || 'Leaves', clear() { snapshot = null; render(); } };
})();
