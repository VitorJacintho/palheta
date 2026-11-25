// Sons: metrônomo e cordas sintetizadas (Karplus-Strong) para referência.
import { getAudioContext, engine } from '../audio/engine.js';
import { midiToFreq } from '../music/theory.js';
import { settings } from './storage.js';

export function click(time, accent = false, suppress = true) {
  const ctx = getAudioContext();
  const vol = settings.get().metronomeVolume;
  if (vol <= 0) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = accent ? 1760 : 1175;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(vol, time + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
  osc.connect(gain).connect(ctx.destination);
  osc.start(time);
  osc.stop(time + 0.06);
  // não confundir o clique com uma palhetada
  if (suppress) engine.suppressOnsets(time + 0.07);
}

/**
 * Mede o atraso total (alto-falante → microfone → análise) tocando cliques
 * e vendo quando o app os "ouve". Retorna o atraso em ms.
 */
export async function measureLatency() {
  const ctx = getAudioContext();
  const onsets = [];
  const un = engine.subscribe((f) => { if (f.onset) onsets.push(f.onsetTime ?? f.t); });
  const start = ctx.currentTime + 0.6;
  const clicks = Array.from({ length: 8 }, (_, k) => start + k * 0.5);
  clicks.forEach((t) => click(t, true, false));
  await new Promise((r) => setTimeout(r, (clicks[7] - ctx.currentTime + 0.6) * 1000));
  un();
  const diffs = clicks
    .map((c) => onsets.find((o) => o >= c - 0.01 && o <= c + 0.3))
    .map((o, k) => (o == null ? null : o - clicks[k]))
    .filter((d) => d != null)
    .sort((a, b) => a - b);
  if (diffs.length < 4) throw new Error('Não consegui ouvir os cliques. Tire o fone, aumente o volume e tente de novo em silêncio.');
  return Math.round(diffs[Math.floor(diffs.length / 2)] * 1000);
}

/**
 * Metrônomo com agendamento antecipado (preciso mesmo com a UI ocupada).
 * onBeat(beatIndex, time) é chamado perto do momento de cada tempo.
 */
export class Metronome {
  constructor({ bpm, beatsPerBar = 4, startTime, onBeat, audible = true, totalBeats = Infinity }) {
    this.bpm = bpm;
    this.beatsPerBar = beatsPerBar;
    this.nextTime = startTime;
    this.beat = 0;
    this.onBeat = onBeat;
    this.audible = audible;
    this.totalBeats = totalBeats;
    this.timeouts = [];
    this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  schedule() {
    const ctx = getAudioContext();
    while (this.nextTime < ctx.currentTime + 0.12 && this.beat < this.totalBeats) {
      const t = this.nextTime;
      const b = this.beat;
      if (this.audible) click(t, b % this.beatsPerBar === 0);
      const delay = Math.max(0, (t - ctx.currentTime) * 1000);
      this.timeouts.push(setTimeout(() => this.onBeat?.(b, t), delay));
      this.beat++;
      this.nextTime += 60 / this.bpm;
    }
    if (this.timeouts.length > 64) this.timeouts.splice(0, 32);
  }

  stop() {
    clearInterval(this.timer);
    this.timeouts.forEach(clearTimeout);
  }
}

// --- Cordas sintetizadas --------------------------------------------------

const pluckCache = new Map();

function pluckBuffer(freq, seconds = 2.2) {
  const ctx = getAudioContext();
  const key = Math.round(freq * 10);
  if (pluckCache.has(key)) return pluckCache.get(key);
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const buffer = ctx.createBuffer(1, len, sr);
  const out = buffer.getChannelData(0);
  const period = Math.round(sr / freq);
  const ring = new Float32Array(period);
  for (let i = 0; i < period; i++) ring[i] = Math.random() * 2 - 1;
  let idx = 0;
  const decay = 0.996;
  for (let i = 0; i < len; i++) {
    const next = (idx + 1) % period;
    const v = decay * 0.5 * (ring[idx] + ring[next]);
    out[i] = ring[idx];
    ring[idx] = v;
    idx = next;
  }
  pluckCache.set(key, buffer);
  return buffer;
}

export function pluck(midi, when = 0, gainValue = 0.5) {
  const ctx = getAudioContext();
  const src = ctx.createBufferSource();
  src.buffer = pluckBuffer(midiToFreq(midi));
  const g = ctx.createGain();
  g.gain.value = gainValue;
  src.connect(g).connect(ctx.destination);
  src.start(when || ctx.currentTime);
}

/** Toca um acorde (lista de midis, grave → agudo) como uma palhetada. */
export function strum(midis, gap = 0.025) {
  const ctx = getAudioContext();
  const t0 = ctx.currentTime + 0.02;
  midis.forEach((m, i) => pluck(m, t0 + i * gap, 0.32));
}
