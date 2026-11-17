// Plays every level of Music words: a wrong answer, then right ones. Recomputes the sound parameters of each question.
// Usage: PORT=5405 node tools/music-words.test.mjs [screenshot-dir]
import { launch, FAST, rounds, levels, combos } from './lib/harness.mjs';
import { smoke, skillOf, setField, closeSettings, persistCheck, readAttempts, newAttempts } from './lib/shared-b.mjs';
const base = `http://localhost:${process.env.PORT || 5405}/music-words/`;
const dir = process.argv[2];
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'light', locale: 'fr-FR' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('FAIL', msg); } };
const attempts = () => readAttempts(page, 'music-words');
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

await smoke({ browser, url: base, check });
await page.goto(base);
for (const level of levels(6)) {
  await page.evaluate((l) => localStorage.setItem('ml:settings:music-words', JSON.stringify({ level: l })), level);
  await page.reload();
  await page.click('.ml-start');
  await page.waitForTimeout(300);
  const items = LEVELS[level], seen = new Set(), modes = new Set();
  const nRounds = rounds(items.length * (level === 4 || level === 6 ? 2 : 1) + 1, 2);
  for (let round = 0; round < nRounds; round++) {
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
      const wrong = s.ids.find((id) => id !== right[0]);
      await page.click(`.mw-choices button[data-id="${wrong}"]`);
      check(await page.$('.mw-choices .ml-wrong'), `L${level}: wrong button not marked`);
      check(await page.$('.ml-stage.ml-bad'), `L${level}: no wrong-answer feedback on the stage`);
      if (s.item !== 'order' && level > 1) { // a second miss shows the answer, and is not logged again
        const wrong2 = s.ids.find((id) => id !== right[0] && id !== wrong);
        await page.click(`.mw-choices button[data-id="${wrong2}"]`);
        check(await page.$(`.mw-choices button[data-id="${right[0]}"].ml-reveal`), `L${level}: answer not revealed after two misses`);
      }
      await page.waitForTimeout(150);
    }
    for (const id of right) await page.click(`.mw-choices button[data-id="${id}"]`);
    if (level === 6) {
      await page.waitForTimeout(400);
      const d = await page.textContent('.mw-def');
      check(d.includes(s.item) && d.length > s.item.length + 8, `L6: no definition after answer (${d})`);
    }
    const mine = await newAttempts(page, 'music-words', before);
    check(mine.length === 1 && mine[0].ok === (round !== 0) && mine[0].level === level && mine[0].item === s.item && mine[0].skill === skillOf('music-words', level),
      `L${level} round ${round}: ${JSON.stringify(mine.map((a) => [a.ok, a.item, a.skill]))}`);
    await page.waitForFunction(() => !document.querySelector('.mw-choices .ml-right, .mw-choices .ml-reveal'), null, { timeout: 8000 });
  }
  // Every item (and both modes) of the level, checked on freshly drawn questions: a settings change draws a new question.
  for (const item of items) for (const mode of level === 4 ? ['sw', 'ws'] : level === 6 ? ['hear', 'see'] : [undefined]) {
    for (let k = 0; k < rounds(item === 'order' ? 3 : 2, 1); k++) {
      await page.evaluate(([i, m]) => window.__test.force(i, m), [item, mode]);
      await setField(page, 0, level);
      await page.waitForFunction((it) => window.__test.state().item === it, item, { timeout: 5000 });
      const t = await page.evaluate(() => window.__test.state());
      verify(level, t);
      if (level === 6 && ['accent', 'fermata', 'staccato', 'legato'].includes(item)) check(t.mode === mode, `L6 ${item}: mode ${t.mode} vs ${mode}`);
      if (level === 4) check(t.mode === mode && t.ids.join() === 'pp,p,mp,mf,f,ff', `L4: mode/ids ${t.mode} ${t.ids}`);
    }
  }
  await closeSettings(page);
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `L${level}: overflow`);
  console.log(`L${level}`, [...seen].join(' '), [...modes].join(' '));
}
// Clean streak of 8 shows the next-level button; the level setting is saved, applied live and after a reload.
await page.evaluate(() => localStorage.setItem('ml:settings:music-words', JSON.stringify({ level: 2 })));
await page.reload();
await page.click('.ml-start');
for (let i = 0; i < 8; i++) {
  await page.waitForFunction((n) => { const t = window.__test.state(); return t.answer && !document.querySelector('.mw-choices .ml-right') && true; }, i, { timeout: 8000 });
  const t = await page.evaluate(() => window.__test.state());
  await page.click(`.mw-choices button[data-id="${t.answer}"]`);
  await page.waitForFunction(() => !document.querySelector('.mw-choices .ml-right'), null, { timeout: 8000 });
}
check(await page.$eval('.mw-next', (e) => e.classList.contains('mw-show')), 'next-level button after 8 clean answers');
await page.click('.mw-next');
await page.waitForFunction(() => window.__test.state().level === 3, null, { timeout: 5000 }).catch(() => check(false, 'next-level click did not go to level 3'));
await persistCheck({ page, url: base, slug: 'music-words', fields: [[0, 'level', 5]], check, applied: async (pg) => ((await pg.evaluate(() => window.__test.state().level)) === 5 ? '' : 'level not applied') });
check(!errors.length, 'console: ' + errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} failure(s)` : 'all good');
process.exit(failed ? 1 : 0);
