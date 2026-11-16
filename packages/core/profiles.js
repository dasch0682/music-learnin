// Learner profiles: several people on one device. Kept in localStorage (small, synchronous).
// A profile = { id, name, hue }. hue (0-359) gives the colour of the initial; no image, no emoji.
// The FIRST profile (the one that existed before profiles) keeps the old storage keys, so nothing needs
// to be migrated: attempts without `who` and settings under `ml:settings:<game>` belong to it.

const K_LIST = 'ml:profiles';
const K_ACTIVE = 'ml:profile';
const K_FIRST = 'ml:profile:first'; // id of the profile that owns the legacy data ('' when it was deleted)
const listeners = new Set();
let fallback = null; // when localStorage is unavailable

const rid = () => 'u' + Math.random().toString(36).slice(2, 8);
const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };
const HUES = [28, 200, 150, 330, 260, 95, 10, 180];

/** All profiles, in creation order. Never empty: a first profile is created on demand. */
export function listProfiles() {
  let list = null;
  try { list = JSON.parse(read(K_LIST)); } catch { /* corrupt */ }
  if (Array.isArray(list)) list = list.filter((p) => p && typeof p.id === 'string');
  if (!Array.isArray(list) || !list.length) {
    if (fallback) return fallback;
    const first = { id: rid(), name: '', hue: HUES[0] };
    list = [first];
    write(K_LIST, JSON.stringify(list));
    write(K_FIRST, first.id);
    write(K_ACTIVE, first.id);
    fallback = read(K_LIST) ? null : list;
  }
  return list;
}
const save = (list) => { write(K_LIST, JSON.stringify(list)); if (fallback) fallback = list; };

export const getProfile = (id) => listProfiles().find((p) => p.id === id) || null;
export const activeId = () => {
  const list = listProfiles();
  const id = read(K_ACTIVE);
  return list.some((p) => p.id === id) ? id : list[0].id;
};
export const activeProfile = () => getProfile(activeId());
/** Id that owns attempts without `who` and the old settings keys. */
export const firstId = () => {
  const list = listProfiles();
  const id = read(K_FIRST);
  return list.some((p) => p.id === id) ? id : list[0].id;
};
/** Owner of an attempt record: its `who` when that profile exists, else the first profile
 *  (old attempts, or attempts of a profile whose list was lost). Use ownerFn() inside loops. */
export const ownerOf = (rec) => ownerFn()(rec);
export function ownerFn() {
  const ids = new Set(listProfiles().map((p) => p.id));
  const first = firstId();
  return (rec) => (rec.who && ids.has(rec.who) ? rec.who : first);
}

/** Name to show (a profile may have no name yet). */
export const profileName = (p, lang = 'en') => (p && p.name) || (lang === 'fr' ? 'Joueur' : 'Player');
export const initialOf = (p, lang) => (profileName(p, lang).trim()[0] || '?').toUpperCase();

export function onProfile(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const emit = () => listeners.forEach((fn) => fn(activeId()));

export function setActive(id) {
  if (!getProfile(id)) return false;
  write(K_ACTIVE, id);
  emit();
  return true;
}

/** Add a profile. opts: { id, hue, activate }. Returns the profile (the existing one when the id is known). */
export function addProfile(name, { id, hue, activate = false } = {}) {
  const list = listProfiles();
  let p = id && list.find((x) => x.id === id);
  if (!p) {
    p = { id: id || rid(), name: String(name || '').trim().slice(0, 24), hue: Number.isFinite(hue) ? hue : HUES[list.length % HUES.length] };
    save([...list, p]);
  }
  if (activate) setActive(p.id); else emit();
  return p;
}

export function renameProfile(id, name) {
  const list = listProfiles();
  const p = list.find((x) => x.id === id);
  if (!p) return;
  p.name = String(name || '').trim().slice(0, 24);
  save(list);
  emit();
}

/** Remove the profile from the list only (storage.js removeProfile also erases its data). */
export function dropProfile(id) {
  const list = listProfiles();
  if (list.length < 2 || !list.some((p) => p.id === id)) return false;
  const first = firstId();
  save(list.filter((p) => p.id !== id));
  if (first === id) write(K_FIRST, '');
  if (read(K_ACTIVE) === id) write(K_ACTIVE, listProfiles()[0].id);
  emit();
  return true;
}

/** localStorage key of the settings of a game, for a profile (default: the active one). */
export function settingsKey(game, id = activeId()) {
  return id === firstId() && read(K_FIRST) === id ? 'ml:settings:' + game : `ml:psettings:${id}:${game}`;
}
/** Prefix of all settings keys of a profile, and how to read the game id back from a key. */
export function settingsPrefix(id = activeId()) {
  return id === firstId() && read(K_FIRST) === id ? 'ml:settings:' : `ml:psettings:${id}:`;
}
