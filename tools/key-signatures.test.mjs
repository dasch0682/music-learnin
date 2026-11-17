// Plays every level of Key signatures: one wrong answer, then the right one. Checks the theory and the drawing too.
// Usage: npx vite --port 5305 --strictPort &   then   PORT=5305 node tools/key-signatures.test.mjs [screenshot-dir]
import { launch, FAST, rounds, levels, combos } from './lib/harness.mjs';
const ID = 'key-signatures';
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
const SHARPS = 'F C G D A E B', FLATS = 'B E A D G C F';
const MAJOR = { '-7': 'C♭', '-6': 'G♭', '-5': 'D♭', '-4': 'A♭', '-3': 'E♭', '-2': 'B♭', '-1': 'F', 0: 'C', '+1': 'G', '+2': 'D', '+3': 'A', '+4': 'E', '+5': 'B', '+6': 'F♯', '+7': 'C♯' };
const MINOR = { '-7': 'A♭', '-6': 'E♭', '-5': 'B♭', '-4': 'F', '-3': 'C', '-2': 'G', '-1': 'D', 0: 'A', '+1': 'E', '+2': 'B', '+3': 'F♯', '+4': 'C♯', '+5': 'G♯', '+6': 'D♯', '+7': 'A♯' };
const FR = { C: 'Do', D: 'Ré', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const name = (sig, minor, lang) => {
  const k = (minor ? MINOR : MAJOR)[sig];
  return (lang === 'fr' ? FR[k[0]] + k.slice(1) : k) + ' ' + (lang === 'fr' ? (minor ? 'mineur' : 'majeur') : (minor ? 'minor' : 'major'));
};
const pcOf = (k) => (PC[k[0]] + (k[1] === '♯' ? 1 : k[1] === '♭' ? -1 : 0) + 12) % 12;
// Where each accidental of the signature sits, per clef (scientific pitch names), and the bottom line of the staff.
const PLACES = {
  treble: { sharps: 'F5 C5 G5 D5 A4 E5 B4', flats: 'B4 E5 A4 D5 G4 C5 F4', bottom: 'E4' },
  bass: { sharps: 'F3 C3 G3 D3 A2 E3 B2', flats: 'B2 E3 A2 D3 G2 C3 F2', bottom: 'G2' },
  alto: { sharps: 'F4 C4 G4 D4 A3 E4 B3', flats: 'B3 E4 A3 D4 G3 C4 F3', bottom: 'F3' },
  tenor: { sharps: 'F3 C4 G3 D4 A3 E4 B3', flats: 'B3 E4 A3 D4 G3 C4 F3', bottom: 'D3' },
};
const stepOf = (n) => +n[1] * 7 + 'CDEFGAB'.indexOf(n[0]);
const GAP = 12, TOP = GAP * 5.5;
const yOf = (clef, step) => TOP + GAP * 4 - ((step - stepOf(PLACES[clef].bottom)) * GAP) / 2;
const alteredBy = (sig) => (+sig > 0 ? SHARPS : FLATS).split(' ').slice(0, Math.abs(+sig));

console.log('order of sharps:', SHARPS, '| order of flats:', FLATS);
for (const sig of Object.keys(MAJOR).sort((a, b) => a - b)) console.log(sig.padStart(2), '|', name(sig, false, 'en').padEnd(9), '|', name(sig, false, 'fr').padEnd(11), '|', name(sig, true, 'en').padEnd(9), '|', name(sig, true, 'fr').padEnd(11), '|', alteredBy(sig).join(' '));

/** Reads a drawn signature: glyph and vertical place of each accidental. */
const readSig = (sel) => page.evaluate((s) => [...document.querySelectorAll(s + ' .ml-keysig')].map((t) => ({ g: t.textContent, x: +t.getAttribute('x'), y: +t.getAttribute('y') })), sel);
function checkSig(drawn, clef, sig, where) {
  const n = Math.abs(+sig);
  const want = PLACES[clef][+sig > 0 ? 'sharps' : 'flats'].split(' ').slice(0, n);
  check(drawn.length === n, `${where}: ${drawn.length} accidentals drawn for ${sig}`);
  drawn.forEach((d, i) => {
    check(d.g === (+sig > 0 ? '♯' : '♭'), `${where}: glyph ${d.g} for ${sig}`);
    check(Math.abs(d.y - (yOf(clef, stepOf(want[i])) + GAP * 0.55)) < 0.01, `${where}: accidental ${i + 1} of ${sig} in ${clef} clef is not on ${want[i]}`);
    check(i === 0 || d.x > drawn[i - 1].x, `${where}: accidentals not from left to right`);
  });
}

async function setup(level, lang, theme) {
  await page.evaluate(([id, l, lg, th]) => { localStorage.setItem('ml:settings:' + id, JSON.stringify({ level: l, sound: true })); localStorage.setItem('ml:lang', lg); localStorage.setItem('ml:theme', th); }, [ID, level, lang, theme]);
  await page.reload();
  await page.waitForFunction(() => window.__test?.state() && !window.__test.state().locked);
}
const state = () => page.evaluate(() => window.__test.state());
const ready = () => page.waitForFunction(() => !window.__test.state().locked, null, { timeout: 8000 });

await page.goto(base);
await page.waitForFunction(() => window.__test?.theory);
// The game's own tables against the hand-written ones.
const th = await page.evaluate(() => window.__test.theory());
check(th.sharps === SHARPS && th.flats === FLATS, `orders: ${th.sharps} / ${th.flats}`);
for (const k of th.keys) {
  check(k.major.en === name(k.sig, false, 'en') && k.major.fr === name(k.sig, false, 'fr'), `major of ${k.sig}: ${k.major.en} / ${k.major.fr}`);
  check(k.minor.en === name(k.sig, true, 'en') && k.minor.fr === name(k.sig, true, 'fr'), `minor of ${k.sig}: ${k.minor.en} / ${k.minor.fr}`);
  check(k.altered === alteredBy(k.sig).join(' '), `altered notes of ${k.sig}: ${k.altered}`);
  const want = (root, steps) => steps.map((s) => (root + s) % 12).join();
  check(k.scaleMajor.map((m) => m % 12).join() === want(pcOf(MAJOR[k.sig]), [0, 2, 4, 5, 7, 9, 11, 12]), `major scale of ${k.sig}`);
  check(k.scaleMinor.map((m) => m % 12).join() === want(pcOf(MINOR[k.sig]), [0, 2, 3, 5, 7, 8, 10, 12]), `minor scale of ${k.sig}`);
  // The scale holds exactly the notes of the signature.
  const pcs = 'CDEFGAB'.split('').map((l) => (PC[l] + (alteredBy(k.sig).includes(l) ? Math.sign(+k.sig) : 0) + 12) % 12).sort((a, b) => a - b).join();
  check([...new Set(k.scaleMajor.map((m) => m % 12))].sort((a, b) => a - b).join() === pcs, `notes of the major scale of ${k.sig}`);
  check([...new Set(k.scaleMinor.map((m) => m % 12))].sort((a, b) => a - b).join() === pcs, `notes of the minor scale of ${k.sig}`);
}

for (const level of levels(6)) {
  await setup(level, 'fr', 'dark');
  const seen = new Set(), kinds = new Set(), clefs = new Set();
  const nRounds = level === 1 ? 10 : rounds(level === 6 ? 24 : 8, 2); // level 1 keeps its clean streak (next-level button)
  for (let round = 0; round < nRounds; round++) {
    await ready();
    const s = await state();
    seen.add(s.item); kinds.add(s.kind); clefs.add(s.clef);
    const where = `L${level} round ${round} (${s.item}, ${s.kind})`;
    check(s.level === level, `${where}: level ${s.level}`);
    const max = level === 1 ? 2 : level <= 3 ? 4 : 7;
    check(Math.abs(s.sig) <= max, `${where}: signature out of the level`);
    check(s.item === s.answer + (s.kind === 'note' ? ':n' : s.minor ? ':m' : ''), `${where}: item`);
    check(s.minor === (level === 5) || level === 6, `${where}: mode`);
    check(level === 6 || s.clef === 'treble', `${where}: clef ${s.clef}`);
    if (s.kind !== 'sig') checkSig(await readSig('.ks-staff'), s.clef, s.answer, where);
    const before = (await attempts()).length;
    const shot = async () => { if (dir && (round === 0 || (level === 6 && kinds.size === 2 && !seen.has('shot2') && seen.add('shot2')))) await page.screenshot({ path: `${dir}/ks-${level}-fr-dark${round ? '-b' : ''}.png` }); };
    if (s.kind === 'note') {
      // The note is drawn without accidental; the expected key follows the signature.
      const letter = 'CDEFGAB'[s.step % 7];
      const want = (Math.floor(s.step / 7) + 1) * 12 + PC[letter] + (alteredBy(s.answer).includes(letter) ? Math.sign(s.sig) : 0);
      check(s.midi === want, `${where}: expected key ${s.midi}, should be ${want}`);
      const head = await page.evaluate(() => { const g = document.querySelector('.ks-staff .ml-note'); return { cy: +g.querySelector('ellipse').getAttribute('cy'), texts: g.querySelectorAll('text').length }; });
      check(Math.abs(head.cy - yOf('treble', s.step)) < 0.01 && head.texts === 0, `${where}: note head ${JSON.stringify(head)}`);
      check(await page.locator('.ml-white').count() <= 12, `${where}: too many keys`);
      await shot();
      if (round === 0) {
        await page.locator(`.ml-key[data-midi="${s.midi >= 76 ? s.midi - 1 : s.midi + 1}"]`).dispatchEvent('pointerdown', { pointerId: 1 });
        await page.waitForTimeout(200);
        if (dir) await page.screenshot({ path: `${dir}/ks-${level}-wrong.png` });
      }
      await page.locator(`.ml-key[data-midi="${s.midi}"]`).dispatchEvent('pointerdown', { pointerId: 1 });
      await page.locator(`.ml-key[data-midi="${s.midi}"]`).dispatchEvent('pointerup', { pointerId: 1 });
    } else {
      check(s.options.length === 4 && new Set(s.options).size === 4 && s.options.includes(s.answer), `${where}: options ${s.options}`);
      const buttons = await page.evaluate(() => [...document.querySelectorAll('.ks-choices button')].map((b) => ({ sig: b.dataset.sig, text: b.textContent, w: b.getBoundingClientRect().width, h: b.getBoundingClientRect().height })));
      check(buttons.every((b) => b.w >= 100 && b.h >= 60), `${where}: small targets`);
      if (s.kind === 'name') buttons.forEach((b) => check(b.text === name(b.sig, s.minor, 'fr'), `${where}: label "${b.text}" for ${b.sig}`));
      else {
        check((await page.textContent('.ks-prompt')) === name(s.answer, s.minor, 'fr'), `${where}: prompt`);
        for (const b of buttons) checkSig(await readSig(`.ks-choices button[data-sig="${b.sig}"]`), s.clef, b.sig, `${where} choice ${b.sig}`);
      }
      await shot();
      if (round === 0) {
        await page.click(`.ks-choices button:not([data-sig="${s.answer}"])`);
        await page.waitForTimeout(150);
      }
      await page.click(`.ks-choices button[data-sig="${s.answer}"]`);
    }
    await page.waitForTimeout(250);
    const mine = (await attempts()).slice(before);
    check(mine.length === 1 && mine[0].ok === (round !== 0) && mine[0].level === level && mine[0].item === s.item && mine[0].skill === 'read.keysig', `${where}: logged ${JSON.stringify(mine.map((a) => [a.ok, a.item, a.skill]))}`);
    await page.waitForFunction((it) => { const st = window.__test.state(); return !st.locked && (st.streak === 0 || st.item !== it || true); }, s.item, { timeout: 8000 });
    await page.waitForTimeout(level <= 2 ? 650 : 100);
  }
  if (level === 1) {
    // Nine clean answers: the "next level" button appears and works.
    check(await page.evaluate(() => getComputedStyle(document.querySelector('.ks-offer')).visibility === 'visible'), 'L1: no next-level button');
    if (dir) await page.screenshot({ path: `${dir}/ks-1-offer.png` });
    await page.click('.ks-offer');
    await ready();
    check((await state()).level === 2, 'L1: next level does not work');
  }
  if (level === 6 && !FAST) check(kinds.has('name') && kinds.has('sig') && clefs.size >= 3, `L6: kinds ${[...kinds]} clefs ${[...clefs]}`);
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `L${level}: overflow`);
  console.log(`L${level}`, [...seen].filter((x) => x !== 'shot2').join(' '), '|', [...kinds].join(' '), '|', [...clefs].join(' '));
  if (dir) {
    await setup(level, 'en', 'light');
    for (let i = 0; i < (level === 6 ? 2 : 1); i++) {
      // At level 6, one picture of each kind of question.
      for (let k = 0; level === 6 && k < 30 && (await state()).kind !== (i ? 'sig' : 'name'); k++) { await page.reload(); await page.waitForFunction(() => window.__test?.state() && !window.__test.state().locked); }
      const s = await state();
      if (s.kind === 'name') for (const b of await page.evaluate(() => [...document.querySelectorAll('.ks-choices button')].map((x) => ({ sig: x.dataset.sig, text: x.textContent })))) check(b.text === name(b.sig, s.minor, 'en'), `L${level} en: label "${b.text}" for ${b.sig}`);
      await page.screenshot({ path: `${dir}/ks-${level}-en-light${i ? '-b' : ''}.png` });
    }
    check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `L${level} en: overflow`);
  }
}
check(!errors.length, 'console: ' + errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} failure(s)` : 'all good');
process.exit(failed ? 1 : 0);
