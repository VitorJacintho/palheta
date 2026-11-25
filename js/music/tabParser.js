// Lê tablatura em texto (ASCII) e gera a sequência de notas.
//
// e|-----------------5-8-|
// B|-------------5-8-----|
// G|---------5-7---------|
// D|-----5-7-------------|
// A|-5-7-----------------|
// E|---------------------|
//
// Blocos de 6 linhas (corda 1 em cima). Números de dois dígitos são casas (ex.: 12).
// Letras de técnica (h p b r / \ ~) são aceitas e ignoradas para a detecção.

import { TUNINGS } from './theory.js';

const TAB_LINE_RE = /^\s*([A-Ga-g][#b]?)?\s*[|:]?\s*([-–0-9hpbrx\/\\~|().^*sSvt ]+)\|?\s*$/;

function isTabLine(line) {
  if (!line || (line.match(/-/g) || []).length < 4) return false;
  return TAB_LINE_RE.test(line);
}

function stripLabel(line) {
  // remove rótulo "e|" / "E:" e mantém o restante alinhado
  const m = line.match(/^\s*[A-Ga-g]?[#b]?\s*[|:]/);
  return m ? line.slice(m[0].length) : line.replace(/^\s+/, '');
}

export function parseTab(text, tuningKey = 'padrao') {
  const tuning = TUNINGS[tuningKey]?.strings || TUNINGS.padrao.strings;
  // corda 1 (aguda) = índice 5 do array da afinação
  const openMidi = (stringNum) => tuning[6 - stringNum];

  const lines = (text || '').replace(/\r/g, '').split('\n');
  const systems = [];
  let block = [];
  const flush = () => {
    if (block.length >= 6) {
      for (let i = 0; i + 6 <= block.length; i += 6) systems.push(block.slice(i, i + 6));
    }
    block = [];
  };
  for (const line of lines) {
    if (isTabLine(line)) block.push(line);
    else flush();
  }
  flush();

  const events = [];
  const errors = [];
  let offset = 0;

  systems.forEach((sys, sIdx) => {
    const rows = sys.map(stripLabel);
    const width = Math.max(...rows.map((r) => r.length));
    for (let c = 0; c < width; c++) {
      const notes = [];
      for (let s = 0; s < 6; s++) {
        const row = rows[s];
        const ch = row[c];
        if (ch >= '0' && ch <= '9') {
          const prev = row[c - 1];
          if (prev >= '0' && prev <= '9') continue; // já lido como parte de número
          let num = ch;
          const nx = row[c + 1];
          if (nx >= '0' && nx <= '9') num += nx;
          const fret = parseInt(num, 10);
          if (fret > 24) { errors.push(`Casa inválida: ${fret}`); continue; }
          const stringNum = s + 1;
          notes.push({ string: stringNum, fret, midi: openMidi(stringNum) + fret });
        }
      }
      if (notes.length) events.push({ col: offset + c, notes, system: sIdx, localCol: c });
    }
    offset += width + 4; // separação entre sistemas
  });

  // durações relativas a partir do espaçamento
  const gaps = [];
  for (let i = 0; i < events.length - 1; i++) {
    // entre sistemas não dá pra saber o espaçamento: usa a unidade
    gaps.push(events[i + 1].system === events[i].system ? events[i + 1].col - events[i].col : null);
  }
  const sorted = gaps.filter((g) => g != null).sort((a, b) => a - b);
  const unit = sorted.length ? sorted[Math.floor(sorted.length * 0.3)] || 1 : 1;
  events.forEach((ev, i) => {
    const g = gaps[i] ?? unit;
    ev.units = Math.min(8, Math.max(0.5, Math.round((g / unit) * 2) / 2));
  });

  return { events, systems, errors };
}

/** Texto de exibição para uma nota da tablatura. */
export function stringName(stringNum, tuningKey = 'padrao') {
  const names = { padrao: ['e', 'B', 'G', 'D', 'A', 'E'], dropD: ['e', 'B', 'G', 'D', 'A', 'D'] };
  return (names[tuningKey] || names.padrao)[stringNum - 1];
}
