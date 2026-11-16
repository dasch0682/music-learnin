// Rhythm cells and the patterns of each level. Lengths are in quarter notes.
const n = (d) => ({ d });
const r = (d) => ({ d, rest: true });

export const CELLS = {
  q: { len: 1, ev: [n(1)] },
  h: { len: 2, ev: [n(2)] },
  ee: { len: 1, ev: [n(0.5), n(0.5)] },
  r: { len: 1, ev: [r(1)] },
  ssss: { len: 1, ev: [n(0.25), n(0.25), n(0.25), n(0.25)] },
  ess: { len: 1, ev: [n(0.5), n(0.25), n(0.25)] },
  'q.e': { len: 2, ev: [n(1.5), n(0.5)] },
  eqe: { len: 2, ev: [n(0.5), n(1), n(0.5)] },
  t: { len: 1, trip: true, ev: [n(1 / 3), n(1 / 3), n(1 / 3)] },
  'q.': { len: 1.5, ev: [n(1.5)] },
  eee: { len: 1.5, ev: [n(0.5), n(0.5), n(0.5)] },
  qe: { len: 1.5, ev: [n(1), n(0.5)] },
  'h.': { len: 3, ev: [n(3)] },
};

/** Palette (cells offered to the player) of each level. */
export const PALETTE = {
  1: ['q', 'ee', 'h'],
  2: ['q', 'ee', 'h', 'r'],
  3: ['q', 'ee', 'h', 'r', 'ssss', 'ess'],
  4: ['q', 'ee', 'h', 'r', 'q.e', 'eqe'],
  5: ['q', 'ee', 'h', 'r', 't'],
  6: ['q.', 'eee', 'qe', 'h.'],
};
export const meterOf = (level) => (level === 6 ? '6/8' : '4/4');
export const barLenOf = (level) => (level === 6 ? 3 : 4);
export const pulseOf = (level) => (level === 6 ? 1.5 : 1);

/** Can a cell start at `pos` (quarters from the start)? It must fit in the bar, and long cells start on their own multiple. */
export function fits(id, pos, barLen) {
  const len = CELLS[id].len;
  const inBar = pos % barLen;
  if (inBar + len > barLen + 1e-6) return false;
  if (len >= 2 && Math.abs(inBar % len) > 1e-6 && Math.abs((inBar % len) - len) > 1e-6) return false;
  return true;
}

function fillBar(ids, barLen) {
  const out = [];
  const go = (pos, acc) => {
    if (Math.abs(pos - barLen) < 1e-6) { out.push(acc); return; }
    for (const id of ids) if (fits(id, pos, barLen)) go(pos + CELLS[id].len, [...acc, id]);
  };
  go(0, []);
  return out;
}
function spread(list, max) {
  if (list.length <= max) return list;
  return Array.from({ length: max }, (_, i) => list[Math.floor((i * list.length) / max)]);
}
const count = (bar, ids) => bar.filter((c) => ids.includes(c)).length;
const pat = (bars) => ({ id: bars.map((b) => b.join('-')).join('|'), bars });

const builders = {
  1: () => fillBar(PALETTE[1], 4).filter((b) => count(b, ['ee', 'h']) >= 1).map((b) => [b]),
  2: () => fillBar(PALETTE[2], 4).filter((b) => count(b, ['r']) >= 1 && count(b, ['r']) <= 2 && count(b, ['q', 'ee', 'h']) >= 2 && !b.some((c, i) => c === 'r' && b[i + 1] === 'r')).map((b) => [b]),
  3: () => fillBar(PALETTE[3], 4).filter((b) => count(b, ['ssss', 'ess']) >= 1 && count(b, ['ssss', 'ess']) <= 2 && count(b, ['r']) <= 1).map((b) => [b]),
  4: () => fillBar(PALETTE[4], 4).filter((b) => count(b, ['q.e', 'eqe']) >= 1 && count(b, ['r']) <= 1).map((b) => [b]),
  5: () => fillBar(PALETTE[5], 4).filter((b) => count(b, ['t']) >= 1 && count(b, ['t']) <= 2 && count(b, ['r']) <= 1).map((b) => [b]),
  6: () => {
    const bars = fillBar(PALETTE[6], 3);
    return bars.flatMap((a) => bars.map((b) => [a, b])).filter(([a, b]) => !(a[0] === 'h.' && b[0] === 'h.') && count([...a, ...b], ['eee', 'qe']) >= 1);
  },
};
const cache = {};
/** Patterns of a level: { id, bars } (bars = lists of cell ids). */
export function poolFor(level) {
  return (cache[level] ||= spread(builders[level](), 30).map(pat));
}
