# Game tests

One Playwright script per game: `tools/<slug>.test.mjs` (plus `platform`, `feedback`, `midi`). They play the game through `window.__test`,
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
| Duration | about 3 to 4 min | about 20 min with `--jobs 4` (70 min before, one test after the other) |

Fast mode still opens every game, plays at least one wrong and one right round and checks the log. It does not play the clean
streak that offers the next level (some tests play it with 6 to 10 short answers anyway), nor every item or every instrument.

## Runner

`npm test`, `npm run test:fast`, `npm run test:changed` all call `node tools/test-all.mjs`. Start nothing by hand: if no dev server answers on
`PORT` (default 5220) the runner starts `vite` and stops it at the end. One Chrome is started for the whole run; each test opens its own
browser contexts in it (isolated localStorage, IndexedDB and service workers, so tests can run side by side).

```
npm run test:fast -- --only find-a-note,high-low   # chosen tests
npm run test:changed                               # fast + only what git diff (origin/main + uncommitted) touches
npm test -- --jobs 4 --retry 1                     # full, 4 at once, a failing test runs once more (reported as flaky if it then passes)
npm run test:fast -- --verbose                     # one line per test
PORT=5250 npm run test:fast                        # another port (use one per agent)
```

Options: `--fast`, `--jobs N` (default half the CPUs, at least 2; at least 4 with `--fast`, since most of a test is waiting), `--only a,b`,
`--changed`, `--retry N`, `--verbose`, `--no-share` (one Chrome per test).

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
- Read IndexedDB only after the app has started (`window.__test` answers): opening the database earlier creates it without its stores and the test hangs.
- No shared state between tests: no fixed file names in `/tmp` (use `mkdtempSync`), no fixed ports other than `PORT`.
- Run one test alone: `PORT=5250 FAST=1 node tools/<slug>.test.mjs` (without `FAST` it runs in full mode).
