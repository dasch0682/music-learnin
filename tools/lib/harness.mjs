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

const DEFAULT_SPEED = Number(process.env.FAST_SPEED) || 10;
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
