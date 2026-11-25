// Cromagrama (perfil de classes de altura) e reconhecimento de acordes.
import { freqToMidi, mod12, parseChord, sameChordFamily, SHARP_NAMES } from '../music/theory.js';

/**
 * Calcula o cromagrama a partir de magnitudes lineares do espectro.
 * Usa apenas picos locais para reduzir ruído.
 */
export function computeChroma(mags, sampleRate, fftSize, minHz = 75, maxHz = 2000) {
  const chroma = new Float32Array(12);
  const binHz = sampleRate / fftSize;
  const lo = Math.max(2, Math.floor(minHz / binHz));
  const hi = Math.min(mags.length - 2, Math.ceil(maxHz / binHz));
  let maxMag = 0;
  for (let i = lo; i <= hi; i++) if (mags[i] > maxMag) maxMag = mags[i];
  if (maxMag <= 0) return chroma;
  const floor = maxMag * 0.02;

  for (let i = lo; i <= hi; i++) {
    const m = mags[i];
    if (m < floor || m < mags[i - 1] || m < mags[i + 1]) continue;
    // interpolação parabólica do pico
    const a = mags[i - 1], b = m, c = mags[i + 1];
    const den = a - 2 * b + c;
    const p = den !== 0 ? 0.5 * (a - c) / den : 0;
    const freq = (i + p) * binHz;
    const midi = freqToMidi(freq);
    const nearest = Math.round(midi);
    const dev = Math.abs(midi - nearest); // 0..0.5
    const w = 1 - dev * 1.6; // penaliza picos desafinados/entre notas
    if (w <= 0) continue;
    // compressão (raiz) para não deixar uma só corda dominar
    chroma[mod12(nearest)] += Math.sqrt(m) * w;
  }
  return normalize(chroma);
}

export function normalize(v) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  s = Math.sqrt(s);
  if (s > 0) for (let i = 0; i < v.length; i++) v[i] /= s;
  return v;
}

// Harmônicos 1..6 caem em +0, +12, +19, +24, +28, +31 semitons
const HARMONIC_PCS = [0, 0, 7, 0, 4, 7];
const HARMONIC_W = [1, 0.6, 0.36, 0.22, 0.13, 0.08];

const templateCache = new Map();

export function chordTemplate(chord) {
  const key = chord.root + ':' + chord.intervals.join(',');
  if (templateCache.has(key)) return templateCache.get(key);
  const t = new Float32Array(12);
  chord.intervals.forEach((iv) => {
    const isCore = chord.core.includes(iv);
    const noteW = iv === 0 ? 1 : isCore ? 0.9 : 0.6;
    for (let h = 0; h < HARMONIC_PCS.length; h++) {
      t[mod12(chord.root + iv + HARMONIC_PCS[h])] += noteW * HARMONIC_W[h];
    }
  });
  normalize(t);
  templateCache.set(key, t);
  return t;
}

const cosine = (a, b) => {
  let s = 0;
  for (let i = 0; i < 12; i++) s += a[i] * b[i];
  return s;
};

// Vocabulário de comparação: maiores, menores e com sétima nos 12 tons
const VOCAB = [];
for (let pc = 0; pc < 12; pc++) {
  for (const suf of ['', 'm', '7', 'm7']) VOCAB.push(parseChord(SHARP_NAMES[pc] + suf));
}

/**
 * Compara o cromagrama com o vocabulário (e com o acorde alvo, se houver).
 * Retorna { best, bestScore, targetScore, match }.
 */
export function recognizeChord(chroma, target = null, minScore = 0.62) {
  let best = null;
  let bestScore = -1;
  for (const c of VOCAB) {
    const s = cosine(chroma, chordTemplate(c));
    if (s > bestScore) { bestScore = s; best = c; }
  }
  let targetScore = null;
  let match = false;
  if (target) {
    targetScore = cosine(chroma, chordTemplate(target));
    if (targetScore > bestScore) { bestScore = targetScore; best = target; }
    match = targetScore >= minScore && (targetScore >= bestScore - 0.03 || sameChordFamily(best, target));
  }
  return { best, bestScore, targetScore, match };
}
