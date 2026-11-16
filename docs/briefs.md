# Game briefs

## ear-scales — "Scales by ear" / "Gammes à l’oreille" — skill `listen.scales`
The app plays a scale. L1 bright or dark: major vs natural minor, two icon buttons (sun, moon as in ear-chords), no names.
L2 major, natural minor, major pentatonic, minor pentatonic, named. L3 natural, harmonic, melodic minor.
L4 major, dorian, mixolydian, natural minor. L5 the seven modes. L6 adds whole tone, blues, harmonic minor (4–6 choices shown).
After a wrong answer, play the chosen scale then the right one. Random tonic. item = scale id.

## ear-jazz — "Jazz colours" / "Couleurs jazz" — skill `listen.jazz`
A chord with extensions (root in the bass, upper voicing mid-register, an arpeggio replay button as in ear-chords).
L1 plain or coloured: seventh chord vs the same with a ninth, two icon buttons. L2 dominant: 7, 9, 13, 7sus4.
L3 major: maj7, maj9, 6/9, maj7♯11. L4 altered dominants: 7♭9, 7♯9, 7♯11, 7♭13. L5 minor: m7, m9, m11, m6, m(maj7).
L6 mixed, 5–6 choices. Random root. item = chord id.

## ear-progressions — "Chord paths" / "Suites d’accords" — skill `listen.progressions`
The app plays 3–4 chords (bass + chord, voiced as in ear-cadences). The player rebuilds the sequence by tapping chord pads
(each pad plays its chord). Slots show the answer; undo; checked when complete; wrong positions marked, replay, retry.
L1 I and V, 3 chords starting on I, two coloured pads without names. L2 I, IV, V, coloured pads without names.
L3 I, IV, V with roman numerals and chord names, 4 chords. L4 adds vi and ii. L5 adds iii, V7 and minor keys (i, iv, V, VI).
L6 jazz: ii7, V7, Imaj7, vi7 plus one secondary dominant or ♭II7. Random key. item = progression, e.g. 'I-IV-V-I'.

## melody-dictation — "Write the tune" / "Écris la mélodie" — skill `listen.dictation`
The app plays a short melody. The first note is written on the staff. Each key pressed on the on-screen keyboard sounds and is
added to the staff; undo; replay. When complete: right notes in `var(--good)`, wrong in `var(--bad)`, replay, correct it
(wrong attempt logged once). L1 3 notes, steps, C major pentatonic, C4–A4. L2 4 notes, steps and thirds, C major.
L3 5 notes, leaps to a fifth. L4 6 notes in G, F, D or B♭ major with key signature (`keySig`, `acc: false`).
L5 minor keys with raised seventh, 6–7 notes. L6 8 notes, chromatic passing notes, treble or bass clef.
Musical melodies (mostly steps, end on tonic or fifth). item = number of notes.

## sight-sing — "Sing the score" / "Chante la partition" — skill `sing.sight`
The staff shows a melody. The app plays only the first note, then the player sings each note (pitch tracking as in second-voice:
held ~0.6 s, any octave, `tolerance` and `voice` settings, the voice setting transposes the melody; never listen while playing).
Current note in accent colour, sung notes in good colour, a small above/below indicator. A steady wrong note for 2 s = mistake
(logged once), restart from the first note. Skip button, "first note again" button. On success the app plays the melody.
Refused microphone: message + retry. L1 2–3 notes by step from the tonic. L2 3–4 notes, pentatonic steps. L3 steps, thirds,
tonic triad. L4 leaps to a fifth, 5 notes. L5 other keys with key signatures. L6 minor and one accidental, 6 notes.
Test with injected pitches (`window.__test.feed`). item = notes + ':' + widest interval, e.g. '4:3'.

## play-scales — "Play the scale" / "Joue la gamme" — skill `play.scales`
The player plays a scale note by note on the on-screen keyboard (a microphone input mode is optional: skip it if it costs much).
Dots show progress. L1 first five notes of C major up, next key hinted. L2 C major up and down, no hints.
L3 G, F, D major (start key marked). L4 any major key. L5 natural minor, harmonic minor.
L6 dorian, mixolydian, major and minor pentatonic, blues. Scale name shown small from L3. A `model` toggle: the app plays the
scale first (L1–L3). Wrong note: flash bad, logged once per scale, continue from the same note. item = scaleId:tonicPc.

## play-chords — "Play the chord" / "Joue l’accord" — skills `play.chords` (L1–L5), `play.cadence` (L6–L7)
Latched keys: a tap sounds the key and toggles it; when as many keys as chord notes are latched, the chord is played and checked;
wrong keys flash bad and release. Any voicing with the right pitch classes is accepted unless an inversion is asked.
L1 the app plays a white-key triad (C, F, G) and flashes its keys once; rebuild it. L2 from the name: C, F, G, Am, Dm, Em.
L3 all major and minor triads. L4 inversions (lowest note asked), diminished, augmented. L5 maj7, 7, m7.
L6 a cadence as two chords in C, G or F: perfect V–I, plagal IV–I, half I–V, deceptive V–vi; cadence name and chord names
shown (FR: cadence parfaite, plagale, demi-cadence, rompue); the app adds the bass and replays the cadence on success.
L7 ii–V–I with sevenths in several keys. item = 'maj', 'min:inv1', 'dom7'… or cadence id.

## tap-rhythm (existing game, add one level) — level 9, skill `rhythm.odd` — "Odd meters" / "Mesures asymétriques"
Read all files of `apps/tap-rhythm/` first; a partial level 9 may exist. Bars in 5/8 (3+2, 2+3), 7/8 (2+2+3, 3+2+2, 2+3+2), 5/4.
Count-in follows the grouping (accents on group starts). Patterns from group cells, notation beamed by group with the time
signature. Levels 1–8 must behave as before; level 8 now offers level 9. Write `tools/tap-rhythm.test.mjs` for the 9 levels
(expose expected onsets and turn start through `window.__test`). item = e.g. '7/8:2+2+3:<pattern>'.

## two-hands — "Two hands" / "Deux mains" — skill `rhythm.poly`
Two very large pads, left and right, each with its own sound; keys F and J too. Two lanes show expected hits and a cursor;
after the turn, taps appear coloured by accuracy (as in tap-rhythm; copy code, do not import across apps).
Settings tempo, latency, tolerance. Count-in, then one or two cycles; a listen button (automatic at low levels).
L1 alternate left/right on the beat. L2 left keeps the beat, right twice as fast. L3 left keeps the beat, right plays short
rhythms. L4 3 against 2 (composite shown and played first). L5 2 against 3, 4 against 3. L6 3 against 4, 5 against 4.
Each hand judged on its lane. item = 'alt', '2:1', '3:2'…

## key-signatures — "Key signatures" / "Armures" — skill `read.keysig`
L1 a staff with 0–2 sharps or flats and one note drawn without accidental: play it on the keyboard as the signature says.
L2 same, up to 4. L3 name the major key (4 choices), up to 4; then the app plays the scale. L4 all 7. L5 relative minors.
L6 all clefs, major or minor, plus the reverse (key named, pick among four small staves).
item = '+3', '-2', '0', with ':m' (minor) or ':n' (note-playing).

## score-reading — "Transpose" / "Transpose" — skill `read.score`
L1 a note written for a B♭ instrument: play the sounding note (major second lower); the first rounds show and play the gap.
L2 E♭ (major sixth lower) and F (fifth lower). L3 reverse: sounding note shown, pick the written note among four small staves.
L4 two staves in different clefs: play the marked one. L5 transpose a 3–4 note motif by a named interval, entered on the
keyboard onto a second staff. L6 a motif for a B♭ or E♭ instrument with key signatures: enter the sounding notes.
Instrument named small (FR « en si♭ »). item = 'Bb', 'Eb', 'F', 'clef:alto', 'up:M2'…

## read-intervals — "Read the interval" / "Lis l’intervalle" — skill `read.intervals`
Two notes on the staff. Generate notes as letter + accidental + octave and draw with `spell` (C–E♭ = minor third).
L1 same, step or skip: three drawn buttons, no names. L2 second to fifth, naturals, treble. L3 to the octave, treble and bass.
L4 major or minor seconds and thirds. L5 all common qualities (M/m 2 3 6 7, P4 P5 P8, A4, d5). L6 key signatures, stacked,
four clefs. 4–6 choices. The interval is played after each answer. item = 'same', 'step', 'skip', '3', 'M3', 'A4'…

## read-chords — "Read the chord" / "Lis l’accord" — skill `read.chords`
A chord stacked on the staff, exact spelling through `spell`. L1 root-position triad on naturals: tap the root name.
L2 major or minor (C F G / D E A). L3 four qualities with accidentals. L4 root position, first or second inversion, then the root.
L5 maj7, 7, m7, m7♭5. L6 full name among four, key signatures, treble or bass, inversions. The chord is played after each answer.
item = 'root', 'maj', 'min', 'dim', 'aug', 'inv0', 'inv1', 'inv2', 'maj7', 'dom7', 'min7', 'm7b5', 'full'.

## build-scales — "Build the scale" / "Construis la gamme" — skills `theory.scales` (L1–L4), `theory.modes` (L5–L6)
Latched keys on a keyboard; when the expected number is latched, the scale is played and checked.
L1 C major by ear (the app plays it, start key marked); after success a strip shows the pattern as wide and narrow blocks
(FR "1 ton", "½ ton"). L2 G and F major by ear: one black key is needed. L3 any major scale from the strip.
L4 natural and harmonic minor; relative minor ("same notes, another home": tap the new home).
L5 modes as the same notes from another start: pick the start note for dorian, phrygian, lydian, mixolydian, aeolian.
L6 change the one note that turns major or minor into lydian, mixolydian, dorian, phrygian; remove two notes of the major
scale to get the major pentatonic; add one note to the minor pentatonic to get the blues scale. item = scaleId:tonicPc or kind.

## build-chords — "Build the chord" / "Construis l’accord" — skills `theory.intervals` (L1–L3), `theory.chords` (L4–L6)
L1 one key lit, the app plays an interval, tap the second key (white keys); the number name appears after.
L2 major or minor seconds and thirds, shown as a strip of half-step blocks; some rounds: two lit keys, choose the name.
L3 all intervals to the octave, up and down, both question directions. L4 stack thirds: major and minor triads from a recipe
of two blocks. L5 dim, aug, sus4, inversions; symbol → keys and keys → symbol. L6 sevenths (maj7, 7, m7, m7♭5, dim7), a few ninths.
Latched keys as in build-scales. item = interval or chord id (':inv1' suffixes).

## circle-of-fifths — "Circle of fifths" / "Cycle des quintes" — skill `theory.keys`
An SVG circle of 12 segments (majors outside, relative minors inside from L5). A tap plays the tonic chord.
L1 one step round: after hearing a chord and the one a fifth higher, tap the next segment clockwise; labels appear when found.
L2 place the sharp-side keys. L3 place the flat-side keys. L4 signature on a small staff (`keySig`) → key, and the reverse.
L5 relative minors. L6 neighbours: tap IV and V of a key; follow ii–V–I by roots; tap the tritone.
item = 'next:G', 'place:Eb', 'sig:+3', 'rel:A', 'V:F', 'tritone:C'…

## harmony-lab — "Harmony lab" / "Atelier d’harmonie" — skills `theory.harmony` (L1–L5), `theory.jazz` (L6–L8)
Chords are blocks; every block can be heard before it is placed. L1 three blocks with colour and shape, no names (rest,
movement, tension); a 4-chord phrase with one empty slot and a goal icon (settled / hanging, drawings of ear-cadences):
pick the block that reaches the goal. L2 same with I, IV, V and the words tonique, sous-dominante, dominante.
L3 harmonise a 4-note melody with I, IV, V (the chord must contain the note; start on I, end by the goal; several answers).
L4 ii, vi, iii as family members; several keys. L5 minor keys, V7, one secondary dominant.
L6 build ii–V–I in a key from six chord-symbol blocks. L7 tritone substitute, backdoor; pick the five-note scale that fits a chord.
L8 turnarounds (I–vi–ii–V and variants); label each chord of a jazz progression as rest, movement or tension.
item = 'goal:settled', 'melody', 'family', 'iiVI:F', 'tritone', 'scale', 'turnaround'…

# Second wave

## platform — profiles, guided path, compare, rewards (edits `packages/core`, `apps/hub.*`, `apps/index.html`, `apps/mastery-map/`)
Do these in order; each must work before the next. Write `tools/platform.test.mjs`.
1. `?level=N` in a game URL: `createGame` applies it to `settings.level` (if that option exists) and saves it.
2. Profiles: several learners on one device. A profile = `{ id, name, emoji-free initial colour }` kept in localStorage; the
   active profile id is stored too. Every new attempt carries `who: <profile id>`; attempts without `who` belong to the first
   profile. `getAttempts`, mastery, settings (keys become per-profile, old keys migrate to the first profile), export/import all
   work on the active profile by default (`getAttempts({ who: '*' })` for all). Exported results keep `who` and the profile name.
   Home page: a small profile switcher in the top bar (add, rename, switch, delete with an in-page confirmation).
3. Guided path, `packages/core/path.js`: `nextSteps(attempts, { count })` returns the 3–5 best things to play now as
   `{ game, level, skill, reason: 'new' | 'weak' | 'review' }`. Rules: skills of the lowest taxonomy level not yet 'good' first,
   one per domain; skills whose mastery faded come back as 'review'; never propose a skill more than two taxonomy levels above
   the learner's median level in that domain. Each game level maps to a skill: add an optional `levels` table to `GAMES` in
   `taxonomy.js` only if you can derive it reliably by reading each game's `main.js`; otherwise link to the game without a level.
   Home page: a "Today" block at the top ("Aujourd’hui") with these steps as large tiles, then the full list by domain.
4. Compare: importing a results file made by another profile offers "add as a new profile". The mastery map gets a
   "compare with…" selector that shows two profiles side by side per skill.
5. Rewards, wordless and calm: a day streak (days with at least one attempt) and one to three stars per skill
   (learning, good, mastered) on the home tiles and the map. No sound, no pop-up.
6. Service worker update: when a new version is installed, the page shows a small "new version · reload" toast.

## midi — real keyboards, better piano, microphone for scales (edits `packages/core/keyboard.js`, `audio.js`, new `midi.js`, `apps/play-scales/`)
1. `packages/core/midi.js`: Web MIDI input (`navigator.requestMIDIAccess`, optional, silent if absent or refused).
   `createKeyboard` and `createPads` forward incoming note-on / note-off to `onDown` / `onUp` when the note is one of their keys,
   and light the key. Nothing changes for players without a MIDI device. Test with a fake `requestMIDIAccess` injected by the test.
2. `audio.js`: a more piano-like `piano` timbre (several partials, short hammer noise, level-dependent decay), same API and
   similar loudness. No samples, nothing downloaded.
3. `apps/play-scales/`: an `input` setting (keyboard / instrument through the microphone) with the transposition setting, as in
   `apps/play-the-note/`. Any octave accepted, a note counts when held in tune ~0.4 s. Extend `tools/play-scales.test.mjs`
   with injected pitches. Write `tools/midi.test.mjs`.

## read-melody — "Read and play" / "Lis et joue" — skill `read.melody`
A short melody written with its rhythm (own SVG renderer in the app: staff, clef, time signature, note heads, stems, beams,
rests; copy ideas from `apps/tap-rhythm/notation.js` and `packages/core/staff.js`). After a count-in the player plays it on
the on-screen keyboard in time with a click. Judged on pitch order and on timing (tolerance setting, latency setting);
a wordless timeline shows early / late / wrong. L1 quarters and halves, 3 notes by step, C–G. L2 4–5 notes, adds pairs of
eighths. L3 thirds, a quarter rest. L4 G and F major with key signature, dotted quarter + eighth. L5 6/8 or 3/4, leaps to a
fifth. L6 minor, sixteenths, bass clef. A listen button plays the model. item = level kind + ':' + number of notes.

## rhythm-dictation — "Write the rhythm" / "Écris le rythme" — skill `rhythm.dictation`
The app plays a one-bar rhythm over a click. The player rebuilds it by tapping beat-sized cells (drawn in notation, copy the
renderer of tap-rhythm) into the slots of the bar; each cell can be heard; undo; checked when full; wrong beats marked,
replay, retry. L1 quarter, two eighths, half (2 beats). L2 adds the quarter rest. L3 adds four sixteenths and
eighth + two sixteenths. L4 dotted quarter + eighth, syncopation. L5 triplets. L6 two bars, 6/8 cells. item = pattern id.

## two-voices — "Two voices" / "Deux voix" — skill `listen.twovoices`
The app plays two lines together (a bass and a melody, 3–5 notes each, note against note). Two staves (treble, bass). The
first note of each is given. The player picks a staff (tap it), then enters its notes on the keyboard as in
`apps/melody-dictation/` (copy what you need). Buttons: hear both, hear top only, hear bottom only. Checked when both are
complete; wrong notes in `var(--bad)`. L1 the bass holds one note, 3 melody notes. L2 the bass alternates tonic and fifth.
L3 parallel thirds or sixths. L4 contrary motion. L5 I–IV–V–I bass with a free melody. L6 minor, 5 notes, one suspension.
item = texture id ('drone', 'tonic-fifth', 'parallel', 'contrary', 'cadence', 'suspension').

## music-words — "Music words" / "Les mots de la musique" — skills `listen.expression` (L1–L3), `read.expression` (L4–L6)
L1 the same short tune twice, one loud and one soft (or fast / slow): which was louder (faster)? Two big buttons "1" "2".
L2 short (staccato) or smooth (legato); getting louder or softer: answer with drawn icons (dots, a slur, an opening or
closing hairpin). L3 the app plays a tune one way; pick among the signs p, f, staccato dot, slur, crescendo, diminuendo.
L4 signs to words: pp p mp mf f ff, and the reverse; hear each. L5 tempo terms (largo, adagio, andante, moderato, allegro,
presto) ordered from slow to fast, and matched to a tune played at that tempo. L6 articulation and expression terms
(staccato, legato, accent, fermata, ritardando, accelerando, da capo, coda): hear or see, pick the term; short plain
definitions in both languages appear after the answer. Italian terms stay in Italian. item = term or contrast id.

## form — "Phrases and form" / "Phrases et forme" — skill `listen.form`
Tunes are generated from short phrases (2 bars, pentatonic or major). L1 same or different: two phrases, two icon buttons.
L2 question or answer: does the phrase end hanging or settled (drawings of `apps/ear-cadences/`)? L3 the app plays three or
four phrases; the player labels them with coloured blocks (first is A; same = same colour): AAB, ABA, AABA, ABAB.
L4 with varied repeats (A, A′). L5 name the form: binary, ternary, rondo (ABACA), theme and variation (FR: forme binaire,
ternaire, rondo, thème et variations). L6 count the bars of a phrase (4, 6, 8) and find where the tune modulates.
Every phrase can be replayed by tapping its block. item = form id.

## known-tunes — "Tunes you know" / "Airs connus" — skill `play.tunes`
Only traditional, public-domain melodies, stored as MIDI note lists with their names in both languages, no lyrics
(for example Frère Jacques, Au clair de la lune, Ah ! vous dirai-je maman, Ode to Joy, Sur le pont d’Avignon, Mary had a
little lamb, London Bridge, J’ai du bon tabac, Alouette, Oh ! Susanna, Amazing Grace, Greensleeves): check every note
list by degrees before using it. The player rebuilds a tune by ear on the keyboard, phrase by phrase: the app plays a phrase,
the player plays it back; wrong key flashes, logged once per phrase. L1 3–5 note openings on white keys with the start key
marked. L2 whole first phrases. L3 full tunes phrase by phrase. L4 the same in G or F. L5 minor or wider tunes.
L6 start from any key (transpose by ear). The tune's name is shown only after success at L1–L2. item = tune id.

## compose — "Make a tune" / "Invente un air" — no skill, nothing is logged
A calm sandbox. A grid of 16 steps by 6 rows (pentatonic by default, no wrong note); tapping a cell toggles a note and
sounds it; play / stop loops the tune with a moving cursor; a tempo setting; a scale setting (major pentatonic, minor
pentatonic, major, minor, blues); an optional second layer of four chord blocks (I, IV, V, vi) under the grid, one per bar;
clear; tunes are kept in localStorage (three slots) and can be exported / imported as a small JSON file (own buttons in the
page, same file style as the core). No score, no judgement. The test checks toggling, playback order, save and reload.

## threads — tension and release in two existing games (edits `apps/second-voice/`, `apps/penta-jam/`)
1. `apps/second-voice/`: add level "Chains of suspensions" / "Retards en chaîne", skill `sing.voice.chain`, placed before the
   improvisation level (which stays last). The bass moves down by step while the singer holds, then resolves down:
   7–6 chains (two or three links) and 4–3 chains; the held note is a tension (striped band), its resolution a rest.
   Update `tools/second-voice.test.mjs` for the new level count.
2. `apps/penta-jam/`: add a level "Tension and release" / "Tension et détente", skill `play.tension`, after the three-chord
   levels: backing I–V–I–V (then I–IV–V–I); one extra pad outside the five notes (the fourth, then the seventh) is drawn
   differently; the goal of a phrase: play that pad on the V chord and move to a neighbouring pad when I returns.
   Renumber later levels consistently. Write `tools/penta-jam.test.mjs` covering every level (expose what it needs through
   `window.__test`).

## tests-a — tests only for `high-low`, `echo-penta`, `ear-intervals`, `ear-chords`
Write `tools/<slug>.test.mjs` for each (every level: a wrong answer then right ones, attempts in IndexedDB, theory recomputed
from the notes, no console error, no overflow). You may add or extend a `window.__test` hook in each app and fix real bugs
you find (report them); change nothing else in the apps.

## tests-b — tests only for `sing-match`, `play-the-note`, `find-a-note`
Same rules as tests-a. `sing-match` and the microphone mode of `play-the-note` are tested with injected pitches.
