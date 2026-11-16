// Two vertical lanes, one above each pad. Time runs from top to bottom.
// Expected hits are bars, the player's taps are dots. Colours come from style.css.

const NS = 'http://www.w3.org/2000/svg';
const el = (name, attrs = {}, parent) => {
  const node = document.createElementNS(NS, name);
  for (const k in attrs) node.setAttribute(k, attrs[k]);
  if (parent) parent.append(node);
  return node;
};

const W = 360, H = 240, Y0 = 16, Y1 = H - 12;
const LANE = { L: { x: 8, w: 166 }, R: { x: 186, w: 166 } };
const HANDS = ['L', 'R'];

export function createLanes(box) {
  let cfg = null, cursor = null, marks = { L: [], R: [] }, taps = null;
  const yOf = (t) => Y0 + (t / cfg.total) * (Y1 - Y0);
  const clampY = (y) => Math.max(7, Math.min(H - 7, y));
  const mid = (hand) => LANE[hand].x + LANE[hand].w / 2;

  /** c: { total (beats), beats (per cycle), L: [t], R: [t] } */
  function draw(c) {
    cfg = c;
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'th-svg', role: 'img' });
    for (const hand of HANDS) {
      const { x, w } = LANE[hand];
      el('rect', { x, y: 1, width: w, height: H - 2, rx: 16, class: 'th-lane' }, svg);
      for (let b = 0; b < c.total - 1e-6; b++) {
        const y = yOf(b), strong = b % c.beats === 0;
        el('line', { x1: x + (strong ? 10 : 26), x2: x + w - (strong ? 10 : 26), y1: y, y2: y, class: strong ? 'th-beat th-strong' : 'th-beat' }, svg);
      }
      marks[hand] = c[hand].map((t) => el('rect', { x: mid(hand) - 34, y: yOf(t) - 4, width: 68, height: 8, rx: 4, class: 'th-mark' }, svg));
    }
    taps = el('g', {}, svg);
    cursor = el('line', { x1: 2, x2: W - 2, y1: 0, y2: 0, class: 'th-cursor', visibility: 'hidden' }, svg);
    box.replaceChildren(svg);
  }

  return {
    draw,
    /** Move the cursor to beat t, or hide it with null. */
    cursor(t) {
      if (!cursor) return;
      if (t == null || t < 0 || t > cfg.total) { cursor.setAttribute('visibility', 'hidden'); return; }
      const y = yOf(t);
      cursor.setAttribute('y1', y); cursor.setAttribute('y2', y); cursor.setAttribute('visibility', 'visible');
    },
    /** Live tap dot. */
    addTap(hand, t) { if (taps) el('circle', { cx: mid(hand), cy: clampY(yOf(t)), r: 6.5, class: 'th-tap' }, taps); },
    clearTaps() { taps?.replaceChildren(); HANDS.forEach((hd) => marks[hd].forEach((m) => m.classList.remove('th-miss'))); },
    /** Final picture. res = { L, R } judge() results, toBeat converts seconds to beats. */
    result(res, toBeat) {
      if (!taps) return;
      taps.replaceChildren();
      for (const hand of HANDS) {
        res[hand].marks.forEach((m, i) => marks[hand][i]?.classList.toggle('th-miss', !m.ok));
        for (const tp of res[hand].taps) {
          const x = mid(hand), y = clampY(yOf(toBeat(tp.t)));
          if (tp.cls === 'extra') el('path', { d: `M${x - 5} ${y - 5} l10 10 m0 -10 l-10 10`, class: 'th-x' }, taps);
          else el('circle', { cx: x, cy: y, r: 7, class: `th-tap th-${tp.cls}` }, taps);
        }
      }
    },
  };
}
