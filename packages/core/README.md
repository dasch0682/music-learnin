# @core — shared module of every game

Each game is a standalone page in `apps/<slug>/` (`index.html` + `main.js`), deployed at `/<slug>/`.
All games share one origin, so they share one IndexedDB database and one mastery map.
`apps/find-a-note/` is the reference implementation: copy its structure.

## Rules for a game

- Plain JS, HTML, CSS. No framework, no new dependency.
- All text bilingual: `{ en, fr }`. Keep text to a minimum: the game should be understood by playing.
- Mobile first (390 px wide), touch first, large targets. Works in light and dark theme: only use the CSS variables.
- Distraction free: nothing on screen that is not needed for the current challenge.
- Practice before theory: the player hears, plays or sings first. Names come later, in higher levels.
- Each challenge is bite-size (a few seconds). Levels go from very first steps to advanced.
- Every answer is logged with `game.attempt({ skill, correct, ... })` using a skill id from `taxonomy.js`.
- Audio needs a user gesture: games that make sound before any tap start with `await game.ready()`.

## shell.js

```js
import { createGame } from '@core/shell.js';
const game = createGame({
  id: 'my-game',                         // = folder name
  title: { en: '…', fr: '…' },
  strings: { key: { en: '…', fr: '… {n}' } },
  settings: [
    { key: 'level', label: {en,fr}, type: 'select', default: 1, options: [{ value: 1, label: {en,fr} }] },
    { key: 'sound', label: {en,fr}, type: 'toggle', default: true },
    { key: 'tempo', label: {en,fr}, type: 'range', min: 40, max: 160, step: 4, default: 80 },
  ],
});
game.stage            // <main> element: draw the game here (flex column, centered)
game.settings         // live values, saved automatically
game.t('key', {n: 3}) // translated string
game.tr({en, fr})     // resolve a bilingual object
game.lang             // 'en' | 'fr'
game.on('settings', fn); game.on('lang', fn);  // re-render there
game.set('level', 2)  // change a setting from code
await game.ready()    // big Start button, unlocks audio. It replaces the stage content: build the game screen after it
await game.attempt({ skill, correct, ms, level, item, detail, silent }) // log + score +1 if correct + flash + sound
game.flash(correct, { silent })  // feedback only, no log
game.setScore(n); game.score; game.say('short toast'); game.h(tag, props, ...children)
```

The shell already provides: top bar, settings dialog, language, theme, import/export of settings and results, reset.

## CSS classes (core.css)

`ml-prompt`, `ml-hint` (text), `ml-btn` (+ `ml-primary`, `ml-right`, `ml-wrong`), `ml-choices` (answer grid),
`ml-round` (big round button, e.g. replay ▶), `ml-start`. Variables: `--bg --fg --muted --line --surface --accent --accent-fg --good --bad --radius`.
A game may add its own `style.css` (import it from `main.js`), using only these variables for colours.

## audio.js

`audio()`, `playNote(midi, { dur, when, gain, timbre })` (timbres: piano, pad, pluck, bass, voice),
`playChord(midis, opts)`, `playSeq(items, { bpm, beats, timbre })` → Promise (items: midi | [chord] | null rest),
`click({ when, accent })`, `tap({ when })`, `sfx('good'|'bad')`, `startDrone(midis)` → stop(), `audioTime()`, `wait(ms)`.
`when` is in seconds from now; use it with `audioTime()` for tight rhythm scheduling.

## music.js

`midiToFreq`, `freqToMidi`, `noteName(midi, { lang, pref, octave })`, `spell(midi, pref)` → `{ letter, acc, octave, step }`,
`naturalMidi(letter, octave)`, `isNatural`, `LETTERS[lang]`, `SCALES` (major, minor, pentaMajor, pentaMinor, blues, dorian, …),
`scaleNotes(root, scaleId, lo, hi)`, `INTERVALS` (semi, id, en, fr), `CHORDS` (steps, en, fr, symbol), `chordNotes(root, type)`,
`rand(n)`, `pick(arr)`, `shuffle(arr)`, `mod`.

## staff.js

`renderStaff(container, { clef: 'treble'|'bass'|'alto'|'tenor', keySig: -7..7, notes: [{ midi | [midis], pref, color, stem, acc: false | 'natural', spell: [{ step, acc }] }], width, gap })` → svg.
`keySig`: flats if negative, sharps if positive. `acc: false` hides the accidental (covered by the key signature). `spell` gives the exact spelling of each head (step: C4 = 28, one per diatonic step; acc -2..2) when sharp/flat `pref` is not enough (E♯, C♭, double accidentals).

## keyboard.js

`createKeyboard(container, { from, to, onDown(midi), onUp, labels, sound, timbre })` and
`createPads(container, { notes: [midi], onDown, onUp, labels, sound, timbre })`.
Both return `{ el, flash(midi, 'ml-hit'|'ml-good'|'ml-bad'|'ml-hint', ms), setEnabled(bool) }`.

## pitch.js

`micSupported()`, `await startMic({ onPitch })` → `{ stop() }`. `onPitch({ freq, midi, note, cents, clarity, rms })`, `freq: null` when silent.
`detectPitch(float32, sampleRate)` for tests.

## mastery.js / storage.js

`loadItemMastery(skill)` → Map item → `{ score, n, status }`; `pickWeak(items, stats, { keyOf, avoid })` picks a question, favouring weak items.
`loadMastery()` → Map skill → stats. `getAttempts({ game, skill })`.

## taxonomy.js

`SKILLS` (id, domain, level, game, en, fr, penta), `DOMAINS`, `LEVELS`, `GAMES`. Use existing skill ids only.

## Testing

`npx vite --port <port> --strictPort` then `PORT=<port> node tools/shot.mjs /<slug>/ out.png dark|light "<js run in page>"`.
The script prints console errors. `LOCALE=en-US` switches the language.

## Conventions shared by the games

- A wrong answer is logged once per question, then the player retries the same question. A success is logged too.
- After a run of clean successes (6 to 10), show a one-tap "next level" button that calls `game.set('level', n + 1)`.
- Expose `window.__test = { state() , ... }` so a script can play the game. Put that script in `tools/<slug>.test.mjs`
  (see `tools/second-voice.test.mjs` and `tools/ear-cadences.test.mjs`): it plays every level, checks the attempts in IndexedDB,
  checks there is no console error and no horizontal overflow at 390 px, and exits non-zero on failure.
- Microphone games: the app never listens while it plays a sound of its own (see `apps/second-voice/main.js`).
- Two threads run through all levels, first by ear and by hand, later with their names:
  the five-note (pentatonic) scale, and tension and release (second voice, cadences).
