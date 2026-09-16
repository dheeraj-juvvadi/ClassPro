'use strict';

globalThis.courseDetails = {
  clean(value) {
    if (typeof value !== 'string') return '';
    const text = value.replace(/\s+/g, ' ').trim();
    if (!/[\p{L}\p{N}]/u.test(text) || /^(tba|n\/?a|null|undefined|-)$/i.test(text)) return '';
    // Remove isolated portal separator tokens; preserve initials and Dr./Prof.
    return text.split(' ').filter(word => !/^[.·•|,;]+$/.test(word)).join(' ');
  },
  recovery(course, source, now) {
    const prediction = attendanceMath.predict(course);
    if (!prediction.valid || !prediction.neededToTarget) return null;
    const model = classproScheduleModel;
    if (!source?.calendar?.length || !source?.entries?.length) return { unavailable: true };
    const matching = source.entries.filter(entry => entry.code === course.code);
    if (new Set(matching.map(entry => entry.batch).filter(Boolean)).size > 1) return { unavailable: true };
    let hours = 0;
    const date = new Date(now); date.setHours(12, 0, 0, 0);
    for (let offset = 0; offset < 400; offset++, date.setDate(date.getDate() + 1)) {
      if (model.dayState(source, date).kind === 'unknown') return { unavailable: true };
      for (const entry of model.classes(source, date).filter(entry => entry.code === course.code)) {
        if (offset === 0 && classproHomeModel.minutes(entry.start) < now.getHours() * 60 + now.getMinutes()) continue;
        hours += classproHomeModel.hours(entry);
        if (hours >= prediction.neededToTarget) return { date: new Date(date), required: prediction.neededToTarget };
      }
    }
    return { unavailable: true };
  },
};
