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

// Key signatures: diatonic steps of the accidentals in treble clef, then the shift for the other clefs.
const SIG_SHARPS = [38, 35, 39, 36, 33, 37, 34];
const SIG_FLATS = [34, 37, 33, 36, 32, 35, 31];
const SIG_TENOR = { sharps: [24, 28, 25, 29, 26, 30, 27], flats: [27, 30, 26, 29, 25, 28, 24] };
const SIG_SHIFT = { treble: 0, bass: -14, alto: -7 };
const GLYPH = { ...ACC_GLYPH, 2: '\u{1D12A}', '-2': '\u{1D12B}', natural: '♮' };

const el = (name, attrs = {}, text) => {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
};

/** Draw a staff into `container` (its content is replaced).
 *  opts: { clef: 'treble'|'bass'|'alto'|'tenor', width, gap (px between lines),
 *          keySig: -7..7 (number of flats if negative, sharps if positive),
 *          notes: [{ midi (number or array = chord), pref: 'sharp'|'flat', color, stem: bool,
 *                    acc: false (hide the accidental, e.g. covered by the key signature) | 'natural',
 *                    spell: [{ step, acc }] (exact spelling, one per note head; step: C4 = 28, acc: -2..2) }] }
 *  Returns the <svg>. Each note group has class "ml-note" and data-index. */
export function renderStaff(container, { clef = 'treble', notes = [], width = 320, gap = 12, keySig = 0 } = {}) {
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

  const nSig = Math.min(7, Math.abs(keySig));
  const sig = clef === 'tenor' ? SIG_TENOR[keySig > 0 ? 'sharps' : 'flats'] : (keySig > 0 ? SIG_SHARPS : SIG_FLATS).map((st) => st + SIG_SHIFT[clef]);
  for (let i = 0; i < nSig; i++) {
    svg.append(el('text', { x: gap * (4.6 + i * 1.05), y: yOf(sig[i]) + gap * 0.55, 'font-size': gap * 2.7, fill: 'currentColor', 'text-anchor': 'middle', 'font-family': '"Noto Music", system-ui, sans-serif', class: 'ml-keysig' }, GLYPH[keySig > 0 ? 1 : -1]));
  }
  const x0 = gap * (6 + nSig * 1.05);
  const dx = notes.length > 1 ? Math.min(gap * 5, (width - x0 - gap * 2.5) / (notes.length - 1)) : 0;
  const start = notes.length > 1 ? x0 : (x0 + width - gap) / 2;
  notes.forEach((note, i) => {
    const g = el('g', { class: 'ml-note', 'data-index': i });
    if (note.color) g.style.color = note.color;
    const x = start + i * dx;
    const midis = [].concat(note.midi);
    const steps = (note.spell || midis.map((m) => spell(m, note.pref))).slice().sort((a, b) => a.step - b.step);
    const all = steps.map((sp) => sp.step);
    // Ledger lines
    for (let st = c.bottom - 2; st >= Math.min(...all); st -= 2) g.append(el('line', { x1: x - gap, x2: x + gap, y1: yOf(st), y2: yOf(st), stroke: 'currentColor', 'stroke-width': 1.2 }));
    for (let st = c.bottom + 10; st <= Math.max(...all); st += 2) g.append(el('line', { x1: x - gap, x2: x + gap, y1: yOf(st), y2: yOf(st), stroke: 'currentColor', 'stroke-width': 1.2 }));
    let shifted = false, accCol = 0, lastAccStep = -99;
    steps.forEach((sp, k) => {
      const y = yOf(sp.step);
      // Two heads a second apart cannot share a column: the upper one moves right.
      shifted = k > 0 && sp.step - steps[k - 1].step === 1 && !shifted;
      const hx = x + (shifted ? gap * 1.25 : 0);
      g.append(el('ellipse', { cx: hx, cy: y, rx: gap * 0.66, ry: gap * 0.47, fill: 'currentColor', transform: `rotate(-20 ${hx} ${y})` }));
      const acc = note.acc === false ? 0 : note.acc === 'natural' ? 'natural' : sp.acc;
      if (acc) {
        // Accidentals that are close together sit in separate columns.
        accCol = sp.step - lastAccStep < 6 ? (accCol + 1) % 3 : 0;
        lastAccStep = sp.step;
        g.append(el('text', { x: x - gap * (1.8 + accCol * 1.15), y: y + gap * 0.55, 'font-size': gap * 2.7, fill: 'currentColor', 'text-anchor': 'middle', 'font-family': '"Noto Music", system-ui, sans-serif' }, GLYPH[acc]));
      }
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
