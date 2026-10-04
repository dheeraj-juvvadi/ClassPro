(() => {
  'use strict';
  const form = document.querySelector('#calendar-export-form');
  const from = form.elements.from, through = form.elements.through;
  const get = id => document.getElementById(id);
  const sample = window.AnonSampleSchedule;
  const parse = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value ? date : null;
  };
  // Only this dated sample week is established. Never repeat it into unknown dates.
  const calendar = new Map(Array.from({ length: 7 }, (_, i) => [
    `2026-10-${String(5 + i).padStart(2, '0')}`, i < 5 ? sample.weekdays[i] : 'holiday'
  ]));
  let events = [];
  function update() {
    events = [];
    get('export-feedback').textContent = '';
    through.setCustomValidity('');
    const start = parse(from.value), end = parse(through.value);
    const span = start && end ? Math.round((end - start) / 86400000) : -1;
    const valid = span >= 0 && span < 31;
    if (start && end && !valid) through.setCustomValidity(span < 0 ? 'Choose an end date on or after the start.' : 'Choose up to 31 days.');
    let days = 0, unknown = 0;
    if (valid) for (let offset = 0; offset <= span; offset++) {
      const date = new Date(+start + offset * 86400000).toISOString().slice(0, 10);
      const day = calendar.get(date);
      if (!day) { unknown++; continue; }
      if (day === 'holiday') continue;
      const lessons = sample.lessonsFor(day);
      if (lessons.length) days++;
      for (const lesson of lessons) events.push({ ...lesson, date });
    }
    get('export-total').textContent = events.length;
    get('export-days').textContent = `across ${days} teaching ${days === 1 ? 'day' : 'days'}`;
    get('export-coverage').textContent = !valid ? 'Choose a date range of up to 31 days.'
      : unknown ? `${unknown} ${unknown === 1 ? 'date has' : 'dates have'} no confirmed timetable and will be skipped.`
        : events.length ? 'Class times and rooms · India Standard Time' : 'No classes on these dates.';
    get('export-coverage').dataset.warning = String(!valid || unknown > 0);
    get('export-download').disabled = !valid || !events.length;
    const first = get('export-first');
    first.hidden = !events.length;
    if (events.length) {
      const event = events[0];
      first.querySelector('strong').textContent = event.name;
      const day = parse(event.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
      first.querySelector('small').textContent = `${day} · ${event.start}–${event.end} · ${event.room}`;
    }
  }
  from.addEventListener('input', update);
  through.addEventListener('input', update);
  const escape = value => value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
  const stamp = date => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const moment = (date, time) => stamp(new Date(`${date}T${time}:00+05:30`));
  form.addEventListener('submit', event => {
    event.preventDefault();
    update();
    if (!form.reportValidity() || !events.length) return;
    const now = stamp(new Date());
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Anon//Sample Classes//EN', 'CALSCALE:GREGORIAN'];
    for (const item of events) lines.push('BEGIN:VEVENT',
      `UID:sample-${item.date}-${item.code}-${item.start.replace(':', '')}@anon.local`,
      `DTSTAMP:${now}`, `DTSTART:${moment(item.date, item.start)}`, `DTEND:${moment(item.date, item.end)}`,
      `SUMMARY:${escape(`[Sample] ${item.name}`)}`, `LOCATION:${escape(item.room)}`,
      'DESCRIPTION:Synthetic design preview. Not an institutional timetable.', 'END:VEVENT');
    lines.push('END:VCALENDAR');
    const url = URL.createObjectURL(new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = `anon-sample-${from.value}.ics`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    get('export-feedback').textContent = `Calendar file ready with ${events.length} sample classes.`;
  });
  update();
})();
