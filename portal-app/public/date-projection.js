'use strict';

globalThis.dateProjection = {
  entryKey(entry) {
    return JSON.stringify([entry.code, entry.start, entry.end, anonHomeModel.hours(entry), entry.batch || '', entry.allocation || '']);
  },
  hours(plan, entry, past = false) {
    const total = anonHomeModel.hours(entry);
    const value = typeof plan === 'object' && plan ? plan.classes?.[this.entryKey(entry)] || plan.action : plan;
    const mode = typeof value === 'object' && value ? value.mode : value;
    const count = typeof value === 'object' && Number.isInteger(value.hours) ? Math.max(0, Math.min(total, value.hours)) : total;
    if (past) return { attend: 0, miss: 0, od: mode === 'od' ? count : 0 };
    if (mode === 'leave') return { attend: 0, miss: total, od: 0 };
    if (mode === 'partial') return { attend: count, miss: total - count, od: 0 };
    return { attend: total, miss: 0, od: 0 };
  },
  calculate(courses, source, selected, today, filters = {}, range = null) {
    const model = anonScheduleModel;
    const fail = error => ({ error, unknown: [], courses: [] });
    if (!(today instanceof Date) || !Number.isFinite(today.getTime())) return fail('Today must be a valid date.');
    const todayKey = model.key(today);
    if (!model.parse(todayKey)) return fail('Today must be a valid calendar date.');
    const selectedKeys = Object.keys(selected);
    if (selectedKeys.some(key => !model.parse(key))) return fail('Selected dates must be valid YYYY-MM-DD dates.');
    let projectionRange = null, traversalEnd = null, traversalStart = todayKey;
    const pastOD = range?.action === 'od';
    if (range !== null) {
      if (!range || !model.parse(range.start) || !model.parse(range.end)) return fail('Range dates must be valid YYYY-MM-DD dates.');
      if (range.start > range.end) return fail('Range start must not be after its end.');
      if (range.action !== undefined && !['leave', 'attend', 'od'].includes(range.action)) return fail('Range action must be leave, attend, or od.');
      if (pastOD ? range.end >= todayKey : range.end < todayKey) {
        return fail(pastOD ? 'OD range must contain only past dates.' : 'Leave range must end today or later.');
      }
      projectionRange = { start: range.start, end: range.end };
      if (range.action !== undefined) projectionRange.action = range.action;
      traversalEnd = range.end;
      if (pastOD) traversalStart = range.start;
      if (range.start < todayKey) projectionRange.beforeElapsed = true;
    } else {
      const missedDates = selectedKeys.filter(key => key >= todayKey
        && model.classes(source, model.parse(key), filters).some(entry => this.hours(selected[key], entry).miss > 0)).sort();
      if (missedDates.length) {
        projectionRange = { start: missedDates[0], end: selectedKeys.filter(key => key >= todayKey).sort().at(-1) };
        traversalEnd = missedDates.at(-1);
      }
    }
    if (projectionRange) {
      const before = model.parse(projectionRange.start);
      before.setDate(before.getDate() - 1);
      projectionRange.before = model.key(before);
    }
    const dates = new Set(range === null ? selectedKeys : pastOD ? [] : selectedKeys.filter(key => key < todayKey));
    if (projectionRange) {
      // Legacy plans only assume intervening attendance through the last miss.
      const end = model.parse(traversalEnd);
      for (let date = model.parse(traversalStart), count = 0; date <= end; date.setDate(date.getDate() + 1), count++) {
        if (count >= 400) return fail('Projection cannot span more than 400 calendar days.');
        dates.add(model.key(date));
      }
    }
    const emptyImpact = () => ({ attend: 0, miss: 0, od: 0 });
    const impacts = new Map(courses.map(course => [course.code, {
      impact: emptyImpact(), beforeImpact: emptyImpact(), duringImpact: emptyImpact(),
    }]));
    const unknown = [];
    for (const key of [...dates].sort()) {
      const date = model.parse(key);
      if (!date || key < todayKey && !selected[key] && !pastOD) continue;
      if (model.dayState(source, date).kind === 'unknown') { unknown.push(key); continue; }
      for (const entry of model.classes(source, date, filters)) {
        const totals = impacts.get(entry.code);
        if (!totals) continue;
        const hours = this.hours(selected[key], entry, key < todayKey);
        // Past OD corrects the original baseline at both checkpoints.
        const phase = pastOD ? totals.duringImpact
          : key < todayKey || !projectionRange || key < projectionRange.start ? totals.beforeImpact : totals.duringImpact;
        for (const field of ['attend', 'miss', 'od']) {
          totals.impact[field] += hours[field];
          phase[field] += hours[field];
        }
      }
    }
    return { unknown, ...(projectionRange ? { range: projectionRange } : {}), courses: courses.map(course => {
      const totals = impacts.get(course.code);
      // predict().present omits future attendance: never chain checkpoint results.
      const predict = impact => attendanceMath.predict({ present: course.present, conducted: course.conducted, ...impact });
      return { ...course, ...totals, prediction: predict(totals.impact),
        beforePrediction: projectionRange?.beforeElapsed ? null : predict(totals.beforeImpact) };
    }) };
  },
};
