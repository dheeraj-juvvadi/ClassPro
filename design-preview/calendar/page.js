(() => {
  'use strict';
  const sample = window.AnonSampleSchedule;
  const makeDate = (year, month, day) => new Date(Date.UTC(year, month, day, 12));
  const reference = makeDate(2026, 9, 2);
  const keyOf = date => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  const fullDate = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const monthLabel = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const shortDate = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const extras = {
    '2026-10-09': { name: 'Data Structures', code: '21CSC201J', start: '14:00', end: '15:00', room: 'A-103', format: 'Practice exam' },
    '2026-10-16': { name: 'Computer Networks', code: '21CSC302J', start: '14:00', end: '15:00', room: 'A-103', format: 'Practice exam' },
    '2026-10-23': { name: 'Operating Systems', code: '21CSC202J', start: '14:00', end: '15:00', room: 'A-103', format: 'Practice exam' }
  };
  const isSampleMonth = date => date.getUTCFullYear() === 2026 && date.getUTCMonth() === 9;
  const weekdayOf = date => sample.weekdays[(date.getUTCDay() + 6) % 7];
  function eventsFor(date) {
    if (!isSampleMonth(date)) return [];
    const events = sample.lessonsFor(weekdayOf(date));
    if (extras[keyOf(date)]) events.push(extras[keyOf(date)]);
    return events.sort((a, b) => a.start.localeCompare(b.start));
  }
  const requested = new URLSearchParams(window.location.search).get('date');
  let selected = reference;
  if (/^\d{4}-\d{2}-\d{2}$/.test(requested || '')) {
    const [year, month, day] = requested.split('-').map(Number);
    const candidate = makeDate(year, month - 1, day);
    if (year >= 1900 && keyOf(candidate) === requested) selected = candidate;
  }
  let visibleMonth = makeDate(selected.getUTCFullYear(), selected.getUTCMonth(), 1);
  const now = new Date();
  const today = keyOf(makeDate(now.getFullYear(), now.getMonth(), now.getDate()));
  const monthDays = document.querySelector('#month-days');
  const eventList = document.querySelector('#day-events');
  const status = document.querySelector('#calendar-status');

  function renderMonth() {
    const year = visibleMonth.getUTCFullYear();
    const month = visibleMonth.getUTCMonth();
    const label = monthLabel.format(visibleMonth);
    document.querySelector('#month-title').textContent = label;
    document.querySelector('#month-caption').textContent = `${label}. Choose a date to see synthetic events.`;
    document.querySelector('#previous-month').setAttribute('aria-label', `Previous month, ${monthLabel.format(makeDate(year, month - 1, 1))}`);
    document.querySelector('#next-month').setAttribute('aria-label', `Next month, ${monthLabel.format(makeDate(year, month + 1, 1))}`);
    const offset = (visibleMonth.getUTCDay() + 6) % 7;
    const daysInMonth = makeDate(year, month + 1, 0).getUTCDate();
    const cellCount = Math.ceil((offset + daysInMonth) / 7) * 7;
    let html = '';
    for (let cell = 0; cell < cellCount; cell += 1) {
      if (cell % 7 === 0) html += '<tr>';
      const day = cell - offset + 1;
      if (day < 1 || day > daysInMonth) {
        html += '<td></td>';
      } else {
        const date = makeDate(year, month, day);
        const key = keyOf(date);
        const events = eventsFor(date);
        const exams = events.filter(event => event.format === 'Practice exam').length;
        const classes = events.length - exams;
        const description = `${fullDate.format(date)}. ${classes} sample ${classes === 1 ? 'class' : 'classes'}${exams ? `, ${exams} practice exam` : ''}.`;
        html += `<td><button type="button" class="day-button${cell % 7 > 4 ? ' is-weekend' : ''}" data-date="${key}" aria-label="${description}" aria-pressed="${key === keyOf(selected)}" aria-controls="day-details"${key === today ? ' aria-current="date"' : ''}>
          <span>${day}</span><span class="date-markers" aria-hidden="true">${classes ? '<i class="event-marker"></i>' : ''}${exams ? '<i class="event-marker exam-marker"></i>' : ''}</span>
        </button></td>`;
      }
      if (cell % 7 === 6) html += '</tr>';
    }
    monthDays.innerHTML = html;
    document.querySelector('#reset-month').hidden = isSampleMonth(visibleMonth);
  }

  function emptyActionDate() {
    for (let day = 1; day <= 31; day += 1) {
      const date = makeDate(2026, 9, day);
      if (date > selected && eventsFor(date).length) return date;
    }
    return makeDate(2026, 9, 1);
  }
  function renderDetails(announce = false) {
    const events = eventsFor(selected);
    const heading = shortDate.format(selected);
    document.querySelector('#selected-date').textContent = heading;
    document.querySelector('#event-count').textContent = `${events.length} ${events.length === 1 ? 'event' : 'events'}`;
    eventList.innerHTML = events.map(event => `<li class="calendar-event">
      <div class="event-time"><time datetime="${keyOf(selected)}T${event.start}">${event.start}</time><span class="sr-only"> to </span><time datetime="${keyOf(selected)}T${event.end}">${event.end}</time></div>
      <div class="event-copy"><h3>${event.name}</h3><p${event.format === 'Practice exam' ? ' class="exam-label"' : ''}>${event.format} · ${event.code}</p></div>
      <span class="event-room"><span class="sr-only">Room </span>${event.room}</span>
    </li>`).join('');
    eventList.hidden = events.length === 0;
    document.querySelector('#empty-day').hidden = events.length > 0;
    document.querySelector('#empty-message').textContent = isSampleMonth(selected)
      ? 'A clear day. No sample classes or exams on this date.'
      : 'No sample events in this month. The preview’s invented events are in October 2026.';
    const nextDate = emptyActionDate();
    const actionLabel = nextDate > selected ? 'Find next sample class' : 'Back to first sample day';
    document.querySelector('#find-event').innerHTML = `${actionLabel} <span aria-hidden="true">→</span>`;
    const weekday = weekdayOf(selected);
    const scheduleLink = document.querySelector('#schedule-link');
    scheduleLink.href = weekday ? `../schedule/?day=${weekday}` : '../schedule/';
    scheduleLink.firstElementChild.textContent = weekday ? `View ${sample.nameOf(weekday)} schedule` : 'View weekly schedule';
    monthDays.querySelectorAll('button').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.date === keyOf(selected)));
    });
    if (announce) status.textContent = `${fullDate.format(selected)}. ${events.length} synthetic ${events.length === 1 ? 'event' : 'events'}.`;
  }
  function jumpTo(date, focusDate = false) {
    selected = date;
    visibleMonth = makeDate(date.getUTCFullYear(), date.getUTCMonth(), 1);
    renderMonth();
    renderDetails(true);
    if (focusDate) monthDays.querySelector('[aria-pressed="true"]').focus();
  }
  function moveMonth(delta) {
    const next = makeDate(visibleMonth.getUTCFullYear(), visibleMonth.getUTCMonth() + delta, 1);
    const lastDay = makeDate(next.getUTCFullYear(), next.getUTCMonth() + 1, 0).getUTCDate();
    jumpTo(makeDate(next.getUTCFullYear(), next.getUTCMonth(), Math.min(selected.getUTCDate(), lastDay)));
  }
  monthDays.addEventListener('click', event => {
    const button = event.target.closest('button[data-date]');
    if (!button || !monthDays.contains(button)) return;
    const [year, month, day] = button.dataset.date.split('-').map(Number);
    selected = makeDate(year, month - 1, day);
    renderDetails(true);
  });
  document.querySelector('#previous-month').addEventListener('click', () => moveMonth(-1));
  document.querySelector('#next-month').addEventListener('click', () => moveMonth(1));
  document.querySelector('#reset-month').addEventListener('click', () => jumpTo(reference, true));
  document.querySelector('#find-event').addEventListener('click', () => jumpTo(emptyActionDate(), true));
  renderMonth();
  renderDetails();
  document.querySelector('#month-section').hidden = false;
  document.querySelector('#day-details').hidden = false;
})();
