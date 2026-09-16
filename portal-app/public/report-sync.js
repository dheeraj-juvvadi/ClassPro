'use strict';

globalThis.reportSyncSchedule = (() => {
  const hours = [...Array.from({ length: 12 }, (_, index) => index + 8), 21, 23];
  function next(instant = Date.now()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(instant)).map(part => [part.type, part.value]));
    const midnight = Date.parse(`${parts.year}-${parts.month}-${parts.day}T00:00:00+05:30`);
    for (let offset = 0; offset < 3; offset++) {
      const day = midnight + offset * 86400000;
      if (isSunday(day)) continue;
      const slot = hours.map(hour => day + hour * 3600000).find(time => time > instant);
      if (slot) return slot;
    }
  }
  function isSunday(instant = Date.now()) {
    return new Intl.DateTimeFormat('en', { timeZone: 'Asia/Kolkata', weekday: 'short' }).format(new Date(instant)) === 'Sun';
  }
  return { next, isSunday };
})();
