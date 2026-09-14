import { writeFileSync } from 'node:fs';

const colors = { page: '#191b19', surface: '#191b19', border: '#353832', ink: '#f1eee3', muted: '#a7a79f', green: '#a5b58c', amber: '#d3ad66', red: '#e3957c', lavender: '#a4a0bf' };
const text = (horizontal, vertical, content, size = 12, color = colors.ink, weight = 450, extra = '') => `<text x="${horizontal}" y="${vertical}" font-size="${size}" fill="${color}" font-weight="${weight}" ${extra}>${content}</text>`;
const rect = (horizontal, vertical, width, height, fill = colors.surface, stroke = colors.border, radius = 17) => `<rect x="${horizontal}" y="${vertical}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}"/>`;
const line = (start, vertical, end, color = colors.border) => `<path d="M${start} ${vertical}H${end}" stroke="${color}"/>`;
const label = (horizontal, vertical, content) => text(horizontal, vertical, content, 9, colors.muted, 600, 'letter-spacing="1.5"');

function shell(title, active) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="390" height="1000" viewBox="0 0 390 1000" fill="none">
<title>ClassPro ${title} — design concept</title>
<desc>Sample academic data using the login’s charcoal, warm paper typography and restrained botanical ink accents.</desc>
<style>@font-face{font-family:Inter;src:url('/InterVariable.woff2') format('woff2')}text{font-family:Inter,Arial,sans-serif;font-variant-numeric:tabular-nums}</style>
<rect width="390" height="1000" fill="${colors.page}"/>
${rect(14, 14, 362, 976, colors.page, colors.border, 25)}
${text(28, 65, `Your ${title.toLowerCase()}.`, 32, colors.ink, 550, 'letter-spacing="-1.6"')}
${text(29, 91, 'Semester 05 · sample data', 11, colors.muted)}
${active === 'Attendance' ? text(29, 135, 'Calculate', 12, colors.ink, 550) + '<circle cx="111" cy="130" r="15" fill="#d5dda9"/>' + text(111, 135, '↗', 16, '#252b1c', 450, 'text-anchor="middle"') : text(29, 136, 'Published assessments', 12, colors.muted)}
${rect(290, 112, 72, 36, colors.page, colors.border, 11)}${text(326, 135, '↻ Sync', 11, colors.ink, 500, 'text-anchor="middle"')}`;
}

function navigation(active) {
  const destinations = ['Home', 'Attendance', 'Marks'];
  const icons = [
    '<path d="M-8 0L0-7L8 0V8H3V2H-3V8H-8Z"/>',
    '<rect x="-7" y="-6" width="14" height="14" rx="3"/><path d="M-3 .5L-1 3L3-1.5"/>',
    '<path d="M-7 8V1M0 8V-7M7 8V-2"/>',
  ];
  let markup = rect(35, 910, 320, 62, '#232421', colors.border, 21);
  destinations.forEach((destination, index) => {
    const center = 89 + index * 106;
    const selected = destination === active;
    const color = selected ? '#272924' : '#aeafa6';
    if (selected) markup += rect(center - (index === 1 ? 52 : 46), 918, index === 1 ? 104 : 92, 46, '#e0dfd2', '#e0dfd2', 14);
    markup += `<g transform="translate(${center} 935)" stroke="${color}" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">${icons[index]}</g>`;
    markup += text(center, 957, destination, 12, color, selected ? 650 : 600, 'text-anchor="middle" letter-spacing="-.25"');
  });
  return markup + '</svg>';
}

function section(title, vertical, note = '') {
  return label(24, vertical, title) + text(366, vertical, note, 9, colors.muted, 450, 'text-anchor="end"') + line(24, vertical + 13, 366);
}

function attendanceRow(vertical, title, code, present, absent, margin, color) {
  const total = present + absent;
  const percentage = (100 * present / total).toFixed(1);
  let markup = rect(24, vertical, 342, 116);
  markup += text(42, vertical + 28, title, 15, colors.ink, 550, 'letter-spacing="-.4"');
  markup += text(42, vertical + 46, code, 9, colors.muted);
  const metrics = [[present, colors.ink, 'present'], [absent, colors.red, 'absent'], [total, colors.muted, 'total']];
  metrics.forEach(([value, tint, name], index) => {
    const left = 42 + index * 51;
    markup += text(left, vertical + 79, value, 18, tint, 550);
    markup += text(left, vertical + 99, name, 9, colors.muted);
  });
  markup += text(346, vertical + 78, `${percentage}%`, 34, colors.ink, 500, 'text-anchor="end" letter-spacing="-1.6"');
  markup += `<circle cx="328" cy="${vertical + 25}" r="3" fill="${color}"/>`;
  markup += text(346, vertical + 100, `${margin} margin`, 11, color, 550, 'text-anchor="end"');
  return markup;
}

function marksCard(vertical, title, code, earned, total, credits, assessments, color) {
  const percentage = Math.round(100 * earned / total);
  const height = assessments.length > 1 ? 232 : 208;
  let markup = rect(24, vertical, 342, height);
  title.forEach((part, index) => { markup += text(42, vertical + 29 + index * 19, part, 15, colors.ink, 550, 'letter-spacing="-.4"'); });
  markup += text(40, vertical + 70, code, 9, colors.muted);
  markup += text(349, vertical + 70, `${earned}<tspan font-size="14" fill="${colors.muted}"> / ${total}</tspan>`, 30, colors.ink, 500, 'text-anchor="end" letter-spacing="-1"');
  markup += text(349, vertical + 29, `${credits} credits`, 9, colors.muted, 450, 'text-anchor="end"');
  markup += line(40, vertical + 84, 350);
  markup += text(42, vertical + 115, 'Published total', 10, colors.muted, 500);
  markup += text(339, vertical + 115, `${percentage}%`, 12, colors.ink, 600, 'text-anchor="end"');
  markup += `<path d="M42 ${vertical + 133}H349" stroke="#363832" stroke-width="3"/><path d="M42 ${vertical + 133}H${42 + 307 * percentage / 100}" stroke="${color === colors.amber ? colors.amber : colors.lavender}" stroke-width="3"/>`;
  assessments.forEach((assessment, index) => {
    const top = vertical + 160 + index * 28;
    markup += text(42, top + 17, assessment[0], 11, colors.muted, 500);
    markup += text(348, top + 17, assessment[1], 12, colors.ink, 550, 'text-anchor="end"');
  });
  return markup;
}

let attendance = shell('Attendance', 'Attendance') + '<g transform="translate(0 60)">';
attendance += section('YOUR SUBJECTS', 122, 'Target · 75%');
attendance += attendanceRow(151, 'Fault Tolerant Systems', '21CS30101', 14, 4, 0, colors.amber);
attendance += attendanceRow(279, 'Data Structures', '21CS20102', 18, 4, 2, colors.green);
attendance += attendanceRow(407, 'Computer Networks', '21CS20503', 13, 6, -5, colors.red);
attendance += section('PRACTICAL', 557, 'Target / 75%');
attendance += attendanceRow(584, 'Operating Systems Lab', '21CS20304', 20, 2, 4, colors.green);
attendance += text(25, 730, 'Margins are class hours, not percentages.', 10, colors.muted);
attendance += text(25, 749, 'Negative margin = hours to attend to reach 75%.', 10, colors.muted);
attendance += '</g>' + navigation('Attendance');

let marks = shell('Marks', 'Marks') + '<g transform="translate(0 60)">';
marks += section('YOUR SUBJECTS', 122, '3 results published');
marks += marksCard(151, ['Data Structures'], 'CS201', 18, 20, 4, [['Cycle test 1', '18 / 20']], colors.green);
marks += marksCard(371, ['Computer Networks'], 'CS205', 12, 20, 3, [['Cycle test 1', '12 / 20']], colors.amber);
marks += marksCard(591, ['Operating Systems'], 'CS203', 27, 30, 3, [['Lab evaluation', '27 / 30']], colors.green);
marks += '</g>' + navigation('Marks');

const publicDirectory = new URL('../public/', import.meta.url);
const selectedPage = process.argv[2];
if (!selectedPage || selectedPage === 'attendance') writeFileSync(new URL('attendance-concept.svg', publicDirectory), attendance);
if (!selectedPage || selectedPage === 'marks') writeFileSync(new URL('marks-concept.svg', publicDirectory), marks);
console.log('Generated selected SVG concepts.');
