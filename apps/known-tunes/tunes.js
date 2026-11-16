// Traditional, public-domain melodies as MIDI note lists in C major (C4 = 60), no lyrics.
// Each phrase: { n: [midi], b: [beats] }. Rhythms are simplified. Degrees are checked in tools/known-tunes.test.mjs.
const P = (n, b) => ({ n, b });
const Q = (n) => P(n, n.map(() => 1));
export const TUNES = [
  { id: 'frere-jacques', name: { en: 'Brother John', fr: 'Frère Jacques' }, phrases: [
    Q([60, 62, 64, 60]), P([64, 65, 67], [1, 1, 2]), P([67, 69, 67, 65, 64, 60], [.5, .5, .5, .5, 1, 1]), P([60, 55, 60], [1, 1, 2]),
  ] },
  { id: 'au-clair', name: { en: 'By the moonlight', fr: 'Au clair de la lune' }, phrases: [
    P([60, 60, 60, 62, 64, 62], [1, 1, 1, 1, 2, 2]), P([60, 64, 62, 62, 60], [1, 1, 1, 1, 4]),
  ] },
  { id: 'ah-vous-dirai-je', name: { en: 'Twinkle, twinkle', fr: 'Ah ! vous dirai-je, maman' }, phrases: [
    P([60, 60, 67, 67, 69, 69, 67], [1, 1, 1, 1, 1, 1, 2]), P([65, 65, 64, 64, 62, 62, 60], [1, 1, 1, 1, 1, 1, 2]),
    P([67, 67, 65, 65, 64, 64, 62], [1, 1, 1, 1, 1, 1, 2]),
  ] },
  { id: 'ode-to-joy', name: { en: 'Ode to Joy', fr: 'Ode à la joie' }, phrases: [
    Q([64, 64, 65, 67, 67, 65, 64, 62]), P([60, 60, 62, 64, 64, 62, 62], [1, 1, 1, 1, 1.5, .5, 2]),
    Q([64, 64, 65, 67, 67, 65, 64, 62]), P([60, 60, 62, 64, 62, 60, 60], [1, 1, 1, 1, 1.5, .5, 2]),
  ] },
  { id: 'mary-lamb', name: { en: 'Mary had a little lamb', fr: 'Mary avait un petit agneau' }, phrases: [
    P([64, 62, 60, 62, 64, 64, 64], [1, 1, 1, 1, 1, 1, 2]), P([62, 62, 62], [1, 1, 2]), P([64, 67, 67], [1, 1, 2]),
    Q([64, 62, 60, 62, 64, 64, 64, 64]), P([62, 62, 64, 62, 60], [1, 1, 1, 1, 4]),
  ] },
  { id: 'london-bridge', name: { en: 'London Bridge', fr: 'Le pont de Londres' }, phrases: [
    P([67, 69, 67, 65, 64, 65, 67], [1.5, .5, 1, 1, 1, 1, 2]), P([62, 64, 65], [1, 1, 2]), P([64, 65, 67], [1, 1, 2]),
    P([67, 69, 67, 65, 64, 65, 67], [1.5, .5, 1, 1, 1, 1, 2]), P([62, 67, 64, 60], [2, 2, 2, 2]),
  ] },
  { id: 'susanna', name: { en: 'Oh! Susanna', fr: 'Oh ! Suzanna' }, phrases: [
    Q([60, 62, 64, 67, 67, 69, 67, 64]), P([60, 62, 64, 64, 62, 60, 62], [1, 1, 1, 1, 1, 1, 3]),
  ] },
  { id: 'saints', name: { en: 'When the saints go marching in', fr: 'Quand les saints' }, phrases: [
    P([60, 64, 65, 67], [1, 1, 1, 3]), P([60, 64, 65, 67], [1, 1, 1, 3]), P([60, 64, 65, 67, 64, 60, 64, 62], [1, 1, 1, 2, 1, 1, 1, 3]),
  ] },
];
export const span = (t) => { const a = t.phrases.flatMap((p) => p.n); return Math.max(...a) - Math.min(...a); };
