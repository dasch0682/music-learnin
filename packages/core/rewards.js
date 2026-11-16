// Wordless, calm rewards computed from the attempts log: a day streak and stars per skill. No sound, no pop-up.

const key = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

/** Days in a row with at least one attempt. The streak is still alive if the last day played is yesterday.
 *  → { streak, today (played today), week: 7 booleans, oldest first, last = today } */
export function dayStreak(attempts, now = Date.now()) {
  const days = new Set(attempts.map((r) => key(r.t)));
  const at = (back) => { const d = new Date(now); d.setDate(d.getDate() - back); return key(d.getTime()); };
  const today = days.has(at(0));
  let streak = 0;
  for (let back = today ? 0 : 1; days.has(at(back)); back++) streak++;
  return { streak, today, week: [6, 5, 4, 3, 2, 1, 0].map((b) => days.has(at(b))) };
}

/** 0 to 3 stars: 1 learning, 2 good, 3 mastered (0 = never played). */
export const starsOf = (status) => (status === 'mastered' ? 3 : status === 'good' ? 2 : status === 'learning' ? 1 : 0);
/** Stars of a game: from the average score of its skills already played (same thresholds as the status). */
export function gameStars(skillIds, mastery) {
  const played = skillIds.map((id) => mastery.get(id)).filter((m) => m && m.n > 0);
  if (!played.length) return 0;
  const avg = played.reduce((a, m) => a + m.score, 0) / played.length;
  return avg >= 0.8 ? 3 : avg >= 0.5 ? 2 : 1;
}
/** '★★☆' text for a star count. */
export const starText = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);
