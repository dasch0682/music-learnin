// Plays every level of Music words: a wrong answer, then right ones. Recomputes the sound parameters of each question.
// Usage: PORT=5405 node tools/music-words.test.mjs [screenshot-dir]
import { chromium } from 'playwright-core';
const base = `http://localhost:${process.env.PORT || 5405}/music-words/`;
const dir = process.argv[2];
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'light', locale: 'fr-FR' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('FAIL', msg); } };
const attempts = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('music-learnin'); r.onsuccess = () => { const q = r.result.transaction('attempts').objectStore('attempts').getAll(); q.onsuccess = () => res(q.result.filter((a) => a.game === 'music-words').sort((x, y) => x.t - y.t)); }; }));
const LEVELS = {
  1: ['louder', 'softer', 'faster', 'slower'], 2: ['staccato', 'legato', 'cresc', 'dim'], 3: ['p', 'f', 'staccato', 'legato', 'cresc', 'dim'],
  4: ['pp', 'p', 'mp', 'mf', 'f', 'ff'], 5: ['largo', 'adagio', 'andante', 'moderato', 'allegro', 'presto', 'order'],
  6: ['staccato', 'legato', 'accent', 'fermata', 'ritardando', 'accelerando', 'da capo', 'coda'],
};
const TEMPO = { largo: 50, adagio: 66, andante: 84, moderato: 104, allegro: 132, presto: 176 };
const DYNG = { pp: 0.05, p: 0.09, mp: 0.15, mf: 0.25, f: 0.4, ff: 0.62 };
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const gains = (p) => p.notes.map((n) => n.gain);
const gaps = (p) => p.notes.slice(1).map((n, i) => n.when - p.notes[i].when);
const inc = (a) => a.every((x, i) => !i || x > a[i - 1]);
const dec = (a) => a.every((x, i) => !i || x < a[i - 1]);
const ratio = (p) => mean(p.notes.map((n, i) => n.dur / gaps(p).concat(gaps(p).at(-1))[i]));

function verify(level, s) {
  const [p0, p1] = s.plans;
  const tag = `L${level} ${s.item}/${s.mode}`;
  for (const p of s.plans) check(p.notes.length >= 5 && p.notes.every((n) => n.m >= 55 && n.m <= 80), `${tag}: notes out of range`);
  if (level === 1) {
    check(JSON.stringify(p0.notes.map((n) => n.m)) === JSON.stringify(p1.notes.map((n) => n.m)), `${tag}: tunes differ`);
    const t = s.plans[+s.answer - 1], o = s.plans[2 - s.answer];
    const ok = { louder: mean(gains(t)) > 2 * mean(gains(o)), softer: mean(gains(t)) * 2 < mean(gains(o)), faster: t.end < o.end * 0.7, slower: t.end > o.end * 1.4 }[s.item];
    check(ok, `${tag}: wrong target ${s.answer}`);
  } else if (level === 2 || level === 3) {
    const p = p0, g = gains(p);
    if (s.item === 'staccato') check(ratio(p) < 0.4, `${tag}: not short`);
    if (s.item === 'legato') check(ratio(p) > 1, `${tag}: not joined`);
    if (s.item === 'cresc') check(inc(g), `${tag}: gains not rising`);
    if (s.item === 'dim') check(dec(g), `${tag}: gains not falling`);
    if (s.item === 'p') check(mean(g) < 0.12 && new Set(g).size === 1, `${tag}: not soft`);
    if (s.item === 'f') check(mean(g) > 0.4 && new Set(g).size === 1, `${tag}: not loud`);
  } else if (level === 4) {
    check(gains(p0).every((g) => g === DYNG[s.item]), `${tag}: gain`);
    check(s.mode === 'sw' || s.mode === 'ws', `${tag}: mode`);
  } else if (level === 5) {
    if (s.item === 'order') {
      const bpms = s.order.map((id) => TEMPO[id]);
      check(s.order.length === 4 && inc(bpms), `${tag}: order not slow to fast ${s.order}`);
    } else {
      const expect = (5 * 60) / TEMPO[s.item];
      check(Math.abs(p0.end - expect) < 0.01 && Math.abs(gaps(p0)[0] - 60 / TEMPO[s.item]) < 0.001, `${tag}: tempo`);
    }
  } else if (level === 6 && s.mode === 'hear') {
    const g = gains(p0), gp = gaps(p0);
    if (s.item === 'staccato') check(ratio(p0) < 0.4, `${tag}: not short`);
    if (s.item === 'legato') check(ratio(p0) > 1, `${tag}: not joined`);
    if (s.item === 'accent') check(Math.max(...g) > 2 * Math.min(...g) && g.filter((x) => x > 0.3).length === 1, `${tag}: one accent`);
    if (s.item === 'fermata') check(Math.max(...gp) >= 2.5 * Math.min(...gp), `${tag}: no hold`);
    if (s.item === 'ritardando') check(gp.every((x, i) => !i || x >= gp[i - 1]) && gp.at(-1) > 2 * gp[0], `${tag}: not slowing`);
    if (s.item === 'accelerando') check(dec(gp), `${tag}: not speeding`);
  }
  if (level === 6) check(s.mode === 'see' ? s.plans.length === 0 : s.plans.length === 1, `${tag}: hear/see`);
  if (level === 6 && ['da capo', 'coda', 'ritardando', 'accelerando'].includes(s.item)) check(s.mode === (s.plans.length ? 'hear' : 'see'), `${tag}: mode`);
}

await page.goto(base);
for (let level = 1; level <= 6; level++) {
  await page.evaluate((l) => localStorage.setItem('ml:settings:music-words', JSON.stringify({ level: l })), level);
  await page.reload();
  await page.click('.ml-start');
  await page.waitForTimeout(300);
  const items = LEVELS[level], seen = new Set(), modes = new Set();
  const rounds = items.length * (level === 4 || level === 6 ? 2 : 1) + 1;
  for (let round = 0; round < rounds; round++) {
    const s = await page.evaluate(() => window.__test.state());
    seen.add(s.item); modes.add(s.mode);
    check(s.level === level, `L${level}: level ${s.level}`);
    verify(level, s);
    const nxt = items[(round + 1) % items.length];
    await page.evaluate(([i, m]) => window.__test.force(i, m), [nxt, level === 4 ? (round % 2 ? 'sw' : 'ws') : level === 6 ? (round % 2 ? 'hear' : 'see') : undefined]);
    const before = (await attempts()).length;
    const right = s.item === 'order' ? s.order : [s.answer];
    if (round === 0) {
      if (dir) await page.screenshot({ path: `${dir}/mw-${level}.png` });
      const wrong = s.ids.find((id) => !right.includes(id));
      await page.click(`.mw-choices button[data-id="${wrong}"]`);
      await page.waitForTimeout(150);
    }
    for (const id of right) await page.click(`.mw-choices button[data-id="${id}"]`);
    if (level === 6) {
      await page.waitForTimeout(400);
      const d = await page.textContent('.mw-def');
      check(d.includes(s.item) && d.length > s.item.length + 8, `L6: no definition after answer (${d})`);
    }
    await page.waitForTimeout(level === 6 ? 2600 : 1100);
    const mine = (await attempts()).slice(before);
    check(mine.length === 1 && mine[0].ok === (round !== 0) && mine[0].level === level && mine[0].item === s.item && mine[0].skill === (level <= 3 ? 'listen.expression' : 'read.expression'),
      `L${level} round ${round}: ${JSON.stringify(mine.map((a) => [a.ok, a.item, a.skill]))}`);
  }
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `L${level}: overflow`);
  console.log(`L${level}`, [...seen].join(' '), [...modes].join(' '));
}
check(!errors.length, 'console: ' + errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} failure(s)` : 'all good');
process.exit(failed ? 1 : 0);
