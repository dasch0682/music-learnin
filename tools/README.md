# Game tests

One Playwright script per game: `tools/<slug>.test.mjs` (plus `platform`, `feedback`, `midi`, and `catalog`: taxonomy against the files of every game, titles, level counts, skills reachable). They play the game through `window.__test`,
check the attempts logged in IndexedDB, the music theory, the console and the 390 px layout. All share `tools/lib/harness.mjs`.

## Two modes

| | Fast (`npm run test:fast`) | Full (`npm test`) |
|---|---|---|
| For | agents and developers while they work | before a release, weekly CI |
| Levels | first, middle, last | all |
| Rounds per level | 2 or 3 (one wrong answer, then right ones) | as many as the game needs (clean streaks, every item) |
| Theme / language | one combination (the second one only in short end checks) | both |
| Generators (`__test.sample`) | smaller counts | full counts |
| Timers of the page | delays divided by 5 (`FAST_SPEED`) | real |
| Duration (measured) | at most 300 s on 2 CPUs (about 230 s measured) | FULL_PLACEHOLDER |

Fast mode still opens every game, plays at least one wrong and one right round and checks the log. It does not play the clean
streak that offers the next level (some tests play it with 6 to 10 short answers anyway), nor every item or every instrument.

### Fast budget (a rule for every new or changed test)

- The whole fast suite must take at most **300 s on 2 CPUs** (GitHub runners have 4, so CI is faster). One test should stay under 30 s;
  tests on real timers (`launch({ speed: 1 })`, paced by the clock) under 60 s. Times are wall times inside the suite run (4 tests at once), so they
  are a little longer than the same test alone.
- The runner prints `WARN slow fast test: <slug> took N s` for a test over its budget and `WARN fast suite took N s` when the total goes over 300 s
  (the per-test line also appears with `--only`). Fix the warning before you hand over: do not raise the budget.
- How to stay inside it: one level (or first and last) in fast mode; real-time runs (taps, microphone feeding) are the expensive part (5 to 8 s each),
  so play one wrong and one right run per test and keep the other levels for the structure checks (generators, `__test.sample`, `__show`);
  one persistence check per test; one theme/language (`combos`); no fixed sleeps; share a page between checks instead of reloading; run the
  independent sections of a long test at the same time on their own pages (`Promise.all`, fast only, see `feedback`); a long clean streak or
  level-up check is full only (`if (!FAST)`, with a comment). Keep each kind of check at least once in fast mode when it costs little.
- Measured on 2 CPUs: more than 4 tests at once, or more than 2 real-timer tests at once, does not make fast mode faster and makes the
  timing tests fail (`--jobs 8 --rt 4`: 191 s but 3 failures).

## Runner

`npm test`, `npm run test:fast`, `npm run test:changed` all call `node tools/test-all.mjs`. Start nothing by hand: if no dev server answers on
`PORT` (default 5220) the runner starts `vite` and stops it at the end. One Chrome is started for the whole run; each test opens its own
browser contexts in it (isolated localStorage, IndexedDB and service workers, so tests can run side by side).

```
npm run test:fast -- --only find-a-note,high-low   # chosen tests
npm run test:changed                               # fast + only what git diff (origin/main + uncommitted) touches
npm test -- --jobs 4 --retry 1                     # full, 4 at once (the default is already one per CPU, at least 2), a failing test runs once more (reported as flaky if it then passes)
npm run test:fast -- --verbose                     # one line per test
npm run test:fast -- --only read-chords --repeat 10  # 10 runs of the chosen tests, one line per test: `ok read-chords 10/10 (max 16 s)` (flakiness)
PORT=5250 npm run test:fast                        # another port (use one per agent)
```

Options: `--fast`, `--jobs N` (default: the number of CPUs, at least 2; at least 4 with `--fast`, since most of a test is waiting), `--rt N` (real-timer tests at once), `--only a,b`,
`--changed`, `--retry N`, `--repeat N` (every selected test N times, per-test pass count; a failure is printed once per test), `--verbose`, `--no-share` (one Chrome per test).
Tests on real timers (`launch({ speed: 1 })`, found by the runner in their source) run at most `CPUs / 2` at a time in full mode, `CPUs` in fast mode (at least 1; `--rt N` to change), whatever `--jobs` says: they are the ones that fail when the machine is busy.
The runner passes `TEST_JOBS` (tests at once) to the tests; `TEST_SCALE=n` forces the load factor used by the helpers below.

`--changed` maps `apps/<slug>/` to `tools/<slug>.test.mjs`, `tools/<slug>.test.mjs` to itself, the home page and `public/` to `platform`,
and `packages/core/`, `vite.config.js`, `package.json`, `tools/lib/` and `tools/test-all.mjs` to every test.

Output: one line, `fast: 36 ok, 0 fail, 1 flaky (212 s)`, then the name and the last 15 lines of each failure. Full logs of the last run are in
`tools/.logs/<slug>.log` (git-ignored); read one only after a failure. Exit code 1 if a test fails.

## Writing or changing a test

```js
import { launch, FAST, rounds, levels, combos } from './lib/harness.mjs';
const browser = await launch();                 // launch({ speed: 1 }) = real timers
const page = await browser.newPage({ colorScheme: 'light', locale: 'fr-FR' });   // defaults: 390x780, light, fr-FR
for (const level of levels(6)) {                // [1..6] in full mode, [1, 3, 6] in fast mode (levels(11, [1, 6, 11]) to choose)
  for (let round = 0; round < rounds(8, 2); round++) { /* ... */ }   // rounds(full, fast) works for any value, arrays too
}
for (const [scheme, locale] of combos([['light', 'fr-FR'], ['dark', 'en-US']])) { /* second combination only in full mode */ }
await browser.close();
```

- Round 0 is usually the wrong answer; some tests need 3 rounds (a second wrong try at round 1). Keep `rounds(x, 3)` there.
- A check that needs the whole level (the next-level button after a streak, every clef or item seen) is written `if (!FAST) check(...)`.
- In fast mode the page's `setTimeout`/`setInterval` delays above 20 ms are divided by `FAST_SPEED` (5), and `page.waitForTimeout(ms)` of
  100 ms or more follows. Use `launch({ speed: 1 })` when the test taps against the real clock (rhythm), feeds a microphone in real time,
  or reads a transient state (a toast, a star) a few hundred ms after it appeared. Tests with real timers today: `tap-rhythm`, `two-hands`,
  `penta-jam`, `read-melody`, `feedback`, `second-voice`, `sight-sing`, `sing-match`, `play-the-note`, `play-scales`; `harmony-lab` runs at 3x.
- Read IndexedDB with `readAttempts(page, game)` (below), never with a bare `indexedDB.open`: opening the database before the app has created it makes it without its stores and the test hangs.
- No fixed sleep after an action that triggers a timer of the game (next question, next level): wait for the visible change (a button re-rendered, `state()` changed, a row logged). A sleep shorter than the game's own delay passes on an idle machine and fails under load. Two questions in a row can be identical, so compare a DOM node (`document.contains(oldNode)`), not only the question data.
- A check on what is shown right after the last answer of a round (a staff, a score) must run in the same `page.evaluate` as the tap: the game moves on by itself a few hundred ms later.
- Random draws: never assert that every variant was seen in a fixed number of rounds. Play on until seen (bounded) in full mode, skip the coverage check in fast mode.
- No shared state between tests: no fixed file names in `/tmp` (use `mkdtempSync`), no fixed ports other than `PORT`.
- Run one test alone: `PORT=5250 FAST=1 node tools/<slug>.test.mjs` (without `FAST` it runs in full mode).

## Helpers for stable tests (`tools/lib/harness.mjs`, additive)

```js
import { launch, openGame, readAttempts, waitAttempts, waitIdle, waitReady, loadScale, scaled, sleep, gameUrl } from './lib/harness.mjs';
const page = await openGame(browser, 'read-chords', { theme: 'dark', lang: 'en', level: 3, settings: { sound: false }, start: false });
const rows = await readAttempts(page, 'read-chords');          // oldest first; waits for the app's own database
const rows2 = await waitAttempts(page, 'read-chords', rows.length + 1);   // polls until a new row is logged (throws after the timeout)
await waitIdle(page);                                           // loaded, fonts, 2 frames, game unlocked
```

- `openGame(browser, slug, { theme, lang, level, settings, start, viewport, hasTouch, acceptDownloads, url, timeout })`: new isolated context and page
  (`browser` = what `launch()` returns); `theme` 'light'/'dark' and `lang` 'fr'/'en' set both the context (colour scheme, locale) and `ml:theme`/`ml:lang`;
  `level` and `settings` go to `ml:settings:<slug>` before the app runs, once per tab (a later `page.reload()` keeps what the test changed).
  It waits for `window.__test` and for a start button or a first `state()`; `start: true` also taps the start button and waits for the first state.
  `page.errors` collects page errors and console errors. `url` opens another URL (`?level=2`) in place of the game page. Never touches IndexedDB.
- `readAttempts(page, game, { timeout, who })`: all attempts of `game` (all if falsy). Waits until the app has created `music-learnin` (checked with
  `indexedDB.databases()` before opening), returns `[]` if it never does (nothing answered yet), throws if it exists without its `attempts` store.
- `waitAttempts(page, game, n, { timeout })`: instead of `waitForTimeout(250)` after an answer.
- `waitIdle(page, { timeout })`: `readyState` complete, `window.__test.state().locked` false when the game exposes it, two animation frames.
- `loadScale()` is 1 on an idle machine and up to 6 under load (`loadavg / CPUs`, or `TEST_JOBS / CPUs / 2`); `scaled(ms)` multiplies a timeout by it.
  `waitIdle`, `readAttempts`, `waitAttempts`, `openGame` already use it; use `scaled()` for your own `waitForFunction` timeouts.
  `sleep(ms)` is a plain Node sleep (`page.waitForTimeout` is accelerated in fast mode, `sleep` is not).
