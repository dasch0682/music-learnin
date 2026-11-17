// Plays every level of Play the scale with real pointer events on the keys: a wrong note, then the right ones.
// Usage: npx vite --port 5303 --strictPort &   then   PORT=5303 node tools/play-scales.test.mjs [screenshot-dir]
import { launch, FAST, rounds, levels, combos } from './lib/harness.mjs';
const ID = 'play-scales';
const base = `http://localhost:${process.env.PORT || 5303}/${ID}/`;
const dir = process.argv[2];
const browser = await launch({ speed: 1 }); // microphone test: pitches are fed in real time (accelerated timers made it hang when run next to other microphone tests)
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'light', locale: 'fr-FR', hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('FAIL', msg); } };
const attempts = () => page.evaluate((id) => new Promise((res) => { const r = indexedDB.open('music-learnin'); r.onsuccess = () => { const q = r.result.transaction('attempts').objectStore('attempts').getAll(); q.onsuccess = () => res(q.result.filter((a) => a.game === id).sort((x, y) => x.t - y.t)); }; }), ID);
const state = () => page.evaluate(() => window.__test.state());

// Theory, written by hand (semitones above the tonic), independent from the game code.
const STEPS = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10], mixolydian: [0, 2, 4, 5, 7, 9, 10],
  pentaMajor: [0, 2, 4, 7, 9], pentaMinor: [0, 3, 5, 7, 10], blues: [0, 3, 5, 6, 7, 10],
};
const ALLOWED = {
  1: { scales: ['major'], tonics: [0] }, 2: { scales: ['major'], tonics: [0] }, 3: { scales: ['major'], tonics: [7, 5, 2] },
  4: { scales: ['major'], tonics: null }, 5: { scales: ['minor', 'harmonicMinor'], tonics: null },
  6: { scales: ['dorian', 'mixolydian', 'pentaMajor', 'pentaMinor', 'blues'], tonics: null },
};
const expectedFor = (level, scale, tonic) => {
  const up = [...STEPS[scale], 12].map((s) => 60 + tonic + s);
  if (level === 1) return up.slice(0, 5);
  return [...up, ...up.slice(0, -1).reverse()];
};

/** Real pointer click in the middle of a key. */
async function tapKey(midi) {
  const box = await page.locator(`.ps-kb [data-midi="${midi}"]`).boundingBox();
  if (!box) throw new Error('no key ' + midi);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * (box.height > 100 ? 0.4 : 0.5));
}
async function setup(level, lang, theme, model) {
  await page.evaluate(([id, l, lg, th, md]) => { localStorage.setItem('ml:settings:' + id, JSON.stringify({ level: l, model: md })); localStorage.setItem('ml:lang', lg); localStorage.setItem('ml:theme', th); }, [ID, level, lang, theme, model]);
  await page.reload();
  await page.click('.ml-start');
  await page.waitForFunction(() => window.__test.state().expected.length && !window.__test.state().locked, null, { timeout: 15000 });
}

await page.goto(base);
for (const level of levels(6)) {
  await setup(level, 'fr', 'light', false);
  const seen = new Set();
  for (let round = 0; round < rounds(4, 2); round++) {
    const s = await state();
    seen.add(s.item);
    const al = ALLOWED[level];
    check(al.scales.includes(s.scale) && (!al.tonics || al.tonics.includes(s.tonic)), `L${level}: unexpected ${s.item}`);
    check(s.item === `${s.scale}:${s.tonic}`, `L${level}: item ${s.item}`);
    const want = expectedFor(level, s.scale, s.tonic);
    check(JSON.stringify(want) === JSON.stringify(s.expected), `L${level} ${s.item}: expected ${s.expected} want ${want}`);
    // The keyboard holds every note, on at most 12 white keys.
    const keys = await page.$$eval('.ps-kb .ml-white', (e) => e.length);
    check(keys <= 12, `L${level}: ${keys} white keys`);
    check(want.every((m) => m >= s.win[0] && m <= s.win[1]), `L${level}: notes out of the keyboard`);
    const dots = await page.$$eval('.ps-dot', (e) => e.length);
    check(dots === want.length, `L${level}: ${dots} dots for ${want.length} notes`);
    const startMarked = await page.$$eval('.ps-start', (e) => e.map((k) => +k.dataset.midi));
    check(level >= 3 ? startMarked.join() === String(want[0]) : startMarked.length === 0, `L${level}: start key ${startMarked}`);
    const nameShown = (await page.textContent('.ps-name')).trim();
    check(level >= 3 ? nameShown.length > 3 : nameShown === '', `L${level}: name "${nameShown}"`);
    if (level === 1) {
      const hinted = await page.$$eval('.ps-kb .ml-hint', (e) => e.map((k) => +k.dataset.midi));
      check(hinted.join() === String(want[0]), `L1: hint ${hinted}`);
    }
    if (round === 0 && dir) await page.screenshot({ path: `${dir}/ps-${level}.png` });
    const before = (await attempts()).length;
    for (let i = 0; i < want.length; i++) {
      if (round === 0 && i === 1) {
        // A wrong note: flashes bad, no progress, continues from the same note.
        const wrong = [60, 61, 62, 63, 64].map((m) => m + s.win[0] - 60).find((m) => m >= s.win[0] && m <= s.win[1] && m !== want[1]);
        await tapKey(wrong);
        const bad = await page.$$eval('.ps-kb .ml-bad', (e) => e.length);
        check(bad === 1, `L${level}: wrong note did not flash bad`);
        await tapKey(wrong);
        const st = await state();
        check(st.idx === 1 && st.wrongLogged, `L${level}: after wrong note idx ${st.idx}`);
      }
      await tapKey(want[i]);
    }
    await page.waitForTimeout(150);
    const mine = (await attempts()).slice(before);
    const exp = round === 0 ? [false, true] : [true];
    check(mine.map((a) => a.ok).join() === exp.join() && mine.every((a) => a.skill === 'play.scales' && a.level === level && a.item === s.item), `L${level} round ${round}: ${JSON.stringify(mine.map((a) => [a.ok, a.skill, a.level, a.item]))}`);
    await page.waitForFunction((it) => { const t = window.__test.state(); return !t.locked && t.idx === 0 && t.item !== undefined; }, null, { timeout: 5000 });
    await page.waitForTimeout(100);
  }
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `L${level}: overflow`);
  console.log(`L${level}`, [...seen].join(' '));
}

// Model playing first (levels 1-3): the keyboard is locked until the scale has played.
await setup(1, 'en', 'dark', true).catch(() => {});
{
  const s = await state();
  check(!s.locked && s.idx === 0, 'model: not unlocked after playing');
  if (dir) await page.screenshot({ path: `${dir}/ps-en-dark.png` });
}
// Clean streak offers the next level with one tap.
await setup(1, 'fr', 'light', false);
for (let r = 0; r < 4; r++) {
  const s = await state();
  for (const m of s.expected) await tapKey(m);
  await page.waitForFunction(() => !window.__test.state().locked && window.__test.state().idx === 0);
}
check(await page.isVisible('.ps-offer:not(.ps-off)'), 'next level button not shown after a clean streak');
await page.click('.ps-offer');
await page.waitForFunction(() => window.__test.state().level === 2 && !window.__test.state().locked);
check((await state()).level === 2, 'next level button did not change the level');

// Microphone input: injected pitches (any octave, transposing instrument), a wrong note, and a still-ringing note not counting twice.
const feedFor = async (midi, ms) => { for (let t = 0; t < ms; t += 40) { await page.evaluate((m) => window.__test.feed(m), midi); await page.waitForTimeout(40); } };
async function micSetup(level, instrument) {
  await page.evaluate(([id, l, ins]) => { localStorage.setItem('ml:settings:' + id, JSON.stringify({ level: l, model: false, input: 'mic', instrument: ins })); localStorage.setItem('ml:lang', 'fr'); localStorage.setItem('ml:theme', 'light'); }, [ID, level, instrument]);
  await page.reload();
  await page.click('.ml-start');
  await page.waitForFunction(() => window.__test.state().expected.length && !window.__test.state().locked, null, { timeout: 15000 });
}
for (const [instrument, shift] of combos([['Bb', -2], ['C', 0], ['Eb', -9]])) { // fast: one transposing instrument
  await micSetup(2, instrument);
  let s = await state();
  check(s.micMode || s.micFailed, 'mic: neither mic mode nor fallback');
  if (!s.micMode) { console.log('mic unavailable in this browser, using keyboard fallback check only'); break; }
  check(s.shift === shift, `mic ${instrument}: shift ${s.shift}`);
  check(await page.$('.ps-meter') !== null, 'mic: no meter');
  const before = (await attempts()).length;
  // Short note (under 0.4 s) does not count.
  await feedFor(s.expected[0] + shift, 120);
  check((await state()).idx === 0, 'mic: a short note counted');
  await feedFor(null, 300);
  // Wrong note held 1.3 s: counted once.
  await feedFor(s.expected[0] + shift + 3, 1300);
  s = await state();
  check(s.wrongLogged && s.idx === 0, 'mic: wrong note not counted once');
  await feedFor(null, 300);
  for (let i = 0; i < s.expected.length; i++) {
    const octave = (i % 3 - 1) * 12; // any octave
    await feedFor(s.expected[i] + shift + octave, 650);
    const idx = (await state()).idx;
    if (i < s.expected.length - 1) check(idx === i + 1, `mic ${instrument}: note ${i} gave idx ${idx}`);
  }
  await page.waitForTimeout(200);
  const mine = (await attempts()).slice(before);
  check(mine.map((a) => a.ok).join() === 'false,true' && mine.every((a) => a.skill === 'play.scales' && a.level === 2), `mic ${instrument}: ${JSON.stringify(mine.map((a) => [a.ok, a.level]))}`);
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), 'mic: overflow');
  if (dir && instrument === 'Bb') await page.screenshot({ path: `${dir}/ps-mic.png` });
  await page.waitForFunction(() => !window.__test.state().locked && window.__test.state().idx === 0, null, { timeout: 5000 });
}
check(!errors.length, 'console: ' + errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} failure(s)` : 'all good');
process.exit(failed ? 1 : 0);
