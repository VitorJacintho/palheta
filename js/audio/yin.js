// Detecção de frequência fundamental (algoritmo YIN).
// Retorna { freq, clarity } ou null se não houver nota clara.

export function detectPitch(buf, sampleRate, opts = {}) {
  const { threshold = 0.15, minFreq = 70, maxFreq = 1400 } = opts;
  const maxTau = Math.min(Math.floor(sampleRate / minFreq), Math.floor(buf.length / 2));
  const minTau = Math.max(2, Math.floor(sampleRate / maxFreq));
  const W = buf.length - maxTau;
  if (W <= 0) return null;

  const d = new Float32Array(maxTau + 1);
  for (let tau = 1; tau <= maxTau; tau++) {
    let sum = 0;
    for (let i = 0; i < W; i++) {
      const diff = buf[i] - buf[i + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
  }

  // Diferença normalizada pela média acumulada
  d[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= maxTau; tau++) {
    running += d[tau];
    d[tau] = running > 0 ? (d[tau] * tau) / running : 1;
  }

  let tauEst = -1;
  for (let tau = minTau; tau <= maxTau; tau++) {
    if (d[tau] < threshold) {
      while (tau + 1 <= maxTau && d[tau + 1] < d[tau]) tau++;
      tauEst = tau;
      break;
    }
  }
  if (tauEst === -1) {
    // Sem cruzar o limiar: usa o mínimo global se for razoável
    let best = minTau;
    for (let tau = minTau; tau <= maxTau; tau++) if (d[tau] < d[best]) best = tau;
    if (d[best] > 0.35) return null;
    tauEst = best;
  }

  // Interpolação parabólica para precisão sub-amostra
  let betterTau = tauEst;
  if (tauEst > 1 && tauEst < maxTau) {
    const s0 = d[tauEst - 1], s1 = d[tauEst], s2 = d[tauEst + 1];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom !== 0) betterTau = tauEst + (s2 - s0) / denom;
  }
  const freq = sampleRate / betterTau;
  if (freq < minFreq || freq > maxFreq) return null;
  return { freq, clarity: Math.max(0, 1 - d[tauEst]) };
}
