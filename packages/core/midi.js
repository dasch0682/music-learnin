// Web MIDI input (optional). Silent when the browser has no Web MIDI, when the player refuses, or when no device is plugged in.
// Nothing is requested until a first listener subscribes (the on-screen keyboards do it when they are created).

const listeners = new Set();
let started = false;
let access = null;
const attached = new Set();

/** True when this browser exposes Web MIDI. */
export const midiSupported = () => typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';

/** Parse a raw MIDI message (array-like of bytes). Returns { type: 'on'|'off', midi, velocity, channel } or null. */
export function parseMidi(data) {
  if (!data || data.length < 2) return null;
  const status = data[0] & 0xf0, channel = data[0] & 0x0f;
  const midi = data[1], velocity = data[2] ?? 0;
  if (status === 0x90 && velocity > 0) return { type: 'on', midi, velocity, channel };
  if (status === 0x80 || status === 0x90) return { type: 'off', midi, velocity, channel };
  return null;
}

function dispatch(ev) {
  const msg = parseMidi(ev?.data);
  if (!msg) return;
  for (const fn of [...listeners]) { try { fn(msg); } catch { /* a listener must not break the others */ } }
}

function attach(input) {
  if (!input || attached.has(input.id ?? input)) return;
  attached.add(input.id ?? input);
  try { input.onmidimessage = dispatch; } catch { /* ignore */ }
}

function scan() {
  if (!access) return;
  try { access.inputs?.forEach((input) => attach(input)); } catch { /* ignore */ }
}

async function start() {
  if (started) return;
  started = true;
  if (!midiSupported()) return;
  try {
    access = await navigator.requestMIDIAccess();
    scan();
    access.onstatechange = () => scan();
  } catch { access = null; }
}

/** Names of the MIDI inputs currently seen (empty when none). */
export function midiInputs() {
  const out = [];
  try { access?.inputs?.forEach((i) => out.push(i.name || i.id || 'MIDI')); } catch { /* ignore */ }
  return out;
}

/** Listen to note-on / note-off: fn({ type: 'on'|'off', midi, velocity (1-127), channel }). Returns an unsubscribe function. */
export function onMidi(fn) {
  listeners.add(fn);
  start();
  return () => listeners.delete(fn);
}
