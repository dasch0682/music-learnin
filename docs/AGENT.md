# Instructions for an agent building a game

The repo is a suite of offline, bilingual (EN/FR) music-learning games, from first steps (young children) to mastery.
Practice comes before theory: the player hears, sings, plays or builds first; names and rules come later, at higher levels.
Every challenge is bite-size (a few seconds).

## Read first (and nothing else unless needed)

- `packages/core/README.md` (API and conventions), `packages/core/taxonomy.js`, `packages/core/core.css`.
- Only the core modules your game uses: `shell.js`, `audio.js`, `music.js`, `mastery.js`, and `staff.js`, `keyboard.js`, `pitch.js` if needed.
- One reference game close to yours, with its test:
  listening or choices → `apps/ear-cadences/` + `tools/ear-cadences.test.mjs`;
  microphone → `apps/second-voice/` + `tools/second-voice.test.mjs`;
  staff + keyboard → `apps/play-the-note/`; rhythm → `apps/tap-rhythm/`.
- Your brief in `docs/briefs.md` (only the sections named in your task).

Files of your game may already exist from an interrupted run: read them and continue, do not restart from zero.

## Hard constraints

- Write only in `apps/<your-slug>/` and `tools/<your-slug>.test.mjs`. Never edit `packages/core`, other apps, `package.json`, `vite.config.js`, docs. No git, no npm install. Other agents work in other folders at the same time.
- A core bug or missing feature: work around it in your app and report it (file, problem, fix).
- `apps/<slug>/index.html` = copy of `apps/find-a-note/index.html` with the title changed; `main.js`; optional `style.css`. Import core with `@core/...`.
- `createGame({ id })` equals the folder name. Use exactly the skill ids of the brief (already in `taxonomy.js`).
- All text `{ en, fr }`, natural French with accents and French music terms. Very little text on screen.
- Phone first (390x780), touch, large targets (at most ~12 white keys across), colours only through the CSS variables, no horizontal overflow.
- Sound and microphone only after a tap: `await game.ready()` (it replaces the stage: build the screen after it).
- A `level` select with bilingual labels. Log every challenge: `game.attempt({ skill, correct, ms, level, item })`.
  Weak items return more often (`loadItemMastery` + `pickWeak`). A wrong answer is logged once, then the player retries.
  After a clean streak, a one-tap "next level" button (`game.set('level', n + 1)`).
- Expose `window.__test = { state() }` (expected answer included) so the test can play.

## Testing (required, keep it cheap)

Two modes, explained in `tools/README.md`. Agents use the fast one.

- While you work: `PORT=<PORT> npm run test:fast -- --only <your-slug>` (a few seconds to one minute). The runner starts and stops the dev
  server itself if none answers on `PORT`. Use your own port.
- Before you report: `PORT=<PORT> npm run test:changed` (fast mode, only the tests concerned by your changes: your app, or everything if you touched `packages/core`).
- The full suite (`npm test`, every level, both themes) only when your task asks for it. Do not run it on your own.
- Read the summary line only. On a failure the runner prints the test name and its last 15 lines; open `tools/.logs/<slug>.log` for more
  (never paste a full log into your report or your context; use `tail` or `grep FAIL`).
- Never run `vite build`. Use only your scratch dir for temporary files.
- You cannot hear: check MIDI numbers by reasoning.

`tools/<slug>.test.mjs`, modelled on the reference test: plays every level (a wrong answer, then right ones), checks the attempts
in IndexedDB (skill, level, item), recomputes expected answers from music theory where possible, checks no console error and no
overflow at 390 px, exits non-zero on failure. Build it on `tools/lib/harness.mjs`: `launch()`, `levels(n)`, `rounds(full, fast)`,
`combos(list)`. In fast mode it must still open the game, play at least one wrong and one right round and check the log.
Use `launch({ speed: 1 })` if the test taps against the clock or feeds a microphone.
Single run: `PORT=<PORT> FAST=1 node tools/<slug>.test.mjs <your scratch dir>`.

- Look at no more than 3 screenshots per game (Read tool), chosen to cover light/dark and FR/EN.

## Final report

At most 12 lines per game: levels done, how answers are judged, what is unfinished, core issues.

## If your task says you may edit `packages/core` or the home page

- Keep every existing export and behaviour working at each save: other agents are running games against the core while you work.
- Document what you add in `packages/core/README.md` (short).
- After your changes: `npx vite build` is allowed for you only at the very end, followed by
  `npx vite preview --port 4173 --strictPort &` and `node tools/smoke.mjs` (must print "all good"); stop the preview.
