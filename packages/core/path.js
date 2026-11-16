// Guided path: what to play now. Pure functions on an attempts list (no storage, no DOM).
import { SKILLS, GAMES, DOMAINS } from './taxonomy.js';
import { computeMastery } from './mastery.js';

const DAY = 86400000;

/** Game level that trains a skill (lowest, or the one last played when it still trains it). undefined if unknown. */
export function levelFor(game, skill, lastLevel) {
  const g = GAMES.find((x) => x.id === game);
  const lv = g?.levels;
  if (!lv) return undefined;
  if (lastLevel && lv[lastLevel - 1] === skill) return lastLevel;
  const i = lv.indexOf(skill);
  return i < 0 ? undefined : i + 1;
}

const median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * The best things to play now: [{ game, level?, skill, reason: 'new'|'weak'|'review', domain }], at most one per domain.
 *  - first, per domain, the skill of the lowest taxonomy level that is not yet 'good' ('new' if never played, else 'weak');
 *  - a skill never proposed more than two taxonomy levels above the median level of the skills played in that domain;
 *  - a skill that was good but faded comes back as 'review' (at least one is kept in the list when there is one).
 * opts: { count = 4 (1 to 5), now = Date.now() }
 */
export function nextSteps(attempts, { count = 4, now = Date.now() } = {}) {
  count = Math.max(1, Math.min(5, count | 0 || 4));
  const mastery = computeMastery(attempts, now);
  const bySkill = new Map();
  for (const r of attempts) { if (!bySkill.has(r.skill)) bySkill.set(r.skill, []); bySkill.get(r.skill).push(r); }
  const built = SKILLS.filter((s) => s.game);
  const picks = [];
  const reviews = [];
  for (const d of DOMAINS) {
    const skills = built.filter((s) => s.domain === d.id);
    const played = skills.filter((s) => (mastery.get(s.id)?.n ?? 0) > 0);
    const cap = median(played.map((s) => s.level)) + 2;
    const info = (s) => {
      const rows = bySkill.get(s.id) || [];
      const last = rows.reduce((m, r) => (r.t > m.t ? r : m), { t: 0, level: undefined });
      return { s, m: mastery.get(s.id), lastLevel: last.level };
    };
    const faded = (x) => {
      if (!x.m || x.m.n < 3 || now - x.m.last < DAY) return 0;
      const peak = computeMastery(bySkill.get(x.s.id), x.m.last).get(x.s.id).score; // same history, no forgetting
      return peak >= 0.5 && x.m.score < peak * 0.92 ? peak - x.m.score : 0;
    };
    const todo = skills.filter((s) => s.level <= cap && (mastery.get(s.id)?.status ?? 'new') !== 'good' && mastery.get(s.id)?.status !== 'mastered')
      .map(info).filter((x) => !faded(x))
      .sort((a, b) => a.s.level - b.s.level || (b.m ? 1 : 0) - (a.m ? 1 : 0) || SKILLS.indexOf(a.s) - SKILLS.indexOf(b.s));
    const rev = skills.map(info).map((x) => ({ x, f: faded(x) })).filter((y) => y.f > 0).sort((a, b) => b.f - a.f || a.x.s.level - b.x.s.level);
    const mk = ({ s, m, lastLevel }, reason) => ({ game: s.game, level: levelFor(s.game, s.id, reason === 'new' ? undefined : lastLevel), skill: s.id, reason, domain: d.id, _level: s.level });
    if (rev.length) reviews.push({ ...mk(rev[0].x, 'review'), _fade: rev[0].f });
    if (todo.length) picks.push(mk(todo[0], todo[0].m ? 'weak' : 'new'));
  }
  picks.sort((a, b) => a._level - b._level);
  let out = picks.slice(0, count);
  const review = reviews.sort((a, b) => b._fade - a._fade)[0];
  if (review) {
    const i = out.findIndex((x) => x.domain === review.domain);
    if (i >= 0) { if (out.length > 1 || count < 2) out[i] = review; }
    else if (out.length >= count) out[out.length - 1] = review;
    else out.push(review);
    if (!out.includes(review)) out = [review];
    // keep a review in the third place at most, so the first tiles are about something new or weak
    out = [...out.filter((x) => x !== review)]; out.splice(Math.min(2, out.length), 0, review);
  }
  return out.slice(0, count).map(({ _level, _fade, ...x }) => x);
}
