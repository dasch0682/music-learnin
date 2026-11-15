// Mastery scoring. Always derived from the attempts log, never stored.
import { getAttempts } from './storage.js';

const DAY = 86400000;

function score(rows, now) {
  let ema = 0, streak = 0, correct = 0;
  for (const r of rows) {
    ema += 0.25 * ((r.ok ? 1 : 0) - ema);
    streak = r.ok ? streak + 1 : 0;
    if (r.ok) correct++;
  }
  const n = rows.length;
  const last = n ? rows[n - 1].t : 0;
  // Memory fades: the half-life grows with the current streak of right answers.
  const halfLife = 2 * 2 ** Math.min(streak, 6);
  const retention = 0.4 + 0.6 * 0.5 ** ((now - last) / DAY / halfLife);
  const value = n ? Math.max(0, Math.min(1, ema * retention)) : 0;
  const status = !n ? 'new' : value >= 0.8 ? 'mastered' : value >= 0.5 ? 'good' : 'learning';
  return { score: value, n, correct, last, status };
}

function group(attempts, keyOf, now) {
  const by = new Map();
  for (const r of attempts) {
    const k = keyOf(r);
    if (k == null) continue;
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(r);
  }
  const out = new Map();
  for (const [k, rows] of by) out.set(k, score(rows, now));
  return out;
}

/** Map skillId → { score 0-1, n, correct, last, status: 'new'|'learning'|'good'|'mastered' } */
export const computeMastery = (attempts, now = Date.now()) => group(attempts, (r) => r.skill, now);

/** Same, per item inside one skill (e.g. each note of 'read.treble.staff'). */
export const computeItemMastery = (attempts, skill, now = Date.now()) =>
  group(attempts.filter((r) => r.skill === skill), (r) => r.item, now);

export async function loadMastery() { return computeMastery(await getAttempts()); }
export async function loadItemMastery(skill) { return computeItemMastery(await getAttempts({ skill }), skill); }

/** Pick one entry of `items`, favouring the weakest. stats = Map from computeItemMastery/computeMastery.
 *  keyOf maps an item to its stats key. `avoid` = key of the previous question (never repeated twice). */
export function pickWeak(items, stats, { keyOf = (x) => x, avoid } = {}) {
  const pool = items.length > 1 ? items.filter((x) => keyOf(x) !== avoid) : items;
  const weights = pool.map((x) => 1.15 - (stats?.get(keyOf(x))?.score ?? 0));
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i]; }
  return pool[pool.length - 1];
}
