// Import / export of settings and results as JSON files.
import { getAttempts, importAttempts, allSettings, getSettings, saveSettings, deviceId } from './storage.js';

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

/** Build the results payload (also used by tests). game omitted = all games. */
export async function buildResults(game) {
  return { app: 'music-learnin', kind: 'results', format: FORMAT, device: deviceId(), exported: Date.now(), game: game || null, attempts: await getAttempts({ game }) };
}
export function buildSettings(game) {
  return { app: 'music-learnin', kind: 'settings', format: FORMAT, exported: Date.now(), settings: game ? { [game]: getSettings(game) } : allSettings() };
}

export async function exportResults(game) { download(`music-learnin-results-${game || 'all'}-${stamp()}.json`, await buildResults(game)); }
export function exportSettings(game) { download(`music-learnin-settings-${game || 'all'}-${stamp()}.json`, buildSettings(game)); }

/** Apply a parsed payload. Returns { kind, added?, skipped?, games? }. Throws on a wrong file. */
export async function applyPayload(data) {
  if (!data || data.app !== 'music-learnin' || data.format > FORMAT) throw new Error('bad-file');
  if (data.kind === 'results') return { kind: 'results', ...(await importAttempts(data.attempts || [])) };
  if (data.kind === 'settings') {
    for (const [game, s] of Object.entries(data.settings || {})) saveSettings(game, s);
    return { kind: 'settings', games: Object.keys(data.settings || {}) };
  }
  throw new Error('bad-file');
}

/** Ask the user for a file, then apply it. expected: 'results' | 'settings'. */
export async function importFile(expected) {
  const data = await pickFile();
  if (expected && data.kind !== expected) throw new Error('bad-file');
  return applyPayload(data);
}
