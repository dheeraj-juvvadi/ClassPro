'use strict';

globalThis.classproHomeModel = {
  minutes(time) {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  },
  today(schedule, now) {
    const entries = schedule.filter(entry => entry.day === now.getDay()).map(entry => ({ ...entry }));
    entries.sort((first, second) => first.start.localeCompare(second.start));
    return entries.reduce((merged, entry) => {
      const previous = merged.at(-1);
      if (previous && previous.code === entry.code && previous.title === entry.title && previous.room === entry.room && previous.end === entry.start) {
        previous.end = entry.end;
      } else merged.push(entry);
      return merged;
    }, []);
  },
  valid(entry) {
    return entry && typeof entry.code === 'string' && entry.code.trim() && entry.code.length <= 40
      && typeof entry.title === 'string' && entry.title.trim() && entry.title.length <= 100
      && typeof entry.room === 'string' && entry.room.trim() && entry.room.length <= 100
      && Number.isInteger(entry.day) && entry.day >= 0 && entry.day <= 6
      && /^([01]\d|2[0-3]):[0-5]\d$/.test(entry.start)
      && /^([01]\d|2[0-3]):[0-5]\d$/.test(entry.end) && entry.start < entry.end;
  },
  insight(course) {
    const prediction = globalThis.attendanceMath.predict({ present: course.present, conducted: course.conducted });
    if (!prediction.valid || prediction.percentage === null) return { percentage: '—', margin: 'No hours recorded', tone: 'neutral' };
    const margin = prediction.neededToTarget ? -prediction.neededToTarget : prediction.canMiss;
    return { percentage: `${Math.round(prediction.percentage)}%`, margin: `${margin} margin`,
      detail: margin < 0 ? `Attend ${-margin} more hours to reach 75%` : `Can miss ${margin} hours and stay at 75%`,
      tone: margin < 0 ? 'risk' : margin === 0 ? 'caution' : 'healthy' };
  },
};
