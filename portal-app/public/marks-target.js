'use strict';

globalThis.anonMarksTarget = (() => {
  const get = id => document.getElementById(id);
  const dialog = get('marks-target-dialog');
  const form = get('marks-target-form');
  const presets = { theory: [60, 75], practical: [60, 40], internal: [100, 0] };
  const fields = { internalMax: 'target-internal-max', examMax: 'target-exam-max', expected: 'target-expected', target: 'target-total' };
  const grades = marksTargetMath.grades;
  const gradeButtons = new Map();
  const fmt = number => Number(number.toFixed(2));
  const plans = new Map();
  let course = null, trigger = null;
  function showGrade(grade, editing = false) {
    const selected = grade?.label ?? 'Custom';
    for (const [label, button] of gradeButtons) {
      button.setAttribute('aria-pressed', String(label === selected));
    }
    get('target-total-field').hidden = Boolean(grade) && !editing;
    get('target-grade-help').textContent = grade
      ? `${grade.label} starts at ${fmt(grade.min)} / 100.`
      : 'Enter a target total from 0 to 100.';
  }
  function syncGrade(editing = false) {
    const value = get(fields.target).value;
    const grade = value.trim() === '' ? null : grades.find(item => item.min === Number(value));
    showGrade(grade, editing);
  }
  for (const grade of [...grades, null]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'target-grade-option';
    button.textContent = grade?.label ?? 'Custom';
    button.dataset.grade = grade?.label ?? 'custom';
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-describedby', 'target-grade-help');
    button.addEventListener('click', () => {
      if (grade) get(fields.target).value = grade.min;
      showGrade(grade);
      render();
      if (!grade) get(fields.target).focus();
    });
    gradeButtons.set(button.textContent, button);
    get('target-grade-options').append(button);
  }
  syncGrade();
  function schemeChanged() {
    const kind = get('target-scheme').value;
    get('target-custom').hidden = kind !== 'custom';
    if (presets[kind]) {
      get(fields.internalMax).value = presets[kind][0];
      get(fields.examMax).value = presets[kind][1];
    }
    get(fields.expected).disabled = !kind;
    render();
  }
  function render() {
    if (!course) return;
    const output = get('marks-target-result');
    const error = get('marks-target-error');
    for (const id of Object.values(fields)) get(id).removeAttribute('aria-invalid');
    error.textContent = ''; error.hidden = true;
    if (!get('target-scheme').value) {
      output.textContent = 'Choose your marking scheme to see what you need.';
      output.dataset.tone = 'neutral';
      get('target-remaining').textContent = 'Your remaining internal marks appear here.';
      return;
    }
    const inputs = Object.fromEntries(Object.entries(fields).map(([key, id]) => [key, get(id).value]));
    const result = marksTargetMath.calculate({ scored: course.scored, recorded: course.total, ...inputs });
    const remaining = Number(inputs.internalMax) - Number(course.total);
    get(fields.expected).max = Math.max(0, remaining);
    get('target-remaining').textContent = Number.isFinite(remaining) && remaining >= 0 ? `${fmt(remaining)} internal marks are still available in this scheme.` : 'The reported marks do not fit this scheme.';
    if (!result.valid) {
      error.textContent = result.error; error.hidden = false;
      if (fields[result.field]) get(fields[result.field]).setAttribute('aria-invalid', 'true');
      output.textContent = 'Check the values above.'; output.dataset.tone = 'neutral';
      return;
    }
    plans.set(course.code, { scheme: get('target-scheme').value, ...inputs });
    output.replaceChildren();
    const heading = document.createElement('strong');
    const detail = document.createElement('p');
    if (result.internalOnly) {
      heading.textContent = `${fmt(result.projected)} / 100 projected`;
      detail.textContent = result.needed > 0 ? `That is ${fmt(result.needed)} below your target. Adjust your expected remaining marks to explore another outcome.` : 'Your expected internal marks meet this target.';
    } else if (!result.possible) {
      heading.textContent = 'Beyond this scenario';
      detail.textContent = `Even full marks in the final would reach ${fmt(result.ceiling)} / 100 with these expected internals.`;
    } else {
      heading.textContent = `${fmt(result.required)} / ${inputs.examMax} in the final`;
      detail.textContent = `To reach ${inputs.target} / 100 with ${fmt(result.projected)} internal marks. The final contributes ${fmt(result.weight)} points.`;
    }
    output.dataset.tone = result.possible ? 'possible' : 'limited';
    const best = document.createElement('small');
    best.textContent = `Best possible from the reported marks: ${fmt(result.best)} / 100.`;
    output.append(heading, detail, best);
  }
  get('target-scheme').addEventListener('change', schemeChanged);
  form.addEventListener('input', event => {
    if (event.target.id === fields.target) syncGrade(true);
    if (event.target.id !== 'target-scheme') render();
  });
  form.addEventListener('submit', event => { event.preventDefault(); render(); });
  get('close-marks-target').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    if (trigger?.isConnected) trigger.focus();
    else if (document.body.dataset.page === 'marks') get('reports-title').focus();
  });
  return {
    open(value, button) {
      course = value; trigger = button;
      form.reset();
      const saved = plans.get(course.code);
      if (saved) {
        get('target-scheme').value = saved.scheme;
        for (const [key, id] of Object.entries(fields)) get(id).value = saved[key];
      }
      syncGrade();
      get('marks-target-course').textContent = course.title || course.code;
      get('marks-target-recorded').textContent = `Reported so far: ${course.scored ?? '—'} / ${course.total ?? '—'}.`;
      schemeChanged();
      dialog.showModal();
      get('target-scheme').focus();
    },
    update(courses) {
      if (!dialog.open || !course) return;
      const updated = courses.find(item => item.code === course.code);
      if (!updated) { dialog.close(); course = null; return; }
      course = updated;
      get('marks-target-recorded').textContent = `Reported so far: ${course.scored ?? '—'} / ${course.total ?? '—'}.`;
      render();
    },
    clear() { plans.clear(); course = null; trigger = null; dialog.close(); form.reset(); syncGrade(); },
  };
})();
