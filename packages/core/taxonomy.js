// Skill taxonomy: the shared vocabulary of every game and of the mastery map.
// Every attempt logged by a game carries one of these skill ids.
// game = slug of the game that trains the skill (null = planned, not built yet).
// penta = part of the pentatonic thread that runs from level 1 to jazz improvisation.

export const TAXONOMY_VERSION = 1;

export const DOMAINS = [
  { id: 'listen', en: 'Listening', fr: 'Écoute' },
  { id: 'sing', en: 'Singing', fr: 'Chant' },
  { id: 'play', en: 'Playing', fr: 'Jeu' },
  { id: 'rhythm', en: 'Rhythm', fr: 'Rythme' },
  { id: 'read', en: 'Reading', fr: 'Lecture' },
  { id: 'theory', en: 'Theory', fr: 'Théorie' },
];

export const LEVELS = [
  { id: 1, en: 'Discovery', fr: 'Éveil' },
  { id: 2, en: 'Beginner', fr: 'Débutant' },
  { id: 3, en: 'Elementary', fr: 'Élémentaire' },
  { id: 4, en: 'Intermediate', fr: 'Intermédiaire' },
  { id: 5, en: 'Upper intermediate', fr: 'Confirmé' },
  { id: 6, en: 'Advanced', fr: 'Avancé' },
  { id: 7, en: 'Expert', fr: 'Expert' },
  { id: 8, en: 'Mastery', fr: 'Maîtrise' },
];

// voice = part of the second-voice thread (tension and release, from one held note to jazz guide tones).
const s = (id, level, game, en, fr, penta = false, voice = false) => ({ id, domain: id.split('.')[0], level, game, en, fr, penta, voice });
const v = (id, level, game, en, fr) => s(id, level, game, en, fr, false, true);

export const SKILLS = [
  // Listening
  s('listen.highlow', 1, 'high-low', 'Higher or lower', 'Plus aigu ou plus grave'),
  s('listen.contour', 1, 'high-low', 'Melody shape', 'Dessin de la mélodie'),
  s('listen.penta.echo', 1, 'echo-penta', 'Echo a short tune', 'Rejouer un petit air', true),
  s('listen.penta.long', 3, 'echo-penta', 'Echo longer tunes', 'Rejouer des airs plus longs', true),
  s('listen.intervals.basic', 2, 'ear-intervals', 'Intervals: 2nd, 3rd, 5th, octave', 'Intervalles : seconde, tierce, quinte, octave'),
  s('listen.intervals.all', 4, 'ear-intervals', 'All melodic intervals', 'Tous les intervalles mélodiques'),
  s('listen.intervals.harmonic', 5, 'ear-intervals', 'Harmonic intervals', 'Intervalles harmoniques'),
  s('listen.chords.triads', 3, 'ear-chords', 'Major or minor chord', 'Accord majeur ou mineur'),
  s('listen.chords.triads4', 4, 'ear-chords', 'Four triad types', 'Quatre types d’accords de trois sons'),
  s('listen.chords.sevenths', 6, 'ear-chords', 'Seventh chords', 'Accords de septième'),
  s('listen.scales', 5, null, 'Scales and modes by ear', 'Gammes et modes à l’oreille'),
  s('listen.progressions', 6, null, 'Chord progressions', 'Enchaînements d’accords'),
  s('listen.dictation', 7, null, 'Melodic dictation', 'Dictée mélodique'),
  s('listen.jazz', 8, null, 'Extensions and alterations', 'Extensions et altérations'),
  // Singing
  s('sing.match', 1, 'sing-match', 'Match a note', 'Chanter la même note'),
  s('sing.penta', 2, 'sing-match', 'Sing a short tune back', 'Rechanter un petit air', true),
  s('sing.intervals', 3, 'sing-match', 'Sing an interval', 'Chanter un intervalle'),
  s('sing.scale', 4, 'sing-match', 'Sing scale degrees', 'Chanter les degrés de la gamme'),
  s('sing.sight', 6, null, 'Sight-singing', 'Déchiffrage chanté'),
  v('sing.voice.hold', 1, 'second-voice', 'Hold a note against a moving voice', 'Tenir sa note contre une voix qui bouge'),
  v('sing.voice.tension', 3, 'second-voice', 'Tension and release', 'Tension et détente'),
  v('sing.voice.thirds', 4, 'second-voice', 'Sing in thirds', 'Chanter à la tierce'),
  v('sing.voice.leading', 5, 'second-voice', 'Follow the chords with one voice', 'Suivre les accords à une voix'),
  v('sing.voice.guide', 7, 'second-voice', 'Guide tones on ii–V–I', 'Notes guides sur ii–V–I'),
  v('sing.voice.free', 8, 'second-voice', 'Improvise a second voice', 'Improviser une deuxième voix'),
  // Playing
  s('play.penta.free', 1, 'penta-jam', 'Free play on five notes', 'Jeu libre sur cinq notes', true),
  s('play.penta.callresponse', 2, 'penta-jam', 'Question and answer', 'Question et réponse', true),
  s('play.note', 2, 'play-the-note', 'Play the written note', 'Jouer la note écrite'),
  s('play.penta.harmony', 3, 'penta-jam', 'Play over three chords', 'Jouer sur trois accords', true),
  s('play.scales', 4, null, 'Play scales', 'Jouer des gammes'),
  s('play.penta.blues', 5, 'penta-jam', 'Blues improvisation', 'Improvisation blues', true),
  s('play.chords', 5, null, 'Play chords', 'Jouer des accords'),
  s('play.penta.modal', 6, 'penta-jam', 'Modal improvisation', 'Improvisation modale', true),
  s('play.penta.jazz', 7, 'penta-jam', 'Pentatonics on ii–V–I', 'Pentatoniques sur ii–V–I', true),
  s('play.penta.outside', 8, 'penta-jam', 'Playing outside', 'Jeu « outside »', true),
  // Rhythm
  s('rhythm.pulse', 1, 'tap-rhythm', 'Keep the beat', 'Garder la pulsation'),
  s('rhythm.echo.basic', 1, 'tap-rhythm', 'Echo: long and short', 'Écho : longues et brèves'),
  s('rhythm.read.basic', 2, 'tap-rhythm', 'Read quarter, half, eighth notes', 'Lire noires, blanches, croches'),
  s('rhythm.rests', 3, 'tap-rhythm', 'Rests', 'Silences'),
  s('rhythm.sixteenths', 4, 'tap-rhythm', 'Sixteenth notes', 'Doubles croches'),
  s('rhythm.syncopation', 5, 'tap-rhythm', 'Dotted notes and syncopation', 'Notes pointées et syncopes'),
  s('rhythm.triplets', 5, 'tap-rhythm', 'Triplets and swing', 'Triolets et swing'),
  s('rhythm.compound', 6, 'tap-rhythm', 'Compound time (6/8)', 'Mesures composées (6/8)'),
  s('rhythm.poly', 7, null, 'Polyrhythm', 'Polyrythmie'),
  s('rhythm.odd', 8, null, 'Odd meters', 'Mesures asymétriques'),
  // Reading
  s('read.treble.staff', 1, 'find-a-note', 'Treble clef: on the staff', 'Clé de sol : dans la portée'),
  s('read.treble.ledger', 2, 'find-a-note', 'Treble clef: ledger lines', 'Clé de sol : lignes supplémentaires'),
  s('read.bass.staff', 2, 'find-a-note', 'Bass clef: on the staff', 'Clé de fa : dans la portée'),
  s('read.bass.ledger', 3, 'find-a-note', 'Bass clef: ledger lines', 'Clé de fa : lignes supplémentaires'),
  s('read.accidentals', 3, 'find-a-note', 'Sharps and flats', 'Dièses et bémols'),
  s('read.grand', 4, 'find-a-note', 'Both clefs mixed', 'Les deux clés mélangées'),
  s('read.cclefs', 5, 'find-a-note', 'Alto and tenor clefs', 'Clés d’ut 3 et ut 4'),
  s('read.keysig', 4, null, 'Key signatures', 'Armures'),
  s('read.intervals', 4, null, 'Read intervals', 'Lire les intervalles'),
  s('read.chords', 5, null, 'Read chords', 'Lire les accords'),
  s('read.score', 7, null, 'Score reading and transposition', 'Lecture de partition et transposition'),
  // Theory (always met first by ear and by hand in the games above)
  s('theory.scales', 3, null, 'Build scales', 'Construire les gammes'),
  s('theory.intervals', 4, null, 'Name intervals', 'Nommer les intervalles'),
  s('theory.keys', 4, null, 'Keys and circle of fifths', 'Tonalités et cycle des quintes'),
  s('theory.chords', 5, null, 'Build chords', 'Construire les accords'),
  s('theory.harmony', 6, null, 'Functional harmony', 'Harmonie fonctionnelle'),
  s('theory.modes', 6, null, 'Modes', 'Modes'),
  s('theory.jazz', 8, null, 'Jazz harmony', 'Harmonie jazz'),
];

export const skillById = (id) => SKILLS.find((k) => k.id === id);

/** Games shown on the home page. */
export const GAMES = [
  { id: 'high-low', domain: 'listen', icon: '↕', en: 'High or low', fr: 'Aigu ou grave' },
  { id: 'echo-penta', domain: 'listen', icon: '◍', en: 'Echo', fr: 'Écho' },
  { id: 'ear-intervals', domain: 'listen', icon: '⇅', en: 'Intervals by ear', fr: 'Intervalles à l’oreille' },
  { id: 'ear-chords', domain: 'listen', icon: '≡', en: 'Chords by ear', fr: 'Accords à l’oreille' },
  { id: 'sing-match', domain: 'sing', icon: '◉', en: 'Sing it', fr: 'Chante-la' },
  { id: 'second-voice', domain: 'sing', icon: '◎', en: 'Second voice', fr: 'Deuxième voix' },
  { id: 'penta-jam', domain: 'play', icon: '✦', en: 'Five-note jam', fr: 'Impro cinq notes' },
  { id: 'play-the-note', domain: 'play', icon: '♪', en: 'Play the note', fr: 'Joue la note' },
  { id: 'tap-rhythm', domain: 'rhythm', icon: '●', en: 'Tap the rhythm', fr: 'Frappe le rythme' },
  { id: 'find-a-note', domain: 'read', icon: '𝄞', en: 'Find the note', fr: 'Trouve la note' },
];
