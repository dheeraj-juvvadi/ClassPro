'use strict';

// Uses the Inter, sage and charcoal visual language of home-concept.svg.
globalThis.renderTimetableSvg = (container, entries) => {
  const ns = 'http://www.w3.org/2000/svg';
  const make = (tag, attrs = {}, text) => {
    const node = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    return node;
  };
  container.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement('p'); empty.className = 'quiet';
    empty.textContent = 'SRM has not returned a timetable. Connect Academia from Accounts, then refresh your reports.';
    container.append(empty); return;
  }
  const orders = [...new Set(entries.map(entry => String(entry.dayOrder || `Day ${entry.day}`)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const times = [...new Set(entries.flatMap(entry => [entry.start, entry.end]))].sort();
  const column = 230, left = 82, top = 88, rowHeight = 108;
  const width = left + column * orders.length + 20;
  const height = top + (times.length - 1) * rowHeight + 22;
  const svg = make('svg', { xmlns: ns, viewBox: `0 0 ${width} ${height}`, width, height, role: 'img', 'aria-labelledby': 'timetable-svg-title timetable-svg-desc', class: 'timetable-svg' });
  svg.append(make('title', { id: 'timetable-svg-title' }, 'SRM timetable by day order'),
    make('desc', { id: 'timetable-svg-desc' }, entries.map(entry => `Day order ${entry.dayOrder || entry.day}, ${entry.start} to ${entry.end}, ${entry.title}, ${entry.room || 'room unlisted'}`).join('. ')),
    make('rect', { width, height, rx: 18, fill: '#191b19' }));
  const text = (x, y, value, size = 13, fill = '#f1eee3') => make('text', { x, y, fill, 'font-size': size, 'font-family': 'Inter, Arial, sans-serif' }, value);
  svg.append(text(18, 35, 'TIME', 11, '#adb4a4'));
  orders.forEach((order, index) => {
    svg.append(text(left + index * column + 14, 35, `DAY ORDER ${order}`, 12, '#c5d4a7'));
  });
  times.forEach((time, index) => {
    const y = top + index * rowHeight;
    svg.append(text(14, y + 4, time, 12, '#adb4a4'));
    if (index < times.length - 1) svg.append(make('line', { x1: left, x2: width - 18, y1: y, y2: y, stroke: '#353c30' }));
  });
  for (const [orderIndex, order] of orders.entries()) {
    const selected = entries.filter(entry => String(entry.dayOrder || `Day ${entry.day}`) === order).sort((a, b) => a.start.localeCompare(b.start));
    // Separate overlapping allocations so no period can hide another.
    const lanes = [];
    const positioned = selected.map(entry => {
      let lane = lanes.findIndex(end => end <= entry.start);
      if (lane < 0) lane = lanes.length;
      lanes[lane] = entry.end; return { entry, lane };
    });
    const cellWidth = (column - 12) / Math.max(1, lanes.length);
    for (const { entry, lane } of positioned) {
      const x = left + orderIndex * column + lane * cellWidth + 5;
      const y = top + times.indexOf(entry.start) * rowHeight + 6;
      const h = (times.indexOf(entry.end) - times.indexOf(entry.start)) * rowHeight - 12;
      const group = make('g');
      group.append(make('title', {}, `${entry.title} · ${entry.start}–${entry.end} · ${entry.room || ''} · ${entry.batch || ''}`),
        make('rect', { x, y, width: cellWidth - 8, height: h, rx: 12, fill: '#c5d4a7' }));
      const maxChars = Math.max(8, Math.floor((cellWidth - 32) / 7));
      const words = entry.title.split(/\s+/); const lines = [''];
      for (const word of words) {
        if ((lines.at(-1) + word).length > maxChars && lines.at(-1)) lines.push('');
        lines[lines.length - 1] += `${word} `;
      }
      const lineCount = Math.max(1, Math.floor((h - 48) / 16));
      lines.slice(0, lineCount).forEach((line, index) => group.append(text(x + 10, y + 22 + index * 16,
        line.trim().slice(0, maxChars) + (index === lineCount - 1 && lines.length > lineCount ? '…' : ''), 13, '#233020')));
      group.append(text(x + 10, y + h - 25, `${entry.start}–${entry.end}`, 11, '#233020'),
        text(x + 10, y + h - 10, (entry.room || entry.code).slice(0, maxChars), 11, '#233020'));
      svg.append(group);
    }
  }
  container.append(svg);
};
