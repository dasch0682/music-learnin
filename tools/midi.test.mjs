// Tests the Web MIDI input of the core keyboards (fake requestMIDIAccess injected), the no-MIDI and refused cases, and the piano timbre.
// Usage: npx vite --port 5402 --strictPort &   then   PORT=5402 node tools/midi.test.mjs [screenshot-dir]
import { launch, FAST, rounds, levels, combos, CORE } from './lib/harness.mjs';
const base = `http://localhost:${process.env.PORT || 5402}/play-scales/`;
const browser = await launch();
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('FAIL', msg); } };

// mode: 'fake' (one device), 'none' (no Web MIDI at all), 'refused' (requestMIDIAccess rejects), 'late' (device plugged in after start)
const FAKE = (mode) => `(() => {
  const mode = ${JSON.stringify(mode)};
  if (mode === 'none') { try { delete Navigator.prototype.requestMIDIAccess; } catch {} navigator.requestMIDIAccess = undefined; return; }
  if (mode === 'refused') { navigator.requestMIDIAccess = () => Promise.reject(new DOMException('denied', 'SecurityError')); return; }
  const inputs = new Map();
  const access = { inputs, onstatechange: null };
  const dev = { id: 'fake1', name: 'Fake keys', onmidimessage: null };
  window.__midiCalls = 0;
  if (mode === 'fake') inputs.set(dev.id, dev);
  window.__plug = () => { inputs.set(dev.id, dev); access.onstatechange?.({ port: dev }); };
  window.__midi = (...bytes) => dev.onmidimessage?.({ data: new Uint8Array(bytes) });
  navigator.requestMIDIAccess = () => { window.__midiCalls++; return Promise.resolve(access); };
})();`;

async function open(mode, fr = 'fr') {
  const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'light', locale: fr + '-FR', hasTouch: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(FAKE(mode));
  await page.addInitScript(() => { localStorage.setItem('ml:settings:play-scales', JSON.stringify({ level: 1, model: false })); });
  await page.goto(base);
  await page.click('.ml-start');
  await page.waitForFunction(() => window.__test.state().expected.length && !window.__test.state().locked, null, { timeout: 15000 });
  return { page, errors };
}
const st = (page) => page.evaluate(() => window.__test.state());

// 1. A device: note-on lights the key and plays the scale; a wrong note counts once; note-off clears.
{
  const { page, errors } = await open('fake');
  check(await page.evaluate(() => window.__midiCalls) === 1, 'requestMIDIAccess not called once');
  const s = await st(page);
  const [a, b] = s.expected;
  await page.evaluate((m) => window.__midi(0x90, m, 90), a);
  check(await page.$eval(`.ps-kb [data-midi="${a}"]`, (k) => k.classList.contains('ml-down')), 'key not lit on note-on');
  check((await st(page)).idx === 1, 'first MIDI note did not advance');
  await page.evaluate((m) => window.__midi(0x80, m, 0), a);
  check(!(await page.$eval(`.ps-kb [data-midi="${a}"]`, (k) => k.classList.contains('ml-down'))), 'key still lit after note-off');
  // Note-on with velocity 0 is a note-off.
  await page.evaluate((m) => window.__midi(0x90, m, 100), b);
  check((await st(page)).idx === 2, 'second MIDI note did not advance');
  await page.evaluate((m) => window.__midi(0x90, m, 0), b);
  check(!(await page.$eval(`.ps-kb [data-midi="${b}"]`, (k) => k.classList.contains('ml-down'))), 'velocity-0 note-on did not release');
  // Wrong note, a note outside the keyboard, a control change.
  const wrong = s.win[0] === s.expected[2] ? s.win[0] + 1 : s.win[0];
  await page.evaluate((m) => window.__midi(0x90, m, 90), wrong === s.expected[2] ? wrong + 1 : wrong);
  check((await st(page)).wrongLogged, 'wrong MIDI note not counted');
  await page.evaluate(() => { window.__midi(0x90, 20, 90); window.__midi(0xb0, 64, 127); });
  check((await st(page)).idx === 2, 'out-of-range note or CC moved the game');
  await page.evaluate(() => window.__midi(0x80, 20, 0));
  // The rest of the scale by MIDI.
  for (const m of s.expected.slice(2)) await page.evaluate((x) => { window.__midi(0x90, x, 80); window.__midi(0x80, x, 0); }, m);
  await page.waitForTimeout(200);
  const at = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('music-learnin'); r.onsuccess = () => { const q = r.result.transaction('attempts').objectStore('attempts').getAll(); q.onsuccess = () => res(q.result.filter((x) => x.game === 'play-scales').sort((u, v) => u.t - v.t).map((x) => [x.ok, x.skill])); }; }));
  check(JSON.stringify(at) === JSON.stringify([[false, 'play.scales'], [true, 'play.scales']]), 'attempts after MIDI play: ' + JSON.stringify(at));
  check(!errors.length, 'console (fake): ' + errors.join(' | '));
  await page.close();
}

// 2. Plugged in later (hot plug), and a replaced keyboard stops listening.
{
  const { page, errors } = await open('late');
  const s = await st(page);
  await page.evaluate((m) => window.__midi?.(0x90, m, 90), s.expected[0]);
  check((await st(page)).idx === 0, 'no device yet but a note moved the game');
  await page.evaluate(() => window.__plug());
  await page.evaluate((m) => window.__midi(0x90, m, 90), s.expected[0]);
  check((await st(page)).idx === 1, 'hot-plugged device ignored');
  check(!errors.length, 'console (late): ' + errors.join(' | '));
  await page.close();
}

// 3. Pads light on MIDI too.
{
  const { page, errors } = await open('fake');
  const lit = await page.evaluate(async (CORE) => {
    const { createPads } = await import(CORE + '/keyboard.js');
    const box = document.createElement('div'); document.body.append(box);
    const got = [];
    const pads = createPads(box, { notes: [60, 62, 64], onDown: (m) => got.push(['d', m]), onUp: (m) => got.push(['u', m]) });
    window.__midi(0x90, 62, 90);
    const on = box.querySelector('[data-midi="62"]').classList.contains('ml-down');
    window.__midi(0x80, 62, 0);
    const off = !box.querySelector('[data-midi="62"]').classList.contains('ml-down');
    window.__midi(0x90, 61, 90);
    pads.setEnabled(false);
    window.__midi(0x90, 64, 90);
    return { on, off, got, other: box.querySelectorAll('.ml-down').length };
  }, CORE);
  check(lit.on && lit.off, 'pads not lit / released: ' + JSON.stringify(lit));
  check(JSON.stringify(lit.got) === '[["d",62],["u",62]]', 'pad callbacks: ' + JSON.stringify(lit.got));
  check(lit.other === 0, 'unknown or disabled pad lit');
  check(!errors.length, 'console (pads): ' + errors.join(' | '));
  await page.close();
}

// 4. No Web MIDI, and a refusal: everything works with touch, nothing in the console.
for (const mode of ['none', 'refused']) {
  const { page, errors } = await open(mode);
  const s = await st(page);
  const box = await page.locator(`.ps-kb [data-midi="${s.expected[0]}"]`).boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.4);
  check((await st(page)).idx === 1, `${mode}: touch does not work`);
  await page.waitForTimeout(100);
  check(!errors.length, `console (${mode}): ` + errors.join(' | '));
  await page.close();
}

// 5. Piano timbre: plays, returns the usual end time, and the graph is built without error for the whole range.
{
  const { page, errors } = await open('none');
  const r = await page.evaluate(async (CORE) => {
    const { playNote, playChord, audio } = await import(CORE + '/audio.js');
    const ctx = audio();
    const out = [];
    for (const m of [21, 40, 60, 84, 108]) {
      const end = playNote(m, { dur: 0.6, timbre: 'piano' });
      out.push(+(end - ctx.currentTime).toFixed(2));
    }
    playChord([60, 64, 67], { timbre: 'piano' });
    for (const t of ['pad', 'pluck', 'bass', 'voice']) playNote(60, { timbre: t });
    return out;
  }, CORE);
  check(r.every((x) => Math.abs(x - 0.85) < 0.05), 'piano end time: ' + r);
  check(!errors.length, 'console (audio): ' + errors.join(' | '));
  await page.close();
}

await browser.close();
console.log(failed ? `${failed} failure(s)` : 'all good');
process.exit(failed ? 1 : 0);
