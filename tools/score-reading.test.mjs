// Plays every level of Transpose: one wrong answer, then the right ones. Checks the theory and the drawing too.
// Usage: npx vite --port 5305 --strictPort &   then   PORT=5305 node tools/score-reading.test.mjs [screenshot-dir]
import { launch, FAST, rounds, levels, combos } from './lib/harness.mjs';
const ID = 'score-reading';
const base = `http://localhost:${process.env.PORT || 5305}/${ID}/`;
const dir = process.argv[2];
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'light', locale: 'fr-FR', hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('FAIL', msg); } };
const attempts = () => page.evaluate((id) => new Promise((res) => { const r = indexedDB.open('music-learnin'); r.onsuccess = () => { const q = r.result.transaction('attempts').objectStore('attempts').getAll(); q.onsuccess = () => res(q.result.filter((a) => a.game === id).sort((x, y) => x.t - y.t)); }; }), ID);

// ---------- theory, written by hand, independent from the game code ----------
// Concert pitch = written pitch + this many semitones (B-flat instrument: written C sounds B-flat below).
const SEMIS = { Bb: -2, Eb: -9, F: -7 };
const NAME_FR = { Bb: 'en si♭', Eb: 'en mi♭', F: 'en fa' }, NAME_EN = { Bb: 'in B♭', Eb: 'in E♭', F: 'in F' };
const PC = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B
const SHARPS = [3, 0, 4, 1, 5, 2, 6], FLATS = [6, 2, 5, 1, 4, 0, 3]; // F C G D A E B / B E A D G C F
const mod = (n, m) => ((n % m) + m) % m;
const pitch = (step, acc = 0) => (Math.floor(step / 7) + 1) * 12 + PC[mod(step, 7)] + acc; // C4 = step 28 = midi 60
const sigAlt = (letter, sig) => ((sig > 0 ? SHARPS : FLATS).slice(0, Math.abs(sig)).includes(letter) ? Math.sign(sig) : 0);
const IVL = { M2: [2, 1], m3: [3, 2], M3: [4, 2], P4: [5, 3], P5: [7, 4] }; // semitones, letters
const BOTTOM = { treble: 30, bass: 18, alto: 24, tenor: 22 }; // E4, G2, F3, D3
const GAP = 12, TOP = GAP * 5.5;
const yOf = (clef, step) => TOP + GAP * 4 - ((step - BOTTOM[clef]) * GAP) / 2;
const SIG_SHIFT = { Bb: -2, Eb: -3 }; // fifths, for a part written for the instrument

console.log('semitones from written to sounding:', JSON.stringify(SEMIS), '| signature shift (fifths):', JSON.stringify(SIG_SHIFT));

const state = () => page.evaluate(() => window.__test.state());
const ready = () => page.waitForFunction(() => window.__test.state() && !window.__test.state().locked, null, { timeout: 12000 });
async function setup(level, lang, theme) {
  await page.evaluate(([id, l, lg, th]) => { localStorage.setItem('ml:settings:' + id, JSON.stringify({ level: l, hear: true })); localStorage.setItem('ml:lang', lg); localStorage.setItem('ml:theme', th); }, [ID, level, lang, theme]);
  await page.reload();
  await page.click('.ml-start');
  await page.waitForFunction(() => window.__test?.state());
  await ready();
}
/** Heads drawn in a container: vertical place, accidental glyphs, and whether they are visible. */
const heads = (sel) => page.evaluate((s) => [...document.querySelectorAll(s + ' .ml-note')].map((g) => ({
  cy: +g.querySelector('ellipse').getAttribute('cy'), acc: [...g.querySelectorAll('text')].map((t) => t.textContent).join(''), color: g.style.color,
})), sel);
const sigGlyphs = (sel) => page.evaluate((s) => [...document.querySelectorAll(s + ' .ml-keysig')].map((t) => ({ g: t.textContent, y: +t.getAttribute('y') })), sel);
const ACCG = { '-1': '♭', 0: '', 1: '♯' };
const keysCount = () => page.locator('.ml-white').count();
const press = async (midi) => {
  const k = page.locator(`.ml-key[data-midi="${midi}"]`);
  await k.dispatchEvent('pointerdown', { pointerId: 1 });
  await k.dispatchEvent('pointerup', { pointerId: 1 });
};
const wrongKey = (s) => { for (const m of [s.win[0], s.win[1]]) if (m !== s.exp[s.pos]) return m; };

function checkHead(d, clef, n, where) {
  check(d && Math.abs(d.cy - yOf(clef, n.step)) < 0.01, `${where}: head at ${d?.cy}, should be ${yOf(clef, n.step)} (step ${n.step})`);
  check(d && d.acc === ACCG[n.acc], `${where}: accidental "${d?.acc}" for acc ${n.acc}`);
}

await page.goto(base);
for (const level of levels(6)) {
  await setup(level, 'fr', 'dark');
  const seen = new Set();
  const nRounds = level === 1 ? 10 : rounds(8, 2); // level 1 keeps its clean streak (next-level button)
  for (let round = 0; round < nRounds; round++) {
    await ready();
    const s = await state();
    seen.add(s.item);
    const where = `L${level} round ${round} (${s.item})`;
    check(s.level === level, `${where}: level`);
    const before = (await attempts()).length;
    if (s.kind !== 'pick') {
      check(await keysCount() <= 12, `${where}: too many keys`);
      check(s.exp.every((m) => m >= s.win[0] && m <= s.win[1]), `${where}: expected keys outside the keyboard ${s.win} ${s.exp}`);
    }
    if (level <= 2) {
      check(level === 1 ? s.inst === 'Bb' : s.inst === 'Eb' || s.inst === 'F', `${where}: instrument`);
      check(s.item === s.inst, `${where}: item`);
      check(s.written.acc === 0 && s.written.step >= 30 && s.written.step <= 37, `${where}: written note ${JSON.stringify(s.written)}`);
      check(s.exp.length === 1 && s.exp[0] === pitch(s.written.step) + SEMIS[s.inst], `${where}: expected ${s.exp}, should be ${pitch(s.written.step) + SEMIS[s.inst]}`);
      check((await page.textContent('.sr-label')) === NAME_FR[s.inst], `${where}: instrument label`);
      checkHead((await heads('.sr-staff'))[0], 'treble', s.written, where);
      check(s.intro === (level === 1 && round < 3), `${where}: intro ${s.intro}`);
      check(await page.locator('.sr-gap').isVisible() === s.intro, `${where}: gap text`);
      if (s.intro) {
        check(await page.locator(`.ml-key[data-midi="${pitch(s.written.step)}"].ml-hint`).count() === 1, `${where}: written key not lit`);
        if (round === 0 && dir) await page.screenshot({ path: `${dir}/sr-1-fr-dark.png` });
      }
    } else if (level === 3) {
      check(s.item === s.inst + ':r', `${where}: item`);
      check(s.sounding.acc === 0 && s.sounding.step >= 28, `${where}: sounding note`);
      check(s.written.midi === s.sounding.midi - SEMIS[s.inst], `${where}: written ${s.written.midi} for sounding ${s.sounding.midi}`);
      check(s.written.midi === pitch(s.written.step, s.written.acc) && Math.abs(s.written.acc) <= 1, `${where}: written spelling ${JSON.stringify(s.written)}`);
      check(new Set(s.options.map((o) => o.midi)).size === 4 && s.options.some((o) => o.midi === s.written.midi), `${where}: options`);
      checkHead((await heads('.sr-staff'))[0], 'treble', s.sounding, where);
      for (const o of s.options) {
        const hd = await heads(`.sr-choices button[data-key="${o.step}:${o.acc}"]`);
        check(hd.length === 1 && o.midi === pitch(o.step, o.acc), `${where}: option ${JSON.stringify(o)}`);
        checkHead(hd[0], 'treble', o, `${where} option`);
      }
      const sizes = await page.evaluate(() => [...document.querySelectorAll('.sr-choices button')].map((b) => [b.getBoundingClientRect().width, b.getBoundingClientRect().height]));
      check(sizes.every(([w, hh]) => w >= 100 && hh >= 60), `${where}: small targets`);
      if (round === 0 && dir) await page.screenshot({ path: `${dir}/sr-3-fr-dark.png` });
    } else if (level === 4) {
      const marked = s.staves.filter((x) => x.marked);
      check(s.staves.length === 2 && s.staves[0].clef !== s.staves[1].clef && marked.length === 1 && s.item === 'clef:' + marked[0].clef, `${where}: staves ${JSON.stringify(s.staves)}`);
      for (const st of s.staves) {
        check(st.step >= BOTTOM[st.clef] - 2 && st.step <= BOTTOM[st.clef] + 10 && st.acc === 0, `${where}: note out of the staff`);
        check(st.midi === pitch(st.step), `${where}: midi of ${st.clef}`);
        checkHead((await heads(`.sr-staff[data-clef="${st.clef}"]`))[0], st.clef, st, `${where} ${st.clef}`);
      }
      check(await page.locator('.sr-marked').count() === 1 && (await page.getAttribute('.sr-marked', 'data-clef')) === marked[0].clef, `${where}: marked staff`);
      check(s.exp[0] === pitch(marked[0].step), `${where}: expected key`);
    } else if (level === 5) {
      const [semi, letters] = IVL[s.ivl];
      check(s.item === (s.dir > 0 ? 'up:' : 'down:') + s.ivl, `${where}: item`);
      check(s.source.length >= 3 && s.source.length <= 4 && s.target.length === s.source.length, `${where}: motif length`);
      s.source.forEach((n, i) => {
        const t = s.target[i];
        check(n.acc === 0 && n.midi === pitch(n.step), `${where}: source ${i}`);
        check(t.step === n.step + s.dir * letters && t.midi === n.midi + s.dir * semi && t.midi === pitch(t.step, t.acc) && Math.abs(t.acc) <= 1, `${where}: note ${i} ${JSON.stringify(n)} -> ${JSON.stringify(t)}`);
      });
      check(s.exp.join() === s.target.map((t) => t.midi).join(), `${where}: expected keys`);
      const hd = await heads('.sr-source');
      s.source.forEach((n, i) => checkHead(hd[i], 'treble', n, `${where} source ${i}`));
      const label = await page.textContent('.sr-label');
      check(label.startsWith(s.dir > 0 ? '↑' : '↓') && label.length > 5, `${where}: label ${label}`);
      check((await heads('.sr-target')).every((x) => x.color === 'transparent'), `${where}: target not empty`);
    } else {
      const I = s.inst;
      check(I === 'Bb' || I === 'Eb', `${where}: instrument`);
      check(s.item === I + ':key', `${where}: item`);
      check(s.sig === s.writtenSig + SIG_SHIFT[I] && Math.abs(s.writtenSig) <= 4 && Math.abs(s.sig) <= 5, `${where}: signatures ${s.writtenSig} -> ${s.sig}`);
      s.source.forEach((n, i) => {
        const t = s.target[i];
        const letter = mod(n.step, 7);
        check(n.acc === sigAlt(letter, s.writtenSig) && n.midi === pitch(n.step, n.acc), `${where}: written note ${i} not in the written key`);
        check(t.midi === n.midi + SEMIS[I], `${where}: note ${i} sounds ${t.midi}, should be ${n.midi + SEMIS[I]}`);
        check(t.acc === sigAlt(mod(t.step, 7), s.sig) && t.midi === pitch(t.step, t.acc), `${where}: sounding note ${i} not in the sounding key (${JSON.stringify(t)})`);
        check(t.step - n.step === { Bb: -1, Eb: -5 }[I], `${where}: letters moved ${t.step - n.step}`);
        check(t.step >= 28 && t.step <= 35, `${where}: sounding note out of the staff`);
      });
      const nSharp = Math.abs(s.writtenSig), nSig = Math.abs(s.sig);
      const a = await sigGlyphs('.sr-source'), b = await sigGlyphs('.sr-target');
      check(a.length === nSharp && b.length === nSig, `${where}: ${a.length}/${b.length} accidentals drawn for ${s.writtenSig}/${s.sig}`);
      const order = (sig) => (sig > 0 ? SHARPS : FLATS);
      const treble = { sharps: [38, 35, 39, 36, 33, 37, 34], flats: [34, 37, 33, 36, 32, 35, 31] };
      for (const [list, sig] of [[a, s.writtenSig], [b, s.sig]]) list.forEach((d, i) => {
        const st = treble[sig > 0 ? 'sharps' : 'flats'][i];
        check(mod(st, 7) === order(sig)[i] && Math.abs(d.y - (yOf('treble', st) + GAP * 0.55)) < 0.01 && d.g === (sig > 0 ? '♯' : '♭'), `${where}: signature accidental ${i} of ${sig}`);
      });
      const hd = await heads('.sr-source');
      s.source.forEach((n, i) => check(hd[i] && Math.abs(hd[i].cy - yOf('treble', n.step)) < 0.01 && hd[i].acc === '', `${where}: written head ${i}`));
      check((await page.textContent('.sr-label')) === NAME_FR[I], `${where}: label`);
      if (round === 0 && dir) await page.screenshot({ path: `${dir}/sr-6-fr-dark.png` });
    }

    // Play: one wrong answer in round 0, then the right ones.
    if (s.kind === 'pick') {
      if (round === 0) { await page.click(`.sr-choices button:not([data-key="${s.answer}"])`); await page.waitForTimeout(150); }
      await page.click(`.sr-choices button[data-key="${s.answer}"]`);
    } else {
      if (round === 0) {
        await press(wrongKey(s));
        await page.waitForTimeout(150);
        check((await state()).pos === 0, `${where}: a wrong key moved on`);
      }
      for (let i = 0; i < s.exp.length; i++) {
        await press(s.exp[i]);
        await page.waitForTimeout(60);
        if (s.kind === 'motif') {
          const hd = await heads('.sr-target');
          check(hd.filter((x) => x.color !== 'transparent').length === i + 1, `${where}: ${i + 1} notes should be on the answer staff`);
          if (i === s.exp.length - 1) s.target.forEach((t, k) => checkHead(hd[k], 'treble', { step: t.step, acc: level === 6 ? 0 : t.acc }, `${where} answer ${k}`));
        }
      }
    }
    await page.waitForTimeout(250);
    const mine = (await attempts()).slice(before);
    check(mine.length === 1 && mine[0].ok === (round !== 0) && mine[0].level === level && mine[0].item === s.item && mine[0].skill === 'read.score', `${where}: logged ${JSON.stringify(mine.map((a) => [a.ok, a.item, a.skill, a.level]))}`);
    await ready();
  }
  if (level === 1) {
    // Nine clean answers: the "next level" button appears and works.
    check(await page.evaluate(() => getComputedStyle(document.querySelector('.sr-offer')).visibility === 'visible'), 'L1: no next-level button');
    await page.click('.sr-offer');
    await ready();
    check((await state()).level === 2, 'L1: next level does not work');
  }
  if (level === 2) check(seen.has('Eb') && seen.has('F'), `L2: instruments ${[...seen]}`);
  if (level === 3) check(seen.size >= 2, `L3: instruments ${[...seen]}`);
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `L${level}: overflow`);
  console.log(`L${level}`, [...seen].join(' '));
  if (dir) {
    await setup(level, 'en', 'light');
    if (level === 5 || level === 4) await page.screenshot({ path: `${dir}/sr-${level}-en-light.png` });
    if (level === 6) {
      const s = await state();
      check((await page.textContent('.sr-label')) === NAME_EN[s.inst], 'L6 en: label');
    }
    check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `L${level} en: overflow`);
    const bottom = await page.evaluate(() => Math.max(...[...document.querySelectorAll('.ml-keyboard, .sr-choices')].map((e) => e.getBoundingClientRect().bottom)));
    check(bottom <= 780, `L${level}: content below the screen (${bottom})`);
  }
}
check(!errors.length, 'console: ' + errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} failure(s)` : 'all good');
process.exit(failed ? 1 : 0);
