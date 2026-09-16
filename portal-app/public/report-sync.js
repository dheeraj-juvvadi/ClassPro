'use strict';

globalThis.reportSyncSchedule = (() => {
  const hours = [...Array.from({ length: 12 }, (_, index) => index + 8), 21, 23];
  function next(instant = Date.now()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(instant)).map(part => [part.type, part.value]));
    const midnight = Date.parse(`${parts.year}-${parts.month}-${parts.day}T00:00:00+05:30`);
    return hours.map(hour => midnight + hour * 3600000).find(time => time > instant) || midnight + 32 * 3600000;
  }
  return { next };
})();
