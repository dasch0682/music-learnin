// Two-hand patterns. Times are in beats inside one cycle. L = left hand, R = right hand.
// 'a:b' means: the right hand plays a evenly spaced hits while the left hand plays b.

const even = (n, beats) => Array.from({ length: n }, (_, i) => (i * beats) / n);

/** a against b. The slower hand is the beat. */
const poly = (a, b, extra = {}) => {
  const beats = Math.min(a, b);
  return { id: `${a}:${b}`, beats, L: even(b, beats), R: even(a, beats), cycles: 2, count: beats >= 3 ? beats : 4, ...extra };
};

/** The left hand keeps the beat, the right hand plays cells (q = quarter, ee = two eighths). */
const withBeat = (cells) => {
  const R = [];
  cells.forEach((c, i) => { R.push(i); if (c === 'ee') R.push(i + 0.5); });
  return { id: 'beat+' + cells.join('-'), beats: cells.length, L: even(cells.length, cells.length), R, cycles: 1, count: 4 };
};

function rightRhythms() {
  const out = [];
  for (let m = 1; m < 8; m++) out.push([0, 1, 2].map((i) => ((m >> i) & 1 ? 'ee' : 'q')).concat('q'));
  out.sort((a, b) => a.filter((c) => c === 'ee').length - b.filter((c) => c === 'ee').length);
  return out.map(withBeat);
}

const LEVELS = {
  // Alternate the hands on the beat.
  1: () => [
    { id: 'alt', beats: 4, L: [0, 2], R: [1, 3], cycles: 2, count: 4, demo: 1 },
    { id: 'alt-r', beats: 4, L: [1, 3], R: [0, 2], cycles: 2, count: 4, demo: 1 },
  ],
  // 2 against 1.
  2: () => [{ id: '2:1', beats: 4, L: even(4, 4), R: even(8, 4), cycles: 1, count: 4, demo: 1 }],
  // Beat + a short rhythm.
  3: rightRhythms,
  // 3 against 2: always shown and played first.
  4: () => [poly(3, 2, { demo: 2, always: true })],
  5: () => [poly(2, 3), poly(4, 3)],
  6: () => [poly(3, 4), poly(5, 4), poly(3, 2, { id: '3:2:fast', mult: 1.4 })],
};

const cache = {};
export const MAX_LEVEL = 6;
/** Patterns of a level. */
export const poolFor = (level) => (cache[level] ||= LEVELS[level]());

/**
 * Compare the taps of one hand with its expected onsets (seconds from the start of the turn).
 * Returns marks, taps with a class, misses and extra taps.
 */
export function judge(onsets, tol, taps) {
  const pairs = [];
  onsets.forEach((o, i) => taps.forEach((tp, j) => {
    const d = tp - o;
    if (Math.abs(d) <= tol) pairs.push({ i, j, d });
  }));
  pairs.sort((a, b) => Math.abs(a.d) - Math.abs(b.d));
  const hit = new Map(), used = new Map();
  for (const pr of pairs) if (!hit.has(pr.i) && !used.has(pr.j)) { hit.set(pr.i, pr); used.set(pr.j, pr); }
  const marks = onsets.map((t, i) => ({ t, ok: hit.has(i) }));
  let err = 0;
  const out = taps.map((t, j) => {
    const pr = used.get(j);
    if (pr) {
      err += Math.abs(pr.d);
      return { t, d: pr.d, cls: Math.abs(pr.d) <= tol * 0.5 ? 'good' : pr.d < 0 ? 'early' : 'late' };
    }
    // Not in any window: tied to the nearest missed onset if it is close, else an extra tap.
    const near = onsets.some((o, i) => !hit.has(i) && Math.abs(t - o) <= tol * 2.2);
    return { t, d: null, cls: near ? 'off' : 'extra' };
  });
  const miss = onsets.length - hit.size, extra = taps.length - used.size;
  return { ok: miss === 0 && extra <= 1, marks, taps: out, miss, extra, err: used.size ? Math.round((err / used.size) * 1000) : null };
}
