// Motor de áudio: microfone, análise contínua (afinação, acorde, ataques).
import { detectPitch } from './yin.js';
import { computeChroma } from './chroma.js';
import { freqToMidi } from '../music/theory.js';
import { settings } from '../services/storage.js';

let ctx = null;

export function getAudioContext() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

const FFT_SIZE = 8192;
const PITCH_WINDOW = 2048;
const TICK_MS = 20;

class AudioEngine {
  constructor() {
    this.listeners = new Set();
    this.stream = null;
    this.analyser = null;
    this.timer = null;
    this.timeBuf = new Float32Array(FFT_SIZE);
    this.freqDb = new Float32Array(FFT_SIZE / 2);
    this.mags = new Float32Array(FFT_SIZE / 2);
    this.smoothChroma = new Float32Array(12);
    this.rmsHistory = [];
    this.lastOnset = -1;
    this.suppressUntil = 0;
    this.pitchHistory = [];
    this.latencyOffset = 0; // ajuste fino (s), positivo = o buffer está "adiantado"
  }

  get running() { return !!this.stream; }

  async start() {
    if (this.stream) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Seu navegador não permite acesso ao microfone. Use Chrome, Edge ou Safari atualizados (e HTTPS).');
    }
    const audioCtx = getAudioContext();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const src = audioCtx.createMediaStreamSource(this.stream);
    this.analyser = audioCtx.createAnalyser();
    this.analyser.fftSize = FFT_SIZE;
    this.analyser.smoothingTimeConstant = 0;
    src.connect(this.analyser);
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.analyser = null;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Ignora ataques até o tempo dado (ex.: clique do metrônomo). */
  suppressOnsets(until) {
    this.suppressUntil = Math.max(this.suppressUntil, until);
  }

  /**
   * Acha o instante exato do ataque dentro do buffer (precisão de ~1 ms),
   * em vez de usar o horário do ciclo de análise (que chega ~40 ms depois).
   */
  locateOnset(t, sr, baseRms) {
    const buf = this.timeBuf;
    const span = Math.min(buf.length, Math.round(sr * 0.06)); // últimos 60 ms
    const start = buf.length - span;
    const hop = 64;
    const level = Math.max(baseRms * 2.5, 0.002);
    for (let i = start; i + hop <= buf.length; i += hop) {
      let s = 0;
      for (let j = i; j < i + hop; j++) s += buf[j] * buf[j];
      if (Math.sqrt(s / hop) > level) {
        return t - (buf.length - i) / sr + this.latencyOffset;
      }
    }
    return t - 0.02;
  }

  tick() {
    if (!this.analyser || this.listeners.size === 0) return;
    const audioCtx = getAudioContext();
    const t = audioCtx.currentTime;
    const sr = audioCtx.sampleRate;
    this.analyser.getFloatTimeDomainData(this.timeBuf);

    // Energia dos últimos ~20 ms (para ataques) e da janela de afinação
    const recent = this.timeBuf.subarray(FFT_SIZE - 1024);
    let sum = 0;
    for (let i = 0; i < recent.length; i++) sum += recent[i] * recent[i];
    const rms = Math.sqrt(sum / recent.length);

    const gate = gateFromSensitivity(settings.get().sensitivity);
    const voiced = rms > gate;

    // Ataque: subida brusca de energia
    const hist = this.rmsHistory;
    const prevMin = hist.length ? Math.min(...hist.slice(-4)) : 0;
    let onset = false;
    let onsetTime = null;
    if (voiced && rms > prevMin * 1.8 + gate * 0.5 && t - this.lastOnset > 0.12 && t > this.suppressUntil) {
      onset = true;
      onsetTime = this.locateOnset(t, sr, prevMin);
      this.lastOnset = t;
    }
    hist.push(rms);
    if (hist.length > 20) hist.shift();

    // Afinação
    let pitch = null;
    if (voiced) {
      const win = this.timeBuf.subarray(FFT_SIZE - PITCH_WINDOW);
      const p = detectPitch(win, sr);
      if (p && p.clarity > 0.75) {
        const midi = freqToMidi(p.freq);
        pitch = { freq: p.freq, midi, clarity: p.clarity };
      }
    }

    // Cromagrama
    let chroma = this.smoothChroma;
    if (voiced) {
      this.analyser.getFloatFrequencyData(this.freqDb);
      for (let i = 0; i < this.freqDb.length; i++) this.mags[i] = Math.pow(10, this.freqDb[i] / 20);
      const raw = computeChroma(this.mags, sr, FFT_SIZE);
      const a = onset ? 0.7 : 0.35;
      for (let i = 0; i < 12; i++) chroma[i] = chroma[i] * (1 - a) + raw[i] * a;
    } else {
      for (let i = 0; i < 12; i++) chroma[i] *= 0.85;
    }

    const frame = { t, rms, gate, voiced, onset, onsetTime, pitch, chroma };
    this.listeners.forEach((fn) => {
      try { fn(frame); } catch (e) { console.error(e); }
    });
  }
}

/** Sensibilidade 1..10 → limiar de RMS. */
export function gateFromSensitivity(s = 5) {
  // 1 → 0.05 (pouco sensível)  10 → 0.004 (muito sensível)
  return 0.05 * Math.pow(0.004 / 0.05, (s - 1) / 9);
}

export const engine = new AudioEngine();

// Navegadores só liberam o áudio depois de um toque/clique do usuário
if (typeof window !== 'undefined') {
  ['pointerdown', 'keydown'].forEach((ev) =>
    window.addEventListener(ev, () => { if (ctx && ctx.state === 'suspended') ctx.resume(); }, { passive: true }));
}
