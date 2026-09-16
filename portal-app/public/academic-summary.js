'use strict';

globalThis.academicSummary = (() => {
  const get = id => document.getElementById(id);
  const element = (tag, text) => {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
  };
  function update(reports = {}) {
    const courses = (reports.attendance?.data || []).filter(course =>
      attendanceMath.predict({ present: course.present, conducted: course.conducted }).valid);
    const totals = courses.reduce((sum, course) => ({ present: sum.present + course.present,
      conducted: sum.conducted + course.conducted }), { present: 0, conducted: 0 });
    const result = attendanceMath.predict(totals);
    const atRisk = courses.filter(course => course.conducted > 0 && course.present / course.conducted < .75);
    const overview = get('attendance-overview');
    overview.replaceChildren();
    if (totals.conducted) {
      overview.append(element('strong', `${result.percentage}% overall`),
        element('span', `${totals.present} / ${totals.conducted} hours attended`),
        element('span', atRisk.length ? `${atRisk.length} ${atRisk.length === 1 ? 'course needs' : 'courses need'} recovery` : 'Every recorded course is at or above 75%'));
      overview.append(element('small', 'The 75% target applies to each course individually.'));
    }
    const monthly = get('monthly-attendance');
    monthly.replaceChildren();
    const rows = (reports.monthly || []).filter(row => typeof row.month === 'string'
      && Number.isInteger(row.present) && Number.isInteger(row.absent) && row.present >= 0 && row.absent >= 0);
    monthly.hidden = !rows.length;
    if (!rows.length) return;
    monthly.append(element('h3', 'Month by month'));
    const table = document.createElement('table');
    const caption = element('caption', 'Attendance hours reported by SRM');
    table.append(caption);
    const head = document.createElement('thead');
    const headings = document.createElement('tr');
    for (const title of ['Month', 'Present', 'Absent', 'Attendance']) {
      const th = element('th', title); th.scope = 'col'; headings.append(th);
    }
    head.append(headings); table.append(head);
    const body = document.createElement('tbody');
    for (const row of rows) {
      const tr = document.createElement('tr');
      const total = row.present + row.absent;
      for (const value of [row.month, row.present, row.absent, total ? `${Number((100 * row.present / total).toFixed(1))}%` : '—']) tr.append(element('td', value));
      body.append(tr);
    }
    table.append(body); monthly.append(table);
  }
  return { update, clear: () => update() };
})();
