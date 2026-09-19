'use strict';

globalThis.renderDatePlannerResults = (result, focusCode, selectedCount) => {
  const output = document.getElementById('projection-result');
  const make = (tag, className, text) => {
    const node = document.createElement(tag); node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const courses = [...result.courses].sort((a, b) => Number(b.code === focusCode) - Number(a.code === focusCode));
  const valid = courses.filter(course => course.prediction.valid && course.prediction.percentage !== null);
  const risk = valid.filter(course => course.prediction.neededToTarget > 0).length;
  const affected = valid.filter(course => Object.values(course.impact).some(hours => hours > 0)).length;
  const qualified = result.unknown.length > 0 || valid.length < courses.length;
  document.getElementById('projection-summary').textContent = !courses.length ? 'Your courses will appear here when attendance is available.'
    : !selectedCount ? 'Select dates to compare your attendance.'
    : !valid.length ? 'Recorded attendance hours are needed for a projection.'
    : !affected ? 'No confirmed class hours change on these dates.'
    : qualified ? 'A partial outlook. Some dates or attendance hours are unavailable.'
    : risk ? `${risk} ${risk === 1 ? 'course falls' : 'courses fall'} below 75%.`
    : 'All courses remain at or above 75%.';
  output.replaceChildren();
  for (const course of courses) {
    const prediction = course.prediction;
    const card = make('article', 'date-projection-course');
    card.dataset.course = course.code;
    const heading = make('div', 'date-result-heading');
    const identity = make('div', '');
    identity.append(make('span', 'date-result-code', course.code), make('h4', '', course.title || course.code));
    heading.append(identity);
    card.append(heading);
    if (!prediction.valid || prediction.percentage === null) {
      card.append(make('p', 'date-result-unavailable', 'No attendance hours recorded yet.'));
      output.append(card); continue;
    }
    const before = attendanceMath.predict({ present: course.present, conducted: course.conducted });
    const risk = prediction.neededToTarget > 0;
    card.dataset.tone = risk ? 'risk' : prediction.canMiss === 0 ? 'edge' : 'healthy';
    heading.append(make('span', 'date-result-badge', risk ? 'Below target' : prediction.canMiss === 0 ? 'At the edge' : 'On track'));
    const comparison = make('div', 'date-result-comparison');
    const current = make('div', 'date-result-current');
    current.append(make('span', '', 'Now'), make('strong', '', before.percentage === null ? '—' : `${before.percentage}%`));
    const next = make('div', 'date-result-next');
    next.append(make('span', '', selectedCount ? 'Projected' : 'Current'), make('strong', '', `${prediction.percentage}%`));
    const arrow = make('span', 'date-result-arrow', '→'); arrow.setAttribute('aria-hidden', 'true');
    comparison.append(current, arrow, next); card.append(comparison);
    const track = make('div', 'date-result-track'); track.setAttribute('aria-hidden', 'true');
    const fill = make('span', 'date-result-fill'); fill.style.width = `${Math.min(100, prediction.percentage)}%`;
    const start = make('span', 'date-result-start'); start.style.left = `${Math.min(100, before.percentage || 0)}%`;
    track.append(fill, start, make('span', 'date-result-target'));
    const note = risk ? `Attend ${prediction.neededToTarget} more ${prediction.neededToTarget === 1 ? 'hour' : 'hours'} to reach 75%.`
      : prediction.canMiss ? `Can miss ${prediction.canMiss} more ${prediction.canMiss === 1 ? 'hour' : 'hours'} and stay at 75%.`
      : 'No additional classes can be missed at this target.';
    card.append(track, make('p', 'date-result-margin', note));
    const impact = course.impact;
    const changes = [[impact.attend, 'attend'], [impact.miss, 'leave'], [impact.od, 'OD correction']]
      .filter(([hours]) => hours).map(([hours, label]) => `${hours}h ${label}`);
    card.append(make('p', 'date-result-impact', changes.length ? changes.join(' · ') : selectedCount ? 'No class hours changed for this course.' : 'Choose dates to explore a plan.'));
    output.append(card);
  }
};
