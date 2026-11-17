// Feedback modes (docs/feedback-spec.md): storage, sounds, messages, streaks, reveal, reduced motion, accessibility.
// Usage: npx vite --port 5220 --strictPort &   then   PORT=5220 node tools/feedback.test.mjs
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { MESSAGES, pickMessage, FEEDBACK_MODES } from '../packages/core/feedback.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const base = `http://localhost:${process.env.PORT || 5220}/`;
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('FAIL', msg); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 12. Unit (Node): sound lengths, message picking, bank shape.
{
  const log = { end: 0, peak: 0, osc: 0 };
  const param = () => ({
    value: 0,
    setValueAtTime(v) { return this; },
    linearRampToValueAtTime(v, t) { log.end = Math.max(log.end, t); log.peak = Math.max(log.peak, v); },
    exponentialRampToValueAtTime(v, t) { log.end = Math.max(log.end, t); },
  });
  const node = () => ({ connect: (n) => n, gain: param(), frequency: param(), type: '' });
  globalThis.window = { AudioContext: class {
    constructor() { this.currentTime = 0; this.state = 'running'; this.sampleRate = 8000; this.destination = node(); }
    resume() {}
    createDynamicsCompressor() { return node(); }
    createGain() { return node(); }
    createBiquadFilter() { return node(); }
    createOscillator() { log.osc++; return { ...node(), start() {}, stop(t) { log.end = Math.max(log.end, t); } }; }
    createBuffer(c, n) { return { length: n, getChannelData: () => new Float32Array(n) }; }
    createBufferSource() { return { ...node(), start(t) { this.at = t; } }; }
  } };
  const { sfx, SFX_MS } = await import('../packages/core/audio.js');
  const stated = { good: 140, bad: 200, 'good-warm': 240, 'bad-soft': 220, cheer: 420 };
  for (const [name, ms] of Object.entries(stated)) {
    log.end = 0; log.peak = 0; log.osc = 0;
    const r = sfx(name);
    check(r === ms && SFX_MS[name] === ms, `sfx ${name}: returns ${r}, stated ${ms}`);
    check(Math.abs(log.end * 1000 - ms) < 1.5, `sfx ${name}: ends at ${log.end * 1000} ms, stated ${ms}`);
    check(log.peak <= 0.0701 && log.osc >= 1, `sfx ${name}: peak ${log.peak}`);
  }
  check(sfx('nope') === 0, 'unknown sfx name returns 0');
  for (const [kind, lines] of Object.entries(MESSAGES)) {
    for (const m of lines) check(m.en && m.fr && m.en.length <= 40 && m.fr.length <= 44, `bank ${kind}: bad line ${JSON.stringify(m)}`);
    for (const lang of ['en', 'fr']) for (const ear of [false, true]) {
      const recent = [];
      for (let i = 0; i < 200; i++) {
        const l = pickMessage(kind, lang, recent.slice(-3), { ear });
        if (l == null) { recent.length = 0; continue; }
        check(!recent.slice(-3).includes(l), `pickMessage ${kind} repeated ${l}`);
        check(ear || !lines.find((m) => m[lang] === l)?.ear, `pickMessage ${kind}: ear line without ear`);
        recent.push(l);
      }
    }
  }
  check(pickMessage('bad', 'en', MESSAGES.bad.map((m) => m.en), { ear: true }) === null, 'pickMessage: nothing left returns null');
  check(FEEDBACK_MODES.join() === 'silent,discreet,normal,encouraging', 'modes list');
}

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
const sessions = [];
async function session({ locale = 'fr-FR', reducedMotion = 'no-preference' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, colorScheme: 'light', locale, reducedMotion });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  sessions.push(ctx);
  return page;
}
const ls = (p, k) => p.evaluate((k) => localStorage.getItem(k), k);
const fbLog = (p) => p.evaluate(() => window.__fb || []);
const state = (p) => p.evaluate(() => window.__test.state());
const core = (p, mod, body, arg = null) => p.evaluate(`(async (arg) => { const m = await import('/@fs${ROOT}/packages/core/${mod}.js'); ${body} })(${JSON.stringify(arg)})`);
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
const attemptsOf = (p, game) => p.evaluate((game) => new Promise((res) => { const r = indexedDB.open('music-learnin'); r.onsuccess = () => { const q = r.result.transaction('attempts').objectStore('attempts').getAll(); q.onsuccess = () => res(q.result.filter((a) => a.game === game).sort((x, y) => x.t - y.t)); }; }), game);

// Ear cadences: level 4 has four choices, so two different wrong buttons exist.
async function openCad(p, { mode, level = 4, haptics = false } = {}) {
  await p.goto(base + 'ear-cadences/');
  await p.evaluate(([m, l, h]) => {
    if (m) localStorage.setItem('ml:settings:_feedback', JSON.stringify({ mode: m, haptics: h }));
    localStorage.setItem('ml:settings:ear-cadences', JSON.stringify({ level: l, tempo: 110 }));
  }, [mode, level, haptics]);
  await p.reload();
  await p.click('.ml-start');
  await p.waitForFunction(() => window.__test.state().type);
  await p.evaluate(() => { window.__fb = []; });
}
const right = async (p) => { const s = await state(p); await p.click(`.cd-choices button[data-type="${s.type}"]`); };
const wrong = async (p) => { const s = await state(p); await p.locator(`.cd-choices button:not([data-type="${s.type}"]):not([disabled])`).first().click(); };
const nextQ = async (p, ms = 1000) => { await sleep(ms); await p.waitForFunction(() => !document.querySelector('.cd-choices .ml-right')); };

// ---- 1. Default
{
  const p = await session();
  await openCad(p, {});
  check((await p.evaluate(() => document.documentElement.dataset.fb)) === 'normal', 'default data-fb normal');
  check((await ls(p, 'ml:settings:_feedback')) === null, 'no _feedback key before any change');
  await wrong(p);
  await sleep(300);
  await right(p);
  await sleep(300);
  const l = await fbLog(p);
  check(l.length === 2 && l[0].kind === 'bad' && l[0].sound === 'bad' && l[1].kind === 'good' && l[1].sound === 'good', 'default sounds ' + JSON.stringify(l));
  check(l.every((r) => r.message === null && r.mode === 'normal'), 'default: no message');
  check(l[0].visual === 'tint+shake' && l[1].visual === 'tint', 'default visuals');
  check((await ls(p, 'ml:settings:_feedback')) === null, 'still no _feedback key after answers');
}

// ---- 2. Storage
{
  const p = await session();
  await p.goto(base + 'ear-cadences/');
  await p.click('button.ml-icon');
  check(await p.locator('.ml-fb-mode select').inputValue() === 'normal', 'dialog shows normal');
  await p.selectOption('.ml-fb-mode select', 'encouraging');
  check(JSON.parse(await ls(p, 'ml:settings:_feedback')).mode === 'encouraging', 'stored encouraging');
  check((await p.evaluate(() => document.documentElement.dataset.fb)) === 'encouraging', 'data-fb refreshed');
  check(JSON.parse(await ls(p, 'ml:settings:_feedback')).haptics === false, 'haptics stored false');
  check(await p.locator('.ml-fb-haptics').count() === 1, 'vibration toggle shown');
  await p.reload();
  check((await p.evaluate(() => document.documentElement.dataset.fb)) === 'encouraging', 'reload keeps mode');
  // a second profile starts in normal and writes its own key
  const id = await core(p, 'profiles', `return m.addProfile('B', { activate: true }).id;`);
  await sleep(100);
  check((await p.evaluate(() => document.documentElement.dataset.fb)) === 'normal', 'second profile reads normal');
  await p.click('button.ml-icon');
  await p.selectOption('.ml-fb-mode select', 'discreet');
  check(JSON.parse(await ls(p, `ml:psettings:${id}:_feedback`) || '{}').mode === 'discreet', 'second profile key');
  check(JSON.parse(await ls(p, 'ml:settings:_feedback')).mode === 'encouraging', 'first profile untouched');
  // home dialog
  await p.goto(base);
  await p.waitForSelector('.hub-tile');
  await p.click('#ml-profile');
  const vals = await p.locator('#ml-profiles .ml-prow select').evaluateAll((s) => s.map((x) => x.value));
  check(vals.join() === 'encouraging,discreet', 'home dialog rows ' + vals);
  check(!(await overflow(p)), 'home dialog overflow');
  await p.locator('#ml-profiles .ml-prow select').first().selectOption('silent');
  check(JSON.parse(await ls(p, 'ml:settings:_feedback')).mode === 'silent', 'home row writes first profile');
  check((await p.evaluate(() => document.documentElement.dataset.fb)) === 'discreet', 'active profile mode unchanged');
  // deleting a profile erases its feedback key
  await core(p, 'storage', `await m.removeProfile(arg);`, id);
  check((await ls(p, `ml:psettings:${id}:_feedback`)) === null, 'removeProfile erases _feedback');
  // unknown mode falls back to normal
  await p.evaluate(() => localStorage.setItem('ml:settings:_feedback', '{"mode":"loud"}'));
  check(await core(p, 'feedback', `return m.getFeedback().mode;`) === 'normal', 'unknown mode → normal');
}

// ---- 3. silent and discreet
for (const mode of ['silent', 'discreet']) {
  const p = await session();
  await openCad(p, { mode });
  await wrong(p);
  const anim = await p.evaluate(() => getComputedStyle(document.querySelector('.ml-stage')).animationName);
  const shown = await p.evaluate(() => document.querySelector('.ml-fb').classList.contains('ml-show') && document.querySelector('.ml-fb').textContent.includes('↺'));
  check(mode === 'discreet' ? anim === 'none' : anim !== 'none', `${mode}: stage animation ${anim}`);
  check(shown, `${mode}: badge shown`);
  await sleep(300);
  await right(p);
  await sleep(300);
  const l = await fbLog(p);
  check(l.length === 2 && l.every((r) => r.sound === null && r.mode === mode && r.message === null), `${mode}: log ${JSON.stringify(l)}`);
  check(l[0].visual === (mode === 'silent' ? 'tint' : 'none'), `${mode}: visual ${l[0].visual}`);
}

// ---- 4, 9, 11. encouraging (English then French): messages, no shake, reveal, streak, accessibility
for (const locale of ['en-US', 'fr-FR']) {
  const lang = locale.slice(0, 2);
  const p = await session({ locale });
  await openCad(p, { mode: 'encouraging' });
  const s = await state(p);
  await wrong(p);
  const tf = await p.evaluate(() => getComputedStyle(document.querySelector('.ml-stage')).transform);
  check(tf === 'none', `${lang}: no shake in encouraging (${tf})`);
  await sleep(200);
  let l = await fbLog(p);
  check(l[0].kind === 'bad' && l[0].sound === 'bad-soft', `${lang}: bad sound ${JSON.stringify(l[0])}`);
  check(MESSAGES.bad.some((m) => m[lang] === l[0].message), `${lang}: bad message "${l[0].message}"`);
  await wrong(p);
  await sleep(200);
  l = await fbLog(p);
  check(l.length === 2 && l[1].kind === 'bad' && l[1].message === null, `${lang}: no message on second miss`);
  // 9. the answer is revealed after the second miss
  const rev = await p.evaluate(() => [...document.querySelectorAll('.cd-choices .ml-reveal')].map((b) => b.dataset.type));
  check(rev.length === 1 && rev[0] === s.type, `${lang}: reveal ${JSON.stringify(rev)} expected ${s.type}`);
  await right(p);
  await sleep(300);
  l = await fbLog(p);
  check(l[2].kind === 'good' && l[2].message === null, `${lang}: no praise after reveal ${JSON.stringify(l[2])}`);
  // 5 clean answers: one streak entry with cheer and stars
  await nextQ(p);
  await p.evaluate(() => { window.__fb = []; });
  for (let i = 0; i < 5; i++) {
    await right(p);
    if (i < 4) await nextQ(p);
  }
  await sleep(100);
  const stars = await p.locator('.ml-stars span').count();
  check(stars === 5, `${lang}: stars ${stars}`);
  // 11. accessibility, toast and stars on screen
  const a11y = await p.evaluate(() => { const f = document.querySelector('.ml-fb'); return { text: f.textContent.trim(), live: !!f.closest('[aria-live]'), hidden: f.querySelector('.ml-fb-glyph').getAttribute('aria-hidden') }; });
  check(a11y.text.length > 1 && a11y.live, `${lang}: badge text/live ${JSON.stringify(a11y)}`);
  check(!(await overflow(p)), `${lang}: overflow with stars`);
  l = await fbLog(p);
  const streaks = l.filter((r) => r.kind === 'streak');
  check(streaks.length === 1 && streaks[0].sound === 'cheer' && l.length === 5 && l[4].kind === 'streak', `${lang}: streak ${JSON.stringify(l.map((r) => r.kind + ':' + r.sound))}`);
  check(l.slice(0, 4).every((r) => r.kind === 'good' && r.sound === 'good-warm'), `${lang}: good-warm`);
  check(streaks[0].message && streaks[0].message.includes('5'), `${lang}: milestone message ${streaks[0].message}`);
  await sleep(900);
  check((await p.locator('.ml-stars').count()) === 0, `${lang}: stars removed`);
}

// ---- 5 and 6. chatter limit, no speed praise
{
  const p = await session({ locale: 'en-US' });
  await openCad(p, { mode: 'encouraging' });
  for (let i = 0; i < 12; i++) { await right(p); await nextQ(p, 950); }
  const l = await fbLog(p);
  const msgs = l.map((r) => r.message).filter(Boolean);
  check(l.length === 12 && msgs.length <= 3 && new Set(msgs).size === msgs.length, `chatter: ${JSON.stringify(msgs)}`);
  check(l.filter((r) => r.kind === 'streak').length === 2, 'streak entries at 5 and 10');
}
{
  const kinds = {};
  for (const [name, wait] of [['fast', 0], ['slow', 2200]]) {
    const p = await session({ locale: 'en-US' });
    await openCad(p, { mode: 'encouraging' });
    for (let i = 0; i < 5; i++) { await sleep(wait); await right(p); await nextQ(p, 950); }
    kinds[name] = (await fbLog(p)).map((r) => r.kind + ':' + r.sound).join();
    const ms = (await attemptsOf(p, 'ear-cadences')).map((a) => a.ms);
    kinds[name + 'Ms'] = Math.min(...ms);
  }
  check(kinds.fast === kinds.slow, `speed changes feedback: ${kinds.fast} vs ${kinds.slow}`);
  check(kinds.fastMs < 1500 && kinds.slowMs > 2000, `speed test not meaningful ${kinds.fastMs} ${kinds.slowMs}`);
}

// ---- 7. silent: true on the call (find-a-note with "Play the note" on)
for (const mode of FEEDBACK_MODES) {
  const p = await session();
  await p.goto(base + 'find-a-note/');
  await p.evaluate((m) => localStorage.setItem('ml:settings:_feedback', JSON.stringify({ mode: m })), mode);
  await p.reload();
  await p.waitForFunction(() => window.__test && window.__test.state());
  check((await p.evaluate(() => JSON.parse(localStorage.getItem('ml:settings:find-a-note') || '{}').sound)) !== false, 'play the note on (default)');
  await p.evaluate(() => { window.__fb = []; });
  await p.locator('.ml-choices .ml-btn').first().click();
  await sleep(200);
  await p.locator('.ml-choices .ml-btn:not([disabled])').last().click();
  await sleep(300);
  const l = await fbLog(p);
  check(l.length >= 1 && l.every((r) => r.sound === null), `find-a-note ${mode}: sounds ${JSON.stringify(l.map((r) => r.sound))}`);
}

// ---- 8. Microphone game: the microphone stays shut while a shell sound plays; no vibration
for (const mode of ['normal', 'encouraging']) {
  const p = await session();
  await p.goto(base + 'second-voice/');
  await p.evaluate(([m]) => {
    localStorage.setItem('ml:settings:_feedback', JSON.stringify({ mode: m, haptics: true }));
    localStorage.setItem('ml:settings:second-voice', JSON.stringify({ level: 1, voice: 'child', tolerance: 50, phones: false }));
  }, [mode]);
  await p.reload();
  await p.click('.ml-start');
  const feed = async (midi, ms) => { for (let t = 0; t < ms; t += 40) { await p.evaluate((m) => window.__test.feed(m), midi); await sleep(40); } };
  const listening = async () => { for (let i = 0; i < 200; i++) { const s = await state(p); if (s.listening && !s.done) return s; await feed(null, 80); } throw new Error('never listening'); };
  await p.evaluate(() => window.__test.feed(null));
  let s = await listening();
  await p.evaluate(() => {
    window.__fb = [];
    window.__samples = [];
    setInterval(() => window.__samples.push([performance.now(), window.__test.state().listening]), 10);
  });
  const all = s.steps[0].targets.concat(s.steps[0].other);
  let bad = s.steps[0].targets[0] + 1;
  while (all.some((t) => Math.abs(((bad - t + 6) % 12 + 12) % 12 - 6) < 1)) bad++;
  await feed(bad, 2600); // first miss
  s = await listening();
  await feed(bad, 2600); // second miss (flash only)
  s = await listening();
  const target = s.steps[0].targets[s.steps[0].targets.length - 1];
  for (let i = 0; i < s.steps.length; i++) { const cur = await listening(); await feed(cur.steps[i].targets.at(-1) + 0.2, 900); await feed(null, 500); }
  await feed(null, 1000);
  const [l, samples] = await Promise.all([fbLog(p), p.evaluate(() => window.__samples)]);
  check(l.length >= 2, `second-voice ${mode}: ${l.length} feedback entries`);
  for (const r of l) {
    check(r.haptic === false, `second-voice ${mode}: haptic ${JSON.stringify(r)}`);
    if (r.sound) {
      const during = samples.filter(([t]) => t >= r.t && t <= r.t + r.ms);
      check(during.every(([, on]) => !on), `second-voice ${mode}: listening during ${r.sound}`);
    }
  }
  check(l.some((r) => r.sound), `second-voice ${mode}: no sound at all`);
}

// ---- 10. Reduced motion
{
  const p = await session({ locale: 'en-US', reducedMotion: 'reduce' });
  await openCad(p, { mode: 'encouraging' });
  const moving = () => p.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => getComputedStyle(e).transform !== 'none').map((e) => e.tagName + '.' + e.className));
  await wrong(p);
  let m = await moving();
  check(m.length === 0, 'reduced motion, after a miss: ' + m);
  check(await p.evaluate(() => document.querySelector('.ml-fb').classList.contains('ml-show')), 'reduced motion: badge shown');
  await sleep(300);
  await right(p);
  await nextQ(p);
  for (let i = 0; i < 5; i++) { await right(p); if (i < 4) await nextQ(p); }
  await sleep(50);
  m = await moving();
  check(m.length === 0, 'reduced motion, stars and toast: ' + m);
  check((await p.locator('.ml-stars span').count()) === 5, 'reduced motion: stars still shown');
  check(await p.evaluate(() => getComputedStyle(document.querySelector('.ml-stage')).transform) === 'none', 'reduced motion: stage not moved');
}

check(!errors.length, 'console: ' + errors.join(' | '));
for (const c of sessions) await c.close();
await browser.close();
console.log(failed ? `${failed} failure(s)` : 'all good');
process.exit(failed ? 1 : 0);
