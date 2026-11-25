// Formato de arquivo de música / tablatura do catálogo (texto simples).
//
//   titulo: Medo da Chuva
//   artista: Raul Seixas
//   tom: D
//   capo: 0
//   bpm: 100
//   compasso: 4
//   nivel: iniciante
//   tags: rock, nacional
//   duracoes: 4 4 2 2 ...      (opcional — gravadas tocando)
//
//   [Intro]
//   | A7 | D | G . G5/F# . | D |
//   ...
//   Estrutura: Intro, Primeira parte, Refrão, ...
//
// O cabeçalho termina na primeira linha que não é "campo: valor" conhecido.

import { chordOnlyText } from './songParser.js';

export const LEVELS = ['iniciante', 'intermediario', 'avancado'];
export const LEVEL_LABEL = { iniciante: 'Iniciante', intermediario: 'Intermediário', avancado: 'Avançado' };

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const FIELDS = {
  titulo: 'title', title: 'title',
  artista: 'artist', artist: 'artist',
  tom: 'key', key: 'key',
  capo: 'capo', capotraste: 'capo',
  afinacao: 'tuning', tuning: 'tuning',
  bpm: 'bpm',
  compasso: 'beatsPerBar', tempos: 'beatsPerBar',
  nivel: 'level', level: 'level',
  tags: 'tags',
  duracoes: 'durations', durations: 'durations',
  notas_por_tempo: 'perBeat', 'notas por tempo': 'perBeat',
  fonte: 'source', source: 'source',
};

const TUNING_ALIASES = {
  padrao: 'padrao', standard: 'padrao', 'meio tom abaixo': 'meioTom', meiotom: 'meioTom', eb: 'meioTom',
  'drop d': 'dropD', dropd: 'dropD', dadgad: 'dadgad', 'open g': 'openG', openg: 'openG',
};

function normalizeLevel(v) {
  const n = norm(v || '');
  if (n.startsWith('ini') || n === 'facil') return 'iniciante';
  if (n.startsWith('inter') || n === 'medio') return 'intermediario';
  if (n.startsWith('ava') || n === 'dificil') return 'avancado';
  return null;
}

/** Lê o arquivo: { meta, body }. */
export function parseItemFile(text) {
  const lines = (text || '').replace(/\r/g, '').split('\n');
  const meta = {};
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) { if (Object.keys(meta).length) { i++; break; } continue; }
    const m = line.match(/^([A-Za-zÀ-ú_ ]+?)\s*:\s*(.*)$/);
    const key = m && FIELDS[norm(m[1])];
    if (!key) break;
    meta[key] = m[2].trim();
  }
  const body = lines.slice(i).join('\n').replace(/^\n+/, '').replace(/\s+$/, '');

  const out = {
    title: meta.title || 'Sem título',
    artist: meta.artist || '',
    key: meta.key || '',
    capo: parseInt(meta.capo, 10) || 0,
    tuning: TUNING_ALIASES[norm(meta.tuning || '')] || 'padrao',
    bpm: parseInt(meta.bpm, 10) || 80,
    beatsPerBar: parseInt(meta.beatsPerBar, 10) || 4,
    level: normalizeLevel(meta.level) || 'iniciante',
    tags: (meta.tags || '').split(',').map((t) => t.trim()).filter(Boolean),
    perBeat: parseInt(meta.perBeat, 10) || 2,
    source: meta.source || '',
  };
  if (meta.durations) {
    // "4 2,5 8" (vírgula decimal) ou "4, 2.5, 8" (vírgula + espaço separa)
    out.durations = meta.durations.replace(/,(?=\s|$)/g, ' ').split(/[\s;]+/)
      .map((x) => parseFloat(x.replace(',', '.'))).filter((x) => x > 0);
  }
  return { meta: out, body };
}

/** Converte arquivo de música no objeto usado pelo app. */
export function songFromFile(id, text) {
  const { meta, body } = parseItemFile(text);
  return { id, ...meta, chords: body };
}

export function tabFromFile(id, text) {
  const { meta, body } = parseItemFile(text);
  return { id, ...meta, tab: body };
}

const TUNING_OUT = { padrao: null, meioTom: 'meio tom abaixo', dropD: 'drop D', dadgad: 'DADGAD', openG: 'open G' };

/** Gera o texto do arquivo (para "Copiar como texto"). */
export function itemToFile(item, kind = 'song') {
  const h = [];
  h.push(`titulo: ${item.title || ''}`);
  if (item.artist) h.push(`artista: ${item.artist}`);
  if (item.key) h.push(`tom: ${item.key}`);
  if (item.capo) h.push(`capo: ${item.capo}`);
  if (TUNING_OUT[item.tuning]) h.push(`afinacao: ${TUNING_OUT[item.tuning]}`);
  h.push(`bpm: ${item.bpm || 80}`);
  if (kind === 'song') h.push(`compasso: ${item.beatsPerBar || 4}`);
  else h.push(`notas_por_tempo: ${item.perBeat || 2}`);
  h.push(`nivel: ${item.level || 'iniciante'}`);
  if (item.tags?.length) h.push(`tags: ${item.tags.join(', ')}`);
  if (kind === 'song' && item.durations?.length) h.push(`duracoes: ${item.durations.join(' ')}`);
  // música: sai só a parte de acordes (letra fica no aparelho — direitos autorais)
  const body = kind === 'song' ? chordOnlyText(item.chords) : item.tab;
  return h.join('\n') + '\n\n' + (body || '').trim() + '\n';
}
