// "Guitarrista" simulado para testar o app sem instrumento.
// No console do navegador:  const g = await import('/tests/fake-guitar.js'); g.install();
// Depois de iniciar um treino: g.chords(['G','C','D'], 1.3)  ou  g.notes([45, 48, 50], 0.5)
import { getAudioContext } from '../js/audio/engine.js';
import { parseChord, midiToFreq } from '../js/music/theory.js';
import { shapeFor, shapeMidis } from '../js/music/chordShapes.js';

let dest = null;

export function install() {
  const ctx = getAudioContext();
  dest = ctx.createMediaStreamDestination();
  navigator.mediaDevices.getUserMedia = async () => dest.stream;
}

function note(midi, t0, len, vol = 0.08) {
  const ctx = getAudioContext();
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = midiToFreq(midi);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.004, t0 + len);
  o.connect(g).connect(dest);
  o.start(t0);
  o.stop(t0 + len + 0.02);
}

/** Toca acordes; `durs` pode ser um número (todos iguais) ou uma lista em segundos. */
export function chords(symbols, durs, delay = 1.2) {
  const ctx = getAudioContext();
  let t = ctx.currentTime + delay;
  symbols.forEach((s, idx) => {
    const dur = Array.isArray(durs) ? durs[idx] : durs;
    const midis = shapeMidis(shapeFor(parseChord(s)));
    for (let k = 0; k < 2; k++) midis.forEach((m, i) => note(m, t + (k * dur) / 2 + i * 0.01, dur / 2));
    t += dur;
  });
  return t;
}

/** "Voz" simulada (com vibrato) cantando uma melodia por cima: [midi, segundos][]. */
export function sing(melody, delay = 1.0, vol = 0.12) {
  const ctx = getAudioContext();
  let t = ctx.currentTime + delay;
  melody.forEach(([midi, d]) => {
    if (midi == null) { t += d; return; }
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = midiToFreq(midi);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.5;
    const depth = ctx.createGain();
    depth.gain.value = midiToFreq(midi) * 0.015; // ±25 cents
    lfo.connect(depth).connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.06);
    g.gain.setValueAtTime(vol, t + d * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(dest);
    o.start(t); lfo.start(t);
    o.stop(t + d + 0.02); lfo.stop(t + d + 0.02);
    t += d;
  });
  return t;
}

/** Toca notas isoladas (midi). */
export function notes(midis, dur, delay = 1.0) {
  const ctx = getAudioContext();
  let t = ctx.currentTime + delay;
  midis.forEach((m, idx) => {
    const d = Array.isArray(dur) ? dur[idx] : dur;
    note(m, t, d * 0.9, 0.12);
    t += d;
  });
  return t;
}
