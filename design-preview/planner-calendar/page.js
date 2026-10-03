import '../../portal-app/public/cally.4dcba6a3b8.js';

const model = globalThis.anonScheduleModel;
const get = id => document.getElementById(id);
const source = model.normalize(await fetch('./fixture.json').then(response => response.json()));
// Reuse the existing preview's fictional lessons. Academic dates stay sourced.
source.entries = globalThis.AnonSampleSchedule.weekdays.flatMap((weekday, index) =>
  globalThis.AnonSampleSchedule.lessonsFor(weekday).map(lesson => ({
    code: lesson.code, title: lesson.name, room: lesson.room, start: lesson.start, end: lesson.end,
    dayOrder: String(index + 1), hours: Math.round((anonHomeModel.minutes(lesson.end) - anonHomeModel.minutes(lesson.start)) / 50),
  })));
const calendar = get('calendar');
const month = calendar.querySelector('calendar-month');
const key = date => date.toISOString().slice(0, 10);
const short = value => model.parse(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const full = value => model.parse(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const state = value => model.dayState(source, model.parse(value));
const sampleToday = '2026-10-02';
let mode = 'leave', anchor = '', complete = false, focused = '2026-10-15';
let selected = new Set(), start = '', end = '', shownMonth = '';
let painted = [], excluded = new Set(), calculated = false;
let animation;
const make = (tag, text, className) => {
  const node = document.createElement(tag); node.textContent = text;
  if (className) node.className = className;
  return node;
};
function eligible(value) {
  return state(value).kind === 'teaching' && (mode === 'od' ? value < sampleToday : value >= sampleToday);
}
function inRange() {
  return source.calendar.filter(day => day.date >= start && day.date <= end);
}
function rangeDates() {
  if (!start || !end) return [];
  const dates = [];
  for (let date = model.parse(start); model.key(date) <= end && dates.length < 400; date.setDate(date.getDate() + 1)) dates.push(model.key(date));
  return dates;
}
function chooseRange(first, last) {
  [start, end] = [first, last].sort();
  excluded.clear();
  selected = new Set(inRange().filter(day => eligible(day.date)).map(day => day.date));
  anchor = ''; complete = true; render();
}
function detail(value) {
  focused = value;
  const day = state(value);
  const title = day.kind === 'holiday' ? 'Holiday' : day.kind === 'teaching' ? `Day order ${day.dayOrder || 'unconfirmed'}` : 'Unconfirmed';
  const label = day.label && !/^(instructional day|holiday)$/i.test(day.label) ? ` · ${day.label}` : '';
  const note = day.kind === 'unknown' ? ' · No calendar entry available.' : '';
  get('date-detail').replaceChildren(make('strong', `${short(value)} · ${title}`), document.createTextNode(label + note));
}
function renderNotes(prefix) {
  const container = get('month-events'); container.replaceChildren();
  const events = source.calendar.filter(day => day.date.startsWith(prefix) && day.label && !/^(instructional day|holiday|teaching day)$/i.test(day.label));
  for (const day of events) {
    const button = make('button', '', 'event-row'); button.type = 'button';
    button.append(make('time', short(day.date)), make('span', day.label));
    button.addEventListener('click', () => { calendar.focusedDate = day.date; detail(day.date); });
    container.append(button);
  }
  if (!events.length) container.append(make('p', source.calendar.some(day => day.date.startsWith(prefix))
    ? 'No named events in this month’s source.' : 'Unconfirmed month. No calendar entries in this preview.', 'source-note'));
}
function decorate() {
  if (!month.shadowRoot) return;
  const buttons = [...month.shadowRoot.querySelectorAll('button[part]')];
  let prefix = '';
  for (const button of buttons) {
    const value = button.getAttribute('part').match(/date-(\d{4}-\d{2}-\d{2})/)?.[1];
    if (!value) continue;
    prefix ||= value.slice(0, 7);
    const day = state(value);
    const description = day.kind === 'holiday' ? 'Holiday' : day.kind === 'teaching' ? `Day order ${day.dayOrder}` : 'Unconfirmed, no calendar entry';
    const label = `${full(value)}, ${description}${day.label ? ', ' + day.label : ''}${excluded.has(value) ? ', excluded, tap to restore' : selected.has(value) ? ', selected ' + mode : painted.includes(value) ? ', in range, no teaching hours' : ''}`;
    if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
    if (button.title !== label) button.title = label;
  }
  if (prefix && shownMonth !== prefix) {
    const previous = shownMonth; shownMonth = prefix; renderNotes(prefix);
    if (previous && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      animation?.cancel();
      animation = month.animate([{ opacity: .45, transform: `translateX(${prefix > previous ? 6 : -6}px)` }, { opacity: 1, transform: 'translateX(0)' }], { duration: 160, easing: 'ease-out' });
    }
  }
}
function render() {
  calendar.today = sampleToday;
  painted = [...new Set([...rangeDates().filter(value => !excluded.has(value)), ...selected])].sort();
  calendar.value = painted.join(' ');
  calendar.isDateDisallowed = date => mode === 'od' ? key(date) >= sampleToday : key(date) < sampleToday;
  const dates = [...selected].sort();
  calendar.getDayParts = date => {
    const value = key(date), day = state(value);
    const named = day.label && !/^(instructional day|holiday)$/i.test(day.label);
    const included = painted.includes(value);
    const previous = new Date(date), next = new Date(date);
    previous.setUTCDate(previous.getUTCDate() - 1); next.setUTCDate(next.getUTCDate() + 1);
    const left = included && (date.getUTCDay() === 1 || date.getUTCDate() === 1 || !painted.includes(key(previous)));
    const right = included && (date.getUTCDay() === 0 || next.getUTCMonth() !== date.getUTCMonth() || !painted.includes(key(next)));
    return `date-${value} ${day.kind} ${day.dayOrder ? 'do-' + day.dayOrder : ''} ${named ? 'event' : ''} ${included ? 'selected' : ''} ${value >= start && value <= end ? 'span' : ''} ${excluded.has(value) ? 'excluded' : ''} ${value === start ? 'range-start' : ''} ${value === end ? 'range-end' : ''} ${left ? 'run-start' : ''} ${right ? 'run-end' : ''}`;
  };
  get('from').value = start; get('through').value = end;
  get('from').min = get('through').min = mode === 'od' ? '' : sampleToday;
  get('from').max = get('through').max = mode === 'od' ? '2026-10-01' : '';
  get('summary-title').textContent = `Your ${mode === 'od' ? 'OD correction' : mode} plan`;
  const off = painted.filter(value => state(value).kind === 'holiday').length;
  const unknown = painted.filter(value => state(value).kind === 'unknown').length;
  get('plan-description').textContent = start ? `${dates.length} teaching days${off ? ` · ${off} holidays` : ''}${unknown ? ` · ${unknown} unconfirmed` : ''}` : 'Your selected days will appear here.';
  get('range-from').textContent = start ? short(start) : 'Start date';
  get('range-through').textContent = anchor ? 'Choose end' : end ? short(end) : 'End date';
  get('range-status').textContent = anchor ? 'Choose end' : start ? `${rangeDates().length} days` : 'Select dates';
  get('selection-hint').textContent = anchor ? `${short(anchor)} selected. Now pick the last day.` : complete ? 'Tap any date to exclude it. Tap again to restore.' : 'Pick your first day, then your last. We’ll fill in between.';
  get('clear').disabled = !start; get('review').disabled = !start;
  renderSelected(); detail(focused); renderCalculation();
  calendar.updated.then(() => month.updated).then(decorate);
}
function remove(value) {
  selected.delete(value); excluded.add(value); anchor = '';
  render();
}
function renderSelected() {
  const container = get('selected-days'); container.replaceChildren();
  for (const value of [...excluded].sort()) {
    const button = make('button', `${short(value)} excluded`); button.type = 'button';
    button.setAttribute('aria-label', `Restore ${short(value)}`);
    button.append(make('span', '↶'));
    button.addEventListener('click', () => { excluded.delete(value); if (eligible(value)) selected.add(value); render(); (container.querySelector('button') || get('from')).focus(); });
    container.append(button);
  }
}
function renderCalculation() {
  get('calculation').hidden = !calculated;
  if (!calculated) return;
  get('calculation-title').textContent = mode === 'attend' ? 'Attended hours' : mode === 'od' ? 'Selected OD hours' : 'Missed hours';
  get('calculation-range').textContent = `${short(start)} — ${short(end)}`;
  const holidays = painted.filter(value => state(value).kind === 'holiday').length;
  const unconfirmed = painted.filter(value => state(value).kind === 'unknown').length;
  get('calculation-context').textContent = `${holidays} ${holidays === 1 ? 'holiday' : 'holidays'}${excluded.size ? ` · ${excluded.size} ${excluded.size === 1 ? 'date' : 'dates'} excluded` : ''}${unconfirmed ? ` · ${unconfirmed} unconfirmed` : ''}`;
  const totals = new Map();
  for (const value of selected) {
    for (const lesson of model.classes(source, model.parse(value))) {
      const previous = totals.get(lesson.code) || { title: lesson.title, hours: 0 };
      previous.hours += anonHomeModel.hours(lesson); totals.set(lesson.code, previous);
    }
  }
  const rows = [...totals].map(([code, lesson]) => {
    const row = make('div', '', 'subject-hours'); row.dataset.code = code;
    row.append(make('span', lesson.title), make('strong', `${lesson.hours}h`)); return row;
  });
  if (!rows.length) rows.push(make('p', 'No confirmed class hours in these dates.', 'source-note'));
  get('subject-hours').replaceChildren(...rows);
  get('unconfirmed-note').hidden = !unconfirmed;
  get('unconfirmed-note').textContent = 'Confirmed hours only. Unconfirmed dates are not counted as holidays or class hours.';
}
calendar.addEventListener('change', () => {
  const next = new Set(calendar.value.trim().split(/\s+/).filter(Boolean));
  const value = [...next].find(value => !painted.includes(value)) || painted.find(value => !next.has(value));
  if (!value) return;
  if (complete) {
    if (painted.includes(value)) remove(value);
    else { if (eligible(value)) selected.add(value); excluded.delete(value); render(); }
  } else if (anchor) chooseRange(anchor, value);
  else { selected = new Set(eligible(value) ? [value] : []); excluded.clear(); anchor = value; start = value; end = value; render(); }
  detail(value);
});
calendar.addEventListener('focusday', event => { if (event.detail instanceof Date) detail(key(event.detail)); });
calendar.addEventListener('mouseover', event => {
  const button = event.composedPath().find(node => node instanceof HTMLElement && node.getAttribute('part')?.includes('date-'));
  const value = button?.getAttribute('part').match(/date-(\d{4}-\d{2}-\d{2})/)?.[1];
  if (value) detail(value);
});
get('reset-month').addEventListener('click', () => { calendar.focusedDate = mode === 'od' ? '2026-10-01' : sampleToday; detail(calendar.focusedDate); });
for (const button of document.querySelectorAll('[data-mode]')) button.addEventListener('click', () => {
  mode = button.dataset.mode; selected.clear(); excluded.clear(); complete = calculated = false; start = end = anchor = '';
  document.querySelectorAll('[data-mode]').forEach(node => node.setAttribute('aria-pressed', String(node === button)));
  focused = mode === 'od' ? '2026-10-01' : sampleToday; calendar.focusedDate = focused; render();
});
function newRange() { selected.clear(); excluded.clear(); complete = calculated = false; start = end = anchor = ''; render(); }
get('new-range').addEventListener('click', newRange);
get('clear').addEventListener('click', newRange);
for (const input of [get('from'), get('through')]) input.addEventListener('change', () => {
  const first = get('from').value, last = get('through').value;
  if (!first || !last || !get('from').checkValidity() || !get('through').checkValidity()) return;
  chooseRange(first, last); calendar.focusedDate = first;
});
get('review').addEventListener('click', () => {
  calculated = true; renderCalculation();
});
const notes = document.querySelector('.month-notes');
function layout(value) {
  document.body.dataset.layout = 'month';
  document.querySelector('.calendar-panel').append(notes);
}
get('source-note').textContent = `${source.calendarSource}. Sample subjects from the current preview; each 50-minute period counts as 1 class hour. Outside Sep–Nov is unconfirmed. No live student data.`;
layout();
calendar.focusedDate = focused;
render();
await calendar.updated; await month.updated;
new MutationObserver(decorate).observe(month.shadowRoot, { childList: true, subtree: true, attributes: true, attributeFilter: ['part'] });
decorate();
