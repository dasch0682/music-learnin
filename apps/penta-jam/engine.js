// Backing instruments. They go through their own bus, so the whole backing can be cut at once
// (notes already scheduled on the audio clock cannot be cancelled one by one).
const freq = (m) => 440 * 2 ** ((m - 69) / 12);

export function createBacking(ctx) {
  const out = ctx.createGain();
  out.gain.value = 0.8;
  const comp = ctx.createDynamicsCompressor();
  out.connect(comp).connect(ctx.destination);
  const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.2), ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  // waves: [type, frequency multiplier, level, detune cents]
  function tone(waves, midi, t, dur, gain, { attack = 0.01, release = 0.12, sustain = 0.7, cutoff = 1500 } = {}) {
    const env = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    const hold = Math.max(dur, attack + 0.02);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(Math.max(gain * sustain, 0.0001), t + hold);
    env.gain.exponentialRampToValueAtTime(0.0001, t + hold + release);
    lp.connect(env).connect(out);
    for (const [type, mult, level, detune = 0] of waves) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = freq(midi) * mult;
      o.detune.value = detune;
      g.gain.value = level;
      o.connect(g).connect(lp);
      o.start(t);
      o.stop(t + hold + release + 0.05);
    }
  }

  return {
    /** Round bass note. */
    bass(midi, t, dur, gain = 0.25) {
      tone([['triangle', 1, 1], ['sine', 1, 0.6], ['sine', 2, 0.12]], midi, t, dur, gain, { attack: 0.008, release: 0.08, sustain: 0.5, cutoff: 600 });
    },
    /** Soft chord. attack in seconds (long for a drone). */
    pad(midis, t, dur, gain = 0.16, attack = 0.05) {
      const g = gain / Math.sqrt(midis.length);
      for (const m of midis) tone([['sine', 1, 1, -4], ['triangle', 1, 0.35, 5]], m, t, dur, g, { attack, release: 0.3, sustain: 0.8, cutoff: 1400 });
    },
    /** Melody voice used when the app plays a question. */
    lead(midi, t, dur, gain = 0.26) {
      tone([['triangle', 1, 1], ['sine', 2, 0.3]], midi, t, dur, gain, { attack: 0.005, release: 0.25, sustain: 0.25, cutoff: 5000 });
    },
    hat(t, gain = 0.06) {
      const src = ctx.createBufferSource();
      const hp = ctx.createBiquadFilter();
      const g = ctx.createGain();
      src.buffer = noise;
      hp.type = 'highpass';
      hp.frequency.value = 7000;
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      src.connect(hp).connect(g).connect(out);
      src.start(t);
      src.stop(t + 0.07);
    },
    kick(t, gain = 0.2) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.1);
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.18);
    },
    /** Silence everything, including notes already scheduled. */
    kill() {
      const t = ctx.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setTargetAtTime(0, t, 0.015);
      setTimeout(() => { out.disconnect(); comp.disconnect(); }, 200);
    },
  };
}
