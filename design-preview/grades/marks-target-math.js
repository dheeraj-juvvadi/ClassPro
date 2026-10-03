'use strict';

globalThis.marksTargetMath = {
  // Planning thresholds; an estimate does not override course grading rules.
  grades: Object.freeze([
    { label: 'O', min: 91 }, { label: 'A+', min: 81 }, { label: 'A', min: 71 },
    { label: 'B+', min: 61 }, { label: 'B', min: 56 }, { label: 'C', min: 50 },
  ].map(Object.freeze)),
  initialTarget(course) {
    const scheme = this.scheme(course.code);
    if (course.scored === null || course.total === null || !Number.isFinite(Number(course.scored)) || !Number.isFinite(Number(course.total))) return 81;
    const best = Math.min(100, Number(course.scored) + Math.max(0, scheme.internalMax - Number(course.total)) + (100 - scheme.internalMax));
    return this.grades.find(grade => best >= grade.min)?.min ?? 0;
  },
  scheme(code) {
    return /P$/i.test(String(code || '').trim())
      ? { internalMax: 100, examMax: 0, label: 'Internal only' }
      : { internalMax: 60, examMax: 75, label: '60 internal + 40 final' };
  },
  projection(courses) {
    let credits = 0, points = 0, missing = 0;
    for (const course of courses) {
      if (course.excluded) continue;
      const weight = Number(course.credits);
      if (course.credits === undefined || course.credits === null || String(course.credits).trim() === '' || !Number.isFinite(weight) || weight < 0) { missing++; continue; }
      if (weight === 0) continue;
      const index = this.grades.findIndex(grade => grade.min === Number(course.target));
      if (index < 0 && course.target !== 0) { missing++; continue; }
      credits += weight; points += weight * (index < 0 ? 0 : 10 - index);
    }
    return { value: !missing && credits > 0 ? points / credits : null, credits, missing };
  },
  cumulative(current, completed, semester, credits) {
    if ([current, completed].some(value => value === null || value === undefined || String(value).trim() === '')) return { value: null };
    const gpa = Number(current), previous = Number(completed);
    if (!Number.isFinite(gpa) || gpa < 0 || gpa > 10) return { value: null, error: 'Current CGPA must be between 0 and 10.' };
    if (!Number.isFinite(previous) || previous < 0) return { value: null, error: 'Completed credits must be zero or more.' };
    if (semester === null || !Number.isFinite(semester) || credits <= 0) return { value: null };
    return { value: (gpa * previous + semester * credits) / (previous + credits) };
  },
  calculate({ scored, recorded, internalMax, examMax, expected, target }) {
    const values = { scored, recorded, internalMax, examMax, expected, target };
    for (const [key, value] of Object.entries(values)) {
      if (value === null || value === undefined || String(value).trim() === '' || !Number.isFinite(Number(value))) {
        return { valid: false, field: key, error: 'Enter a number in every field.' };
      }
      values[key] = Number(value);
    }
    ({ scored, recorded, internalMax, examMax, expected, target } = values);
    if (internalMax <= 0 || internalMax > 100) return { valid: false, field: 'internalMax', error: 'Internal marks must be above 0 and at most 100.' };
    if (recorded < 0 || scored < 0 || scored > recorded || recorded > internalMax) {
      return { valid: false, error: 'These recorded marks do not fit the course total. Sync to check for updates.' };
    }
    const remaining = internalMax - recorded;
    if (expected < 0 || expected > remaining) return { valid: false, field: 'expected', error: `Expected marks must be between 0 and ${Number(remaining.toFixed(2))}.` };
    if (target < 0 || target > 100) return { valid: false, field: 'target', error: 'Your target must be between 0 and 100.' };
    const weight = 100 - internalMax;
    if (weight && (examMax <= 0 || examMax > 1000)) return { valid: false, field: 'examMax', error: 'The final exam maximum must be above 0 and at most 1000.' };
    const projected = scored + expected;
    const needed = Math.max(0, target - projected);
    const possible = needed <= weight + 1e-9;
    return { valid: true, remaining, projected, weight, possible, needed,
      internalOnly: !weight,
      required: weight ? Math.max(0, Math.ceil((needed / weight * examMax - 1e-9) * 100) / 100) : 0,
      best: scored + remaining + weight,
      ceiling: projected + weight,
    };
  },
};
