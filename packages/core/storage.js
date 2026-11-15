// Shared browser storage. All games live on the same origin, so they share this database.
// Source of truth = append-only log of attempts. Mastery is always recomputed from it.

const DB_NAME = 'music-learnin';
const DB_VERSION = 1;
let dbp = null;
const memory = []; // fallback when IndexedDB is unavailable (private mode, old browsers)

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    if (!('indexedDB' in globalThis)) return resolve(null);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const s = req.result.createObjectStore('attempts', { keyPath: 'id' });
      s.createIndex('game', 'game');
      s.createIndex('skill', 'skill');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
  return dbp;
}
const done = (tx) => new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = tx.onabort = () => rej(tx.error); });
const result = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

export function deviceId() {
  let id = localStorage.getItem('ml:device');
  if (!id) { id = uid().slice(0, 8); localStorage.setItem('ml:device', id); }
  return id;
}

/** Record one answer. { game, skill, correct, ms?, level?, item?, detail? } → stored record.
 *  item = the precise thing asked (e.g. 'E4', 'M3'), used for per-item memorisation stats. */
export async function logAttempt({ game, skill, correct, ms = null, level = null, item = null, detail = null }) {
  const rec = { id: uid(), t: Date.now(), dev: deviceId(), game, skill, ok: !!correct, ms, level, item, detail };
  const db = await open();
  if (!db) { memory.push(rec); return rec; }
  const tx = db.transaction('attempts', 'readwrite');
  tx.objectStore('attempts').put(rec);
  await done(tx);
  return rec;
}

/** Read attempts, optionally filtered by { game } or { skill }. Sorted by time. */
export async function getAttempts({ game, skill } = {}) {
  const db = await open();
  let rows;
  if (!db) rows = memory.filter((r) => (!game || r.game === game) && (!skill || r.skill === skill));
  else {
    const store = db.transaction('attempts').objectStore('attempts');
    if (game) rows = await result(store.index('game').getAll(game));
    else if (skill) rows = await result(store.index('skill').getAll(skill));
    else rows = await result(store.getAll());
    if (game && skill) rows = rows.filter((r) => r.skill === skill);
  }
  return rows.sort((a, b) => a.t - b.t);
}

/** Merge a list of attempts (set union by id). Returns { added, skipped }. */
export async function importAttempts(list) {
  const valid = list.filter((r) => r && r.id && r.game && r.skill && typeof r.t === 'number');
  const db = await open();
  let added = 0;
  if (!db) {
    for (const r of valid) if (!memory.some((m) => m.id === r.id)) { memory.push(r); added++; }
  } else {
    const tx = db.transaction('attempts', 'readwrite');
    const store = tx.objectStore('attempts');
    for (const r of valid) {
      const req = store.add(r);
      req.onsuccess = () => { added++; };
      req.onerror = (e) => { e.preventDefault(); e.stopPropagation(); }; // already there
    }
    await done(tx);
  }
  return { added, skipped: list.length - added };
}

/** Delete attempts of one game (or all when game is omitted). */
export async function clearAttempts(game) {
  const db = await open();
  if (!db) { for (let i = memory.length - 1; i >= 0; i--) if (!game || memory[i].game === game) memory.splice(i, 1); return; }
  const tx = db.transaction('attempts', 'readwrite');
  const store = tx.objectStore('attempts');
  if (!game) store.clear();
  else {
    const keys = await result(store.index('game').getAllKeys(game));
    keys.forEach((k) => store.delete(k));
  }
  await done(tx);
}

// Settings are small: localStorage, one key per game.
const sKey = (game) => 'ml:settings:' + game;
export function getSettings(game, defaults = {}) {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(sKey(game)) || '{}') }; } catch { return { ...defaults }; }
}
export function saveSettings(game, obj) { localStorage.setItem(sKey(game), JSON.stringify(obj)); }
export function allSettings() {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith('ml:settings:')) { try { out[k.slice(12)] = JSON.parse(localStorage.getItem(k)); } catch { /* skip */ } }
  }
  return out;
}
