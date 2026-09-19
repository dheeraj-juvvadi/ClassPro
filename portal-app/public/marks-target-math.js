'use strict';

globalThis.marksTargetMath = {
  // ClassPro GradeX target thresholds. These are planning presets, not an
  // assertion of an official grade or a course-specific grading policy.
  grades: Object.freeze([
    { label: 'O', min: 91 }, { label: 'A+', min: 81 }, { label: 'A', min: 71 },
    { label: 'B+', min: 61 }, { label: 'B', min: 56 }, { label: 'C', min: 50 },
  ].map(Object.freeze)),
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
      return { valid: false, error: 'The reported marks do not fit this scheme. Choose the matching scheme before calculating.' };
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
