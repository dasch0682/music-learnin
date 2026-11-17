// Shared helper of the game tests (see tools/README.md).
//   const browser = await launch();              // one Chrome: shared when started by test-all.mjs (PW_WS), else its own
//   const page = await browser.newPage({ colorScheme: 'dark', locale: 'en-US' });   // one isolated context per page
//   rounds(8, 2)   -> 8 in full mode, 2 in fast mode        levels(6) -> [1..6] in full mode, [1, 3, 6] in fast mode
//   combos([a, b]) -> both in full mode, the first one in fast mode
// FAST=1 (npm run test:fast): the timers of the page run `speed` times faster (setTimeout/setInterval delays are divided),
// so waits on audio playback shrink. A test that needs real time calls launch({ speed: 1 }).
import { chromium } from 'playwright-core';

export const FAST = /^(1|true|yes)$/i.test(process.env.FAST || '');
export const rounds = (full, fast) => (FAST ? fast : full);
export const levels = (n, fast) => (FAST ? (fast || [...new Set([1, Math.ceil(n / 2), n])]) : Array.from({ length: n }, (_, i) => i + 1));
export const combos = (list) => (FAST ? list.slice(0, 1) : list);
export const port = (dflt) => process.env.PORT || dflt;
export const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
export const ARGS = ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'];

const DEFAULT_SPEED = Number(process.env.FAST_SPEED) || 5;
// Divides the delay of every setTimeout/setInterval of the page (short ones, up to 20 ms, are kept).
const speedScript = (f) => `(() => { const f = ${f}, st = window.setTimeout, si = window.setInterval;
  const sc = (d) => (d > 20 ? d / f : d);
  window.setTimeout = (fn, d, ...a) => st(fn, sc(+d || 0), ...a);
  window.setInterval = (fn, d, ...a) => si(fn, sc(+d || 0), ...a); })();`;

export async function launch({ speed = FAST ? DEFAULT_SPEED : 1 } = {}) {
  const shared = !!process.env.PW_WS;
  const browser = shared ? await chromium.connect(process.env.PW_WS) : await chromium.launch({ executablePath: CHROME, args: ARGS });
  const ctxs = [];
  const newContext = async (opts = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, colorScheme: 'light', locale: 'fr-FR', ...opts });
    ctxs.push(ctx);
    if (speed > 1) {
      await ctx.addInitScript(speedScript(speed));
      // waits written in the test follow the same clock
      const np = ctx.newPage.bind(ctx);
      ctx.newPage = async () => { const p = await np(); const w = p.waitForTimeout.bind(p); p.waitForTimeout = (ms) => w(ms >= 100 ? Math.max(50, ms / speed) : ms); return p; };
    }
    return ctx;
  };
  return {
    speed, shared, newContext,
    newPage: async (opts) => (await newContext(opts)).newPage(),
    close: async () => { for (const c of ctxs) await c.close().catch(() => {}); await browser.close().catch(() => {}); },
  };
}

/** Dev-server URL prefix of packages/core (for dynamic imports inside page.evaluate). */
import { fileURLToPath as _f } from 'node:url';
import { resolve as _r, dirname as _d } from 'node:path';
export const CORE = '/@fs' + _r(_d(_f(import.meta.url)), '../../packages/core');

// ---------------------------------------------------------------------------------------------------------------
// Robust helpers (additive; see tools/README.md "Helpers for stable tests").
import { cpus as _cpus, loadavg as _loadavg } from 'node:os';

/** Multiplier for waits that depend on the machine: 1 when idle, up to 6 when the CPUs are busy (parallel jobs, other agents).
 *  TEST_SCALE=n forces it; test-all.mjs also passes TEST_JOBS (tests running at once). */
export function loadScale() {
  const forced = Number(process.env.TEST_SCALE);
  if (forced > 0) return forced;
  const n = _cpus().length || 1;
  const byLoad = _loadavg()[0] / n;
  const byJobs = (Number(process.env.TEST_JOBS) || 1) / n / 2;
  return Math.min(6, Math.max(1, byLoad, byJobs));
}
/** A timeout in ms, stretched by the load. scaled(5000) is 5 s on an idle machine. */
export const scaled = (ms) => Math.round(ms * loadScale());
/** Plain sleep in Node (never accelerated by FAST, unlike page.waitForTimeout). */
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** `http://localhost:PORT/<slug>/` (PORT from the environment, `dflt` if none). */
export const gameUrl = (slug, dflt = 5220) => `http://localhost:${process.env.PORT || dflt}/${slug}/`;

/**
 * Opens a game in a fresh isolated context and waits until the app is ready.
 *   const page = await openGame(browser, 'read-chords', { theme: 'dark', lang: 'en', level: 3, settings: { sound: false } });
 * - theme 'light' | 'dark' (colour scheme of the context AND ml:theme), lang 'fr' | 'en' (locale AND ml:lang), defaults light / fr.
 * - level and settings are written to ml:settings:<slug> before the app starts (once per tab: a later page.reload() keeps what the test changed).
 * - start: true also taps the start button (games that call game.ready()) and waits for the first question (window.__test.state()).
 * - viewport, hasTouch, acceptDownloads, url (full URL, e.g. with ?level=2), timeout (ms, scaled by load) are optional.
 * Ready = window.__test defined AND (a start button is shown OR window.__test.state() answers). Never reads IndexedDB.
 * The page gets page.errors (array: pageerror + console errors) for a final check(!page.errors.length).
 * Close with page.context().close() (browser.close() closes everything too).
 */
export async function openGame(browser, slug, { theme = 'light', lang = 'fr', level, settings, start = false, viewport, hasTouch, acceptDownloads, url, timeout = 15000 } = {}) {
  const ctx = await browser.newContext({
    viewport: viewport || { width: 390, height: 780 }, colorScheme: theme, locale: lang === 'en' ? 'en-US' : 'fr-FR',
    ...(hasTouch ? { hasTouch } : {}), ...(acceptDownloads ? { acceptDownloads } : {}),
  });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  const merged = { ...(level != null ? { level } : {}), ...(settings || {}) };
  await page.addInitScript(([slug, merged, theme, lang]) => {
    try {
      if (sessionStorage.getItem('__seeded')) return;
      sessionStorage.setItem('__seeded', '1');
      localStorage.setItem('ml:theme', theme);
      localStorage.setItem('ml:lang', lang);
      if (Object.keys(merged).length) localStorage.setItem('ml:settings:' + slug, JSON.stringify(merged));
    } catch {}
  }, [slug, merged, theme, lang]);
  await page.goto(url || gameUrl(slug));
  await waitReady(page, { timeout });
  if (start) {
    await page.click('.ml-start', { timeout: scaled(timeout) });
    await page.waitForFunction(() => window.__test?.state?.(), null, { timeout: scaled(timeout) });
  }
  return page;
}

/** Waits for window.__test and (a start button or a first state). Throws with the page errors if it never comes. */
export async function waitReady(page, { timeout = 15000 } = {}) {
  try {
    await page.waitForFunction(() => window.__test && (document.querySelector('.ml-start') || window.__test.state?.() || !window.__test.state), null, { timeout: scaled(timeout) });
  } catch (e) {
    throw new Error(`app not ready after ${scaled(timeout)} ms (window.__test missing or no state). Page errors: ${(page.errors || []).join(' | ') || 'none'}`);
  }
}

/**
 * Waits until the page is quiet: loaded, fonts ready, two animation frames, and a game that exposes `locked` in
 * window.__test.state() is unlocked. Timeout scaled by load. Use it instead of waitForTimeout after an action.
 */
export async function waitIdle(page, { timeout = 8000 } = {}) {
  await page.waitForFunction(() => document.readyState === 'complete', null, { timeout: scaled(timeout) });
  await page.waitForFunction(() => {
    const st = window.__test?.state?.();
    return !(st && typeof st === 'object' && st.locked === true);
  }, null, { timeout: scaled(timeout), polling: 50 });
  await page.evaluate(() => Promise.race([
    Promise.all([document.fonts?.ready, new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))]),
    new Promise((r) => setTimeout(r, 1500)),
  ]));
}

/**
 * Attempts logged for `game` (all games if falsy), oldest first. Waits for the app's own database first:
 * opening 'music-learnin' before the app does would create it without its stores and every later read would hang.
 * Returns [] if the app never created it within the timeout (nothing was answered yet), throws if it exists without stores.
 */
export async function readAttempts(page, game, { timeout = 10000, who } = {}) {
  const ms = scaled(timeout);
  const res = await page.evaluate(async ([game, ms, who]) => {
    const wait = (n) => new Promise((r) => setTimeout(r, n)); // <= 20 ms: not accelerated by FAST
    const end = Date.now() + ms;
    const exists = async () => { try { return (await indexedDB.databases()).some((d) => d.name === 'music-learnin'); } catch { return true; } };
    while (!(await exists())) { if (Date.now() > end) return { rows: [] }; await wait(20); }
    const db = await new Promise((res, rej) => { const r = indexedDB.open('music-learnin'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    try {
      if (!db.objectStoreNames.contains('attempts')) return { broken: true };
      const rows = await new Promise((res, rej) => { const q = db.transaction('attempts').objectStore('attempts').getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
      return { rows };
    } finally { db.close(); }
  }, [game || null, ms, who || null]);
  if (res.broken) throw new Error("IndexedDB 'music-learnin' exists without its 'attempts' store: it was opened before the app created it");
  return res.rows.filter((a) => (!game || a.game === game) && (!who || a.who === who)).sort((x, y) => x.t - y.t);
}

/** Polls readAttempts until the game has at least `n` rows (counting from 0), then returns them. Throws on timeout. */
export async function waitAttempts(page, game, n, { timeout = 10000 } = {}) {
  const end = Date.now() + scaled(timeout);
  let rows = [];
  while (Date.now() < end) {
    rows = await readAttempts(page, game, { timeout: 1000 });
    if (rows.length >= n) return rows;
    await sleep(40);
  }
  throw new Error(`expected ${n} attempts of ${game}, found ${rows.length}`);
}
