// Small helpers shared by the tests of melody-dictation, music-words, penta-jam, play-chords, play-scales, play-the-note,
// read-intervals, read-melody, rhythm-dictation, second-voice, sight-sing, sing-match, tap-rhythm, two-hands, two-voices.
// (Does not touch harness.mjs.)
import { FAST } from './harness.mjs';
import { GAMES } from '../../packages/core/taxonomy.js';

/** Skill id the taxonomy gives to a level of a game. */
export const skillOf = (slug, level) => GAMES.find((g) => g.id === slug).levels[level - 1];
export const levelCount = (slug) => GAMES.find((g) => g.id === slug).levels.length;

/** check()/failed counter + console error collector for a page. */
export function makeChecker() {
  const o = { failed: 0, errors: [] };
  o.check = (ok, msg) => { if (!ok) { o.failed++; console.log('FAIL', msg); } };
  o.watch = (page) => {
    page.on('pageerror', (e) => o.errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') o.errors.push(m.text()); });
  };
  return o;
}

export const overflows = (page) => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);

/** Attempts of one game from IndexedDB, oldest first. Waits for the app (window.__test) before opening the database. */
export async function readAttempts(page, game) {
  await page.waitForFunction(() => window.__test, null, { timeout: 15000 });
  return page.evaluate((g) => new Promise((res) => {
    const r = indexedDB.open('music-learnin');
    r.onsuccess = () => {
      const q = r.result.transaction('attempts').objectStore('attempts').getAll();
      q.onsuccess = () => { r.result.close(); res(q.result.filter((a) => a.game === g).sort((x, y) => x.t - y.t)); };
    };
  }), game);
}

/** Waits until `n` more attempts than `before` are logged (or the timeout), returns the new ones. */
export async function newAttempts(page, game, before, n = 1, timeout = 6000) {
  const t0 = Date.now();
  for (;;) {
    const all = await readAttempts(page, game);
    if (all.length >= before + n || Date.now() - t0 > timeout) return all.slice(before);
    await new Promise((r) => setTimeout(r, 80));
  }
}

/** Page load in both themes and languages: no console error, no overflow at 390 px, translated title, theme applied.
 *  Full: the 4 combinations. Fast: 2 (light/fr, dark/en). `prep(page)` may run after the start button. */
export async function smoke({ browser, url, check, prep, startSel = '.ml-start' }) {
  const list = FAST ? [['light', 'fr-FR'], ['dark', 'en-US']] : [['light', 'fr-FR'], ['dark', 'en-US'], ['light', 'en-US'], ['dark', 'fr-FR']];
  const titles = {}, bgs = {};
  for (const [scheme, locale] of list) {
    const p = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: scheme, locale });
    const errs = [];
    p.on('pageerror', (e) => errs.push(String(e)));
    p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(url);
    await p.waitForSelector(startSel || '.ml-title', { timeout: 15000 });
    const tag = `${scheme}/${locale}`;
    const lang = await p.evaluate(() => document.documentElement.lang);
    check(lang === locale.slice(0, 2), `smoke ${tag}: html lang ${lang}`);
    titles[locale] = await p.$eval('.ml-title', (e) => e.textContent);
    bgs[scheme] = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    check(!(await overflows(p)), `smoke ${tag}: overflow before start`);
    if (startSel) await p.click(startSel);
    await p.waitForFunction(() => window.__test, null, { timeout: 15000 });
    await p.waitForTimeout(400);
    if (prep) await prep(p, tag);
    check(!(await overflows(p)), `smoke ${tag}: overflow after start`);
    check(errs.length === 0, `smoke ${tag}: console ${errs.join(' | ')}`);
    await p.close();
  }
  if (titles['fr-FR'] && titles['en-US']) check(titles['fr-FR'] !== titles['en-US'], `smoke: title not translated (${titles['fr-FR']})`);
  if (bgs.light && bgs.dark) check(bgs.light !== bgs.dark, `smoke: dark theme not applied (${bgs.light})`);
}

/** Opens the settings dialog and changes field #index (order of config.settings). kind: 'select' | 'toggle' | 'range'. */
export async function setField(page, index, value) {
  if (!(await page.$('dialog.ml-settings[open]'))) {
    await page.click('.ml-bar button.ml-icon');
    await page.waitForSelector('dialog.ml-settings[open]');
  }
  await page.evaluate(([i, v]) => {
    const f = document.querySelectorAll('dialog.ml-settings label.ml-field')[i];
    const sel = f.querySelector('select'), chk = f.querySelector('input[type=checkbox]'), rng = f.querySelector('input[type=range]');
    if (sel) { sel.value = String(v); sel.dispatchEvent(new Event('change')); }
    else if (chk) { chk.checked = !!v; chk.dispatchEvent(new Event('change')); }
    else { rng.value = v; rng.dispatchEvent(new Event('input')); rng.dispatchEvent(new Event('change')); }
  }, [index, value]);
}
export const closeSettings = (page) => page.evaluate(() => document.querySelector('dialog.ml-settings')?.close());
export const savedSettings = (page, slug) => page.evaluate((s) => JSON.parse(localStorage.getItem('ml:settings:' + s) || '{}'), slug);

/** Changes settings through the dialog, reloads, and checks they are saved and still applied. `fields`: [[index, key, value]].
 *  `applied(page)` may return an error string (or '' when the page reflects the settings). */
export async function persistCheck({ page, url, slug, fields, check, applied, start = true }) {
  for (const [i, , v] of fields) await setField(page, i, v);
  await closeSettings(page);
  const saved = await savedSettings(page, slug);
  for (const [, k, v] of fields) check(String(saved[k]) === String(v), `${slug}: setting ${k} not saved (${saved[k]} vs ${v})`);
  await page.reload();
  if (start) await page.click('.ml-start');
  await page.waitForFunction(() => window.__test, null, { timeout: 15000 });
  await page.waitForTimeout(300);
  const after = await savedSettings(page, slug);
  for (const [, k, v] of fields) check(String(after[k]) === String(v), `${slug}: setting ${k} lost after reload (${after[k]})`);
  if (applied) { const e = await applied(page); check(!e, `${slug}: setting not applied after reload: ${e}`); }
}

/** Records every audio source started by the page (call before goto). Read back with playedNotes(). */
export async function recordAudio(page) {
  await page.context().addInitScript(() => {
    window.__starts = [];
    const p = AudioScheduledSourceNode.prototype, o = p.start;
    p.start = function (w) {
      try { window.__starts.push({ now: this.context.currentTime, when: w ?? this.context.currentTime, f: this.frequency ? this.frequency.value : 0 }); } catch { /* ignore */ }
      return o.apply(this, arguments);
    };
  });
}
/** Notes played since the last call: [{ when (s), midi }] (one per onset, lowest partial). */
export async function playedNotes(page, reset = true) {
  const s = await page.evaluate((r) => { const a = window.__starts.slice(); if (r) window.__starts.length = 0; return a; }, reset);
  const groups = [];
  for (const x of s.filter((x) => x.f > 20)) {
    const g = groups.find((y) => Math.abs(y.when - x.when) < 0.05);
    if (g) g.f = Math.min(g.f, x.f); else groups.push({ when: x.when, f: x.f });
  }
  return groups.sort((a, b) => a.when - b.when).map((g) => ({ when: g.when, midi: Math.round(69 + 12 * Math.log2(g.f / 440)) }));
}
/** Waits until at least n onsets were recorded (without clearing), returns them. */
export async function waitPlayed(page, n, timeout = 10000) {
  const t0 = Date.now();
  for (;;) {
    const p = await playedNotes(page, false);
    if (p.length >= n || Date.now() - t0 > timeout) return p;
    await new Promise((r) => setTimeout(r, 100));
  }
}
