// Tests Make a tune: toggling, playback order, chords, scales, slots, reload, export / import, nothing logged.
// Usage: npx vite --port 5406 --strictPort &   then   PORT=5406 node tools/compose.test.mjs [screenshot-dir]
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
const ID = 'compose';
const base = `http://localhost:${process.env.PORT || 5406}/${ID}/`;
const dir = process.argv[2];
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'light', locale: 'fr-FR', hasTouch: true, acceptDownloads: true });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('FAIL', msg); } };
const state = () => page.evaluate(() => window.__test.state());
const cell = (s, r) => page.locator(`.cp-cell[data-step="${s}"][data-row="${r}"]`);
const start = async () => { await page.goto(base); await page.click('.ml-start'); await page.waitForSelector('.cp-cell'); };
const settings = (o) => page.evaluate(([id, o]) => { localStorage.setItem('ml:settings:' + id, JSON.stringify(o)); }, [ID, o]);
const tap = (s, r) => cell(s, r).dispatchEvent('pointerdown');

// Scales written by hand: semitones above C4 (60), six rows from the bottom.
const ROWS = {
  pentaMajor: [0, 2, 4, 7, 9, 12], pentaMinor: [0, 3, 5, 7, 10, 12], major: [0, 2, 4, 5, 7, 9],
  minor: [0, 2, 3, 5, 7, 8], blues: [0, 3, 5, 6, 7, 10],
};
const CH = { I: [48, 52, 55], IV: [53, 57, 60], V: [55, 59, 62], vi: [57, 60, 64] };

await page.goto(base);
await settings({ scale: 'pentaMajor', tempo: 200, chords: false });
await start();

// Every scale gives the right six rows.
for (const [sc, semis] of Object.entries(ROWS)) {
  await page.evaluate(([id, sc]) => localStorage.setItem('ml:settings:' + id, JSON.stringify({ scale: sc, tempo: 200, chords: false })), [ID, sc]);
  await page.reload(); await page.click('.ml-start'); await page.waitForSelector('.cp-cell');
  const s = await state();
  check(JSON.stringify(s.rows) === JSON.stringify(semis.map((x) => 60 + x)), `${sc}: rows ${s.rows}`);
}
await page.evaluate((id) => localStorage.setItem('ml:settings:' + id, JSON.stringify({ scale: 'pentaMajor', tempo: 200, chords: false })), ID);
await page.reload(); await page.click('.ml-start'); await page.waitForSelector('.cp-cell');

// Toggle: on, off, on.
await tap(0, 0);
check((await state()).cells[0].join() === '0', 'toggle on');
check(await cell(0, 0).evaluate((e) => e.classList.contains('cp-on')), 'cell drawn on');
await tap(0, 0);
check((await state()).cells[0].length === 0, 'toggle off');
const melody = [[0, 0], [1, 2], [2, 4], [3, 5], [4, 3], [5, 3], [6, 1], [7, 0], [8, 2], [9, 5], [12, 1], [12, 4], [15, 0]];
for (const [s, r] of melody) await tap(s, r);
let st = await state();
check(st.cells.flat().length === melody.length, 'cells set');

// Playback: the cursor moves, notes sound in step order (200 bpm = 300 ms a step).
await page.click('.cp-play');
await page.waitForFunction(() => window.__test.state().played.length >= 17, null, { timeout: 15000 });
st = await state();
check(st.playing, 'playing');
const want = (s) => st.cells[s].slice().sort((a, b) => a - b).map((r) => 60 + ROWS.pentaMajor[r]);
const pl = st.played.slice(0, 17);
check(pl.every((p, i) => p.step === i % 16), 'steps in order and looping');
check(pl.every((p) => JSON.stringify(p.notes) === JSON.stringify(want(p.step))), 'notes of each step: ' + JSON.stringify(pl.slice(0, 4)));
check(pl.every((p) => p.chord === null), 'no chord when the layer is off');
check(await page.locator('.cp-cell.cp-now').count() === ROWS.pentaMajor.length, 'cursor column drawn');
if (dir) await page.screenshot({ path: `${dir}/cp-play.png` });
await page.click('.cp-play');
st = await state();
check(!st.playing && st.step === -1, 'stopped');
check(await page.locator('.cp-cell.cp-now').count() === 0, 'cursor cleared');

// Chord layer: one block per bar, chord sounds on steps 0, 4, 8, 12.
await page.evaluate((id) => localStorage.setItem('ml:settings:' + id, JSON.stringify({ scale: 'pentaMajor', tempo: 200, chords: true })), ID);
await page.reload(); await page.click('.ml-start'); await page.waitForSelector('.cp-chord');
check((await page.locator('.cp-chord').allTextContents()).length === 4, 'four chord blocks');
await page.locator('.cp-chord').nth(1).click();
st = await state();
check(st.chords.join() === 'I,I,IV,V', 'chord block cycles vi -> I: ' + st.chords);
await page.click('.cp-play');
await page.waitForFunction(() => window.__test.state().played.length >= 16, null, { timeout: 15000 });
st = await state();
await page.click('.cp-play');
check(st.played.slice(0, 16).every((p) => (p.step % 4 === 0) === (p.chord !== null)), 'chords on bar starts only');
check(st.played.slice(0, 16).filter((p) => p.chord).every((p) => JSON.stringify(p.chord) === JSON.stringify(CH[st.chords[p.step / 4]])), 'chord notes ' + JSON.stringify(st.played.filter((p) => p.chord).map((p) => p.chord)));
if (dir) await page.screenshot({ path: `${dir}/cp-chords.png` });

// Slots: edit, switch, switch back, reload.
await page.click('.cp-slot[data-slot="2"]');
st = await state();
check(st.slot === 2 && st.cells.flat().length === 0, 'slot 2 empty');
await tap(3, 3); await tap(10, 1);
await page.click('.cp-slot[data-slot="1"]');
st = await state();
check(st.slot === 1 && st.cells.flat().length === melody.length, 'slot 1 kept its tune');
await page.reload(); await page.click('.ml-start'); await page.waitForSelector('.cp-cell');
st = await state();
check(st.slot === 1 && st.cells.flat().length === melody.length && st.cells[12].join() === '1,4', 'reload keeps slot 1: ' + JSON.stringify(st.cells));
check(st.chords.join() === 'I,I,IV,V', 'reload keeps chords');
await page.click('.cp-slot[data-slot="2"]');
st = await state();
check(JSON.stringify(st.cells.map((c) => c.join())) === JSON.stringify(Array.from({ length: 16 }, (_, i) => (i === 3 ? '3' : i === 10 ? '1' : ''))), 'slot 2 kept after reload');
await page.click('.cp-slot[data-slot="1"]');

// Export a file, clear, import it back.
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByText('Enregistrer').click()]);
const path = (dir || '/tmp') + '/tune.json';
await dl.saveAs(path);
const json = JSON.parse((await import('node:fs')).readFileSync(path, 'utf8'));
check(json.app === 'music-learnin' && json.kind === 'tune' && json.tune.cells.flat().length === melody.length && json.tune.scale === 'pentaMajor', 'export content');
check(/^music-learnin-tune-.*\.json$/.test(dl.suggestedFilename()), 'file name ' + dl.suggestedFilename());
await page.getByText('Effacer').click();
check((await state()).cells.flat().length === 0, 'clear');
await page.setInputFiles('.cp-file', path);
await page.waitForFunction(() => window.__test.state().cells.flat().length > 0);
st = await state();
check(st.cells.flat().length === melody.length && st.cells[15].join() === '0', 'import restores the tune');
// A wrong file is refused and changes nothing.
writeFileSync((dir || '/tmp') + '/bad.json', '{"hello":1}');
await page.setInputFiles('.cp-file', (dir || '/tmp') + '/bad.json');
await page.waitForTimeout(300);
check((await state()).cells.flat().length === melody.length, 'bad file changed the tune');

// Nothing is logged.
const logged = await page.evaluate((id) => new Promise((res) => { const r = indexedDB.open('music-learnin'); r.onsuccess = () => { const db = r.result; if (!db.objectStoreNames.contains('attempts')) return res(0); const q = db.transaction('attempts').objectStore('attempts').getAll(); q.onsuccess = () => res(q.result.filter((a) => a.game === id).length); }; }), ID);
check(logged === 0, `${logged} attempts logged`);

// English, dark, overflow.
await page.evaluate(() => { localStorage.setItem('ml:lang', 'en'); localStorage.setItem('ml:theme', 'dark'); });
await page.reload(); await page.click('.ml-start'); await page.waitForSelector('.cp-cell');
if (dir) await page.screenshot({ path: `${dir}/cp-en-dark.png` });
check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), 'overflow');
check(!errors.length, 'console: ' + errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} failure(s)` : 'all good');
process.exit(failed ? 1 : 0);
