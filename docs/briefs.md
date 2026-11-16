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
