'use strict';

globalThis.dateProjection = {
  calculate(courses, source, selected, today, filters = {}) {
    const model = classproScheduleModel;
    const todayKey = model.key(today);
    const dates = new Set(Object.keys(selected));
    const lastLeave = Object.keys(selected).filter(date => selected[date] === 'leave' && date >= todayKey).sort().at(-1);
    if (lastLeave) {
      const end = model.parse(lastLeave);
      for (let date = model.parse(todayKey), count = 0; date <= end && count < 400; date.setDate(date.getDate() + 1), count++) dates.add(model.key(date));
    }
    const impacts = new Map(courses.map(course => [course.code, { attend: 0, miss: 0, od: 0 }]));
    const unknown = [];
    for (const key of [...dates].sort()) {
      const date = model.parse(key);
      if (!date || key < todayKey && selected[key] !== 'od') continue;
      if (model.dayState(source, date).kind === 'unknown') { unknown.push(key); continue; }
      for (const entry of model.classes(source, date, filters)) {
        const impact = impacts.get(entry.code);
        if (!impact) continue;
        const hours = classproHomeModel.hours(entry);
        const field = key < todayKey ? 'od' : selected[key] === 'leave' ? 'miss' : 'attend';
        impact[field] += hours;
      }
    }
    return { unknown, courses: courses.map(course => {
      const impact = impacts.get(course.code);
      return { ...course, impact, prediction: attendanceMath.predict({ present: course.present, conducted: course.conducted, ...impact }) };
    }) };
  },
};
