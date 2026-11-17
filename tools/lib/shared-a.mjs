// Helpers shared by the tests of build-chords, build-scales, circle-of-fifths, compose, ear-*, echo-penta, find-a-note, form, harmony-lab,
// high-low, key-signatures, known-tunes (copy of the helpers of shared-b plus feedback checks).
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
    await p.waitForSelector(startSel, { timeout: 15000 });
    const tag = `${scheme}/${locale}`;
    const lang = await p.evaluate(() => document.documentElement.lang);
    check(lang === locale.slice(0, 2), `smoke ${tag}: html lang ${lang}`);
    titles[locale] = await p.$eval('.ml-title', (e) => e.textContent);
    bgs[scheme] = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    check(!(await overflows(p)), `smoke ${tag}: overflow before start`);
    await p.click(startSel);
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
    const g = groups.find((y) => Math.abs(y.when - x.when) < 0.004);
    if (g) g.f = Math.min(g.f, x.f); else groups.push({ when: x.when, f: x.f });
  }
  return groups.sort((a, b) => a.when - b.when).map((g) => ({ when: g.when, midi: Math.round(69 + 12 * Math.log2(g.f / 440)) }));
}

/** Feedback log of the shell (window.__fb, last 50 entries): kinds since index `from`. */
export const fbLog = (page) => page.evaluate(() => (window.__fb || []).map((f) => f.kind));
/** Waits for `n` more entries of window.__fb than `from`, returns the new kinds. */
export async function fbSince(page, from, n = 1, timeout = 5000) {
  await page.waitForFunction(([f, k]) => (window.__fb || []).length >= f + k, [from, n], { timeout }).catch(() => {});
  return (await fbLog(page)).slice(from);
}
/** Waits until the page state satisfies a predicate (string expression of `s`, the __test.state()), returns the state. */
export async function stateWhere(page, expr, timeout = 15000) {
  await page.waitForFunction((e) => { const s = window.__test?.state?.(); return s && new Function('s', 'return (' + e + ')')(s); }, expr, { timeout });
  return page.evaluate(() => window.__test.state());
}
export const pcs = (a) => [...new Set(a.map((m) => ((m % 12) + 12) % 12))].sort((x, y) => x - y);

/** Waits until the question changed (state JSON differs from `prev`); tolerates an identical redraw after `timeout`. */
export async function nextQuestion(page, prev, timeout = 8000) {
  await page.waitForFunction((p) => { const s = window.__test?.state?.(); return s && JSON.stringify(s) !== p; }, prev, { timeout }).catch(() => {});
  return page.evaluate(() => window.__test.state());
}

/** One question of a choice game, in one of three modes, with every kind of check:
 *   'right'  : right answer -> exactly one attempt (ok), feedback good (or streak)
 *   'wrong1' : one wrong answer -> one attempt (not ok), .ml-wrong on the button, feedback bad, then the right one -> nothing more is logged
 *   'wrong2' : two wrong answers (needs two wrong options) -> .ml-reveal on the right one after the 2nd miss, then the right one -> still one attempt
 *  o = { page, slug, level, skill, check, tag, s (state), mode, rightSel, wrongSels: [sel, sel] }  (selectors for page.click)
 *  Returns the next state. */
export async function answerChoice(o) {
  const { page, slug, level, skill, check, tag, s, mode, rightSel, wrongSels = [], click = (sel) => page.click(sel), wrongClass = 'ml-wrong', revealClass = 'ml-reveal' } = o;
  const prevJson = JSON.stringify(s);
  const before = (await readAttempts(page, slug)).length;
  const fb0 = (await fbLog(page)).length;
  const nWrong = mode === 'right' ? 0 : mode === 'wrong1' ? 1 : 2;
  for (let i = 0; i < nWrong; i++) {
    // the reveal can be short-lived (a hint on a key): record it with an observer instead of polling
    if (i === 1) await page.evaluate(([sel, cls]) => { window.__rv = false; const el = document.querySelector(sel); const chk = () => { if (el.classList.contains(cls)) window.__rv = true; }; chk(); new MutationObserver(chk).observe(el, { attributes: true, attributeFilter: ['class'] }); }, [rightSel, revealClass]);
    await click(wrongSels[i]);
    const k = await fbSince(page, fb0 + i, 1);
    check(k[0] === 'bad', `${tag}: wrong answer #${i + 1} gave feedback ${k[0]}`);
    if (wrongClass) check(await page.$eval(wrongSels[i], (b, c) => b.classList.contains(c), wrongClass).catch(() => false), `${tag}: wrong button #${i + 1} not marked ${wrongClass}`);
    if (i === 0) check(!(await page.$(`${rightSel}.${revealClass}`)), `${tag}: answer revealed after the first miss`);
  }
  if (nWrong === 2) {
    await page.waitForFunction(() => window.__rv, null, { timeout: 3000 }).catch(() => {});
    check(await page.evaluate(() => window.__rv), `${tag}: right answer not revealed after the second miss`);
  }
  await click(rightSel);
  const k = await fbSince(page, fb0 + nWrong, 1);
  check(k[0] === 'good' || k[0] === 'streak' || k[0] === 'level', `${tag}: right answer gave feedback ${k[0]}`);
  const mine = await newAttempts(page, slug, before, 1);
  const want = mode === 'right';
  check(mine.length === 1 && mine[0].ok === want && mine[0].game === slug && mine[0].level === level && mine[0].skill === skill && mine[0].item === s.item && mine[0].item != null,
    `${tag}: log ${JSON.stringify(mine.map((a) => [a.game, a.skill, a.ok, a.level, a.item]))} (want ok=${want} L${level} ${skill} ${s.item})`);
  return nextQuestion(page, prevJson);
}

/** Plays `max` right answers on the current question flow until the "next level" button is visible, taps it,
 *  and checks the level changed and was saved. Returns false if the button never showed. */
export async function levelUpCheck({ page, slug, level, check, rightSelOf, nextSel, max = 14, last = false, celebrate = false, click = (sel) => page.click(sel) }) {
  let s = await page.evaluate(() => window.__test.state());
  const fb0 = (await fbLog(page)).length;
  for (let i = 0; i < max; i++) {
    const shown = await isShown(page, nextSel);
    if (shown) break;
    await click(rightSelOf(s));
    s = await nextQuestion(page, JSON.stringify(s));
  }
  const shown = await isShown(page, nextSel);
  if (last) {
    check(!shown, `L${level}: next-level button offered on the last level`);
    if (celebrate) check((await fbLog(page)).includes('level'), `L${level}: no celebration after a clean streak on the last level`);
    return;
  }
  check(shown, `L${level}: no next-level button after a clean streak`);
  if (!shown) return;
  await page.click(nextSel);
  await page.waitForFunction((l) => window.__test.state()?.level === l, level + 1, { timeout: 8000 }).catch(() => {});
  check((await savedSettings(page, slug)).level === level + 1, `L${level}: next-level button did not save level ${level + 1}`);
  check((await page.evaluate(() => window.__test.state()?.level)) === level + 1, `L${level}: state level after next-level tap`);
}

/** True when the element exists and is visible (display, visibility, opacity, size). */
export const isShown = (page, sel) => page.$eval(sel, (b) => { const c = getComputedStyle(b); return c.display !== 'none' && c.visibility !== 'hidden' && +c.opacity > 0.1 && b.getBoundingClientRect().height > 0; }).catch(() => false);
