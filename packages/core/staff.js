// SVG staff renderer. Colours follow the theme (currentColor).
import { spell, ACC_GLYPH } from './music.js';

const NS = 'http://www.w3.org/2000/svg';
// bottom = diatonic step of the bottom line (C4 = 28). ref = step of the line the clef glyph sits on.
export const CLEFS = {
  treble: { glyph: '\u{1D11E}', bottom: 30, ref: 32, size: 4.1, dy: 0.05 },
  bass: { glyph: '\u{1D122}', bottom: 18, ref: 24, size: 4.1, dy: 2.5 },
  alto: { glyph: '\u{1D121}', bottom: 24, ref: 28, size: 4.4, dy: 1.95 },
  tenor: { glyph: '\u{1D121}', bottom: 22, ref: 28, size: 4.4, dy: 1.95 },
};

const el = (name, attrs = {}, text) => {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
};

/** Draw a staff into `container` (its content is replaced).
 *  opts: { clef: 'treble'|'bass'|'alto'|'tenor', width, gap (px between lines),
 *          notes: [{ midi (number or array = chord), pref: 'sharp'|'flat', color, stem: bool }] }
 *  Returns the <svg>. Each note group has class "ml-note" and data-index. */
export function renderStaff(container, { clef = 'treble', notes = [], width = 320, gap = 12 } = {}) {
  const c = CLEFS[clef];
  const top = gap * 5.5;
  const height = gap * 15;
  const yOf = (step) => top + gap * 4 - ((step - c.bottom) * gap) / 2;
  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, class: 'ml-staff', role: 'img' });
  svg.style.maxWidth = width * 1.6 + 'px';

  for (let i = 0; i < 5; i++) svg.append(el('line', { x1: 4, x2: width - 4, y1: top + i * gap, y2: top + i * gap, stroke: 'currentColor', 'stroke-width': 1.2 }));
  svg.append(el('text', {
    x: gap * 0.6, y: yOf(c.ref) + gap * c.dy, 'font-size': gap * c.size, 'font-family': '"Noto Music", serif',
    fill: 'currentColor', 'dominant-baseline': 'alphabetic', class: 'ml-clef',
  }, c.glyph));

  const x0 = gap * 6;
  const dx = notes.length > 1 ? Math.min(gap * 5, (width - x0 - gap * 2.5) / (notes.length - 1)) : 0;
  const start = notes.length > 1 ? x0 : (x0 + width - gap) / 2;
  notes.forEach((note, i) => {
    const g = el('g', { class: 'ml-note', 'data-index': i });
    if (note.color) g.style.color = note.color;
    const x = start + i * dx;
    const midis = [].concat(note.midi);
    const steps = midis.map((m) => spell(m, note.pref));
    const all = steps.map((sp) => sp.step);
    // Ledger lines
    for (let st = c.bottom - 2; st >= Math.min(...all); st -= 2) g.append(el('line', { x1: x - gap, x2: x + gap, y1: yOf(st), y2: yOf(st), stroke: 'currentColor', 'stroke-width': 1.2 }));
    for (let st = c.bottom + 10; st <= Math.max(...all); st += 2) g.append(el('line', { x1: x - gap, x2: x + gap, y1: yOf(st), y2: yOf(st), stroke: 'currentColor', 'stroke-width': 1.2 }));
    steps.forEach((sp) => {
      const y = yOf(sp.step);
      g.append(el('ellipse', { cx: x, cy: y, rx: gap * 0.66, ry: gap * 0.47, fill: 'currentColor', transform: `rotate(-20 ${x} ${y})` }));
      if (sp.acc) g.append(el('text', { x: x - gap * 1.8, y: y + gap * 0.55, 'font-size': gap * 2.7, fill: 'currentColor', 'text-anchor': 'middle', 'font-family': '"Noto Music", system-ui, sans-serif' }, ACC_GLYPH[sp.acc]));
    });
    if (note.stem) {
      const up = Math.max(...all) < c.bottom + 4;
      const sx = x + (up ? gap * 0.6 : -gap * 0.6);
      const y1 = yOf(up ? Math.min(...all) : Math.max(...all));
      g.append(el('line', { x1: sx, x2: sx, y1, y2: up ? yOf(Math.max(...all)) - gap * 3.3 : yOf(Math.min(...all)) + gap * 3.3, stroke: 'currentColor', 'stroke-width': 1.4 }));
    }
    svg.append(g);
  });
  container.replaceChildren(svg);
  return svg;
}
