// Converte texto de cifra/progressão em uma lista de acordes com duração em tempos.
//
// Formatos aceitos (podem ser misturados):
//   | G . C . | D |        compassos: cada "." estende o acorde anterior
//   G C D Em               linha só de acordes: cada acorde = 1 compasso
//   G:2 C:2 D:4            duração explícita em tempos
//   [Refrão] ou Intro:     marcadores de seção
//   ... (2x) ou x2         repete a linha
//   Estrutura: Intro, A, Refrão, B, Refrão
//                          toca as partes nessa ordem (escreve o refrão uma vez só)
// Linhas com letra (que não são só acordes) são ignoradas — dá pra colar uma cifra inteira.

import { isChordToken, parseChord } from './theory.js';

const REPEAT_RE = /^\(?(?:x\s*(\d+)|(\d+)\s*x)\)?$/i;
const STRUCTURE_RE = /^(?:estrutura|ordem|structure)\s*:\s*(.+)$/i;

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function splitBeats(token) {
  const m = token.match(/^(.+?)[:*](\d+(?:[.,]\d+)?)$/);
  if (m && isChordToken(m[1])) return { symbol: m[1], beats: parseFloat(m[2].replace(',', '.')) };
  return { symbol: token, beats: null };
}

function isChordish(token) {
  if (token === '.' || token === '-' || token === '%' || token === '/') return true;
  if (REPEAT_RE.test(token)) return true;
  return isChordToken(splitBeats(token).symbol);
}

export function parseProgression(text, beatsPerBar = 4) {
  const items = [];
  const errors = [];
  const warnings = [];
  let section = null;
  let ignored = 0;
  let prevBar = null;
  let structure = null;

  const push = (symbol, beats, sec) => {
    const chord = parseChord(symbol);
    if (!chord) {
      errors.push(`Acorde não reconhecido: ${symbol}`);
      return;
    }
    items.push({ symbol: chord.symbol, beats: Math.max(0.5, beats), section: sec });
  };

  const lines = (text || '').replace(/\r/g, '').split('\n');
  for (const raw of lines) {
    let line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue; // comentários

    const st = line.match(STRUCTURE_RE);
    if (st) {
      structure = st[1].split(/[,;→>]+/).map((s) => s.replace(/[[\]]/g, '').trim()).filter(Boolean);
      continue;
    }

    const sec = line.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (sec) {
      section = sec[1].trim();
      line = sec[2].trim();
      if (!line) continue;
    }
    const label = line.match(/^([A-Za-zÀ-ú0-9 ]{2,24}):\s*(.*)$/);
    if (label && !isChordToken(label[1])) {
      section = label[1].trim();
      line = label[2].trim();
      if (!line) continue;
    }

    // repetição no fim da linha: "(2x)" ou "x2"
    let repeat = 1;
    const rep = line.match(/\s+\(?(?:x\s*(\d+)|(\d+)\s*x)\)?\s*$/i);
    if (rep) {
      repeat = parseInt(rep[1] || rep[2], 10) || 1;
      line = line.slice(0, rep.index).trim();
    }

    const lineItems = [];
    if (line.includes('|')) {
      const bars = line.split('|').map((b) => b.trim()).filter(Boolean);
      let valid = bars.length > 0;
      const parsedBars = [];
      for (const bar of bars) {
        const tokens = bar.split(/\s+/).filter(Boolean);
        if (!tokens.every(isChordish)) { valid = false; break; }
        parsedBars.push(tokens);
      }
      if (!valid) { ignored++; continue; }
      for (const tokens of parsedBars) {
        if (tokens.length === 1 && tokens[0] === '%') {
          if (prevBar) prevBar.forEach((it) => lineItems.push({ ...it }));
          continue;
        }
        const units = [];
        for (const tk of tokens) {
          if (tk === '.' || tk === '-' || tk === '/') {
            if (units.length) units[units.length - 1].units++;
          } else {
            const { symbol, beats } = splitBeats(tk);
            units.push({ symbol, units: 1, beats });
          }
        }
        const totalUnits = units.reduce((a, u) => a + (u.beats == null ? u.units : 0), 0);
        const explicitBeats = units.reduce((a, u) => a + (u.beats ?? 0), 0);
        const free = Math.max(0, beatsPerBar - explicitBeats);
        const barItems = units.map((u) => ({
          symbol: u.symbol,
          beats: u.beats ?? (totalUnits ? (free * u.units) / totalUnits : beatsPerBar),
        }));
        prevBar = barItems;
        barItems.forEach((it) => lineItems.push(it));
      }
    } else {
      const tokens = line.split(/\s+/).filter(Boolean);
      if (!tokens.every(isChordish) || tokens.every((t) => !isChordToken(splitBeats(t).symbol))) {
        ignored++;
        continue;
      }
      for (const tk of tokens) {
        if (tk === '.' || tk === '-' || tk === '/') {
          const last = lineItems[lineItems.length - 1];
          if (last) last.beats += beatsPerBar;
          continue;
        }
        if (tk === '%' || REPEAT_RE.test(tk)) continue;
        const { symbol, beats } = splitBeats(tk);
        lineItems.push({ symbol, beats: beats ?? beatsPerBar });
      }
    }

    for (let r = 0; r < repeat; r++) lineItems.forEach((it) => push(it.symbol, it.beats, section));
  }

  if (!structure) return { items, errors, warnings, ignoredLines: ignored };

  // Monta a música na ordem da estrutura
  const bySection = new Map();
  items.forEach((it) => {
    const k = norm(it.section || '');
    if (!bySection.has(k)) bySection.set(k, []);
    bySection.get(k).push(it);
  });
  const ordered = [];
  structure.forEach((name) => {
    const part = bySection.get(norm(name));
    if (!part) errors.push(`Parte não encontrada na estrutura: ${name}`);
    else part.forEach((it) => ordered.push({ ...it }));
  });
  const used = new Set(structure.map(norm));
  [...bySection.keys()].filter((k) => k && !used.has(k))
    .forEach((k) => warnings.push(`Parte definida mas fora da estrutura: ${bySection.get(k)[0].section}`));

  return { items: ordered, errors, warnings, ignoredLines: ignored, structure };
}

/** Junta acordes iguais em sequência (o violonista não "troca" de G para G). */
export function mergeRepeats(items) {
  const out = [];
  for (const it of items) {
    const chord = parseChord(it.symbol);
    if (!chord) continue;
    const last = out[out.length - 1];
    if (last && last.chord.root === chord.root && last.chord.suffix === chord.suffix && last.chord.bass === chord.bass) {
      last.beats += it.beats;
    } else {
      out.push({ symbol: it.symbol, chord, beats: it.beats, section: it.section });
    }
  }
  return out;
}

/**
 * Sequência final de acordes de uma música, já com as durações gravadas
 * (se existirem e ainda baterem com a cifra).
 * Retorna { segments, usedRecording, recordingMismatch }.
 */
export function songSegments(song) {
  const segments = mergeRepeats(parseProgression(song.chords, song.beatsPerBar || 4).items);
  const d = song.durations;
  if (Array.isArray(d) && d.length) {
    if (d.length === segments.length) {
      segments.forEach((s, i) => { if (d[i] > 0) s.beats = d[i]; });
      return { segments, usedRecording: true, recordingMismatch: false };
    }
    return { segments, usedRecording: false, recordingMismatch: true };
  }
  return { segments, usedRecording: false, recordingMismatch: false };
}
