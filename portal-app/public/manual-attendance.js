'use strict';

globalThis.manualAttendance = {
  calculate(courses, selected, mode, hours, today) {
    const model = anonScheduleModel, dates = Object.keys(selected).sort();
    const fail = error => ({ error, unknown: [], courses: [], manual: true });
    if (!['leave', 'attend', 'od'].includes(mode)) return fail('Choose Leave, Attend or OD.');
    if (dates.some(date => !model.parse(date))) return fail('Choose valid calendar dates.');
    const todayKey = model.key(today);
    if (dates.some(date => mode === 'od' ? date >= todayKey : date < todayKey))
      return fail(mode === 'od' ? 'Choose past dates for an OD correction.' : 'Choose today or future dates.');
    if (dates.length > 400) return fail('Choose up to 400 dates.');
    const field = mode === 'od' ? 'od' : mode === 'attend' ? 'attend' : 'miss';
    const empty = () => ({ attend: 0, miss: 0, od: 0 });
    const rows = [];
    for (const course of courses) {
      const count = hours[course.code] ?? 0;
      if (!Number.isSafeInteger(count) || count < 0 || count > 10000)
        return fail('Enter whole hours from 0 to 10,000 for each subject.');
      const impact = { ...empty(), [field]: dates.length ? count : 0 };
      rows.push({ ...course, impact, beforeImpact: empty(), duringImpact: { ...impact },
        prediction: attendanceMath.predict({ present: course.present, conducted: course.conducted, ...impact }),
        beforePrediction: attendanceMath.predict({ present: course.present, conducted: course.conducted }) });
    }
    const range = dates.length ? { start: dates[0], end: dates.at(-1), action: mode } : null;
    return { manual: true, unknown: [], courses: rows, ...(range ? { range } : {}) };
  },
  render(container, courses, hours, mode, onChange) {
    const label = mode === 'od' ? 'OD hours' : mode === 'attend' ? 'Hours to attend' : 'Hours to miss';
    const signature = JSON.stringify([mode, courses.map(course => [course.code, course.title])]);
    if (container.dataset.signature === signature) return;
    container.dataset.signature = signature;
    container.replaceChildren();
    for (const course of courses) {
      const row = document.createElement('label'); row.className = 'projection-manual-row';
      const name = document.createElement('span'); name.textContent = course.title || course.code;
      const input = document.createElement('input');
      input.type = 'number'; input.min = '0'; input.max = '10000'; input.step = '1';
      input.value = hours[course.code] ?? 0; input.inputMode = 'numeric'; input.dataset.course = course.code;
      input.setAttribute('aria-label', `${label}: ${course.title || course.code}`);
      input.addEventListener('input', () => onChange(course.code, input.value === '' ? 0 : input.valueAsNumber));
      row.append(name, input); container.append(row);
    }
  },
};
