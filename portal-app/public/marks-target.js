'use strict';

globalThis.anonMarksTarget = (() => {
  const presets = { theory: [60, 75], practical: [60, 40], internal: [100, 0] };
  const grades = [...marksTargetMath.grades].reverse();
  const views = new Map();
  const fmt = number => Number(number.toFixed(2));
  const key = course => String(course.code || course.title);
  let sequence = 0;
  function create(course) {
    const id = key(course);
    if (views.has(id)) return views.get(id).root;
    const root = document.getElementById('marks-target-template').content.firstElementChild.cloneNode(true);
    const fields = Object.fromEntries([...root.querySelectorAll('[data-field]')].map(el => [el.dataset.field, el]));
    const state = { course, target: '81', custom: false };
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
      const grade = grades[index];
      state.target = String(grade.min); state.custom = false;
      fields.grade.value = index; fields.target.value = state.target;
      render();
    }
    function render() {
      const targetNumber = state.target.trim() === '' ? NaN : Number(state.target);
      const chosen = state.custom ? null : grades.find(grade => grade.min === targetNumber);
      get('.mark-target-grade').textContent = chosen?.label || 'Custom';
      get('.mark-custom-toggle').setAttribute('aria-pressed', String(state.custom));
      get('.mark-custom-field').hidden = !state.custom;
      root.dataset.custom = String(state.custom);
      fields.grade.setAttribute('aria-valuetext', chosen ? `${chosen.label}, ${chosen.min} out of 100` : `Custom target ${state.target || 'not entered'} out of 100`);
      for (const button of stops.children) button.setAttribute('aria-pressed', String(button.dataset.grade === chosen?.label));
      const scheme = fields.scheme.value;
      get('.mark-custom-scheme').hidden = scheme !== 'custom';
      fields.expected.disabled = !scheme;
      for (const input of Object.values(fields)) input.removeAttribute('aria-invalid');
      error.textContent = ''; error.hidden = true;
      const remaining = Number(fields.internalMax.value) - Number(state.course.total);
      fields.expected.max = Math.max(0, remaining);
      get('.mark-expected small').textContent = !scheme ? 'Choose a scheme first.'
        : Number.isFinite(remaining) && remaining >= 0 ? `of ${fmt(remaining)} available` : 'Check this course’s marking scheme.';
      const output = get('.mark-result');
      const caption = get('.mark-result-caption'), number = get('.mark-result-number'), max = get('.mark-result-max');
      const detail = get('.mark-result-detail'), best = get('.mark-result-best');
      caption.textContent = 'Required in final'; number.textContent = '—'; max.textContent = ''; best.textContent = '';
      output.dataset.tone = 'neutral';
      if (!scheme) { detail.textContent = 'Choose your marking scheme to calculate the exam target.'; return; }
      const input = { scored: state.course.scored, recorded: state.course.total,
        internalMax: fields.internalMax.value, examMax: fields.examMax.value, expected: fields.expected.value, target: state.target };
      const result = marksTargetMath.calculate(input);
      if (!result.valid) {
        error.textContent = result.error; error.hidden = false;
        fields[result.field]?.setAttribute('aria-invalid', 'true');
        detail.textContent = 'Check the highlighted values.'; return;
      }
      const target = chosen ? `${chosen.label} · ${chosen.min}/100` : `${fmt(targetNumber)}/100`;
      if (result.internalOnly) {
        caption.textContent = 'Projected total'; number.textContent = fmt(result.projected); max.textContent = '/ 100';
        detail.textContent = result.needed ? `${fmt(result.needed)} more internal marks needed for ${target}.` : `${target} reached in this scenario.`;
      } else if (!result.possible) {
        number.textContent = 'Out of reach';
        detail.textContent = `${target} needs more internals. This scenario can reach ${fmt(result.ceiling)}/100.`;
      } else {
        number.textContent = fmt(result.required); max.textContent = `/ ${fields.examMax.value}`;
        detail.textContent = `For ${target}, with ${fmt(result.projected)} internal marks.`;
      }
      output.dataset.tone = result.possible ? 'possible' : 'limited';
      best.textContent = `Best possible: ${fmt(result.best)}/100`;
    }
    fields.grade.addEventListener('input', () => chooseGrade(Number(fields.grade.value)));
    fields.scheme.addEventListener('change', () => {
      const preset = presets[fields.scheme.value];
      if (preset) { fields.internalMax.value = preset[0]; fields.examMax.value = preset[1]; }
      render();
    });
    get('.mark-custom-toggle').addEventListener('click', () => {
      state.custom = !state.custom;
      if (!state.custom) chooseGrade(Number(fields.grade.value)); else render();
      if (state.custom) fields.target.focus();
    });
    for (const name of ['target', 'expected', 'internalMax', 'examMax']) fields[name].addEventListener('input', () => {
      if (name === 'target') state.target = fields.target.value;
      render();
    });
    views.set(id, { root, state, render });
    render();
    return root;
  }
  return {
    create,
    update(courses) {
      const latest = new Map(courses.map(course => [key(course), course]));
      for (const [id, view] of views) {
        if (!latest.has(id)) { view.root.remove(); views.delete(id); continue; }
        view.state.course = latest.get(id); view.render();
      }
    },
    clear() { for (const view of views.values()) view.root.remove(); views.clear(); },
  };
})();
