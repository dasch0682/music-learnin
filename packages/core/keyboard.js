// On-screen instruments: a piano keyboard and big note pads. Multi-touch.
import { playNote, audio } from './audio.js';
import { noteName, isNatural } from './music.js';
import { getLang } from './i18n.js';
import { onMidi } from './midi.js';

function bind(root, { onDown, onUp, sound, timbre }) {
  const held = new Map();
  const midiOf = (target) => { const k = target.closest?.('[data-midi]'); return k && root.contains(k) ? k : null; };
  root.addEventListener('pointerdown', (e) => {
    const key = midiOf(e.target);
    if (!key || root.classList.contains('ml-disabled')) return;
    e.preventDefault();
    audio();
    const midi = +key.dataset.midi;
    held.set(e.pointerId, key);
    key.classList.add('ml-down');
    if (sound) playNote(midi, { timbre, dur: 0.5 });
    onDown?.(midi);
  });
  const release = (e) => {
    const key = held.get(e.pointerId);
    if (!key) return;
    held.delete(e.pointerId);
    key.classList.remove('ml-down');
    onUp?.(+key.dataset.midi);
  };
  root.addEventListener('pointerup', release);
  root.addEventListener('pointercancel', release);
  root.addEventListener('pointerleave', release);
  root.addEventListener('contextmenu', (e) => e.preventDefault());

  // A real MIDI keyboard plays the same keys (only the notes this instrument has).
  const lit = new Map();
  const off = onMidi(({ type, midi, velocity }) => {
    if (!root.isConnected) { off(); return; }
    const key = root.querySelector(`[data-midi="${midi}"]`);
    if (type === 'on') {
      if (!key || root.classList.contains('ml-disabled') || lit.has(midi)) return;
      audio();
      lit.set(midi, key);
      key.classList.add('ml-down');
      if (sound) playNote(midi, { timbre, dur: 0.5, gain: 0.1 + 0.2 * (velocity / 127) });
      onDown?.(midi);
    } else if (lit.has(midi)) {
      lit.get(midi).classList.remove('ml-down');
      lit.delete(midi);
      onUp?.(midi);
    }
  });
}

function api(root) {
  const key = (midi) => root.querySelector(`[data-midi="${midi}"]`);
  return {
    el: root,
    /** Briefly highlight a key. cls: 'ml-hit' | 'ml-good' | 'ml-bad' | 'ml-hint' */
    flash(midi, cls = 'ml-hit', ms = 350) {
      const k = key(midi);
      if (!k) return;
      k.classList.add(cls);
      setTimeout(() => k.classList.remove(cls), ms);
    },
    setEnabled(on) { root.classList.toggle('ml-disabled', !on); },
  };
}

/** Piano keyboard. opts: { from, to (MIDI, white keys), onDown(midi), onUp(midi), labels: bool, sound: bool, timbre } */
export function createKeyboard(container, { from = 60, to = 76, onDown, onUp, labels = false, sound = true, timbre = 'piano' } = {}) {
  const root = document.createElement('div');
  root.className = 'ml-keyboard';
  const whites = [];
  for (let m = from; m <= to; m++) if (isNatural(m)) whites.push(m);
  const w = 100 / whites.length;
  whites.forEach((m) => {
    const k = document.createElement('button');
    k.className = 'ml-key ml-white';
    k.dataset.midi = m;
    k.style.width = w + '%';
    if (labels) k.textContent = noteName(m, { lang: getLang() });
    root.append(k);
  });
  for (let m = from; m <= to; m++) {
    if (isNatural(m)) continue;
    const i = whites.indexOf(m - 1);
    if (i < 0 || i === whites.length - 1) continue;
    const k = document.createElement('button');
    k.className = 'ml-key ml-black';
    k.dataset.midi = m;
    k.style.left = (i + 1) * w - w * 0.3 + '%';
    k.style.width = w * 0.6 + '%';
    root.append(k);
  }
  bind(root, { onDown, onUp, sound, timbre });
  container.replaceChildren(root);
  return api(root);
}

/** Big pads, one per note (made for pentatonic play: no wrong note).
 *  opts: { notes: [midi], onDown(midi), onUp(midi), labels: bool, sound: bool, timbre } */
export function createPads(container, { notes, onDown, onUp, labels = false, sound = true, timbre = 'piano' } = {}) {
  const root = document.createElement('div');
  root.className = 'ml-pads';
  const lo = Math.min(...notes), hi = Math.max(...notes);
  notes.forEach((m, i) => {
    const k = document.createElement('button');
    k.className = 'ml-pad';
    k.dataset.midi = m;
    k.style.setProperty('--h', hi === lo ? 0.5 : (m - lo) / (hi - lo));
    k.style.setProperty('--i', i);
    if (labels) k.textContent = noteName(m, { lang: getLang() });
    root.append(k);
  });
  bind(root, { onDown, onUp, sound, timbre });
  container.replaceChildren(root);
  return api(root);
}
