(() => {
  'use strict';
  const math = globalThis.marksTargetMath;
  const byId = id => document.getElementById(id);
  const format = value => String(Number(value.toFixed(2)));
  const touched = new Set();
  // Theory fixtures from ../marks/src/marks-courses.ts; totals use released rows only.
  const courses = [
    { name: 'Computer Networks', code: '21CSC302J', scored: 39, recorded: 60 },
    { name: 'Data Structures', code: '21CSC201J', scored: 43, recorded: 50 },
    { name: 'Discrete Mathematics', code: '21MAB204T', scored: 43, recorded: 60 },
  ];
  const courseInput = byId('course');
  const targetInput = byId('target');
  const expectedInput = byId('expected');
  const tabs = Array.from(document.querySelectorAll('[role="tab"]'));

  function selectTab(selected) {
    for (const tab of tabs) {
      const active = tab === selected;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      byId(tab.getAttribute('aria-controls')).hidden = !active;
    }
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', event => {
      const next = { ArrowRight: (index + 1) % tabs.length,
        ArrowLeft: (index + tabs.length - 1) % tabs.length,
        Home: 0, End: tabs.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      selectTab(tabs[next]);
      tabs[next].focus();
    });
  });

  function fieldError(input, message, show) {
    const visible = Boolean(message && (show || touched.has(input.id)));
    const error = byId(`${input.id}-error`);
    error.textContent = visible ? message : '';
    error.hidden = !visible;
    if (visible) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
  function numberValue(id, label, min, max, show, positive = false) {
    const input = byId(id);
    const raw = input.value.trim();
    const value = Number(raw);
    let error = '';
    if (input.validity.badInput) error = `Enter a valid number for ${label.toLowerCase()}.`;
    else if (!raw) error = `Enter ${label.toLowerCase()}.`;
    else if (!Number.isFinite(value)) error = 'Enter a finite number.';
    else if (positive && value <= 0) error = `${label} must be greater than 0.`;
    else if (value < min || value > max) error = Number.isFinite(max)
      ? `${label} must be between ${min} and ${max}.`
      : `${label} must be ${min} or more.`;
    fieldError(input, error, show);
    return error ? null : value;
  }
  function clearResult(kind, note) {
    byId(`${kind}-value`).textContent = '—';
    byId(`${kind}-note`).textContent = note;
    byId(kind === 'final' ? 'predict-result' : 'cgpa-result').removeAttribute('data-state');
  }
  function focusInvalid(form) {
    form.querySelector('[aria-invalid="true"]')?.focus();
  }
  function addOption(select, value, label) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.append(option);
  }
  courses.forEach(course => addOption(courseInput, course.code, course.name));
  math.grades.forEach(grade => addOption(targetInput, grade.min, `${grade.label} · ${grade.min}/100 target`));
  courseInput.value = '21CSC201J';
  targetInput.value = math.initialTarget({ code: '21CSC201J', scored: 43, total: 50 });

  // Calculation handlers follow; the shared helper is copied without modification.
  function configureCourse() {
    const course = courses.find(item => item.code === courseInput.value);
    if (!course) return;
    const remaining = math.scheme(course.code).internalMax - course.recorded;
    byId('course-summary').textContent = `${course.code} · Released: ${course.scored}/${course.recorded} · ${remaining} internal marks remaining`;
    expectedInput.max = String(remaining);
    expectedInput.readOnly = remaining === 0;
    expectedInput.value = remaining === 0 ? '0' : '';
    expectedInput.placeholder = remaining === 0 ? '0' : 'e.g. 8';
    byId('expected-hint').textContent = remaining === 0
      ? 'All internal assessments are released; remaining marks are fixed at 0.'
      : `Enter 0–${remaining} out of the pending internal marks. Pending is not zero.`;
    touched.delete('expected');
    fieldError(expectedInput, '', false);
  }
  function predict(show = false) {
    clearResult('final', 'Complete the fields above to see an estimate.');
    const course = courses.find(item => item.code === courseInput.value);
    const grade = math.grades.find(item => String(item.min) === targetInput.value);
    fieldError(courseInput, course ? '' : 'Choose a theory sample.', show);
    fieldError(targetInput, grade ? '' : 'Choose a sample target grade.', show);
    if (!course) return false;
    const scheme = math.scheme(course.code);
    const expected = numberValue('expected', 'Expected marks', 0, scheme.internalMax - course.recorded, show);
    if (!grade || expected === null) return false;
    const result = math.calculate({ scored: course.scored, recorded: course.recorded,
      internalMax: scheme.internalMax, examMax: scheme.examMax, expected, target: grade.min });
    if (!result.valid) {
      fieldError(expectedInput, result.error, true);
      return false;
    }
    byId('predict-result').dataset.state = result.possible ? 'possible' : 'limited';
    byId('final-value').textContent = result.possible ? `${format(result.required)} / ${scheme.examMax}` : 'Out of reach';
    byId('final-note').textContent = result.possible
      ? result.required === 0
        ? `The ${grade.label} target is already met by ${format(result.projected)}/60 estimated internals in this sample scheme.`
        : `For ${grade.label} with ${format(result.projected)}/60 estimated internals. The final must contribute ${format(result.needed)}/40 after scaling.`
      : `With ${format(result.projected)}/60 estimated internals, the highest total is ${format(result.ceiling)}/100. Adjust expected marks or choose a lower target.`;
    return true;
  }
  courseInput.addEventListener('change', () => {
    touched.add('course');
    configureCourse();
    predict();
  });
  targetInput.addEventListener('change', () => { touched.add('target'); predict(); });
  expectedInput.addEventListener('input', () => { touched.add('expected'); predict(); });
  byId('predict-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!predict(true)) focusInvalid(event.currentTarget);
  });
  function cumulative(show = false) {
    clearResult('cgpa', 'Enter all four values to see an estimate.');
    const current = numberValue('current', 'Current CGPA', 0, 10, show);
    const completed = numberValue('completed', 'Completed credits', 0, Infinity, show);
    const semester = numberValue('semester', 'Projected semester GPA', 0, 10, show);
    const credits = numberValue('credits', 'Semester credits', 0, Infinity, show, true);
    if ([current, completed, semester, credits].some(value => value === null)) return false;
    const result = math.cumulative(current, completed, semester, credits);
    if (result.value === null || !Number.isFinite(result.value) || !Number.isFinite(completed + credits)) {
      fieldError(byId('credits'), result.error || 'These credit values are too large to calculate. Enter smaller values.', true);
      return false;
    }
    byId('cgpa-value').textContent = `${result.value.toFixed(2)} / 10`;
    byId('cgpa-note').textContent = `Across ${format(completed + credits)} credits: ${format(current)} × ${format(completed)} completed + ${format(semester)} × ${format(credits)} this semester, divided by total credits.`;
    return true;
  }
  ['current', 'completed', 'semester', 'credits'].forEach(id => {
    byId(id).addEventListener('input', () => { touched.add(id); cumulative(); });
  });
  byId('cgpa-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!cumulative(true)) focusInvalid(event.currentTarget);
  });
  configureCourse();
  predict();
  cumulative();
})();
