// Rhythm notation on one line (no staff): copied from apps/tap-rhythm/notation.js and adapted.
const NS = 'http://www.w3.org/2000/svg';
export const el = (name, attrs = {}, parent) => {
  const node = document.createElementNS(NS, name);
  for (const k in attrs) node.setAttribute(k, attrs[k]);
  if (parent) parent.append(node);
  return node;
};


const Y = 58;     // notehead line
const TOP = 26;   // top of stems
const SX = 5.3;   // stem offset from the head centre

export const W = 360;

// written value (quarters) → [head, stem, dot, beams]
const SHAPES = [
  [4, 'whole', 0, 0, 0], [3, 'open', 1, 1, 0], [2, 'open', 1, 0, 0], [1.5, 'full', 1, 1, 0],
  [1, 'full', 1, 0, 0], [0.75, 'full', 1, 1, 1], [0.5, 'full', 1, 0, 1], [0.25, 'full', 1, 0, 2],
];
function shape(ev) {
  const d = ev.trip ? ev.d * 1.5 : ev.d;
  const s = SHAPES.find((x) => Math.abs(x[0] - d) < 0.02) || SHAPES[4];
  return { head: s[1], stem: s[2], dot: s[3], beams: s[4] };
}

function drawRest(g, x, d) {
  const r = el('g', { class: 'rd-rest', transform: `translate(${x} ${Y - 15})` }, g);
  if (d >= 1) { // quarter rest
    el('path', { d: 'M-3 -13 L3.2 -5', 'stroke-width': 2.2 }, r);
    el('path', { d: 'M3.2 -5 L-2.2 2.5', 'stroke-width': 4.6 }, r);
    el('path', { d: 'M-2.2 2.5 L3.4 9', 'stroke-width': 2.2 }, r);
    el('path', { d: 'M3.4 9 C-3 6 -6.5 11 -1 15', 'stroke-width': 2.4 }, r);
  } else { // eighth rest
    el('circle', { cx: -3.2, cy: -5, r: 2.6, class: 'rd-fill' }, r);
    el('path', { d: 'M-3.2 -3.4 Q1.5 -2.6 4.6 -7', 'stroke-width': 1.7 }, r);
    el('path', { d: 'M4.6 -7 L-0.4 10', 'stroke-width': 1.9 }, r);
  }
}

function drawFlag(g, x, y) {
  el('path', { class: 'rd-fill', d: `M${x} ${y} q1.4 6.5 7 10.5 q3 4.2 0.4 10.5 q0.6 -6.4 -7.4 -11.5 z` }, g);
}

/** Draw notes and rests. xOf(t) gives the x of a written position. beamUnit: beat length, or t → beam group. */
export function drawNotes(g, evs, xOf, beamUnit) {
  const notes = evs.map((ev) => ({ ev, x: xOf(ev.t), ...shape(ev) }));
  const groups = [];
  let cur = null;
  notes.forEach((nt, i) => {
    if (nt.ev.rest) { drawRest(g, nt.x, nt.ev.d); cur = null; return; }
    if (nt.head === 'whole') el('ellipse', { cx: nt.x, cy: Y, rx: 6.6, ry: 4.3, class: 'rd-open', 'stroke-width': 2.2 }, g);
    else if (nt.head === 'open') el('ellipse', { cx: nt.x, cy: Y, rx: 5.4, ry: 3.7, class: 'rd-open', 'stroke-width': 1.8, transform: `rotate(-22 ${nt.x} ${Y})` }, g);
    else el('ellipse', { cx: nt.x, cy: Y, rx: 6.2, ry: 4.5, class: 'rd-fill', transform: `rotate(-22 ${nt.x} ${Y})` }, g);
    if (nt.stem) el('line', { x1: nt.x + SX, x2: nt.x + SX, y1: Y - 2, y2: TOP, class: 'rd-stroke', 'stroke-width': 1.5 }, g);
    if (nt.dot) el('circle', { cx: nt.x + 11, cy: Y - 0.5, r: 1.9, class: 'rd-fill' }, g);
    const unit = typeof beamUnit === 'function' ? beamUnit(nt.ev.t) : Math.floor((nt.ev.t + 1e-6) / beamUnit);
    if (nt.beams && cur && cur.unit === unit && cur.last === i - 1) { cur.items.push(nt); cur.last = i; }
    else if (nt.beams) { cur = { unit, last: i, items: [nt] }; groups.push(cur); }
    else cur = null;
  });
  for (const { items } of groups) {
    if (items.length === 1) {
      for (let k = 0; k < items[0].beams; k++) drawFlag(g, items[0].x + SX, TOP + k * 7);
      continue;
    }
    const beam = (a, b, level) => el('rect', { x: a - 0.75, width: b - a + 1.5, y: TOP + level * 7.5, height: 4.6, class: 'rd-fill' }, g);
    beam(items[0].x + SX, items[items.length - 1].x + SX, 0);
    items.forEach((nt, i) => {
      if (nt.beams < 2) return;
      const next = items[i + 1], prev = items[i - 1];
      if (next && next.beams >= 2) beam(nt.x + SX, next.x + SX, 1);
      else if (!(prev && prev.beams >= 2)) { // lone sixteenth: short stub
        if (prev) beam(nt.x + SX - 7.5, nt.x + SX, 1); else beam(nt.x + SX, nt.x + SX + 7.5, 1);
      }
    });
  }
  // Triplet brackets.
  const trips = new Map();
  notes.forEach((nt) => { if (nt.ev.trip) { if (!trips.has(nt.ev.cell)) trips.set(nt.ev.cell, []); trips.get(nt.ev.cell).push(nt); } });
  for (const items of trips.values()) {
    const x1 = items[0].x - 5, x2 = items[items.length - 1].x + SX + 4, mid = (x1 + x2) / 2, by = TOP - 8;
    el('path', { d: `M${x1} ${by + 4} V${by} H${mid - 7} M${mid + 7} ${by} H${x2} V${by + 4}`, class: 'rd-stroke', fill: 'none', 'stroke-width': 1.2 }, g);
    el('text', { x: mid, y: by + 4.5, 'text-anchor': 'middle', class: 'rd-three' }, g).textContent = '3';
  }
}


/** Events (written positions) of a list of cells. */
export function eventsOf(ids, CELLS, startCell = 0) {
  const evs = [];
  let pos = 0;
  ids.forEach((id, k) => {
    let t = pos;
    for (const e of CELLS[id].ev) { evs.push({ t, d: e.d, rest: !!e.rest, trip: !!CELLS[id].trip, cell: startCell + k, k }); t += e.d; }
    pos += CELLS[id].len;
  });
  return evs;
}

/** The bar(s) being written. c: { cells, CELLS, total, barLen, pulse, meter, marks: null | [bool] } */
export function drawBars(box, c) {
  const x0 = 44, x1 = 350;
  const xOf = (t) => x0 + (t / c.total) * (x1 - x0);
  const svg = el('svg', { viewBox: `0 8 ${W} 84`, class: 'rd-svg', role: 'img' });
  el('line', { x1: 30, x2: W - 5, y1: Y, y2: Y, class: 'rd-line' }, svg);
  const [a, b] = c.meter.split('/');
  el('text', { x: 15, y: Y - 3, 'text-anchor': 'middle', class: 'rd-meter' }, svg).textContent = a;
  el('text', { x: 15, y: Y + 17, 'text-anchor': 'middle', class: 'rd-meter' }, svg).textContent = b;
  for (let t = c.barLen; t < c.total - 1e-6; t += c.barLen) { const x = xOf(t) - 9.5; el('line', { x1: x, x2: x, y1: Y - 14, y2: Y + 14, class: 'rd-stroke', 'stroke-width': 1.3 }, svg); }
  el('line', { x1: W - 5, x2: W - 5, y1: Y - 14, y2: Y + 14, class: 'rd-stroke', 'stroke-width': 2.4 }, svg);
  const evs = eventsOf(c.cells, c.CELLS);
  const filled = c.cells.reduce((s, id) => s + c.CELLS[id].len, 0);
  // Empty slots, one per remaining beat.
  const w = (c.pulse / c.total) * (x1 - x0) - 8;
  for (let t = filled, i = 0; t < c.total - 1e-6; t += c.pulse, i++) {
    el('rect', { x: xOf(t) - 14, y: Y - 22, width: w, height: 44, rx: 8, class: 'rd-slot' + (i === 0 ? ' rd-next' : '') }, svg);
  }
  for (const status of [undefined, true, false]) {
    const part = evs.filter((e) => (c.marks ? c.marks[e.k] : undefined) === status);
    if (!part.length) continue;
    const g = el('g', { class: status === undefined ? '' : status ? 'rd-ok' : 'rd-bad' }, svg);
    drawNotes(g, part, xOf, c.pulse);
  }
  box.replaceChildren(svg);
}

/** One cell alone, for the palette. */
export function drawCell(box, id, CELLS, trip) {
  const len = CELLS[id].len, S = 52, w = 30 + len * S;
  const svg = el('svg', { viewBox: `0 8 ${w} 84`, class: 'rd-cell', role: 'img' });
  svg.style.width = w * 0.74 + 'px';
  drawNotes(svg, eventsOf([id], CELLS), (t) => 20 + t * S, 1.5);
  box.replaceChildren(svg);
}
