'use strict';
/*
 * attendance-math.js - original attendance projection math.
 *
 * Classic browser script: exposes `globalThis.attendanceMath`. Also loadable
 * from Node with `import '../public/attendance-math.js'`.
 *
 * Contract
 * --------
 * attendanceMath.predict({ present, conducted, attend, miss, od, target })
 *
 * `present` and `conducted` are required; `attend`, `miss`, and `od`
 * default to 0. Inputs are hour counts, all nonnegative integers:
 *   present    hours attended so far (already recorded) - required
 *   conducted  hours conducted so far (already recorded) - required
 *   attend     future hours you expect to attend
 *   miss       future hours you expect to miss
 *   od         OD correction: existing recorded absent hours converted to
 *              present (NOT extra classes). Capped at conducted - present,
 *              because you cannot correct more absences than you have.
 *   target     desired percentage, (0, 100]. Defaults to 75.
 *
 * Result (valid input):
 *   { valid: true, percentage, neededToTarget, canMiss,
 *     present: presentTotal, conducted: conductedTotal }
 *   presentTotal   = present + min(od, conducted - present)
 *   conductedTotal = conducted + attend + miss
 *   percentage     = 100 * (presentTotal + attend) / conductedTotal,
 *                    rounded to 2 decimals for display. When base hours are
 *                    zero and the projected total is still 0, percentage is
 *                    null (nothing to project).
 *   neededToTarget = extra consecutive hours you must attend to reach target;
 *                    0 when already at or above target; null when impossible
 *                    (target 100 with existing uncorrected absences).
 *   canMiss        = extra consecutive hours you can miss and stay >= target.
 *
 * Thresholds are evaluated on the unrounded percentage, with a small
 * epsilon so exact boundaries (e.g. exactly 75%) never round the wrong way.
 *
 * Invalid input:
 *   { valid: false, error: '<message>' }
 */
(function (root) {
  const EPSILON = 1e-9;

  const roundTo2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

  const isCount = (value) =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0;

  const REQUIRED_FIELDS = ['present', 'conducted'];
  const OPTIONAL_FIELDS = ['attend', 'miss', 'od'];

  function predict(input) {
    if (!input || typeof input !== 'object') {
      return { valid: false, error: 'input must be an object' };
    }

    const counts = { present: 0, conducted: 0, attend: 0, miss: 0, od: 0 };
    for (const field of REQUIRED_FIELDS) {
      if (!isCount(input[field])) {
        return { valid: false, error: `${field} is required and must be a nonnegative integer` };
      }
      counts[field] = input[field];
    }
    for (const field of OPTIONAL_FIELDS) {
      const value = input[field];
      if (value === undefined) continue;
      if (!isCount(value)) {
        return { valid: false, error: `${field} must be a nonnegative integer` };
      }
      counts[field] = value;
    }

    const { present, conducted, attend, miss, od } = counts;

    if (present > conducted) {
      return { valid: false, error: 'present cannot exceed conducted' };
    }

    const target = input.target === undefined ? 75 : input.target;
    if (typeof target !== 'number' || !Number.isFinite(target)) {
      return { valid: false, error: 'target must be a finite number' };
    }
    if (!(target > 0) || target > 100) {
      return { valid: false, error: 'target must be greater than 0 and at most 100' };
    }

    const odCapped = Math.min(od, conducted - present);
    const presentTotal = present + odCapped;
    const conductedTotal = conducted + attend + miss;

    if (conductedTotal === 0) {
      return {
        valid: true,
        percentage: null,
        neededToTarget: null,
        canMiss: 0,
        present: presentTotal,
        conducted: 0,
      };
    }

    const projectedPresent = presentTotal + attend;
    const raw = (projectedPresent / conductedTotal) * 100;

    let neededToTarget;
    if (raw + EPSILON >= target) {
      neededToTarget = 0;
    } else if (target >= 100) {
      neededToTarget = null;
    } else {
      const rawNeeded = (target * conductedTotal - 100 * projectedPresent) / (100 - target);
      neededToTarget = Math.max(0, Math.ceil(rawNeeded - EPSILON));
    }

    let canMiss = 0;
    if (projectedPresent > 0) {
      const rawMissable = (100 * projectedPresent) / target - conductedTotal;
      canMiss = Math.max(0, Math.floor(rawMissable + EPSILON));
    }

    return {
      valid: true,
      percentage: roundTo2(raw),
      neededToTarget,
      canMiss,
      present: presentTotal,
      conducted: conductedTotal,
    };
  }

  const api = { predict };
  root.attendanceMath = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
