// Notation of a short melody (one staff) + the feedback timeline under it. Colours: style.css only (CSS variables).
const NS = 'http://www.w3.org/2000/svg';
const el = (name, attrs = {}, parent, text) => {
  const n = document.createElementNS(NS, name);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (text != null) n.textContent = text;
  if (parent) parent.append(n);
  return n;
};

const G = 9;          // gap between staff lines
const W = 360;
const TOP = 44;       // y of the top staff line
const TY = 122;       // timeline
const H = 146;
const HR = G * 0.66;  // head half width
const BAR_PAD = 16;

// bottom = diatonic step of the bottom line (C4 = 28); ref = step of the line the clef sits on.
const CLEFS = {
  treble: { glyph: '\u{1D11E}', bottom: 30, ref: 32, size: 4.1, dy: 0.05, shift: 0 },
  bass: { glyph: '\u{1D122}', bottom: 18, ref: 24, size: 4.1, dy: 2.5, shift: -14 },
};
const SIG_SHARPS = [38, 35, 39, 36, 33, 37, 34];
const SIG_FLATS = [34, 37, 33, 36, 32, 35, 31];
const GLYPH = { sharp: '♯', flat: '♭', natural: '♮' };
const FONT = '"Noto Music", system-ui, sans-serif';

// written value (quarters) → [head, stem, dot, beams]
const SHAPES = [
  [3, 'open', 1, 1, 0], [2, 'open', 1, 0, 0], [1.5, 'full', 1, 1, 0],
  [1, 'full', 1, 0, 0], [0.5, 'full', 1, 0, 1], [0.25, 'full', 1, 0, 2],
];
function shape(d) {
  const s = SHAPES.find((x) => Math.abs(x[0] - d) < 0.02) || SHAPES[3];
  return { head: s[1], stem: s[2], dot: s[3], beams: s[4] };
}

function drawRest(parent, x) {
  const r = el('g', { class: 'rm-rest', transform: `translate(${x} ${TOP + 2 * G - 1})` }, parent);
  el('path', { d: 'M-3 -13 L3.2 -5', 'stroke-width': 2.2 }, r);
  el('path', { d: 'M3.2 -5 L-2.2 2.5', 'stroke-width': 4.6 }, r);
  el('path', { d: 'M-2.2 2.5 L3.4 9', 'stroke-width': 2.2 }, r);
  el('path', { d: 'M3.4 9 C-3 6 -6.5 11 -1 15', 'stroke-width': 2.4 }, r);
}

function flags(parent, x, y, up, count) {
  for (let k = 0; k < count; k++) {
    el('path', {
      class: 'rm-fill', transform: `translate(${x} ${y + (up ? k * 5.5 : -k * 5.5)}) scale(1 ${up ? 1 : -1})`,
      d: 'M0 0 q1.4 6.5 7 10.5 q3 4.2 0.4 10.5 q0.6 -6.4 -7.4 -11.5 z',
    }, parent);
  }
}

/** Score view inside `box`. */
export function createScore(box) {
  let svg = null, cursor = null, pressG = null, marks = [], beatDots = [], noteEls = [], cfg = null, x0 = 0, k = 1;

  const xOf = (t) => {
    const nb = cfg.barStarts.filter((b) => b <= t + 1e-6).length - 1;
    return x0 + t * k + Math.max(0, nb) * BAR_PAD;
  };
  const clampX = (x) => Math.max(8, Math.min(W - 8, x));

  /** c: { clef, fifths, meter, total, barStarts, pulse, unit, notes: [{ t, d, rest, step, show }] } */
  function draw(c) {
    cfg = c;
    const cl = CLEFS[c.clef];
    const yOf = (step) => TOP + 4 * G - ((step - cl.bottom) * G) / 2;
    svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'rm-svg', role: 'img' });
    for (let i = 0; i < 5; i++) el('line', { x1: 3, x2: W - 6, y1: TOP + i * G, y2: TOP + i * G, class: 'rm-staff' }, svg);
    el('text', { x: G * 0.5, y: yOf(cl.ref) + G * cl.dy, 'font-size': G * cl.size, 'font-family': '"Noto Music", serif', class: 'rm-fill rm-clef' }, svg, cl.glyph);
    // key signature
    const nSig = Math.min(7, Math.abs(c.fifths));
    const sig = (c.fifths > 0 ? SIG_SHARPS : SIG_FLATS).map((s) => s + cl.shift);
    for (let i = 0; i < nSig; i++) {
      el('text', { x: G * (4.2 + i * 1.0), y: yOf(sig[i]) + G * 0.55, 'font-size': G * 2.7, 'text-anchor': 'middle', 'font-family': FONT, class: 'rm-fill rm-keysig' }, svg, GLYPH[c.fifths > 0 ? 'sharp' : 'flat']);
    }
    // time signature
    const tx = G * (5.2 + nSig * 1.0);
    const [a, b] = c.meter.split('/');
    el('text', { x: tx, y: TOP + 2 * G - 1.5, 'text-anchor': 'middle', class: 'rm-meter' }, svg, a);
    el('text', { x: tx, y: TOP + 4 * G - 1.5, 'text-anchor': 'middle', class: 'rm-meter' }, svg, b);
    x0 = tx + G * 1.9 + 8;
    const xEnd = 340, nb = c.barStarts.length;
    k = (xEnd - x0 - BAR_PAD * (nb - 1)) / c.total;
    c.barStarts.slice(1).forEach((t) => { const x = xOf(t) - 11; el('line', { x1: x, x2: x, y1: TOP, y2: TOP + 4 * G, class: 'rm-stroke', 'stroke-width': 1.3 }, svg); });
    el('line', { x1: W - 9, x2: W - 9, y1: TOP, y2: TOP + 4 * G, class: 'rm-stroke', 'stroke-width': 1.3 }, svg);
    el('line', { x1: W - 5.5, x2: W - 5.5, y1: TOP, y2: TOP + 4 * G, class: 'rm-stroke', 'stroke-width': 3.2 }, svg);

    // notes
    const mid = cl.bottom + 4;
    const items = c.notes.map((n, i) => ({ n, i, x: xOf(n.t), y: n.rest ? 0 : yOf(n.step), ...shape(n.d) }));
    const groups = [];
    let cur = null;
    items.forEach((it, idx) => {
      if (it.n.rest || !it.beams) { cur = null; return; }
      const u = Math.floor((it.n.t + 1e-6) / c.unit);
      if (cur && cur.u === u && cur.last === idx - 1) { cur.items.push(it); cur.last = idx; } else { cur = { u, last: idx, items: [it] }; groups.push(cur); }
    });
    const groupOf = new Map();
    for (const g of groups) {
      const avg = g.items.reduce((s, it) => s + it.n.step, 0) / g.items.length;
      g.up = avg < mid;
      g.items.forEach((it) => groupOf.set(it, g));
    }
    noteEls = [];
    const beamG = el('g', {}, svg);
    items.forEach((it) => {
      if (it.n.rest) { drawRest(svg, it.x); noteEls.push(null); return; }
      const g = el('g', { class: 'rm-note', 'data-index': it.i, 'data-midi': it.n.midi }, svg);
      noteEls.push(g);
      const step = it.n.step;
      for (let st = cl.bottom - 2; st >= step; st -= 2) el('line', { x1: it.x - G, x2: it.x + G, y1: yOf(st), y2: yOf(st), class: 'rm-stroke', 'stroke-width': 1.2 }, g);
      for (let st = cl.bottom + 10; st <= step; st += 2) el('line', { x1: it.x - G, x2: it.x + G, y1: yOf(st), y2: yOf(st), class: 'rm-stroke', 'stroke-width': 1.2 }, g);
      if (it.head === 'open') el('ellipse', { cx: it.x, cy: it.y, rx: HR - 0.9, ry: G * 0.43, class: 'rm-open rm-head', 'stroke-width': 1.8, transform: `rotate(-22 ${it.x} ${it.y})` }, g);
      else el('ellipse', { cx: it.x, cy: it.y, rx: HR, ry: G * 0.49, class: 'rm-fill rm-head', transform: `rotate(-22 ${it.x} ${it.y})` }, g);
      if (it.n.show) el('text', { x: it.x - G * 1.8, y: it.y + G * 0.55, 'font-size': G * 2.7, 'text-anchor': 'middle', 'font-family': FONT, class: 'rm-fill rm-acc' }, g, GLYPH[it.n.show]);
      if (it.dot) el('circle', { cx: it.x + 11, cy: it.y - ((step - cl.bottom) % 2 === 0 ? G / 2 : 0), r: 1.9, class: 'rm-fill' }, g);
      const grp = groupOf.get(it);
      if (!it.stem) return;
      const up = grp ? grp.up : step < mid;
      const sx = it.x + (up ? HR - 0.8 : -HR + 0.8);
      let endY;
      if (grp && grp.items.length > 1) {
        const ys = grp.items.map((q) => q.y);
        endY = up ? Math.min(...ys) - 3.3 * G : Math.max(...ys) + 3.3 * G;
      } else endY = up ? it.y - 3.5 * G : it.y + 3.5 * G;
      el('line', { x1: sx, x2: sx, y1: it.y, y2: endY, class: 'rm-stroke', 'stroke-width': 1.4 }, g);
      it.sx = sx; it.endY = endY; it.up = up;
      if (it.beams && !(grp && grp.items.length > 1)) flags(g, sx, endY, up, it.beams);
    });
    for (const g of groups) {
      if (g.items.length < 2) continue;
      const up = g.up, by = g.items[0].endY;
      const bar = (xa, xb, lvl) => {
        const y = up ? by + lvl * 6.4 : by - 4.6 - lvl * 6.4;
        el('rect', { x: xa - 0.7, width: xb - xa + 1.4, y, height: 4.6, class: 'rm-fill' }, beamG);
      };
      bar(g.items[0].sx, g.items[g.items.length - 1].sx, 0);
      g.items.forEach((it, i) => {
        if (it.beams < 2) return;
        const next = g.items[i + 1], prev = g.items[i - 1];
        if (next && next.beams >= 2) bar(it.sx, next.sx, 1);
        else if (!(prev && prev.beams >= 2)) { if (prev) bar(it.sx - 7.5, it.sx, 1); else bar(it.sx, it.sx + 7.5, 1); }
      });
    }

    // timeline: line, pulse dots, expected marks, presses, cursor
    el('line', { x1: x0 - 14, x2: W - 6, y1: TY, y2: TY, class: 'rm-line' }, svg);
    beatDots = [];
    for (let t = 0; t < c.total - 1e-6; t += c.pulse) beatDots.push(el('circle', { cx: xOf(t), cy: TY + 15, r: c.barStarts.some((b) => Math.abs(b - t) < 1e-6) ? 3.4 : 2.4, class: 'rm-beat' }, svg));
    marks = c.notes.filter((n) => !n.rest).map((n) => el('rect', { x: xOf(n.t) - 1.6, y: TY - 8, width: 3.2, height: 16, rx: 1.6, class: 'rm-mark' }, svg));
    pressG = el('g', {}, svg);
    cursor = el('line', { x1: 0, x2: 0, y1: TOP - 10, y2: TY + 20, class: 'rm-cursor', visibility: 'hidden' }, svg);
    box.replaceChildren(svg);
  }

  return {
    draw,
    cursor(t) {
      if (!cursor) return;
      if (t == null || t < 0 || t > cfg.total) { cursor.setAttribute('visibility', 'hidden'); beatDots.forEach((b) => b.classList.remove('rm-on')); return; }
      const x = xOf(t);
      cursor.setAttribute('x1', x); cursor.setAttribute('x2', x); cursor.setAttribute('visibility', 'visible');
      const i = Math.floor(t / cfg.pulse + 1e-6);
      beatDots.forEach((b, j) => b.classList.toggle('rm-on', j === i));
    },
    /** Live press dot at position t (quarters). */
    addPress(t) { if (pressG) el('circle', { cx: clampX(xOf(t)), cy: TY, r: 5, class: 'rm-pdot' }, pressG); },
    clearPresses() {
      pressG?.replaceChildren();
      marks.forEach((m) => m.classList.remove('rm-miss'));
      noteEls.forEach((g) => g?.classList.remove('rm-bad'));
    },
    /** Final picture. res = judgeMelody() result; toQ converts seconds to quarters. */
    result(res, toQ) {
      if (!svg) return;
      res.notes.forEach((nt, i) => marks[i]?.classList.toggle('rm-miss', !nt.ok));
      // note heads that were not played right
      let n = 0;
      noteEls.forEach((g) => { if (!g) return; g.classList.toggle('rm-bad', !res.notes[n++].ok); });
      pressG.replaceChildren();
      for (const p of res.presses) {
        const x = clampX(xOf(toQ(p.t)));
        if (p.cls === 'extra') el('path', { d: `M${x - 4.5} ${TY - 4.5} l9 9 m0 -9 l-9 9`, class: 'rm-x' }, pressG);
        else el('circle', { cx: x, cy: TY, r: 5.5, class: `rm-pdot rm-${p.cls}` }, pressG);
      }
    },
  };
}
