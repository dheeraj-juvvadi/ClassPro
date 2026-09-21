'use strict';

globalThis.academicHistoryModel = (() => {
  const numeric = (value, max = 1000) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max ? value : null;
  function analyze(history = {}) {
    const semesters = (Array.isArray(history.semesters) ? history.semesters : []).slice(0, 48)
      .filter(sem => numeric(sem.semester, 24) > 0)
      .map(sem => ({ ...sem, gpa: numeric(sem.gpa, 10), credits: numeric(sem.credits),
        earnedCredits: numeric(sem.earnedCredits),
        courses: (Array.isArray(sem.courses) ? sem.courses : []).slice(0, 80)
          .map(course => ({ code: String(course.code || '').slice(0, 80), title: String(course.title || '').slice(0, 240),
            credits: numeric(course.credits, 30), grade: String(course.grade || '—').slice(0, 16) })) }))
      .sort((a, b) => a.semester - b.semester);
    const graded = semesters.filter(sem => sem.gpa !== null);
    const first = graded[0], latest = graded.at(-1);
    const best = graded.reduce((top, sem) => !top || sem.gpa > top.gpa ? sem : top, null);
    const currentCgpa = numeric(history.currentCgpa, 10), completedCredits = numeric(history.completedCredits);
    const requiredCredits = numeric(history.requiredCredits), registeredCredits = numeric(history.registeredCredits);
    const distribution = new Map();
    for (const sem of semesters) for (const course of sem.courses) {
      const grade = course.grade.toUpperCase();
      distribution.set(grade, (distribution.get(grade) || 0) + 1);
    }
    return { semesters, graded, best, latest, currentCgpa, completedCredits, requiredCredits, registeredCredits,
      change: graded.length > 1 ? latest.gpa - first.gpa : null,
      remaining: completedCredits !== null && requiredCredits !== null ? Math.max(0, requiredCredits - completedCredits) : null,
      progress: completedCredits !== null && requiredCredits > 0 ? Math.min(100, completedCredits / requiredCredits * 100) : null,
      distribution: [...distribution].sort((a, b) => {
        const order = ['O','A+','A','B+','B','C'];
        return (order.includes(a[0]) ? order.indexOf(a[0]) : 99) - (order.includes(b[0]) ? order.indexOf(b[0]) : 99);
      }),
    };
  }
  return { analyze };
})();
