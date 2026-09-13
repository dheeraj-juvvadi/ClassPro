import { load } from 'cheerio';

export class PortalError extends Error {
  constructor(code, message = code, status = 422) {
    super(message);
    this.name = 'PortalError';
    this.code = code;
    this.status = status;
  }
}

const clean = (value) => value.replace(/\s+/g, ' ').trim();
const header = (value) => clean(value).toLowerCase().replace(/[.\s]/g, '');
const fail = (message) => { throw new PortalError('PARSE_ERROR', message); };
const schemas = {
  attendance: ['Code', 'Description', 'Max. hours', 'Att. hours', 'Absent hours', 'Total Percentage'],
  marks: ['Code', 'Description', 'Mark / Max. Mark'],
  components: ['Entered on', 'Component', 'Mark / Max. Mark'],
};

function rowsFor(html, kind) {
  if (typeof html !== 'string' || !html.trim()) fail('Expected a nonempty HTML document.');
  const $ = load(html);
  if ($('#login_form').length) {
    throw new PortalError('SESSION_EXPIRED', 'The portal session has expired.', 401);
  }
  const required = schemas[kind].map(header);
  const rows = [];
  let recognized = false;
  $('table').each((_, table) => {
    const tableRows = $(table).find('tr').filter((__, row) => $(row).closest('table')[0] === table);
    let columns;
    let width;
    tableRows.each((__, row) => {
      const cells = $(row).children('th,td');
      const values = cells.toArray().map((cell) => clean($(cell).text()));
      const labels = values.map(header);
      if (required.every((name) => labels.includes(name))) {
        if (required.some((name) => labels.filter((label) => label === name).length !== 1)) {
          fail(`Duplicate ${kind} headers.`);
        }
        columns = required.map((name) => labels.indexOf(name));
        width = cells.length;
        recognized = true;
        return;
      }
      if (!columns || !values.some(Boolean)) return;
      if (cells.length === 1 && /^(?:no (?:records?|data|results?)(?: (?:found|available))?|nothing to display)\.?$/i.test(values[0])) return;
      if (cells.length !== width || cells.toArray().some((cell) => Number($(cell).attr('colspan') || 1) !== 1 || Number($(cell).attr('rowspan') || 1) !== 1)) {
        fail(`Malformed ${kind} row.`);
      }
      rows.push({ values: columns.map((index) => values[index]), $, row });
    });
  });
  if (!recognized) fail(`Required ${kind} headers were not found.`);
  return rows;
}

function number(value, label, percentage = false) {
  const source = percentage ? value.replace(/\s*%$/, '') : value;
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(source)) fail(`Invalid ${label}.`);
  const parsed = Number(source);
  if (!Number.isFinite(parsed)) fail(`Invalid ${label}.`);
  return parsed;
}

function requiredText(value, label) {
  if (!value) fail(`Missing ${label}.`);
  return value;
}

function score(value) {
  const standaloneNA = /^n\/a$/i.test(value);
  if (standaloneNA) return { scored: null, total: null, scoreLabel: value };
  const slash = value.lastIndexOf('/');
  const parts = slash < 0 ? [value] : [value.slice(0, slash), value.slice(slash + 1)].map(clean);
  const label = parts[0];
  const unpublished = /^(?:|[-–—]|absent|ab|a|n\/?a|not (?:published|entered|available)|unpublished|pending)$/i;
  if (parts.length === 1 && !unpublished.test(label)) fail('Missing maximum mark.');
  const total = parts.length === 2 && !unpublished.test(parts[1]) ? number(parts[1], 'maximum mark') : null;
  const scored = unpublished.test(label) ? null : number(label, 'mark');
  if (scored !== null && total === null) fail('Missing maximum mark.');
  if (scored !== null && scored > total) fail('Mark exceeds maximum mark.');
  return { scored, total, ...(scored === null && label ? { scoreLabel: label } : {}) };
}

export function parseAttendance(html) {
  return rowsFor(html, 'attendance').map(({ values }) => {
    const [code, title, max, attended, missed, percent] = values;
    const conducted = number(max, 'conducted hours');
    const present = number(attended, 'present hours');
    const absent = number(missed, 'absent hours');
    const percentage = number(percent, 'attendance percentage', true);
    if (Math.abs(present + absent - conducted) > 1e-7 || percentage > 100) {
      fail('Inconsistent attendance counts or percentage.');
    }
    if (conducted === 0 && percentage !== 0) fail('Nonzero percentage for zero conducted hours.');
    return {
      code: requiredText(code, 'subject code'), title: requiredText(title, 'subject title'),
      conducted, present, absent, percentage,
    };
  });
}

const quotedArgument = String.raw`(?:'(?:[^'\\\r\n]|\\['"\\nrt])*'|"(?:[^"\\\r\n]|\\['"\\nrt])*")`;
const componentCall = new RegExp(`^\\s*(?:return\\s+)?funViewComponentWiseMarks\\(\\s*(${quotedArgument})\\s*,\\s*(${quotedArgument})\\s*,\\s*(${quotedArgument})\\s*,\\s*(\\d+)\\s*\\)\\s*;?\\s*$`);
function unquote(value) {
  const escapes = { n: '\n', r: '\r', t: '\t', "'": "'", '"': '"', '\\': '\\' };
  return value.slice(1, -1).replace(/\\(['"\\nrt])/g, (_, key) => escapes[key]);
}

export function parseMarks(html) {
  return rowsFor(html, 'marks').map(({ values, $, row }) => {
    const [rawCode, rawTitle, mark] = values;
    const code = requiredText(rawCode, 'subject code');
    const title = requiredText(rawTitle, 'subject title');
    const handlers = $(row).find('[onclick]').toArray()
      .filter((element) => $(element).closest('tr')[0] === row)
      .map((element) => $(element).attr('onclick'))
      .filter((handler) => /funViewComponentWiseMarks/.test(handler));
    let subjectId = null;
    let detailStatus = null;
    if (handlers.length === 1) {
      const match = componentCall.exec(handlers[0]);
      if (match && /^\d+$/.test(unquote(match[1])) && clean(unquote(match[2])) === code && clean(unquote(match[3])) === title && Number.isSafeInteger(Number(match[4]))) {
        subjectId = unquote(match[1]);
        detailStatus = match[4];
      }
    }
    return { code, title, ...score(mark), subjectId, detailStatus };
  });
}

export function parseComponents(html) {
  return rowsFor(html, 'components').map(({ values }) => {
    const [enteredOn, name, mark] = values;
    return { name: requiredText(name, 'component name'), enteredOn, ...score(mark) };
  });
}
