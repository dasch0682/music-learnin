// Import / export of settings and results as JSON files.
import { getAttempts, importAttempts, allSettings, getSettings, saveSettings, deviceId } from './storage.js';
import { activeId, activeProfile, listProfiles, getProfile, addProfile, setActive, ownerFn, profileName } from './profiles.js';
import { getLang } from './i18n.js';

const FORMAT = 1;

function download(name, data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function pickFile() {
  return new Promise((resolve, reject) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json' });
    input.onchange = async () => {
      try { resolve(JSON.parse(await input.files[0].text())); } catch (e) { reject(e); }
    };
    input.click();
  });
}
const stamp = () => new Date().toISOString().slice(0, 10);

/** Build the results payload (also used by tests). game omitted = all games.
 *  Attempts of the active profile by default ({ who: id }, or { who: '*' } for every profile).
 *  Every attempt carries `who`; `profiles` lists the profiles involved (id, name, hue), `profile` is the main one. */
export async function buildResults(game, { who } = {}) {
  const owner = ownerFn();
  const attempts = (await getAttempts({ game, who })).map((r) => ({ ...r, who: owner(r) }));
  const ids = [...new Set(attempts.map((r) => r.who))];
  const id = who && who !== '*' ? who : activeId();
  if (!ids.includes(id) && who !== '*') ids.unshift(id);
  const profiles = ids.map((i) => getProfile(i)).filter(Boolean).map(({ id, name, hue }) => ({ id, name, hue }));
  return { app: 'music-learnin', kind: 'results', format: FORMAT, device: deviceId(), exported: Date.now(), game: game || null,
    profile: who === '*' ? null : profiles.find((p) => p.id === id) || null, profiles, attempts };
}
export function buildSettings(game) {
  const p = activeProfile();
  return { app: 'music-learnin', kind: 'settings', format: FORMAT, exported: Date.now(), profile: { id: p.id, name: p.name, hue: p.hue },
    settings: game ? { [game]: getSettings(game) } : allSettings() };
}

const fileTag = () => { const p = activeProfile(); return p.name ? '-' + p.name.toLowerCase().replace(/[^a-z0-9]+/g, '') : ''; };
export async function exportResults(game) { download(`music-learnin-results-${game || 'all'}${fileTag()}-${stamp()}.json`, await buildResults(game)); }
export function exportSettings(game) { download(`music-learnin-settings-${game || 'all'}${fileTag()}-${stamp()}.json`, buildSettings(game)); }

/** What a results file would do here. { profiles: [unknown profiles of the file], needsChoice } */
export function inspectResults(data) {
  const local = new Set(listProfiles().map((p) => p.id));
  const known = new Map((data.profiles || (data.profile ? [data.profile] : [])).map((p) => [p.id, p]));
  const whos = [...new Set((data.attempts || []).map((r) => r.who).filter(Boolean))];
  const unknown = whos.filter((w) => !local.has(w)).map((w) => known.get(w) || { id: w, name: '' });
  if (data.profile && !local.has(data.profile.id) && !unknown.some((p) => p.id === data.profile.id) && !whos.length) unknown.push(data.profile);
  const noWho = (data.attempts || []).some((r) => !r.who);
  // An old file (no profile) imported while another profile is active is ambiguous too.
  const ambiguous = noWho && !data.profile && activeId() !== listProfiles()[0].id;
  return { unknown, needsChoice: unknown.length > 0 || ambiguous, ambiguous };
}

/** Apply a parsed payload. Returns { kind, added?, skipped?, games? }. Throws on a wrong file.
 *  opts.mode for results: 'keep' (default: attempts keep their owner; unknown profiles are added),
 *  'new' (same, then switch to the added profile), 'merge' (every attempt goes to the active profile). */
export async function applyPayload(data, { mode = 'keep' } = {}) {
  if (!data || data.app !== 'music-learnin' || data.format > FORMAT) throw new Error('bad-file');
  if (data.kind === 'results') {
    const list = data.attempts || [];
    if (mode === 'merge') return { kind: 'results', ...(await importAttempts(list, { who: activeId() })) };
    const { unknown, ambiguous } = inspectResults(data);
    let created = null;
    for (const p of unknown) {
      const q = addProfile(p.name || data.profile?.name || '', { id: p.id, hue: p.hue });
      created = created || q;
    }
    let rows = list;
    if (ambiguous && mode === 'new') {
      created = addProfile(data.profile?.name || '', { hue: data.profile?.hue });
      rows = list.map((r) => (r.who ? r : { ...r, who: created.id }));
    }
    const r = await importAttempts(rows);
    if (mode === 'new' && created) setActive(created.id);
    return { kind: 'results', ...r, profile: created };
  }
  if (data.kind === 'settings') {
    for (const [game, s] of Object.entries(data.settings || {})) saveSettings(game, s);
    return { kind: 'settings', games: Object.keys(data.settings || {}) };
  }
  throw new Error('bad-file');
}

const TXT = {
  title: { en: 'Results of another profile', fr: 'Résultats d’un autre profil' },
  addNew: { en: 'Add as a new profile', fr: 'Ajouter comme nouveau profil' },
  merge: { en: 'Merge into {name}', fr: 'Fusionner dans {name}' },
  cancel: { en: 'Cancel', fr: 'Annuler' },
};
const T = (k, vars = {}) => { let s = TXT[k][getLang()] || TXT[k].en; for (const [a, b] of Object.entries(vars)) s = s.replaceAll(`{${a}}`, b); return s; };

/** In-page question: resolves 'new' | 'merge' | null (cancel). */
export function askImportMode(data) {
  const lang = getLang();
  const names = (inspectResults(data).unknown.length ? inspectResults(data).unknown : [data.profile || {}]).map((p) => profileName(p, lang)).join(', ');
  return new Promise((resolve) => {
    const d = Object.assign(document.createElement('dialog'), { className: 'ml-settings ml-ask' });
    const btn = (label, v, cls = '') => { const b = Object.assign(document.createElement('button'), { className: 'ml-btn ' + cls, textContent: label }); b.onclick = () => { d.close(); d.remove(); resolve(v); }; return b; };
    d.append(Object.assign(document.createElement('h2'), { textContent: T('title') }),
      Object.assign(document.createElement('p'), { textContent: names }),
      btn(T('addNew'), 'new', 'ml-primary'), btn(T('merge', { name: profileName(activeProfile(), lang) }), 'merge'), btn(T('cancel'), null));
    d.addEventListener('cancel', () => { d.remove(); resolve(null); });
    document.body.append(d);
    d.showModal();
  });
}

/** Ask the user for a file, then apply it. expected: 'results' | 'settings'.
 *  A results file from another profile (or an old file while a later profile is active) asks what to do first;
 *  the answer 'cancel' resolves { kind: 'results', added: 0, skipped: 0, cancelled: true }. */
export async function importFile(expected) {
  const data = await pickFile();
  if (expected && data.kind !== expected) throw new Error('bad-file');
  if (data && data.app === 'music-learnin' && data.kind === 'results' && inspectResults(data).needsChoice) {
    const mode = await askImportMode(data);
    if (!mode) return { kind: 'results', added: 0, skipped: 0, cancelled: true };
    return applyPayload(data, { mode });
  }
  return applyPayload(data);
}
