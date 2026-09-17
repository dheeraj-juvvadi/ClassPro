'use strict';

// Ratio-D's 15/5 minute reminders, scoped to a dated class and opt-in session.
globalThis.createClassReminders = ({ notify }) => {
  let enabled = false;
  let day = '';
  const sent = new Set();
  return {
    enable(value) { enabled = value === true; },
    clear() { enabled = false; day = ''; sent.clear(); },
    check(next, now) {
      if (!enabled || !next || next.unknown) return;
      const date = classproScheduleModel.key(now);
      if (day !== date) { day = date; sent.clear(); }
      if (classproScheduleModel.key(next.date) !== date) return;
      const minutes = classproHomeModel.minutes(next.start) - now.getHours() * 60 - now.getMinutes();
      if (minutes <= 0 || minutes > 15) return;
      const window = minutes <= 5 ? 5 : 15;
      const tag = `anon-class-${date}-${next.code || next.title}-${next.start}-${window}`;
      if (sent.has(tag)) return;
      try {
        if (notify(`Next: ${next.title}`, {
          body: `${next.room ? `${next.room} · ` : ''}Starts in ${minutes} min`,
          icon: '/icons/icon-192.png', tag,
        }) !== false) sent.add(tag);
      } catch { /* Retry at the next clock tick if this browser cannot deliver. */ }
    },
  };
};
