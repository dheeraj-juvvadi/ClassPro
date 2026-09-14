'use strict';

globalThis.academicUI = (() => {
  let courses = [];
  let selected = null;
  const get = identifier => document.getElementById(identifier);
  function create(tag, className, text) {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function margin(present, conducted) {
    const prediction = attendanceMath.predict({ present, conducted });
    if (!prediction.valid || prediction.percentage === null) return { text: 'No hours yet', tone: 'neutral', percentage: '—', detail: 'No attendance hours recorded.' };
    const required = prediction.neededToTarget;
    return { text: required ? `Required: ${required}` : `Margin: ${prediction.canMiss}`,
      tone: required ? 'risk' : prediction.canMiss === 0 ? 'caution' : 'healthy',
      percentage: `${Number(prediction.percentage.toFixed(1))}%`,
      detail: required ? `Attend ${required} consecutive hours to reach 75%.` : `You can miss ${prediction.canMiss} hours and remain at 75%.` };
  }
  function renderAttendance(data, container) {
    courses = data;
    const list = create('div', 'attendance-rows');
    for (const course of data) {
      const status = margin(course.present, course.conducted);
      const card = create('article', `attendance-row ${status.tone}`);
      const heading = create('div', 'attendance-row-heading');
      const name = create('div');
      name.append(create('h3', '', course.title || course.code), create('p', 'course-code', course.code));
      const badge = create('button', `margin-badge ${status.tone}`, status.text);
      badge.type = 'button';
      badge.title = status.detail;
      badge.setAttribute('aria-label', `${course.title}: ${status.detail} Calculate attendance`);
      badge.addEventListener('click', () => open(course));
      heading.append(name, badge);
      const bottom = create('div', 'attendance-row-bottom');
      const counts = create('dl', 'attendance-counts');
      for (const [label, value] of [['Present', course.present], ['Absent', course.absent], ['Total', course.conducted]]) {
        const pair = create('div', label === 'Absent' ? 'count-absent' : '');
        pair.append(create('dt', '', label), create('dd', '', value ?? '—'));
        counts.append(pair);
      }
      bottom.append(counts, create('strong', 'attendance-percent', status.percentage));
      card.append(heading, bottom);
      list.append(card);
    }
    container.append(list);
    get('calculate-attendance').disabled = !data.length;
  }
  function refreshCalculation() {
    if (!selected) return;
    const result = attendanceMath.predict({ present: selected.present, conducted: selected.conducted,
      attend: controls.attend.value(), miss: controls.miss.value(), od: controls.od.value() });
    const output = get('projection-result');
    if (!result.valid || result.percentage === null) { output.textContent = 'No attendance hours to calculate.'; return; }
    const detail = result.neededToTarget ? `Attend ${result.neededToTarget} more hours to reach 75%.` : `Margin: ${result.canMiss} hours.`;
    output.replaceChildren(create('strong', '', `${Number(result.percentage.toFixed(1))}%`), create('span', '', detail));
    output.className = result.neededToTarget ? 'projection-result risk' : 'projection-result healthy';
  }
  const controls = {};
  for (const [key, label] of [['attend', 'Hours to attend'], ['miss', 'Hours to miss'], ['od', 'OD correction hours']]) {
    controls[key] = createQuantityStepper({ label, max: 99, onChange: () => { if (controls.od) refreshCalculation(); } });
    get(`projection-${key}`).append(controls[key].element);
  }
  function selectCourse(index) {
    selected = null;
    for (const control of Object.values(controls)) control.set(0);
    selected = courses[index];
    refreshCalculation();
  }
  function open(course = courses[0]) {
    if (!course) return;
    const selector = get('projection-course');
    selector.replaceChildren();
    courses.forEach((entry, index) => {
      const option = create('option', '', entry.title || entry.code);
      option.value = index;
      selector.append(option);
    });
    const index = Math.max(0, courses.indexOf(course));
    selector.value = index;
    selectCourse(index);
    get('projection-dialog').showModal();
  }
  get('projection-course').addEventListener('change', event => selectCourse(Number(event.target.value)));
  get('calculate-attendance').addEventListener('click', () => open());
  get('close-projection').addEventListener('click', () => get('projection-dialog').close());
  return { renderAttendance, margin, clear() { courses = []; selected = null; get('projection-dialog').close(); } };
})();
