// Rhythm patterns. A pattern is a list of bars, a bar is a list of beat-sized cells.
// All lengths are in quarter notes. Pattern id = compact string of its cells.

const n = (d) => ({ d });
const r = (d) => ({ d, rest: true });

/** Cells. len = length in quarters, ev = notes and rests in order. */
export const CELLS = {
  // 4/4
  q: { len: 1, ev: [n(1)] },
  h: { len: 2, ev: [n(2)] },
  w: { len: 4, ev: [n(4)] },
  ee: { len: 1, ev: [n(0.5), n(0.5)] },
  r: { len: 1, ev: [r(1)] },
  xe: { len: 1, ev: [r(0.5), n(0.5)] },
  ex: { len: 1, ev: [n(0.5), r(0.5)] },
  ssss: { len: 1, ev: [n(0.25), n(0.25), n(0.25), n(0.25)] },
  ess: { len: 1, ev: [n(0.5), n(0.25), n(0.25)] },
  sse: { len: 1, ev: [n(0.25), n(0.25), n(0.5)] },
  'q.e': { len: 2, ev: [n(1.5), n(0.5)] },
  eqe: { len: 2, ev: [n(0.5), n(1), n(0.5)] },
  'e.s': { len: 1, ev: [n(0.75), n(0.25)] },
  t: { len: 1, trip: true, ev: [n(1 / 3), n(1 / 3), n(1 / 3)] },
  // 6/8 (beat = dotted quarter)
  'q.': { len: 1.5, ev: [n(1.5)] },
  eee: { len: 1.5, ev: [n(0.5), n(0.5), n(0.5)] },
  qe: { len: 1.5, ev: [n(1), n(0.5)] },
  'h.': { len: 3, ev: [n(3)] },
};

/** Every way to fill one bar with the given cells. Long cells only start on strong beats. */
function fillBar(ids, barLen) {
  const out = [];
  const go = (pos, acc) => {
    if (Math.abs(pos - barLen) < 1e-6) { out.push(acc); return; }
    for (const id of ids) {
      const len = CELLS[id].len;
      if (pos + len > barLen + 1e-6) continue;
      if (len >= 2 && Math.abs(pos % len) > 1e-6) continue;
      go(pos + len, [...acc, id]);
    }
  };
  go(0, []);
  return out;
}

/** Keep at most `max` entries, spread evenly over the list (always the same ones). */
function spread(list, max) {
  if (list.length <= max) return list;
  return Array.from({ length: max }, (_, i) => list[Math.floor((i * list.length) / max)]);
}

const count = (bar, ids) => bar.filter((c) => ids.includes(c)).length;
const endsOn = (bar, ids) => ids.includes(bar[bar.length - 1]);
const pat = (bars, extra = {}) => ({
  id: (extra.swing ? 'sw:' : '') + (extra.groups ? `${extra.meter}:${extra.groups.join('+')}:` : '') + bars.map((b) => b.join('-')).join('|'),
  bars, meter: '4/4', ...extra,
});

// Odd meters. unit = length of one count in quarters, groupings = how the counts are grouped in a bar.
export const ODD = {
  '5/8': { unit: 0.5, bars: 2, groupings: [[3, 2], [2, 3]] },
  '7/8': { unit: 0.5, bars: 2, groupings: [[2, 2, 3], [3, 2, 2], [2, 3, 2]] },
  '5/4': { unit: 1, bars: 1, groupings: [[3, 2], [2, 3]] },
};

/** Every bar of an odd meter: one filling per group, never across a group. */
function oddBars(groups, unit) {
  const fill = (g) => (unit === 1
    ? fillBar(g === 3 ? ['q', 'ee', 'h', 'h.'] : ['q', 'ee', 'h'], g)
    : g === 3 ? [['q.'], ['eee'], ['qe']] : [['q'], ['ee']]);
  return groups.map(fill).reduce((acc, opts) => acc.flatMap((a) => opts.map((c) => [...a, ...c])), [[]]);
}

const gcd = (a, b) => (b ? gcd(b, a % b) : a);
/** Keep at most `max` entries, taken with a fixed stride so that neighbours differ (always the same ones). */
function stride(list, max) {
  if (list.length <= max) return list;
  let step = Math.ceil(list.length * 0.382);
  while (gcd(step, list.length) !== 1) step++;
  return Array.from({ length: max }, (_, i) => list[(i * step) % list.length]);
}

const builders = {
  // Echo: long and short sounds.
  2: () => fillBar(['q', 'ee', 'h'], 4).filter((b) => endsOn(b, ['q', 'h'])).map((b) => pat([b])),
  // Read: quarter, half, eighths, whole.
  3: () => fillBar(['q', 'ee', 'h', 'w'], 4).filter((b) => endsOn(b, ['q', 'h', 'w'])).map((b) => pat([b])),
  // Rests.
  4: () => {
    const rests = ['r', 'xe', 'ex'];
    const bars = fillBar(['q', 'ee', 'h', 'r', 'xe', 'ex'], 4).filter((b) => {
      const k = count(b, rests);
      if (k < 1 || k > 2 || !endsOn(b, ['q', 'h', 'r'])) return false;
      if (b[0] === 'r' && endsOn(b, ['r'])) return false;
      return !b.some((c, i) => c === 'r' && b[i + 1] === 'r') && count(b, ['q', 'ee', 'h']) >= 1;
    });
    return spread(bars, 30).map((b) => pat([b]));
  },
  // Sixteenths.
  5: () => {
    const six = ['ssss', 'ess', 'sse'];
    const bars = fillBar(['q', 'ee', 'h', 'ssss', 'ess', 'sse'], 4)
      .filter((b) => count(b, six) >= 1 && count(b, six) <= 2 && endsOn(b, ['q', 'h']));
    return spread(bars, 30).map((b) => pat([b]));
  },
  // Dotted notes and syncopation.
  6: () => {
    const feat = ['q.e', 'eqe', 'e.s'];
    const bars = fillBar(['q', 'ee', 'h', 'q.e', 'eqe', 'e.s'], 4)
      .filter((b) => count(b, feat) >= 1 && count(b, feat) <= 2 && endsOn(b, ['q', 'h', 'q.e']));
    return spread(bars, 30).map((b) => pat([b]));
  },
  // Triplets with duplets, and swung eighths.
  7: () => {
    const all = fillBar(['q', 'ee', 't', 'h'], 4).filter((b) => endsOn(b, ['q', 'h']));
    const straight = all.filter((b) => count(b, ['t']) >= 1 && count(b, ['t']) <= 2);
    const swing = all.filter((b) => count(b, ['ee']) >= 1 && count(b, ['t']) <= 1);
    return [...spread(straight, 16).map((b) => pat([b])), ...spread(swing, 14).map((b) => pat([b], { swing: true }))];
  },
  // 6/8, two bars.
  8: () => {
    const bars = fillBar(['q.', 'eee', 'qe', 'h.'], 3);
    const last = bars.filter((b) => endsOn(b, ['q.', 'h.']));
    const two = bars.flatMap((a) => last.map((b) => [a, b])).filter(([a, b]) => !(a[0] === 'h.' && b[0] === 'h.'));
    return spread(two, 30).map((bs) => pat(bs, { meter: '6/8' }));
  },
  // Odd meters: 5/8, 7/8 (two bars) and 5/4 (one bar), built group by group.
  9: () => Object.entries(ODD).flatMap(([meter, m]) => m.groupings.flatMap((groups) => {
    const bars = oddBars(groups, m.unit);
    const last = bars.filter((b) => endsOn(b, ['q', 'q.', 'h', 'h.']));
    const list = m.bars === 1
      ? last.filter((b) => count(b, ['ee']) <= 2 && b.length > 2)
      : bars.filter((b) => !endsOn(b, ['qe'])).flatMap((a) => last.map((b) => [a, b]));
    return stride(list, m.bars === 1 ? 5 : 6).map((x) => pat(m.bars === 1 ? [x] : x, { meter, groups, unit: m.unit }));
  })),
};

const cache = {};
/** Patterns of a level (2 to 9). */
export function poolFor(level) {
  return (cache[level] ||= builders[level]());
}

/** The steady pulse of level 1: `beats` quarter notes, not written. */
export const pulsePattern = (beats) => ({ id: 'pulse', bars: [Array(beats).fill('q')], meter: '4/4', pulseOnly: true });

/**
 * Flatten a pattern.
 * events: { t, d, rest, trip, cell, tt, td }  t/d = written position and value, tt/td = sounding ones (swing).
 * pulse = click spacing in quarters, total = length in quarters, barLen, barStarts.
 */
export function timing(p) {
  const compound = p.meter === '6/8';
  const pulse = compound ? 1.5 : 1;
  const events = [];
  const barStarts = [];
  let pos = 0, cell = 0;
  for (const bar of p.bars) {
    barStarts.push(pos);
    for (const id of bar) {
      const c = CELLS[id];
      let t = pos;
      c.ev.forEach((e, i) => {
        const ev = { t, d: e.d, rest: !!e.rest, trip: !!c.trip, cell, tt: t, td: e.d };
        if (p.swing && id === 'ee') { ev.tt = pos + (i ? 2 / 3 : 0); ev.td = i ? 1 / 3 : 2 / 3; }
        events.push(ev);
        t += e.d;
      });
      pos += c.len;
      cell++;
    }
  }
  const barLen = pos / p.bars.length;
  if (p.groups) { // odd meter: the clicks follow the grouping
    const unit = p.unit, perBar = Math.round(barLen / unit);
    const starts = [];
    p.groups.reduce((at, g) => { starts.push(at); return at + g; }, 0);
    // grid: one entry per count. s = 2 bar start, 1 group start, 0 inside a group.
    const grid = barStarts.flatMap((b) => Array.from({ length: perBar }, (_, i) => ({ t: b + i * unit, s: i === 0 ? 2 : starts.includes(i) ? 1 : 0 })));
    const groupStarts = grid.filter((g) => g.s).map((g) => g.t);
    return {
      events, pulse: unit === 1 ? 1 : 1.25, total: pos, barLen, barStarts, meter: p.meter, swing: false,
      onsets: events.filter((e) => !e.rest).map((e) => e.tt),
      unit, groups: p.groups, grid, groupStarts,
      beats: unit === 1 ? grid.map((g) => ({ t: g.t, big: g.s > 0 })) : groupStarts.map((t) => ({ t, big: false })),
      counts: grid.filter((g) => g.t < barLen - 1e-6 && (unit === 1 || g.s)).map((g) => g.t),
    };
  }
  return { events, pulse, total: pos, barLen, barStarts, meter: p.meter, swing: !!p.swing, onsets: events.filter((e) => !e.rest).map((e) => e.tt) };
}

/**
 * Compare taps with the expected onsets (seconds from the start of the turn).
 * tols[i] = window of onset i. Returns marks, taps with a class, and the verdict.
 */
export function judge(onsets, tols, taps) {
  const pairs = [];
  onsets.forEach((o, i) => taps.forEach((tp, j) => {
    const d = tp - o;
    if (Math.abs(d) <= tols[i]) pairs.push({ i, j, d });
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
      const fine = Math.abs(pr.d) <= tols[pr.i] * 0.5;
      return { t, d: pr.d, cls: fine ? 'good' : pr.d < 0 ? 'early' : 'late' };
    }
    // Not in any window: tied to the nearest missed onset if it is close, else an extra tap.
    let best = null;
    onsets.forEach((o, i) => { if (!hit.has(i) && Math.abs(t - o) <= tols[i] * 2.2 && (!best || Math.abs(t - o) < Math.abs(best.d))) best = { d: t - o }; });
    return { t, d: best ? best.d : null, cls: best ? 'off' : 'extra' };
  });
  const miss = onsets.length - hit.size;
  const extra = taps.length - used.size;
  return { correct: miss === 0 && extra <= 1, marks, taps: out, miss, extra, err: used.size ? Math.round((err / used.size) * 1000) : null };
}
