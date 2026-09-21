'use strict';

globalThis.anonAcademicHistory = (() => {
  const root = document.getElementById('academic-history');
  let fingerprint = '';
  const el = (tag, className, text) => {
    const node = document.createElement(tag); node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const fmt = value => value === null ? '—' : Number(value.toFixed(3)).toString();
  const metric = (label, value, note) => {
    const node = el('div', 'journey-metric');
    node.append(el('span', '', label), el('strong', '', value));
    if (note) node.append(el('small', '', note));
    return node;
  };
  function chart(model) {
    const figure = el('figure', 'journey-chart');
    figure.append(el('figcaption', '', 'Semester GPA'));
    if (!model.graded.length) { figure.append(el('p', '', 'Semester GPAs have not been published yet.')); return figure; }
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 640 180'); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', model.graded.map(sem => `Semester ${sem.semester}: ${fmt(sem.gpa)} GPA`).join('; '));
    const shape = (tag, attrs, text) => {
      const node = document.createElementNS(ns, tag);
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
      if (text !== undefined) node.textContent = text;
      svg.append(node); return node;
    };
    for (const value of [0, 5, 10]) {
      const y = 144 - value * 12;
      shape('line', { x1: 32, x2: 616, y1: y, y2: y, class: 'journey-grid' });
      shape('text', { x: 16, y: y + 4, 'text-anchor': 'middle', class: 'journey-axis' }, value);
    }
    const points = model.semesters.map((sem, i) => ({ sem, x: model.semesters.length === 1 ? 324 : 48 + i * 544 / (model.semesters.length - 1), y: sem.gpa === null ? null : 144 - sem.gpa * 12 }));
    let segment = [];
    const flush = () => { if (segment.length) shape('polyline', { points: segment.join(' '), class: 'journey-line' }); segment = []; };
    for (const p of points) { if (p.y === null) flush(); else segment.push(`${p.x},${p.y}`); }
    flush();
    for (const { sem, x, y } of points) {
      shape('text', { x, y: 170, 'text-anchor': 'middle', class: 'journey-axis' }, `S${sem.semester}`);
      if (y === null) continue;
      shape('circle', { cx: x, cy: y, r: 4, class: 'journey-dot' });
      if (points.length <= 10) shape('text', { x, y: y - 12, 'text-anchor': 'middle', class: 'journey-point-label' }, sem.gpa.toFixed(2));
    }
    figure.append(svg); return figure;
  }
  function semesterCard(sem, opened) {
    const card = el('details', 'journey-semester');
    card.dataset.semester = `${sem.semester}:${sem.period}`;
    card.open = opened.has(card.dataset.semester);
    const summary = el('summary', '');
    const title = el('div', 'journey-semester-title');
    title.append(el('strong', '', `Semester ${sem.semester}`), el('small', '', `${sem.period ? `${sem.period} · ` : ''}${fmt(sem.earnedCredits)} credits earned`));
    const score = el('span', 'journey-semester-score', fmt(sem.gpa)); score.append(el('small', '', 'GPA'));
    summary.append(title, score); card.append(summary);
    const list = el('ul', 'journey-courses');
    for (const course of sem.courses) {
      const row = el('li', 'journey-course');
      const description = el('div', '');
      description.append(el('span', '', course.title || course.code), el('small', '', `${course.code} · ${fmt(course.credits)} ${course.credits === 1 ? 'credit' : 'credits'}`));
      const grade = el('span', 'journey-grade', course.grade);
      grade.setAttribute('aria-label', `Grade ${course.grade}`);
      row.append(description, grade); list.append(row);
    }
    card.append(list); return card;
  }
  function render(history = {}, profile = {}, state = {}) {
    const connection = state.connections?.portal;
    const next = JSON.stringify([history, profile.currentCgpa, profile.completedCredits, connection, state.sync?.pending]);
    if (next === fingerprint) return;
    fingerprint = next;
    const opened = new Set([...root.querySelectorAll('details[open]')].map(d => d.dataset.semester || 'journey'));
    root.replaceChildren();
    const model = academicHistoryModel.analyze({ ...profile, ...history });
    const heading = el('div', 'journey-heading');
    heading.append(el('h3', '', 'So Far'));
    root.append(heading);
    if (!model.semesters.length && model.currentCgpa === null && model.completedCredits === null) {
      root.append(el('p', 'journey-empty', history.status === 'empty'
        ? 'Your semester results haven’t been published yet. They’ll appear here after a sync.'
        : connection?.expired ? 'Your Student Portal session expired. Reconnect in Settings to load your results.'
        : connection?.connected ? state.sync?.pending
          ? 'Loading your published results from Student Portal…'
          : 'Student Portal is connected. Your grade history hasn’t loaded yet. Tap Sync to try again.'
        : 'Connect Student Portal in Settings to see your GPA, credits, and semester history.'));
      return;
    }
    const metrics = el('div', 'journey-metrics');
    metrics.append(metric('Current CGPA', model.currentCgpa === null ? '—' : model.currentCgpa.toFixed(2), 'Out of 10'),
      metric('Credits earned', fmt(model.completedCredits), model.requiredCredits === null ? 'From published results' : `of ${fmt(model.requiredCredits)} required`));
    root.append(metrics);
    if (model.progress !== null) {
      const track = el('div', 'journey-progress');
      const bar = el('progress', ''); bar.max = model.requiredCredits; bar.value = Math.min(model.completedCredits, model.requiredCredits);
      bar.setAttribute('aria-label', `${fmt(model.completedCredits)} of ${fmt(model.requiredCredits)} degree credits earned`);
      track.append(bar, el('span', '', `${Math.round(model.progress)}% of credits earned · ${fmt(model.remaining)} to go`));
      root.append(track);
    }
    if (history.stale || history.partial) root.append(el('p', 'journey-notice', history.stale
      ? 'Showing your last saved results. The latest sync couldn’t refresh this report.'
      : 'Some rows could not be read. Published totals are shown as supplied by the portal.'));
    if (!model.semesters.length) return;
    const details = el('details', 'journey-details'); details.open = opened.has('journey');
    const summary = el('summary', '');
    summary.append(el('span', '', 'Semester analysis'), el('span', 'journey-count', `${new Set(model.semesters.map(s => s.semester)).size} semesters`));
    details.append(summary);
    const body = el('div', 'journey-body'); body.append(chart(model));
    const insights = el('div', 'journey-insights');
    if (model.best) insights.append(metric('Best semester', fmt(model.best.gpa), `Semester ${model.best.semester}`));
    if (model.change !== null) insights.append(metric('Since your first semester', `${model.change > 0 ? '+' : ''}${model.change.toFixed(2)}`, 'Change in semester GPA'));
    if (insights.childElementCount) body.append(insights);
    const distribution = el('div', 'journey-distribution');
    distribution.append(el('h4', '', 'Grades across your record'));
    const chips = el('ul', '');
    for (const [grade, count] of model.distribution) chips.append(el('li', '', `${grade} · ${count}`));
    distribution.append(chips); body.append(distribution);
    const semesters = el('div', 'journey-semesters');
    for (const sem of model.semesters) semesters.append(semesterCard(sem, opened));
    body.append(semesters);
    const date = new Date(history.fetchedAt);
    const stamp = Number.isNaN(date.getTime()) ? '' : ` · Synced ${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
    body.append(el('p', 'journey-footnote', `Student Portal · Semester GPAs and CGPA are reported values. Zero-credit subjects are listed but add no credits.${stamp}`));
    details.append(body); root.append(details);
  }
  return { render, clear() { fingerprint = ''; root.replaceChildren(); } };
})();
