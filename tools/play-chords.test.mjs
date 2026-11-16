// Plays every level of Play the chord with real pointer events on the keys: a wrong chord, then right ones.
// Usage: npx vite --port 5303 --strictPort &   then   PORT=5303 node tools/play-chords.test.mjs [screenshot-dir]
import { chromium } from 'playwright-core';
const ID = 'play-chords';
const base = `http://localhost:${process.env.PORT || 5303}/${ID}/`;
const dir = process.argv[2];
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'light', locale: 'fr-FR', hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('FAIL', msg); } };
const attempts = () => page.evaluate((id) => new Promise((res) => { const r = indexedDB.open('music-learnin'); r.onsuccess = () => { const q = r.result.transaction('attempts').objectStore('attempts').getAll(); q.onsuccess = () => res(q.result.filter((a) => a.game === id).sort((x, y) => x.t - y.t)); }; }), ID);
const state = () => page.evaluate(() => window.__test.state());
const mod = (n, m) => ((n % m) + m) % m;

// ---------- theory, written by hand, independent from the game code ----------
const STEPS = { maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8], maj7: [0, 4, 7, 11], dom7: [0, 4, 7, 10], min7: [0, 3, 7, 10] };
const NATURAL_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11, Do: 0, 'Ré': 2, Mi: 4, Fa: 5, Sol: 7, La: 9, Si: 11 };
const pcsOf = (root, type) => STEPS[type].map((s) => mod(root + s, 12));
// [root pc, type, inversion] allowed per level
const ALLOWED = {
  1: (r, t, i) => [0, 5, 7].includes(r) && t === 'maj' && !i,
  2: (r, t, i) => !i && ((t === 'maj' && [0, 5, 7].includes(r)) || (t === 'min' && [9, 2, 4].includes(r))),
  3: (r, t, i) => !i && (t === 'maj' || t === 'min'),
  4: (r, t, i) => (i ? ['maj', 'min'].includes(t) && i <= 2 : ['maj', 'min', 'dim', 'aug'].includes(t)),
  5: (r, t, i) => !i && ['maj7', 'dom7', 'min7'].includes(t),
};
// Cadences: degree offsets from the key, and chord types.
const CAD = {
  perfect: [[7, 'maj'], [0, 'maj']], plagal: [[5, 'maj'], [0, 'maj']], half: [[0, 'maj'], [7, 'maj']], deceptive: [[7, 'maj'], [9, 'min']],
  iiVI: [[2, 'min7'], [7, 'dom7'], [0, 'maj7']],
};
const CAD_NAME = { perfect: 'Cadence parfaite', plagal: 'Cadence plagale', half: 'Demi-cadence', deceptive: 'Cadence rompue', iiVI: 'ii–V–I' };
const nameOk = (name, root) => { const m = name.match(/^(Do|Ré|Mi|Fa|Sol|La|Si|[A-G])([♯♭]?)/); if (!m) return false; return mod(NATURAL_PC[m[1]] + (m[2] === '♯' ? 1 : m[2] === '♭' ? -1 : 0), 12) === root; };

/** One way to play the chord within the keyboard window: bass first, the others above it. */
function voice(pcs, bassPc, lo, hi, inv = true) {
  if (!inv) { const out = pcs.map((pc) => lo + mod(pc - lo, 12)); if (out.some((x) => x > hi)) throw new Error('out of window'); return out; } // any voicing: each note as low as possible
  const order = [bassPc, ...pcs.filter((p) => p !== bassPc).sort((a, b) => mod(a - bassPc, 12) - mod(b - bassPc, 12))];
  const out = [];
  let m = lo;
  for (const pc of order) { while (mod(m, 12) !== pc) m++; out.push(m); m++; }
  if (out.some((x) => x > hi)) throw new Error(`voicing ${out} out of window ${lo}-${hi}`);
  return out;
}
async function tapKey(midi) {
  const box = await page.locator(`.pc-kb [data-midi="${midi}"]`).boundingBox();
  if (!box) throw new Error('no key ' + midi);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * (box.height > 100 ? 0.4 : 0.5));
}
async function setup(level, lang, theme) {
  await page.evaluate(([id, l, lg, th]) => { localStorage.setItem('ml:settings:' + id, JSON.stringify({ level: l })); localStorage.setItem('ml:lang', lg); localStorage.setItem('ml:theme', th); }, [ID, level, lang, theme]);
  await page.reload();
  await page.click('.ml-start');
  // Level 1: the app plays its chord and flashes the three keys.
  if (level === 1) check(await page.waitForFunction(() => document.querySelectorAll('.pc-kb .ml-hit').length === 3, null, { polling: 'raf', timeout: 5000 }).then(() => true, () => false), 'L1: the app did not flash the three keys of its chord');
  await page.waitForFunction(() => window.__test.state().chords && !window.__test.state().locked, null, { timeout: 15000 });
}
const settle = () => page.waitForFunction(() => { const s = window.__test.state(); return !s.locked && s.step === 0 && !s.latched.length; }, null, { timeout: 10000 }).catch(async (e) => { console.log('STATE', JSON.stringify(await state())); throw e; });

await page.goto(base);
for (let level = 1; level <= 7; level++) {
  await setup(level, 'fr', 'light');
  const seen = new Set();
  for (let round = 0; round < 4; round++) {
    const s = await state();
    seen.add(s.item);
    const cad = level >= 6;
    check(s.latched.length === 0 && s.step === 0, `L${level}: not clean at start`);
    // The expected chords, recomputed from theory.
    let want;
    if (cad) {
      check(!!CAD[s.cad], `L${level}: cadence ${s.cad}`);
      check(level === 6 ? s.cad !== 'iiVI' && [0, 7, 5].includes(s.key) : s.cad === 'iiVI' && [0, 5, 10, 7, 3, 2].includes(s.key), `L${level}: ${s.cad} in key ${s.key}`);
      want = CAD[s.cad].map(([off, t]) => ({ root: mod(s.key + off, 12), type: t, inv: 0 }));
      check(s.item === s.cad, `L${level}: item ${s.item}`);
      const shown = await page.$$eval('.pc-step', (e) => e.map((x) => x.firstChild.textContent));
      check(shown.length === want.length && shown.every((n, i) => nameOk(n, want[i].root)), `L${level}: chord names ${shown}`);
      check((await page.textContent('.pc-name')).trim() === CAD_NAME[s.cad], `L${level}: cadence name`);
    } else {
      want = s.chords.map((c) => ({ root: c.root, type: c.type, inv: c.inv }));
      check(want.length === 1 && ALLOWED[level](want[0].root, want[0].type, want[0].inv), `L${level}: unexpected chord ${JSON.stringify(want)}`);
      check(s.item === want[0].type + (want[0].inv ? ':inv' + want[0].inv : ''), `L${level}: item ${s.item}`);
      const nm = (await page.textContent('.pc-name')).trim();
      check(level === 1 ? await page.isHidden('.pc-name') : nameOk(nm, want[0].root), `L${level}: name "${nm}"`);
    }
    want.forEach((w, i) => {
      check(JSON.stringify(s.pcs[i]) === JSON.stringify(pcsOf(w.root, w.type)), `L${level}: pcs ${s.pcs[i]} for ${JSON.stringify(w)}`);
      check(s.bass[i] === (w.inv ? pcsOf(w.root, w.type)[w.inv] : null), `L${level}: bass ${s.bass[i]}`);
    });
    const keys = await page.$$eval('.pc-kb .ml-white', (e) => e.length);
    check(keys <= 12, `L${level}: ${keys} white keys`);
    if (round === 0 && dir) await page.screenshot({ path: `${dir}/pc-${level}.png` });

    const before = (await attempts()).length;
    let expectWrong = false;
    for (let i = 0; i < want.length; i++) {
      const w = want[i], pcs = pcsOf(w.root, w.type);
      const n = pcs.length;
      let wrong = null;
      if (round === 0 && i === 0) {
        // Keys that are not in the chord at all.
        const outside = [];
        for (let m = s.win[0]; m <= s.win[1] && outside.length < n; m++) if (!pcs.includes(mod(m, 12))) outside.push(m);
        wrong = outside;
      } else if (round === 1 && i === 0 && w.inv) {
        wrong = voice(pcs, pcs[0], s.win[0], s.win[1]); // right notes, but the bass is not the one asked
      }
      if (wrong) {
        expectWrong = true;
        for (const m of wrong) await tapKey(m);
        const bad = await page.$$eval('.pc-kb .ml-bad', (e) => e.length);
        check(bad === wrong.length, `L${level}: ${bad} keys flashed bad for ${wrong.length} wrong keys`);
        const st = await state();
        check(st.latched.length === 0 && st.wrongLogged && st.step === 0, `L${level}: wrong chord not released ${JSON.stringify(st.latched)}`);
        await page.waitForTimeout(500);
      }
      const notes = w.inv ? voice(pcs, pcs[w.inv], s.win[0], s.win[1]) : voice(pcs, pcs[0], s.win[0], s.win[1], false);
      const lit = [];
      for (const m of notes) {
        await tapKey(m);
        lit.push(m);
        if (lit.length < notes.length) check((await state()).latched.length === lit.length, `L${level}: key ${m} not latched`);
      }
      if (i < want.length - 1) await page.waitForFunction((k) => window.__test.state().step === k && !window.__test.state().locked, i + 1, { timeout: 5000 });
    }
    await page.waitForTimeout(150);
    const mine = (await attempts()).slice(before);
    const exp = expectWrong ? [false, true] : [true];
    check(mine.map((a) => a.ok).join() === exp.join() && mine.every((a) => a.skill === (cad ? 'play.cadence' : 'play.chords') && a.level === level && a.item === s.item), `L${level} round ${round}: ${JSON.stringify(mine.map((a) => [a.ok, a.skill, a.level, a.item]))}`);
    await settle();
  }
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `L${level}: overflow`);
  console.log(`L${level}`, [...seen].join(' '));
}

// One tap on a latched key releases it (no check, no log).
await setup(3, 'en', 'dark');
{
  const s = await state();
  const before = (await attempts()).length;
  await tapKey(s.win[0]);
  check((await state()).latched.length === 1, 'tap does not latch');
  await tapKey(s.win[0]);
  check((await state()).latched.length === 0, 'second tap does not release');
  check((await attempts()).length === before, 'latching logged an attempt');
  if (dir) { await tapKey(s.win[0]); await page.screenshot({ path: `${dir}/pc-en-dark.png` }); }
}
// A clean streak offers the next level with one tap.
await setup(2, 'fr', 'light');
for (let r = 0; r < 5; r++) {
  const s = await state();
  const pcs = s.pcs[0];
  for (const m of voice(pcs, pcs[0], s.win[0], s.win[1], false)) await tapKey(m);
  await settle();
}
check(await page.isVisible('.pc-offer:not(.pc-off)'), 'next level button not shown after a clean streak');
await page.click('.pc-offer');
await page.waitForFunction(() => window.__test.state().level === 3 && !window.__test.state().locked);
check(!errors.length, 'console: ' + errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} failure(s)` : 'all good');
process.exit(failed ? 1 : 0);
