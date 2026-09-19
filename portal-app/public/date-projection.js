'use strict';

globalThis.dateProjection = {
  entryKey(entry) {
    return JSON.stringify([entry.code, entry.start, entry.end, classproHomeModel.hours(entry), entry.batch || '', entry.allocation || '']);
  },
  hours(plan, entry, past = false) {
    const total = classproHomeModel.hours(entry);
    const value = typeof plan === 'object' && plan ? plan.classes?.[this.entryKey(entry)] || plan.action : plan;
    const mode = typeof value === 'object' && value ? value.mode : value;
    const count = typeof value === 'object' && Number.isInteger(value.hours) ? Math.max(0, Math.min(total, value.hours)) : total;
    if (past) return { attend: 0, miss: 0, od: mode === 'od' ? count : 0 };
    if (mode === 'leave') return { attend: 0, miss: total, od: 0 };
    if (mode === 'partial') return { attend: count, miss: total - count, od: 0 };
    return { attend: total, miss: 0, od: 0 };
  },
  calculate(courses, source, selected, today, filters = {}) {
    const model = classproScheduleModel;
    const todayKey = model.key(today);
    const dates = new Set(Object.keys(selected));
    const lastLeave = Object.keys(selected).filter(date => date >= todayKey && model.parse(date)
      && model.classes(source, model.parse(date), filters).some(entry => this.hours(selected[date], entry).miss > 0)).sort().at(-1);
    if (lastLeave) {
      const end = model.parse(lastLeave);
      for (let date = model.parse(todayKey), count = 0; date <= end && count < 400; date.setDate(date.getDate() + 1), count++) dates.add(model.key(date));
    }
    const impacts = new Map(courses.map(course => [course.code, { attend: 0, miss: 0, od: 0 }]));
    const unknown = [];
    for (const key of [...dates].sort()) {
      const date = model.parse(key);
      if (!date || key < todayKey && !selected[key]) continue;
      if (model.dayState(source, date).kind === 'unknown') { unknown.push(key); continue; }
      for (const entry of model.classes(source, date, filters)) {
        const impact = impacts.get(entry.code);
        if (!impact) continue;
        const hours = this.hours(selected[key], entry, key < todayKey);
        for (const field of ['attend', 'miss', 'od']) impact[field] += hours[field];
      }
    }
    return { unknown, courses: courses.map(course => {
      const impact = impacts.get(course.code);
      return { ...course, impact, prediction: attendanceMath.predict({ present: course.present, conducted: course.conducted, ...impact }) };
    }) };
  },
};
