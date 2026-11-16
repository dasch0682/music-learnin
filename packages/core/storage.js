// Shared browser storage. All games live on the same origin, so they share this database.
// Source of truth = append-only log of attempts. Mastery is always recomputed from it.

import { activeId, ownerFn, listProfiles, dropProfile, settingsKey, settingsPrefix, getProfile } from './profiles.js';

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
export async function logAttempt({ game, skill, correct, ms = null, level = null, item = null, detail = null, who = activeId() }) {
  const rec = { id: uid(), t: Date.now(), dev: deviceId(), who, game, skill, ok: !!correct, ms, level, item, detail };
  const db = await open();
  if (!db) { memory.push(rec); return rec; }
  const tx = db.transaction('attempts', 'readwrite');
  tx.objectStore('attempts').put(rec);
  await done(tx);
  return rec;
}

/** Read attempts, optionally filtered by { game } or { skill }. Sorted by time.
 *  Only the active profile's attempts, unless { who: <profile id> } or { who: '*' } (everybody). */
export async function getAttempts({ game, skill, who } = {}) {
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
  if (who !== '*') { const owner = ownerFn(), id = who || activeId(); rows = rows.filter((r) => owner(r) === id); }
  return rows.sort((a, b) => a.t - b.t);
}

/** Merge a list of attempts (set union by id). Returns { added, skipped }.
 *  { who } rewrites the owner of every imported attempt (merge into one profile). */
export async function importAttempts(list, { who } = {}) {
  let valid = list.filter((r) => r && r.id && r.game && r.skill && typeof r.t === 'number');
  if (who) valid = valid.map((r) => ({ ...r, who }));
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

/** Delete attempts of one game (or all when game is omitted) of the active profile ({ who } for another, '*' for all). */
export async function clearAttempts(game, { who } = {}) {
  const all = who === '*';
  const owner = ownerFn(), id = who || activeId();
  const mine = (r) => (!game || r.game === game) && (all || owner(r) === id);
  const db = await open();
  if (!db) { for (let i = memory.length - 1; i >= 0; i--) if (mine(memory[i])) memory.splice(i, 1); return; }
  const tx = db.transaction('attempts', 'readwrite');
  const store = tx.objectStore('attempts');
  const rows = await result(game ? store.index('game').getAll(game) : store.getAll());
  rows.filter(mine).forEach((r) => store.delete(r.id));
  await done(tx);
}

/** Delete a profile with its attempts and settings. False when it is the last profile. */
export async function removeProfile(id) {
  if (listProfiles().length < 2 || !getProfile(id)) return false;
  await clearAttempts(null, { who: id });
  const prefix = settingsPrefix(id);
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(prefix)) keys.push(k); }
  keys.forEach((k) => localStorage.removeItem(k));
  return dropProfile(id);
}

// Settings are small: localStorage, one key per game and per profile (see profiles.js settingsKey).
export function getSettings(game, defaults = {}) {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(settingsKey(game)) || '{}') }; } catch { return { ...defaults }; }
}
export function saveSettings(game, obj) { localStorage.setItem(settingsKey(game), JSON.stringify(obj)); }
/** Settings of every game, for the active profile (or { who }). */
export function allSettings(who = activeId()) {
  const out = {}, prefix = settingsPrefix(who);
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith(prefix)) { try { out[k.slice(prefix.length)] = JSON.parse(localStorage.getItem(k)); } catch { /* skip */ } }
  }
  return out;
}
