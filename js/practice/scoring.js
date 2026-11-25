// Funções de pontuação compartilhadas.

export const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
export const median = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const stdev = (arr) => {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(mean(arr.map((x) => (x - m) ** 2)));
};

export function grade(score) {
  if (score >= 90) return { label: 'Excelente!', emoji: '🔥' };
  if (score >= 75) return { label: 'Muito bom!', emoji: '🎸' };
  if (score >= 60) return { label: 'Bom — continue praticando', emoji: '👍' };
  if (score >= 40) return { label: 'Dá pra melhorar', emoji: '💪' };
  return { label: 'Tente mais devagar', emoji: '🐢' };
}

/** Pontua desvio relativo (0 = perfeito, tol = vira zero). */
export const relScore = (dev, tol) => clamp(1 - Math.abs(dev) / tol);

/** Pontua erro de tempo em ms (até `good` ms é 100%, `bad` ms é 0). */
export const msScore = (ms, good = 25, bad = 160) => clamp(1 - (Math.abs(ms) - good) / (bad - good));

export function weighted(metrics) {
  const total = metrics.reduce((a, m) => a + m.weight, 0);
  return Math.round(metrics.reduce((a, m) => a + m.value * m.weight, 0) / total);
}
