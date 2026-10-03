(() => {
  'use strict';
  // Fictional timetable shared only by the two planning previews.
  const courses = {
    ds: ['Data Structures', '21CSC201J', 'B-204'],
    cn: ['Computer Networks', '21CSC302J', 'B-206'],
    os: ['Operating Systems', '21CSC202J', 'B-204'],
    dm: ['Discrete Mathematics', '21MAB204T', 'A-103'],
    pe: ['Professional Ethics', '21LEM202T', 'A-105']
  };
  const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
  const timetable = {
    monday: [['08:00', '08:50', 'ds'], ['10:00', '10:50', 'cn'], ['11:00', '11:50', 'os'], ['13:00', '13:50', 'dm']],
    tuesday: [['09:00', '09:50', 'dm'], ['10:00', '10:50', 'pe'], ['13:00', '14:40', 'ds', 'Lab', 'Lab 2']],
    wednesday: [['08:00', '08:50', 'cn'], ['10:00', '10:50', 'os'], ['11:00', '11:50', 'ds'], ['14:00', '14:50', 'dm']],
    thursday: [['09:00', '09:50', 'pe'], ['10:00', '10:50', 'dm'], ['13:00', '14:40', 'cn', 'Lab', 'Lab 3']],
    friday: [['08:00', '08:50', 'os'], ['10:00', '10:50', 'ds'], ['11:00', '11:50', 'cn']]
  };
  const nameOf = day => day[0].toUpperCase() + day.slice(1);
  const lessonsFor = day => (timetable[day] || []).map(([start, end, key, format = 'Class', room]) => ({
    start, end, name: courses[key][0], code: courses[key][1], room: room || courses[key][2], format
  }));
  window.AnonSampleSchedule = { weekdays, lessonsFor, nameOf };
  if (document.body.dataset.page !== 'schedule') return;

  const buttons = [...document.querySelectorAll('.weekday-switch button')];
  const rows = document.querySelector('#course-rows');
  const summary = document.querySelector('#day-summary');
  const minutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const duration = lessons => {
    const total = lessons.reduce((sum, lesson) => sum + minutes(lesson.end) - minutes(lesson.start), 0);
    return `${Math.floor(total / 60)}h${total % 60 ? ` ${total % 60}m` : ''}`;
  };
  function showDay(day, announce = false) {
    const lessons = lessonsFor(day);
    const name = nameOf(day);
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.day === day)));
    document.querySelector('#day-title').textContent = name;
    summary.textContent = `${lessons.length} classes · ${duration(lessons)}`;
    document.querySelector('#schedule-caption').textContent = `${name} sample classes. Times use a 24-hour clock.`;
    rows.innerHTML = lessons.map(lesson => `<tr>
      <td class="class-time"><time datetime="${lesson.start}">${lesson.start}</time><span class="sr-only"> to </span><time datetime="${lesson.end}">${lesson.end}</time></td>
      <th scope="row"><span class="course-name">${lesson.name}</span><span class="course-meta">${lesson.code} · ${lesson.format}</span></th>
      <td class="class-room">${lesson.room}</td>
    </tr>`).join('');
    const link = document.querySelector('#calendar-link');
    link.href = `../calendar/?date=2026-10-${String(5 + weekdays.indexOf(day)).padStart(2, '0')}`;
    link.firstElementChild.textContent = `View ${name} in calendar`;
    if (announce) document.querySelector('#schedule-status').textContent = `${name}: ${summary.textContent}.`;
  }
  buttons.forEach(button => button.addEventListener('click', () => showDay(button.dataset.day, true)));
  const requestedDay = new URLSearchParams(window.location.search).get('day');
  showDay(weekdays.includes(requestedDay) ? requestedDay : 'monday');
  document.querySelector('.weekday-switch').hidden = false;
})();
