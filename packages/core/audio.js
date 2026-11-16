// Web Audio synth. Everything is generated in the browser: no samples, works offline.
import { midiToFreq } from './music.js';

let ac = null;
let master = null;

/** Returns the shared AudioContext (created lazily). Must first be called from a user gesture. */
export function audio() {
  if (!ac) {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ac.createDynamicsCompressor();
    master = ac.createGain();
    master.gain.value = 0.9;
    master.connect(comp).connect(ac.destination);
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}
export const audioReady = () => !!ac && ac.state === 'running';
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const TIMBRES = {
  // Piano: several slightly stretched partials, each decaying at its own speed (see playPiano). `waves` is only the fallback.
  piano: { waves: [['triangle', 1, 1], ['sine', 2, 0.3]], attack: 0.005, sustain: 0, release: 0.25, piano: true },
  pad: { waves: [['sine', 1, 1], ['sine', 2, 0.15]], attack: 0.08, sustain: 1, release: 0.3 },
  pluck: { waves: [['sawtooth', 1, 0.5], ['triangle', 1, 0.7]], attack: 0.002, sustain: 0, release: 0.12 },
  bass: { waves: [['triangle', 1, 1], ['sine', 0.5, 0.5]], attack: 0.005, sustain: 0.6, release: 0.15 },
  voice: { waves: [['sine', 1, 1], ['triangle', 1, 0.35], ['sine', 3, 0.08]], attack: 0.04, sustain: 1, release: 0.15 },
};

/** Play one note. opts: { dur seconds, when seconds from now, gain 0-1, timbre }. Returns end time (ctx time). */
export function playNote(midi, { dur = 0.6, when = 0, gain = 0.25, timbre = 'piano' } = {}) {
  const ctx = audio();
  const tb = TIMBRES[timbre] || TIMBRES.piano;
  const t0 = ctx.currentTime + when;
  if (tb.piano) return playPiano(ctx, midi, t0, dur, gain, tb);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(gain, t0 + tb.attack);
  if (tb.sustain) env.gain.setValueAtTime(gain * tb.sustain, t0 + dur);
  else env.gain.exponentialRampToValueAtTime(gain * 0.25, t0 + dur);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + tb.release);
  env.connect(master);
  for (const [type, mult, level] of tb.waves) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = midiToFreq(midi) * mult;
    g.gain.value = level;
    o.connect(g).connect(env);
    o.start(t0);
    o.stop(t0 + dur + tb.release + 0.05);
  }
  return t0 + dur + tb.release;
}

let hammerBuf = null;
function hammerBuffer(ctx) {
  if (!hammerBuf || hammerBuf.sampleRate !== ctx.sampleRate) {
    const n = Math.floor(ctx.sampleRate * 0.03);
    hammerBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = hammerBuf.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < n; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; d[i] = (seed / 0x3fffffff - 1) * (1 - i / n); }
  }
  return hammerBuf;
}
// Partial levels (sum about 1.3, like the old two-wave piano) and how much of each is left when the note ends.
const PIANO_PARTIALS = [1, 0.5, 0.28, 0.16, 0.1, 0.06];
function playPiano(ctx, midi, t0, dur, gain, tb) {
  const f0 = midiToFreq(midi);
  const end = t0 + dur + tb.release;
  // Low notes ring longer, high notes die faster; the longer the key is held, the more it has faded.
  const ring = Math.max(0.35, Math.min(1.5, 1.45 - (midi - 36) / 55));
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(gain, t0 + tb.attack);
  env.gain.exponentialRampToValueAtTime(gain * Math.min(0.5, 0.18 * ring + 0.1), t0 + dur);
  env.gain.exponentialRampToValueAtTime(0.0001, end);
  env.connect(master);
  PIANO_PARTIALS.forEach((level, i) => {
    const k = i + 1;
    const f = f0 * k * Math.sqrt(1 + 0.0004 * k * k); // slight stretch, like a real string
    if (f > 12000) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    g.gain.setValueAtTime(level, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, level * Math.min(0.9, 0.55 * ring / k)), end);
    o.connect(g).connect(env);
    o.start(t0);
    o.stop(end + 0.05);
  });
  // Short hammer noise.
  const nz = ctx.createBufferSource();
  nz.buffer = hammerBuffer(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = Math.min(6000, f0 * 4);
  const ng = ctx.createGain();
  ng.gain.value = 0.35;
  nz.connect(bp).connect(ng).connect(env);
  nz.start(t0);
  return end;
}

/** Play several notes together. */
export function playChord(midis, opts = {}) {
  const gain = (opts.gain ?? 0.25) / Math.sqrt(midis.length);
  return Math.max(...midis.map((m) => playNote(m, { ...opts, gain })));
}

/** Play notes one after another. Items are MIDI numbers, arrays (chords) or null (rest).
 *  opts: { bpm, beats per item (number or array), timbre, gain, when }. Resolves when finished. */
export function playSeq(items, { bpm = 90, beats = 1, when = 0, ...opts } = {}) {
  const ctx = audio();
  const beat = 60 / bpm;
  let t = when;
  items.forEach((it, i) => {
    const b = Array.isArray(beats) ? beats[i] : beats;
    const dur = b * beat * 0.9;
    if (Array.isArray(it)) playChord(it, { ...opts, dur, when: t });
    else if (it != null) playNote(it, { ...opts, dur, when: t });
    t += b * beat;
  });
  return wait(t * 1000 + 150);
}

/** Metronome click. */
export function click({ when = 0, accent = false, gain = 0.3 } = {}) {
  const ctx = audio();
  const t0 = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'square';
  o.frequency.value = accent ? 1600 : 1000;
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + 0.06);
}

/** Short percussive tap sound (for rhythm games). */
export function tap({ when = 0, gain = 0.35, pitch = 220 } = {}) {
  const ctx = audio();
  const t0 = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(pitch * 2, t0);
  o.frequency.exponentialRampToValueAtTime(pitch, t0 + 0.08);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + 0.16);
}

/** Feedback sound: 'good' | 'bad'. */
export function sfx(kind) {
  if (kind === 'good') { playNote(84, { dur: 0.08, gain: 0.12, timbre: 'pad' }); playNote(91, { dur: 0.14, when: 0.08, gain: 0.12, timbre: 'pad' }); }
  else playNote(46, { dur: 0.2, gain: 0.14, timbre: 'pluck' });
}

/** Sustained drone until the returned stop() is called. */
export function startDrone(midis, { gain = 0.12 } = {}) {
  const ctx = audio();
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, ctx.currentTime);
  env.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + 0.6);
  env.connect(master);
  const oscs = midis.flatMap((m) => ['sine', 'triangle'].map((type, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = midiToFreq(m);
    o.detune.value = i ? 4 : -4;
    g.gain.value = (i ? 0.25 : 1) / midis.length;
    o.connect(g).connect(env);
    o.start();
    return o;
  }));
  return () => {
    const t = ctx.currentTime;
    env.gain.cancelScheduledValues(t);
    env.gain.setValueAtTime(env.gain.value, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    oscs.forEach((o) => o.stop(t + 0.5));
  };
}

/** Current audio clock in seconds (for precise rhythm scheduling). */
export const audioTime = () => audio().currentTime;
