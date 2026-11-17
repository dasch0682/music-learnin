// Feedback setting (success and error cues), per profile. See docs/feedback-spec.md.
// Stored as the pseudo-game `_feedback`: { mode, haptics }. No DOM here, so it can run in Node tests.
import { settingsKey, activeId } from './profiles.js';

export const FEEDBACK_MODES = ['silent', 'discreet', 'normal', 'encouraging'];
export const MODE_LABELS = {
  silent: { en: 'Silent', fr: 'Silencieux' },
  discreet: { en: 'Discreet', fr: 'Discret' },
  normal: { en: 'Normal', fr: 'Normal' },
  encouraging: { en: 'Encouraging', fr: 'Encourageant' },
};
const KEY = '_feedback';

function read(id) {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(settingsKey(KEY, id)) || '{}') || {}; } catch { /* corrupt: defaults */ }
  return { mode: FEEDBACK_MODES.includes(s.mode) ? s.mode : 'normal', haptics: s.haptics === true };
}

/** { mode, haptics } of a profile (default: the active one). Unknown or missing mode → 'normal'. */
export const getFeedback = (id = activeId()) => read(id);

/** Merge a patch ({ mode?, haptics? }) into the stored value of a profile. Returns the new value. */
export function setFeedback(patch, id = activeId()) {
  const next = { ...read(id), ...patch };
  if (!FEEDBACK_MODES.includes(next.mode)) next.mode = 'normal';
  next.haptics = next.haptics === true;
  try { localStorage.setItem(settingsKey(KEY, id), JSON.stringify(next)); } catch { /* storage blocked */ }
  return next;
}

// Messages (encouraging mode only). French uses "tu". `ear` lines are used only by listening games.
export const MESSAGES = {
  good: [
    { en: 'Yes!', fr: 'Oui !' },
    { en: 'Well listened.', fr: 'Bien écouté.' },
    { en: 'Nicely done.', fr: 'Joli.' },
    { en: 'You’ve got it.', fr: 'Tu l’as.' },
    { en: 'Good ear.', fr: 'Bonne oreille.', ear: true },
  ],
  recovery: [
    { en: 'You found it!', fr: 'Tu as trouvé !' },
    { en: 'Well persisted.', fr: 'Tu n’as pas lâché, bravo.' },
    { en: 'Trying again works.', fr: 'Réessayer, ça marche.' },
  ],
  streak: [
    { en: '{n} in a row!', fr: '{n} à la suite !' },
    { en: '{n} in a row. You’re focused.', fr: '{n} à la suite. Tu es concentré·e.' },
    { en: '{n} in a row. Keep that calm pace.', fr: '{n} à la suite. Garde ce rythme tranquille.' },
  ],
  bad: [
    { en: 'Not yet. Try again.', fr: 'Pas encore. Essaie encore.' },
    { en: 'Almost. Listen once more.', fr: 'Presque. Écoute encore une fois.', ear: true },
    { en: 'Take your time.', fr: 'Prends ton temps.' },
    { en: 'Close. One more try.', fr: 'Pas loin. Encore un essai.' },
    { en: 'Mistakes help you learn.', fr: 'On apprend en se trompant.' },
    { en: 'That one is tricky.', fr: 'Celle-là est difficile.' },
  ],
};

/** One line of a bank ('good' | 'recovery' | 'streak' | 'bad') in `lang`, never one of `recent`
 *  (lines already shown, as returned by this function). `{n}` is left in place for the caller.
 *  opts.ear: allow the lines made for listening games. Returns null when nothing is left. */
export function pickMessage(kind, lang, recent = [], { ear = false } = {}) {
  const l = lang === 'fr' ? 'fr' : 'en';
  const pool = (MESSAGES[kind] || []).filter((m) => (ear || !m.ear) && !recent.includes(m.en) && !recent.includes(m.fr));
  return pool.length ? pool[Math.floor(Math.random() * pool.length)][l] : null;
}
