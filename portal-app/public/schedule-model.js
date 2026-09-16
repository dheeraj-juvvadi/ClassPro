'use strict';

globalThis.classproScheduleModel = (() => {
  const home = globalThis.classproHomeModel;
  const label = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 100;
  const key = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const parse = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T12:00:00`);
    return Number.isFinite(date.getTime()) && key(date) === value ? date : null;
  };
  function normalize(input) {
    if (!input || !Array.isArray(input.entries) || !Array.isArray(input.calendar)) return null;
    if (input.entries.length > 1000 || input.calendar.length > 1500) return null;
    try { new Intl.DateTimeFormat('en', { timeZone: input.timezone }); } catch { return null; }
    if (!label(input.timezone)) return null;
    const entries = input.entries.filter(entry => {
      if (!entry || !home.valid({ ...entry, day: entry.day ?? 0 })) return false;
      if (entry.day === undefined ? !label(entry.dayOrder) : entry.dayOrder !== undefined) return false;
      return (entry.hours === undefined || Number.isInteger(entry.hours) && entry.hours > 0 && entry.hours <= 24)
        && ['allocation', 'batch'].every(field => entry[field] === undefined || label(entry[field]));
    });
    const calendar = input.calendar.filter(day => day && parse(day.date)
      && ['teaching', 'holiday'].includes(day.kind)
      && (day.dayOrder === undefined || label(day.dayOrder))
      && (day.label === undefined || typeof day.label === 'string' && day.label.trim().length > 0 && day.label.length <= 1000));
    if (entries.length !== input.entries.length || calendar.length !== input.calendar.length) return null;
    if (new Set(calendar.map(day => day.date)).size !== calendar.length) return null;
    return { timezone: input.timezone, entries, calendar, calendarSource: input.calendarSource };
  }
  function clock(timezone, instant = new Date()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(instant).map(part => [part.type, part.value]));
    return new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00`);
  }
  function dayState(source, date) {
    if (Array.isArray(source)) return { kind: source.length ? 'manual' : 'unknown' };
    return source?.calendar.find(day => day.date === key(date)) || { kind: 'unknown' };
  }
  function classes(source, date, filters = {}) {
    const state = dayState(source, date);
    if (state.kind === 'holiday' || state.kind === 'unknown') return [];
    const entries = Array.isArray(source) ? source : source.entries;
    const selected = entries.filter(entry =>
      (entry.dayOrder !== undefined ? entry.dayOrder === state.dayOrder : entry.day === date.getDay())
      && ['allocation', 'batch'].every(field => !filters[field] || !entry[field] || entry[field] === filters[field]));
    selected.sort((first, second) => first.start.localeCompare(second.start));
    return selected.reduce((merged, entry) => {
      const previous = merged.at(-1);
      if (previous && ['code', 'title', 'room', 'allocation', 'batch', 'faculty'].every(field => previous[field] === entry[field]) && previous.end === entry.start) {
        const hours = home.hours(previous) + home.hours(entry);
        previous.end = entry.end;
        previous.hours = hours;
      }
      else merged.push({ ...entry });
      return merged;
    }, []);
  }
  function next(source, date, filters = {}) {
    let unknown = false;
    const dates = Array.isArray(source)
      ? Array.from({ length: 8 }, (_, offset) => { const candidate = new Date(date); candidate.setDate(date.getDate() + offset); return candidate; })
      : (source?.calendar || []).map(day => parse(day.date)).filter(candidate => key(candidate) >= key(date)).sort((first, second) => first - second);
    let expected = key(date);
    for (const candidate of dates) {
      if (key(candidate) !== expected) unknown = true;
      const following = new Date(candidate);
      following.setDate(candidate.getDate() + 1);
      expected = key(following);
      const sameDay = key(candidate) === key(date);
      const entry = classes(source, candidate, filters).find(slot => !sameDay || home.minutes(slot.end) > date.getHours() * 60 + date.getMinutes());
      if (entry) return { ...entry, date: candidate, unknown };
    }
    return null;
  }
  return { key, parse, normalize, clock, dayState, classes, next };
})();
