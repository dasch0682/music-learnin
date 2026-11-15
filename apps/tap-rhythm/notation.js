// Compact rhythm notation on one line (no staff) + the feedback timeline under it.
// Colours come from style.css (CSS variables only).

const NS = 'http://www.w3.org/2000/svg';
const el = (name, attrs = {}, parent) => {
  const node = document.createElementNS(NS, name);
  for (const k in attrs) node.setAttribute(k, attrs[k]);
  if (parent) parent.append(node);
  return node;
};

const Y = 58;     // notehead line
const TOP = 26;   // top of stems
const SX = 5.3;   // stem offset from the head centre
const TY = 98;    // timeline
const W = 360;

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
  const r = el('g', { class: 'tr-rest', transform: `translate(${x} ${Y - 15})` }, g);
  if (d >= 1) { // quarter rest
    el('path', { d: 'M-3 -13 L3.2 -5', 'stroke-width': 2.2 }, r);
    el('path', { d: 'M3.2 -5 L-2.2 2.5', 'stroke-width': 4.6 }, r);
    el('path', { d: 'M-2.2 2.5 L3.4 9', 'stroke-width': 2.2 }, r);
    el('path', { d: 'M3.4 9 C-3 6 -6.5 11 -1 15', 'stroke-width': 2.4 }, r);
  } else { // eighth rest
    el('circle', { cx: -3.2, cy: -5, r: 2.6, class: 'tr-fill' }, r);
    el('path', { d: 'M-3.2 -3.4 Q1.5 -2.6 4.6 -7', 'stroke-width': 1.7 }, r);
    el('path', { d: 'M4.6 -7 L-0.4 10', 'stroke-width': 1.9 }, r);
  }
}

function drawFlag(g, x, y) {
  el('path', { class: 'tr-fill', d: `M${x} ${y} q1.4 6.5 7 10.5 q3 4.2 0.4 10.5 q0.6 -6.4 -7.4 -11.5 z` }, g);
}

/** Draw notes and rests. xOf(t) gives the x of a written position. */
function drawNotes(g, evs, xOf, beamUnit) {
  const notes = evs.map((ev) => ({ ev, x: xOf(ev.t), ...shape(ev) }));
  const groups = [];
  let cur = null;
  notes.forEach((nt, i) => {
    if (nt.ev.rest) { drawRest(g, nt.x, nt.ev.d); cur = null; return; }
    if (nt.head === 'whole') el('ellipse', { cx: nt.x, cy: Y, rx: 6.6, ry: 4.3, class: 'tr-open', 'stroke-width': 2.2 }, g);
    else if (nt.head === 'open') el('ellipse', { cx: nt.x, cy: Y, rx: 5.4, ry: 3.7, class: 'tr-open', 'stroke-width': 1.8, transform: `rotate(-22 ${nt.x} ${Y})` }, g);
    else el('ellipse', { cx: nt.x, cy: Y, rx: 6.2, ry: 4.5, class: 'tr-fill', transform: `rotate(-22 ${nt.x} ${Y})` }, g);
    if (nt.stem) el('line', { x1: nt.x + SX, x2: nt.x + SX, y1: Y - 2, y2: TOP, class: 'tr-stroke', 'stroke-width': 1.5 }, g);
    if (nt.dot) el('circle', { cx: nt.x + 11, cy: Y - 0.5, r: 1.9, class: 'tr-fill' }, g);
    const unit = Math.floor((nt.ev.t + 1e-6) / beamUnit);
    if (nt.beams && cur && cur.unit === unit && cur.last === i - 1) { cur.items.push(nt); cur.last = i; }
    else if (nt.beams) { cur = { unit, last: i, items: [nt] }; groups.push(cur); }
    else cur = null;
  });
  for (const { items } of groups) {
    if (items.length === 1) {
      for (let k = 0; k < items[0].beams; k++) drawFlag(g, items[0].x + SX, TOP + k * 7);
      continue;
    }
    const beam = (a, b, level) => el('rect', { x: a - 0.75, width: b - a + 1.5, y: TOP + level * 7.5, height: 4.6, class: 'tr-fill' }, g);
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
    el('path', { d: `M${x1} ${by + 4} V${by} H${mid - 7} M${mid + 7} ${by} H${x2} V${by + 4}`, class: 'tr-stroke', fill: 'none', 'stroke-width': 1.2 }, g);
    el('text', { x: mid, y: by + 4.5, 'text-anchor': 'middle', class: 'tr-three' }, g).textContent = '3';
  }
}

/** Score view inside `box`. */
export function createScore(box) {
  let svg = null, cursor = null, tapsG = null, marks = [], beats = [], cfg = null, x0 = 0, x1 = 0;
  const xOf = (t) => x0 + (t / cfg.total) * (x1 - x0);
  const clampX = (x) => Math.max(7, Math.min(W - 7, x));

  /** c: { events, total, pulse, barStarts, meter, swing, notes: bool, marks: [t] } */
  function draw(c) {
    cfg = c;
    const top = c.notes ? (c.swing ? -26 : 0) : TY - 20;
    svg = el('svg', { viewBox: `0 ${top} ${W} ${TY + 22 - top}`, class: 'tr-svg', role: 'img' });
    x0 = c.notes ? 44 : 26;
    x1 = c.notes ? 350 : 346;
    if (c.notes) {
      el('line', { x1: 30, x2: W - 5, y1: Y, y2: Y, class: 'tr-line' }, svg);
      const [a, b] = c.meter.split('/');
      el('text', { x: 15, y: Y - 3, 'text-anchor': 'middle', class: 'tr-meter' }, svg).textContent = a;
      el('text', { x: 15, y: Y + 17, 'text-anchor': 'middle', class: 'tr-meter' }, svg).textContent = b;
      c.barStarts.slice(1).forEach((t) => { const x = xOf(t) - 12; el('line', { x1: x, x2: x, y1: Y - 14, y2: Y + 14, class: 'tr-stroke', 'stroke-width': 1.3 }, svg); });
      el('line', { x1: W - 5, x2: W - 5, y1: Y - 14, y2: Y + 14, class: 'tr-stroke', 'stroke-width': 2.4 }, svg);
      drawNotes(svg, c.events, xOf, c.pulse);
      if (c.swing) { // eighths = triplet quarter + eighth
        const lg = el('g', { transform: 'translate(40 -30) scale(0.52)' }, svg);
        drawNotes(lg, [{ t: 0, d: 0.5 }, { t: 0.5, d: 0.5 }], (t) => t * 48, 1);
        el('text', { x: 52, y: Y - 8, 'text-anchor': 'middle', class: 'tr-meter' }, lg).textContent = '=';
        drawNotes(lg, [{ t: 0, d: 2 / 3, trip: true, cell: 0 }, { t: 2 / 3, d: 1 / 3, trip: true, cell: 0 }], (t) => 78 + t * 45, 1);
      }
    }
    // Timeline: line, pulse dots, expected marks, taps, cursor.
    el('line', { x1: x0 - 12, x2: W - 5, y1: TY, y2: TY, class: 'tr-line' }, svg);
    beats = [];
    for (let t = 0; t < c.total - 1e-6; t += c.pulse) beats.push(el('circle', { cx: xOf(t), cy: TY + 15, r: 2.4, class: 'tr-beat' }, svg));
    const mg = el('g', {}, svg);
    marks = (c.marks || []).map((t) => el('rect', { x: xOf(t) - 1.6, y: TY - 8, width: 3.2, height: 16, rx: 1.6, class: 'tr-mark' }, mg));
    tapsG = el('g', {}, svg);
    cursor = el('line', { x1: 0, x2: 0, y1: c.notes ? 6 : TY - 14, y2: TY + 20, class: 'tr-cursor', visibility: 'hidden' }, svg);
    box.replaceChildren(svg);
  }

  return {
    draw,
    /** Move the cursor to position t (quarters), or hide it with null. Lights the current pulse dot. */
    cursor(t) {
      if (!cursor) return;
      if (t == null || t < 0 || t > cfg.total) { cursor.setAttribute('visibility', 'hidden'); beats.forEach((b) => b.classList.remove('tr-on')); return; }
      const x = xOf(t);
      cursor.setAttribute('x1', x); cursor.setAttribute('x2', x); cursor.setAttribute('visibility', 'visible');
      const k = Math.floor(t / cfg.pulse + 1e-6);
      beats.forEach((b, i) => b.classList.toggle('tr-on', i === k));
    },
    /** Live tap dot at position t (quarters). */
    addTap(t) { if (tapsG) el('circle', { cx: clampX(xOf(t)), cy: TY, r: 5, class: 'tr-tap' }, tapsG); },
    clearTaps() { tapsG?.replaceChildren(); marks.forEach((m) => m.classList.remove('tr-miss')); },
    /** Final picture. res = judge() result, toQ converts seconds to quarters. Draws the marks if they were hidden. */
    result(res, toQ) {
      if (!svg) return;
      if (!marks.length) marks = res.marks.map((m) => el('rect', { x: xOf(toQ(m.t)) - 1.6, y: TY - 8, width: 3.2, height: 16, rx: 1.6, class: 'tr-mark' }, tapsG.previousSibling));
      res.marks.forEach((m, i) => marks[i]?.classList.toggle('tr-miss', !m.ok));
      tapsG.replaceChildren();
      for (const tp of res.taps) {
        const x = clampX(xOf(toQ(tp.t)));
        if (tp.cls === 'extra') el('path', { d: `M${x - 4.5} ${TY - 4.5} l9 9 m0 -9 l-9 9`, class: 'tr-x' }, tapsG);
        else el('circle', { cx: x, cy: TY, r: 5.5, class: `tr-tap tr-${tp.cls}` }, tapsG);
      }
    },
  };
}
