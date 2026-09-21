'use strict';

globalThis.anonMarksTarget = (() => {
  const grades = [{ label: 'F', min: 0 }, ...[...marksTargetMath.grades].reverse()];
  const views = new Map();
  const fmt = number => Number(number.toFixed(2));
  const key = course => String(course.code || course.title);
  const overallSlider = document.getElementById('marks-overall-grade');
  let overallIndex = 6;
  let sequence = 0;
  const historyTouched = new Set();
  function projection() {
    const panel = document.getElementById('marks-projection');
    panel.hidden = views.size === 0;
    document.getElementById('marks-overall-label').textContent = overallIndex === null ? 'Individual targets' : overallIndex === 6 ? 'Max possible' : grades[overallIndex].label;
    const result = marksTargetMath.projection([...views.values()].map(view => ({
      credits: view.state.course.credits, target: view.state.target, excluded: view.state.excluded,
    })));
    document.getElementById('marks-projection-value').textContent = result.value === null ? '—' : result.value.toFixed(2);
    document.getElementById('marks-summary-gpa').textContent = result.value === null ? '—' : result.value.toFixed(2);
    document.getElementById('marks-projection-note').textContent = result.missing
      ? 'Course credits unavailable · sync to calculate'
      : result.credits ? `${fmt(result.credits)} credits · estimate` : 'No credit-bearing courses';
    const current = document.getElementById('marks-current-cgpa');
    const completed = document.getElementById('marks-completed-credits');
    const overall = marksTargetMath.cumulative(current.value, completed.value, result.value, result.credits);
    document.getElementById('marks-cgpa-value').textContent = overall.value === null ? '—' : overall.value.toFixed(2);
    const error = document.getElementById('marks-cgpa-error');
    error.textContent = overall.error || ''; error.hidden = !overall.error;
    current.setAttribute('aria-invalid', String(Boolean(overall.error?.startsWith('Current'))));
    completed.setAttribute('aria-invalid', String(Boolean(overall.error?.startsWith('Completed'))));
  }
  function create(course) {
    const id = key(course);
    if (views.has(id)) return views.get(id).root;
    const root = document.getElementById('marks-target-template').content.firstElementChild.cloneNode(true);
    const fields = Object.fromEntries([...root.querySelectorAll('[data-field]')].map(el => [el.dataset.field, el]));
    const state = { course, target: marksTargetMath.initialTarget(course), expectedTouched: false, excluded: false };
    const get = selector => root.querySelector(selector);
    const error = get('.mark-plan-error'); error.id = `mark-plan-error-${++sequence}`;
    root.dataset.course = id;
    root.setAttribute('aria-label', `Grade target for ${course.title || course.code}`);
    for (const [name, input] of Object.entries(fields)) {
      input.id = `mark-plan-${sequence}-${name}`;
      input.setAttribute('aria-describedby', error.id);
    }
    const stops = get('.mark-grade-stops');
    for (const [index, grade] of grades.entries()) {
      const button = document.createElement('button'); button.type = 'button';
      button.textContent = grade.label; button.dataset.grade = grade.label;
      button.title = `${grade.label}: ${grade.min} / 100 target`;
      button.addEventListener('click', () => chooseGrade(index));
      stops.append(button);
    }
    function chooseGrade(index) {
      overallIndex = null;
      state.targetTouched = true;
      state.target = grades[index].min; fields.grade.value = index;
      render(); projection();
    }
    function render() {
      const chosen = grades.find(grade => grade.min === state.target);
      fields.grade.value = grades.indexOf(chosen);
      get('.mark-target-grade').textContent = chosen.label;
      get('.mark-plan-selected').textContent = chosen.label;
      fields.grade.setAttribute('aria-valuetext', `${chosen.label}, ${chosen.min} out of 100`);
      for (const button of stops.children) button.setAttribute('aria-pressed', String(button.dataset.grade === chosen.label));
      const scheme = marksTargetMath.scheme(state.course.code);
      get('.mark-scheme-label').textContent = scheme.label;
      root.dataset.scheme = scheme.examMax ? 'standard' : 'internal';
      root.dataset.excluded = String(state.excluded);
      get('.mark-include input').checked = !state.excluded;
      const remaining = Math.max(0, scheme.internalMax - Number(state.course.total));
      fields.expected.max = remaining;
      if (!state.expectedTouched) fields.expected.value = remaining;
      else if (Number(fields.expected.value) > remaining) fields.expected.value = remaining;
      get('.mark-expected').hidden = !remaining || !scheme.examMax;
      get('.mark-expected-value').textContent = `${fmt(Number(fields.expected.value))} / ${fmt(remaining)}`;
      error.textContent = ''; error.hidden = true;
      const result = marksTargetMath.calculate({ scored: state.course.scored, recorded: state.course.total,
        ...scheme, expected: fields.expected.value, target: state.target });
      const output = get('.mark-result'), caption = get('.mark-result-caption');
      const number = get('.mark-result-number'), max = get('.mark-result-max'), detail = get('.mark-result-detail');
      output.dataset.tone = 'neutral'; number.textContent = '—'; max.textContent = ''; detail.textContent = '';
      caption.textContent = scheme.examMax ? 'Needed in final' : 'Internal marks needed';
      if (!result.valid) { error.textContent = result.error; error.hidden = false; return; }
      if (chosen.min === 0) {
        caption.textContent = 'Grade points'; number.textContent = '0';
        detail.textContent = 'F counts as zero in GPA'; return;
      }
      if (result.internalOnly) {
        const needed = Math.max(0, state.target - Number(state.course.scored));
        number.textContent = fmt(needed); max.textContent = needed ? ` / ${fmt(result.remaining)} left` : '';
        detail.textContent = needed > result.remaining ? 'Above the available marks' : needed ? `For ${chosen.label} · no final exam` : `${chosen.label} already reached`;
        output.dataset.tone = needed <= result.remaining ? 'possible' : 'limited';
      } else {
        number.textContent = result.possible ? fmt(result.required) : 'Out of reach';
        max.textContent = result.possible ? ' / 75' : '';
        detail.textContent = result.possible ? `For ${chosen.label} · ${fmt(result.projected)}/60 internals` : 'Try a lower target';
        output.dataset.tone = result.possible ? 'possible' : 'limited';
      }
    }
    fields.grade.addEventListener('input', () => chooseGrade(Number(fields.grade.value)));
    fields.expected.addEventListener('input', () => { state.expectedTouched = true; render(); });
    get('.mark-include input').addEventListener('change', event => {
      state.excluded = !event.target.checked; render(); projection();
    });
    views.set(id, { root, state, render });
    render(); projection();
    return root;
  }
  overallSlider.addEventListener('input', () => {
    overallIndex = Number(overallSlider.value);
    overallSlider.setAttribute('aria-valuetext', overallIndex === 6 ? 'Highest possible grade in each subject' : `${grades[overallIndex].label} target for all included subjects`);
    for (const view of views.values()) {
      if (view.state.excluded) continue;
      view.state.target = Math.min(grades[overallIndex].min, marksTargetMath.initialTarget(view.state.course));
      view.state.targetTouched = true;
      view.render();
    }
    projection();
  });
  for (const id of ['marks-current-cgpa', 'marks-completed-credits']) document.getElementById(id).addEventListener('input', () => { historyTouched.add(id); projection(); });
  return {
    create,
    history(profile = {}) {
      let filled = 0;
      for (const [field, id, max] of [['currentCgpa','marks-current-cgpa',10], ['completedCredits','marks-completed-credits',400]]) {
        const value = profile[field];
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max && !historyTouched.has(id)) {
          document.getElementById(id).value = value; filled++;
        } else if (!historyTouched.has(id)) {
          document.getElementById(id).value = '';
        }
      }
      const note = document.getElementById('marks-history-source');
      if (note) note.textContent = filled ? 'Filled from Student Portal · you can adjust these values.' : 'Enter your previous results if the portal has not supplied them.';
      projection();
    },
    update(courses) {
      const latest = new Map(courses.map(course => [key(course), course]));
      for (const [id, view] of views) {
        if (!latest.has(id)) { view.root.remove(); views.delete(id); continue; }
        view.state.course = latest.get(id);
        if (!view.state.targetTouched) view.state.target = marksTargetMath.initialTarget(view.state.course);
        view.render();
      }
      projection();
    },
    clear() {
      for (const view of views.values()) view.root.remove(); views.clear();
      for (const id of ['marks-current-cgpa', 'marks-completed-credits']) document.getElementById(id).value = '';
      historyTouched.clear();
      overallIndex = 6; overallSlider.value = 6;
      overallSlider.setAttribute('aria-valuetext', 'Highest possible grade in each subject');
      projection();
    },
  };
})();
