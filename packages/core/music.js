// Music theory helpers. Notes are MIDI numbers (60 = C4 / Do3 in French octave naming).

export const A4 = 440;
export const midiToFreq = (m) => A4 * 2 ** ((m - 69) / 12);
export const freqToMidi = (f) => 69 + 12 * Math.log2(f / A4);
export const mod = (n, m) => ((n % m) + m) % m;

export const LETTERS = {
  en: ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
  fr: ['Do', 'Ré', 'Mi', 'Fa', 'Sol', 'La', 'Si'],
};
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const SHARP = [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [3, 0], [3, 1], [4, 0], [4, 1], [5, 0], [5, 1], [6, 0]];
const FLAT = [[0, 0], [1, -1], [1, 0], [2, -1], [2, 0], [3, 0], [4, -1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0]];
export const ACC_GLYPH = { '-1': '♭', 0: '', 1: '♯' };

/** Spell a MIDI note. pref: 'sharp' | 'flat'. Returns { letter 0-6, acc -1|0|1, octave, step }.
 *  step = diatonic index (C4 = 28), used for staff placement. */
export function spell(midi, pref = 'sharp') {
  const [letter, acc] = (pref === 'flat' ? FLAT : SHARP)[mod(midi, 12)];
  const octave = Math.floor(midi / 12) - 1;
  return { letter, acc, octave, step: octave * 7 + letter };
}

/** Human name of a note. opts: { lang, pref, octave } */
export function noteName(midi, { lang = 'en', pref = 'sharp', octave = false } = {}) {
  const s = spell(midi, pref);
  const oct = octave ? (lang === 'fr' ? s.octave - 1 : s.octave) : '';
  return LETTERS[lang][s.letter] + ACC_GLYPH[s.acc] + oct;
}
export const isNatural = (midi) => LETTER_PC.includes(mod(midi, 12));
/** MIDI number of a natural note from letter index (0=C) and octave. */
export const naturalMidi = (letter, octave) => (octave + 1) * 12 + LETTER_PC[letter];

export const SCALES = {
  major: { steps: [0, 2, 4, 5, 7, 9, 11], en: 'Major', fr: 'Majeure' },
  minor: { steps: [0, 2, 3, 5, 7, 8, 10], en: 'Natural minor', fr: 'Mineure naturelle' },
  harmonicMinor: { steps: [0, 2, 3, 5, 7, 8, 11], en: 'Harmonic minor', fr: 'Mineure harmonique' },
  melodicMinor: { steps: [0, 2, 3, 5, 7, 9, 11], en: 'Melodic minor', fr: 'Mineure mélodique' },
  pentaMajor: { steps: [0, 2, 4, 7, 9], en: 'Major pentatonic', fr: 'Pentatonique majeure' },
  pentaMinor: { steps: [0, 3, 5, 7, 10], en: 'Minor pentatonic', fr: 'Pentatonique mineure' },
  blues: { steps: [0, 3, 5, 6, 7, 10], en: 'Blues', fr: 'Blues' },
  dorian: { steps: [0, 2, 3, 5, 7, 9, 10], en: 'Dorian', fr: 'Dorien' },
  phrygian: { steps: [0, 1, 3, 5, 7, 8, 10], en: 'Phrygian', fr: 'Phrygien' },
  lydian: { steps: [0, 2, 4, 6, 7, 9, 11], en: 'Lydian', fr: 'Lydien' },
  mixolydian: { steps: [0, 2, 4, 5, 7, 9, 10], en: 'Mixolydian', fr: 'Mixolydien' },
  locrian: { steps: [0, 1, 3, 5, 6, 8, 10], en: 'Locrian', fr: 'Locrien' },
  wholeTone: { steps: [0, 2, 4, 6, 8, 10], en: 'Whole tone', fr: 'Par tons' },
  chromatic: { steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], en: 'Chromatic', fr: 'Chromatique' },
};

/** All MIDI notes of a scale between lo and hi (inclusive). root is a MIDI note or pitch class. */
export function scaleNotes(root, scale, lo, hi) {
  const steps = (SCALES[scale] || { steps: scale }).steps;
  const out = [];
  for (let m = lo; m <= hi; m++) if (steps.includes(mod(m - root, 12))) out.push(m);
  return out;
}

export const INTERVALS = [
  { semi: 0, id: 'P1', en: 'Unison', fr: 'Unisson' },
  { semi: 1, id: 'm2', en: 'Minor 2nd', fr: 'Seconde mineure' },
  { semi: 2, id: 'M2', en: 'Major 2nd', fr: 'Seconde majeure' },
  { semi: 3, id: 'm3', en: 'Minor 3rd', fr: 'Tierce mineure' },
  { semi: 4, id: 'M3', en: 'Major 3rd', fr: 'Tierce majeure' },
  { semi: 5, id: 'P4', en: 'Perfect 4th', fr: 'Quarte juste' },
  { semi: 6, id: 'TT', en: 'Tritone', fr: 'Triton' },
  { semi: 7, id: 'P5', en: 'Perfect 5th', fr: 'Quinte juste' },
  { semi: 8, id: 'm6', en: 'Minor 6th', fr: 'Sixte mineure' },
  { semi: 9, id: 'M6', en: 'Major 6th', fr: 'Sixte majeure' },
  { semi: 10, id: 'm7', en: 'Minor 7th', fr: 'Septième mineure' },
  { semi: 11, id: 'M7', en: 'Major 7th', fr: 'Septième majeure' },
  { semi: 12, id: 'P8', en: 'Octave', fr: 'Octave' },
];

export const CHORDS = {
  maj: { steps: [0, 4, 7], en: 'Major', fr: 'Majeur', symbol: '' },
  min: { steps: [0, 3, 7], en: 'Minor', fr: 'Mineur', symbol: 'm' },
  dim: { steps: [0, 3, 6], en: 'Diminished', fr: 'Diminué', symbol: '°' },
  aug: { steps: [0, 4, 8], en: 'Augmented', fr: 'Augmenté', symbol: '+' },
  sus4: { steps: [0, 5, 7], en: 'Suspended 4th', fr: 'Sus 4', symbol: 'sus4' },
  maj7: { steps: [0, 4, 7, 11], en: 'Major 7th', fr: 'Majeur 7', symbol: 'maj7' },
  dom7: { steps: [0, 4, 7, 10], en: 'Dominant 7th', fr: 'Septième de dominante', symbol: '7' },
  min7: { steps: [0, 3, 7, 10], en: 'Minor 7th', fr: 'Mineur 7', symbol: 'm7' },
  m7b5: { steps: [0, 3, 6, 10], en: 'Half-diminished', fr: 'Demi-diminué', symbol: 'ø' },
  dim7: { steps: [0, 3, 6, 9], en: 'Diminished 7th', fr: 'Septième diminuée', symbol: '°7' },
};
export const chordNotes = (root, type) => CHORDS[type].steps.map((s) => root + s);

// Small random helpers used by every game.
export const rand = (n) => Math.floor(Math.random() * n);
export const pick = (arr) => arr[rand(arr.length)];
export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
