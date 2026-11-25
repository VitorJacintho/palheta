// Letra sincronizada: lê uma cifra colada (acordes em cima da letra) e encaixa
// cada linha na sequência de acordes da música.
//
// A posição do acorde em cima da letra diz em que sílaba ele entra:
//   Em          D
//   Aqui vai a letra da música      → D entra em "letra"
//
// A letra é do usuário: fica só no aparelho dele (nunca no catálogo público).

import { isChordToken, parseChord, sameChordFamily } from './theory.js';
import { stripNotes } from './songParser.js';

const REPEAT_RE = /^\(?(?:x\s*\d+|\d+\s*x)\)?$/i;
const isTabLine = (t) => /^[eBGDAEbgda]\s*[|:]/.test(t) && (t.match(/-/g) || []).length >= 4;

function chordTokens(line) {
  const out = [];
  for (const m of line.matchAll(/\S+/g)) {
    const tok = m[0];
    if (tok === '|' || tok === '.' || tok === '-' || tok === '%' || REPEAT_RE.test(tok)) continue;
    const clean = tok.replace(/^\|+|\|+$/g, '');
    if (!isChordToken(clean)) return null; // tem texto que não é acorde → é letra
    out.push({ symbol: clean, col: m.index + (tok.length - tok.replace(/^\|+/, '').length) });
  }
  return out.length ? out : null;
}

/**
 * Converte a cifra colada em linhas: { section, chords: [{symbol, col}], lyric }.
 * lyric = null em linhas só de acordes (instrumental).
 */
export function parseCifra(text) {
  const raw = (text || '').replace(/\r/g, '').replace(/[​ ]/g, (c) => (c === ' ' ? ' ' : '')).split('\n');
  const lines = [];
  let section = null;
  let pending = null; // acordes esperando a linha de letra de baixo
  let started = false;
  let blankRun = 0;

  const flush = () => {
    if (pending) lines.push({ section, chords: pending, lyric: null });
    pending = null;
  };

  for (const l of raw) {
    const line = l.replace(/\s+$/, '');
    const t = line.trim();
    if (!t) { flush(); blankRun++; continue; }
    if (isTabLine(t) || /^parte \d+ de \d+$/i.test(t)) { blankRun = 0; continue; }
    if (!stripNotes(t).trim()) continue; // linha só com anotação, ex. "(Frase 2)"

    const sec = t.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (sec) {
      flush();
      // "[Tab - Frase 1]" é o riff dentro da parte: não muda o nome da parte
      if (!/^tab\s*-/i.test(sec[1])) section = sec[1].trim();
      started = true;
      blankRun = 0;
      const rest = sec[2];
      if (rest) {
        const offset = line.indexOf(rest);
        const ch = chordTokens(stripNotes(rest));
        if (ch) lines.push({ section, chords: ch.map((c) => ({ ...c, col: c.col + offset })), lyric: null });
      }
      continue;
    }

    // "(Frase 1)" e afins são anotações; "(D7)" é acorde de passagem
    const ch = chordTokens(stripNotes(line));
    if (ch) {
      flush();
      pending = ch;
      started = true;
      blankRun = 0;
      continue;
    }

    if (!started) continue; // título, "Tom: D", etc. antes da cifra
    lines.push({ section, chords: pending || [], lyric: line, afterGap: blankRun >= 2 });
    pending = null;
    blankRun = 0;
  }
  flush();

  // rodapé do site depois do fim (linhas sem acorde após um espaço grande)
  while (lines.length && !lines[lines.length - 1].chords.length && lines[lines.length - 1].afterGap) lines.pop();
  return lines;
}

const sameExact = (a, b) => a.root === b.root && a.suffix === b.suffix;

/**
 * Alinha as linhas da cifra com a sequência de acordes da música.
 * Retorna { lines, anchors, matched, total }:
 *   anchors[i] = { line, chord } — onde o acorde i da música aparece na letra (ou null)
 */
export function alignLyrics(segments, lines) {
  // ocorrências de acordes na cifra colada, juntando repetições seguidas
  const P = [];
  lines.forEach((ln, li) => ln.chords.forEach((c, ci) => {
    const chord = parseChord(c.symbol);
    if (!chord) return;
    const last = P[P.length - 1];
    if (last && sameExact(last.chord, chord)) return;
    P.push({ line: li, chordIdx: ci, chord });
  }));

  const n = segments.length;
  const m = P.length;
  const GAP = -1;
  const score = (s, p) => (sameExact(s.chord, p.chord) ? 3 : sameChordFamily(s.chord, p.chord) ? 1 : -2);
  // Needleman–Wunsch
  const D = Array.from({ length: n + 1 }, () => new Float32Array(m + 1));
  for (let i = 1; i <= n; i++) D[i][0] = i * GAP;
  for (let j = 1; j <= m; j++) D[0][j] = j * GAP;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      D[i][j] = Math.max(D[i - 1][j - 1] + score(segments[i - 1], P[j - 1]), D[i - 1][j] + GAP, D[i][j - 1] + GAP);
    }
  }
  const anchors = new Array(n).fill(null);
  let i = n, j = m;
  while (i > 0 && j > 0) {
    const s = score(segments[i - 1], P[j - 1]);
    if (D[i][j] === D[i - 1][j - 1] + s) {
      if (s > 0) anchors[i - 1] = { line: P[j - 1].line, chord: P[j - 1].chordIdx };
      i--; j--;
    } else if (D[i][j] === D[i - 1][j] + GAP) i--;
    else j--;
  }
  // garante ordem crescente das linhas (alinhamentos cruzados viram "sem âncora")
  let lastLine = -1;
  anchors.forEach((a, k) => {
    if (!a) return;
    if (a.line < lastLine) anchors[k] = null; else lastLine = a.line;
  });
  const matched = anchors.filter(Boolean).length;
  return { lines, anchors, matched, total: n };
}

/** Linha da letra a mostrar no acorde i (com `frac` = quanto do acorde já passou, 0..1). */
export function lineFor(alignment, i, frac = 0) {
  const { anchors, lines } = alignment;
  let k = i;
  while (k >= 0 && !anchors[k]) k--;
  if (k < 0) return { line: 0, chord: -1, exact: false };
  const a = anchors[k];
  if (k !== i) return { line: a.line, chord: -1, exact: false };
  // acorde longo que atravessa várias linhas da letra: anda proporcionalmente
  let next = null;
  for (let q = i + 1; q < anchors.length; q++) if (anchors[q]) { next = anchors[q]; break; }
  const end = next ? next.line : lines.length - 1;
  const span = Math.max(0, end - a.line - (next && next.chord > 0 ? 0 : 1));
  const extra = Math.min(span, Math.floor(Math.max(0, Math.min(0.999, frac)) * (span + 1)));
  return { line: a.line + extra, chord: extra ? -1 : a.chord, exact: true };
}

/** Palavra da letra que fica embaixo da coluna `col`: [início, fim). */
export function wordAt(lyric, col) {
  if (!lyric || col >= lyric.length) return null;
  let c = col;
  while (c < lyric.length && lyric[c] === ' ') c++; // acorde em cima de espaço → próxima palavra
  if (c >= lyric.length) return null;
  let s = c, e = c;
  while (s > 0 && lyric[s - 1] !== ' ') s--;
  while (e < lyric.length && lyric[e] !== ' ') e++;
  return [s, e];
}

/** Tem letra de verdade (não só acordes)? */
export function hasLyrics(text) {
  return parseCifra(text).some((l) => l.lyric && l.lyric.trim().length > 3);
}
