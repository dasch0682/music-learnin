# Feedback spec: success and error notifications

One setting, shared by all games, per profile. Design only; nothing here is implemented yet.
## Principles

- An error is information, never a punishment: no buzzer, no shake for a child, no red cross. The cue says "try again".
- Feedback must not mask or prime the music: it is short, quiet, has no stable pitch (glides and noise, no notes, no chords), and ends before the next prompt.
- After two misses on a question the right answer is shown.
- Praise effort, recovery and streaks. Never praise speed (`ms` is never used for feedback).
- Messages are rare: most answers get no text. Celebrations are rarer.
- Never colour alone: every cue also has a shape (✓ / ↺) and an `aria-live` text.

## Modes

| | `silent` | `discreet` | `normal` (default) | `encouraging` |
|---|---|---|---|---|
| Sound | none | none | soft glide, good and bad | warmer double glide (good), softer single glide (bad) |
| Stage visual | tint, no shake | none | tint, 3 px shake on error | tint at lower strength, no shake |
| Badge (top bar, next to score) | ✓ / ↺ | ✓ / ↺ (only cue) | ✓ / ↺ | ✓ / ↺ + score pulse |
| Per-answer message | none | none | none | bank lines, rate limited (below) |
| Celebration (streak) | none | none | score pulse at 10 | stars + sound + message at 5, 10, 20, then every 20 |
| Celebration (level up) | toast only | toast only | toast + score pulse | toast + stars + sound |
| Error handling | tint, ↺ | ↺ | tint, shake, ↺, soft sound | tint, ↺, gentle line on first miss only |
| Vibration (if enabled) | no | yes | yes | yes |

Every mode: wrong button keeps `ml-wrong`, the player retries, and the answer is revealed after the 2nd miss.

Default: `normal`. Profiles hold only `{ id, name, hue }`: there is no age or child flag, and none is added. The profile dialog on the home page shows the mode selector on each profile row, so a parent sets `encouraging` for a child in one tap.

## Storage

- Pseudo-game id `_feedback`, read and written with the existing `getSettings('_feedback', defaults)` / `saveSettings('_feedback', obj)`.
- Keys that result: `ml:settings:_feedback` (first profile), `ml:psettings:<id>:_feedback` (others).
- Value: `{ "mode": "silent" | "discreet" | "normal" | "encouraging", "haptics": false }`. Unknown or missing mode → `normal`.
- This is per profile, travels with "export all settings" / import, and is erased by `removeProfile`, with no change to `profiles.js` or `transfer.js`. A per-game settings export does not include it (intended).
- New `packages/core/feedback.js` exports `getFeedback()` → `{ mode, haptics }`, `setFeedback(patch)`, `FEEDBACK_MODES`, `MESSAGES`, `pickMessage(kind, lang, recent)`.
- `createGame` and `createPage` set `document.documentElement.dataset.fb = mode` (CSS hook), and refresh it on `onProfile` and after a settings import.
- UI: a `select` "Feedback / Retours" (Silent/Silencieux, Discreet/Discret, Normal/Normal, Encouraging/Encourageant) and a toggle "Vibration / Vibration" (hidden when `navigator.vibrate` is absent) in both settings dialogs (`shell.js`, `page.js`), under Theme. A select, not a segmented control: four labels do not fit at 390 px.

## shell.js API

Existing calls keep working unchanged. `silent` keeps its meaning (no sound for this call).

```js
createGame({ ..., quiet: (ms) => {} })   // optional: called with the length of every shell sound, before it starts (mic games)
game.flash(correct, { silent, haptic = true })            // unchanged signature; applies the mode; no streak, no message
await game.attempt({ ..., silent, haptic, revealed })     // as today + shell streak, messages, milestones
game.feedback(kind, { silent, haptic, message })          // kind: 'good' | 'bad' | 'streak' | 'level'; the single place that does sound, visual, badge, toast
game.celebrate(message?)                                  // = feedback('level', { message }); for level-up and "top" toasts
game.streak                                               // clean successes in a row, as counted by the shell
game.fb                                                   // { mode, haptics } (live)
```

- `flash` and `attempt` call `feedback`. Games never call `sfx()`.
- Shell streak: `attempt({ correct: true })` → +1; `attempt({ correct: false })` → 0 and marks the question as missed; the next `flash(true)` or correct attempt after a miss is a "recovery". A game's own streak (for its next-level button) stays as it is.
- `revealed: true` on an attempt means the game showed the answer: no praise for that success.
- `game.say` is unchanged and always shown (it also carries import messages).
- Toast queue: a shell message never replaces a `say`/`celebrate` toast shown less than 2.2 s ago.
- Test hook: every `feedback` pushes `{ kind, mode, sound, ms, visual, message, haptic }` to `window.__fb` (last 50). `sound` is the sound name or `null`.

## Messages (encouraging mode only)

Rules: French uses "tu". At most one toast every 8 s. Never one of the last 3 lines shown. Toast lasts 1.6 s.
Success line: on a recovery, and at streak 3. Milestones (5, 10, 20, +20) use the streak lines with `{n}`.
Error line: only on the first miss of a question, and never twice in a row (the second missed question in a row gets no text).

| Kind | EN | FR |
|---|---|---|
| good | Yes! | Oui ! |
| good | Well listened. | Bien écouté. |
| good | Nicely done. | Joli. |
| good | You've got it. | Tu l'as. |
| good | Good ear. | Bonne oreille. |
| recovery | You found it! | Tu as trouvé ! |
| recovery | Well persisted. | Tu n'as pas lâché, bravo. |
| recovery | Trying again works. | Réessayer, ça marche. |
| streak | {n} in a row! | {n} à la suite ! |
| streak | {n} in a row. You're focused. | {n} à la suite. Tu es concentré·e. |
| streak | {n} in a row. Keep that calm pace. | {n} à la suite. Garde ce rythme tranquille. |
| bad | Not yet. Try again. | Pas encore. Essaie encore. |
| bad | Almost. Listen once more. | Presque. Écoute encore une fois. |
| bad | Take your time. | Prends ton temps. |
| bad | Close. One more try. | Pas loin. Encore un essai. |
| bad | Mistakes help you learn. | On apprend en se trompant. |
| bad | That one is tricky. | Celle-là est difficile. |

"Good ear" / "Listen once more" are used only when `createGame({ ear: true })` is set; other games skip those two lines.

## Sound design

New `sfx(name, { gain })` names in `audio.js`; `'good'` and `'bad'` stay as aliases of the normal pair. All go to `master`.
Each is one or more oscillators with a frequency glide: no steady pitch, so no key or interval is suggested to the ear.
Exercise notes play at gain about 0.3; feedback peaks at 0.07 or less. Envelope: 8 ms linear attack, exponential decay to 0.0001.

| Name | Mode | Voice | Total |
|---|---|---|---|
| `good` | normal | sine, 620 → 930 Hz exponential over 90 ms, peak 0.07 | 140 ms |
| `bad` | normal | sine, 300 → 210 Hz over 150 ms, peak 0.06, lowpass 800 Hz | 200 ms |
| `good-warm` | encouraging | triangle through lowpass 1800 Hz: 520 → 780 Hz (80 ms), then at +90 ms 700 → 1050 Hz (100 ms), peak 0.06 | 240 ms |
| `bad-soft` | encouraging | sine, 330 → 260 Hz over 180 ms, peak 0.045 | 220 ms |
| `cheer` | streak, level up (normal: level up only) | three triangle glides at 0, 90, 180 ms: 660 → 990, 830 → 1245, 990 → 1480 Hz (90 ms each), peak 0.06, plus highpassed (6 kHz) noise shimmer 120 ms at peak 0.015 | 420 ms |

- `cheer` replaces the answer sound of that attempt; two sounds never stack.
- Guarantee for games: an answer sound ends within 250 ms, `cheer` within 450 ms. Existing delays before the next prompt audio are 450 ms or more (replay after an error: 650 ms or more), so nothing overlaps. Keep those minimums in new games.
- Sounds start immediately and are never quantised to a beat. Games with running music keep `silent: true`.
- `silent: true` on the call, `silent` mode and `discreet` mode all skip the sound and do not call `quiet`.
- Haptics (off by default): good `navigator.vibrate(12)`, bad `[18, 50, 18]`, cheer `[12, 40, 12, 40, 24]`. Skipped when `quiet` is set (a phone that vibrates is heard by its own microphone), when `haptic: false`, and in `silent` mode.

## CSS and animation (core.css)

- `.ml-stage.ml-good` / `.ml-bad` keep their names. Strength by `:root[data-fb]`: normal and silent 18 % tint; encouraging 12 %; discreet `animation: none`. Shake (`translateX`) only when `data-fb="normal"`, reduced from 5 px to 3 px.
- New `.ml-fb` badge in the top bar before the score: `✓` (class `ml-fb-good`, `--good`) or `↺` (`ml-fb-bad`, `--muted`, not red), visible 700 ms, opacity fade. It sits in an `aria-live="polite"` region with a hidden text ("Correct / Juste", "Try again / Essaie encore").
- `.ml-score.ml-pulse`: scale 1 → 1.25 → 1 in 400 ms.
- `.ml-stars`: 5 "★" spans in `--accent`, fixed near the score, each moving 24 to 40 px outward and fading in 700 ms. No full-screen confetti. `pointer-events: none`.
- `.ml-btn.ml-reveal` (the right answer shown after two misses): `outline: 3px dashed var(--good)` plus a `✓` in an absolutely positioned corner badge (no text change, no layout change).
- `.ml-btn.ml-right` gets the same corner `✓`; `.ml-btn.ml-wrong` gets `text-decoration: line-through`. This covers colour-blind players.
- `@media (prefers-reduced-motion: reduce)`: no transform anywhere (shake, pulse, stars: stars appear static for 700 ms then go), tint becomes a 150 ms opacity fade, toast has no slide.

## Games to change

No game calls `sfx()` directly. All 34 go through `game.attempt` / `game.flash`, so modes apply everywhere without edits. Required edits:

| Game | Change |
|---|---|
| second-voice, sing-match, sight-sing, play-the-note | Pass `quiet: sound` to `createGame` (the local `sound(ms)` that moves `quietAt`). Remove the hand-written `sound(450)` before `game.attempt` / `game.flash`. `sound` must be declared before `createGame` or wrapped: `quiet: (ms) => sound(ms)`. |
| play-scales | Always passes `silent: true`, so the shell makes no sound. Add `quiet: (ms) => { quietAt = Math.max(quietAt, performance.now() + ms + 150); }` anyway, so `celebrate` is safe. |
| penta-jam | Keeps `silent: true` (the band is playing). Add `haptic: false`. |
| tap-rhythm, two-hands, read-melody | Feedback comes after the run, so sound is fine. Replace `game.say(game.t('levelUp'))` by `game.celebrate(game.t('levelUp'))`. Local `tr-ko` / `th-ko` / `rm-ko` styles: check they have no shake under `data-fb="encouraging"`. |
| echo-penta, known-tunes, find-a-note | `game.say(game.t('levelUp'))` → `game.celebrate(...)`. |
| 18 games with a `top` toast (ear-* ×6, build-chords, build-scales, read-chords, read-intervals, form, music-words, high-low, circle-of-fifths, harmony-lab, two-voices, melody-dictation, rhythm-dictation) | `game.say(game.t('top'))` → `game.celebrate(game.t('top'))`. |
| Choice games (ear-cadences, ear-chords, ear-intervals, ear-jazz, ear-scales, high-low, find-a-note, music-words, form, read-chords, read-intervals; check the others) | Count misses per question; on the 2nd miss add `ml-reveal` to the right button and pass `revealed: true` on the following success. key-signatures and score-reading already do this with `kb.flash(…, 'ml-hint')`: no change. |
| find-a-note, play-the-note, key-signatures, score-reading, read-chords, read-intervals, ear-intervals | Already pass `silent` when the answer makes its own note. No change. |
| compose | No answers. No change. |
| Apps with their own `prefers-reduced-motion` rules (build-scales, play-scales, sing-match, second-voice, play-the-note) | No change; check they do not override the new core rules. |
Order of work: core (feedback.js, audio.js, shell.js, page.js, core.css, README) → microphone games → `celebrate` swaps → reveal.

## Test plan

New `tools/feedback.test.mjs` (Playwright, like `platform.test.mjs`), added to `tools/test-all.mjs`:

1. Default: fresh context → `data-fb="normal"`, no `_feedback` key yet; after one right and one wrong answer in `ear-cadences`, `__fb` has `sound: 'good'` then `sound: 'bad'`, `message: null`.
2. Storage: set the mode in the game dialog → `ml:settings:_feedback` is `{"mode":"encouraging",...}`; reload keeps it; a second profile reads `normal` and writes `ml:psettings:<id>:_feedback`; the home dialog shows the same value.
3. `silent` and `discreet`: every `__fb` entry has `sound: null`; in `discreet` the stage never gets an animation (`getComputedStyle(stage).animationName === 'none'`) and `.ml-fb` is shown.
4. `encouraging`: wrong answer → `sound: 'bad-soft'`, a message that belongs to the `bad` bank in the page language (run once with `LOCALE=en-US`, once in French); a second wrong answer on the same question → no message; computed stage transform stays `none` (no shake); 5 clean answers → one `__fb` entry with `kind: 'streak'`, `sound: 'cheer'`, and `.ml-stars` present.
5. Chatter limit: 12 clean answers in a row produce at most 3 messages, none repeated.
6. No speed praise: same run with `ms: 50` and `ms: 20000` gives the same `__fb` kinds.
7. `silent: true` on a call → `sound: null` in every mode (check `find-a-note` with "Play the note" on).
8. Microphone: in `second-voice` (fake mic as in its test), after an answer `__test.state().listening` is false for at least the `ms` reported in `__fb`, in `normal` and `encouraging`; and no `haptic` entry.
9. Reveal: two wrong answers in `ear-cadences` → exactly one `.ml-reveal` button, and it is the expected answer from `__test.state()`.
10. Reduced motion (`reducedMotion: 'reduce'` context): no element with a non-`none` transform during feedback; badge still shown.
11. Accessibility: `.ml-fb` has text content and sits in an `aria-live` region; no horizontal overflow at 390 px with toast and stars shown; no console error.
12. Unit (Node, no browser): each sfx name schedules within its stated total length; `pickMessage` never returns one of the `recent` lines; every bank line has `en` and `fr`, 40 characters or less.

Existing game tests must pass unchanged (fresh contexts run in `normal`; logged attempts are identical). Note: games that drop their own `sound(450)` rely on `quiet`; their tests check `listening`.
