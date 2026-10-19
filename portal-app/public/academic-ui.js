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
    return { text: required ? `Required: ${required}h` : `Margin: ${prediction.canMiss}h`,
      tone: required ? 'risk' : prediction.canMiss === 0 ? 'caution' : 'healthy',
      percentage: `${Number(prediction.percentage.toFixed(1))}%`,
      detail: required ? `Attend ${required} consecutive hours to reach 75%.` : `You can miss ${prediction.canMiss} hours and remain at 75%.` };
  }
  const TONES = { risk: 'risk', caution: 'edge', healthy: 'good', neutral: 'good' };
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function verdictFor(prediction) {
    if (!prediction.valid || prediction.percentage === null) return 'No hours yet';
    if (prediction.neededToTarget) return `Attend the next ${prediction.neededToTarget} hours`;
    if (prediction.canMiss) return `${prediction.canMiss} hours to spare`;
    return "Right at 75% · don't miss the next one";
  }
  function renderAttendance(data, container, schedule) {
    courses = data;
    const pctOf = course => attendanceMath.predict(course).percentage ?? Infinity;
    const sorted = [...data].sort((a, b) => pctOf(a) - pctOf(b));
    const legend = create('div', 'v2-legend');
    legend.setAttribute('aria-hidden', 'true');
    for (const [cls, label] of [['p', 'Present'], ['a', 'Absent'], ['s', 'Can skip'], ['n', 'Must attend']]) {
      const item = create('span');
      item.append(create('i', `d ${cls}`), document.createTextNode(label));
      legend.append(item);
    }
    const list = create('div', 'attendance-rows');
    for (const course of sorted) {
      const status = margin(course.present, course.conducted);
      const prediction = attendanceMath.predict(course);
      const card = create('article', `attendance-row v2 ${TONES[status.tone] || 'good'}`);
      const details = [course.faculty, course.room, course.type, course.credits && `${course.credits} credits`].map(value => courseDetails.clean(value)).filter(Boolean);
      if (details.length) card.title = details.join(' · ');
      let verdict = verdictFor(prediction);
      const recovery = courseDetails.recovery(course, classproScheduleModel.normalize(schedule), classproScheduleModel.clock('Asia/Kolkata'));
      if (recovery?.date) verdict += ` · back by ${recovery.date.getDate()} ${MONTHS[recovery.date.getMonth()]}`;
      card.setAttribute('aria-label', `${course.title || course.code}: ${status.percentage}, ${course.present} of ${course.conducted} hours present. ${status.detail} ${verdict}`);
      const head = create('div', 'v2-head');
      const left = create('div');
      const sub = create('p');
      sub.append(document.createTextNode(`${course.present}/${course.conducted} hours`));
      const delta = course.change24h?.points;
      if (Number.isFinite(delta)) {
        const amount = Number(delta.toFixed(1));
        const change = create('span', `attendance-change delta ${amount > 0 ? 'positive up' : amount < 0 ? 'negative down' : 'unchanged'}`, `${amount > 0 ? '▲ +' : amount < 0 ? '▼ ' : ''}${amount}% · 24h`);
        change.title = `${delta > 0 ? '+' : ''}${delta} percentage points since the saved reading near 24 hours ago`;
        sub.append(change);
      }
      left.append(create('h3', '', course.title || course.code), sub);
      const pct = create('p', 'v2-pct');
      const pctText = prediction.valid && prediction.percentage !== null ? `${Number(prediction.percentage.toFixed(1))}` : '—';
      pct.append(document.createTextNode(pctText));
      if (pctText !== '—') pct.append(create('span', '', '%'));
      head.append(left, pct);
      const dots = create('div', 'v2-dots');
      dots.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < (course.present || 0); i++) dots.append(create('i', 'd p'));
      for (let i = 0, absent = Math.max(0, (course.conducted || 0) - (course.present || 0)); i < absent; i++) dots.append(create('i', 'd a'));
      const extra = prediction.neededToTarget ? ['n', prediction.neededToTarget] : ['s', prediction.canMiss || 0];
      for (let i = 0; i < extra[1]; i++) dots.append(create('i', `d ${extra[0]}`));
      const button = create('button', 'v2-verdict', verdict);
      button.type = 'button';
      button.addEventListener('click', () => open(course));
      card.append(head, dots, button);
      list.append(card);
    }
    container.append(legend, list);
    get('calculate-attendance').disabled = !data.length;
  }
  get('calculate-attendance').addEventListener('click', () => dateAttendance.open());
  function open(course) { dateAttendance.open(course?.code); }
  function plan(code, hours, date) { dateAttendance.open(code, date); }
  return { renderAttendance, margin, plan, clear() { courses = []; selected = null; get('projection-dialog').close(); } };
})();
