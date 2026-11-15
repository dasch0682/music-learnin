// Microphone pitch detection (autocorrelation). Runs fully in the browser.
import { freqToMidi } from './music.js';

/** Detect the fundamental frequency of a Float32Array time-domain buffer.
 *  Returns { freq, clarity (0-1), rms } with freq = null when no clear pitch. */
export function detectPitch(buf, sampleRate, { minFreq = 65, maxFreq = 1400, minRms = 0.01 } = {}) {
  const n = buf.length;
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n);
  if (rms < minRms) return { freq: null, clarity: 0, rms };

  const minLag = Math.max(2, Math.floor(sampleRate / maxFreq));
  const maxLag = Math.min(n >> 1, Math.ceil(sampleRate / minFreq));
  // Normalised square difference function (McLeod pitch method).
  const nsdf = new Float32Array(maxLag + 1);
  for (let lag = 1; lag <= maxLag; lag++) {
    let acf = 0, div = 0;
    for (let i = 0; i < n - lag; i++) {
      acf += buf[i] * buf[i + lag];
      div += buf[i] * buf[i] + buf[i + lag] * buf[i + lag];
    }
    nsdf[lag] = div ? (2 * acf) / div : 0;
  }
  // Collect the highest peak of each positive lobe after the first zero crossing.
  let lag = 1; // start at lag 1 so the lobe around lag 0 is skipped, never the first true peak
  while (lag < maxLag && nsdf[lag] > 0) lag++;
  const peaks = [];
  while (lag < maxLag) {
    while (lag < maxLag && nsdf[lag] <= 0) lag++;
    let best = lag;
    while (lag < maxLag && nsdf[lag] > 0) { if (nsdf[lag] > nsdf[best]) best = lag; lag++; }
    if (best >= minLag && best < maxLag && nsdf[best] > 0) peaks.push(best);
  }
  if (!peaks.length) return { freq: null, clarity: 0, rms };
  const top = Math.max(...peaks.map((p) => nsdf[p]));
  const chosen = peaks.find((p) => nsdf[p] >= top * 0.9);
  const clarity = nsdf[chosen];
  if (clarity < 0.8) return { freq: null, clarity, rms };
  // Parabolic interpolation around the peak.
  const a = nsdf[chosen - 1], b = nsdf[chosen], c = nsdf[chosen + 1];
  const shift = a - 2 * b + c ? (0.5 * (a - c)) / (a - 2 * b + c) : 0;
  return { freq: sampleRate / (chosen + shift), clarity, rms };
}

/** Start listening to the microphone.
 *  onPitch receives { freq, midi (float), note (nearest MIDI int), cents (-50..50), clarity, rms }
 *  or { freq: null, ... } when silent/unclear. Returns { stop() }. Throws if the mic is refused. */
export async function startMic({ onPitch, minFreq, maxFreq } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
  const src = ctx.createMediaStreamSource(stream);
  const an = ctx.createAnalyser();
  an.fftSize = 2048;
  src.connect(an);
  const buf = new Float32Array(an.fftSize);
  let on = true;
  const loop = () => {
    if (!on) return;
    an.getFloatTimeDomainData(buf);
    const r = detectPitch(buf, ctx.sampleRate, { minFreq, maxFreq });
    if (r.freq) {
      const midi = freqToMidi(r.freq);
      const note = Math.round(midi);
      onPitch?.({ ...r, midi, note, cents: Math.round((midi - note) * 100) });
    } else onPitch?.({ ...r, midi: null, note: null, cents: 0 });
    setTimeout(loop, 40);
  };
  loop();
  return {
    stop() {
      on = false;
      stream.getTracks().forEach((t) => t.stop());
      ctx.close();
    },
  };
}

export const micSupported = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
