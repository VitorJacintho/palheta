// Teoria musical: notas, frequências, acordes e nomes em português.

export const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
export const SOLFEGE = ['Dó', 'Dó♯', 'Ré', 'Ré♯', 'Mi', 'Fá', 'Fá♯', 'Sol', 'Sol♯', 'Lá', 'Lá♯', 'Si'];

const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const LETTER_SOLFEGE = { C: 'Dó', D: 'Ré', E: 'Mi', F: 'Fá', G: 'Sol', A: 'Lá', B: 'Si' };

export const mod12 = (n) => ((n % 12) + 12) % 12;
export const freqToMidi = (f) => 69 + 12 * Math.log2(f / 440);
export const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

export function midiToName(midi, flats = false) {
  const m = Math.round(midi);
  return (flats ? FLAT_NAMES : SHARP_NAMES)[mod12(m)] + (Math.floor(m / 12) - 1);
}

export function pcName(pc, flats = false) {
  return (flats ? FLAT_NAMES : SHARP_NAMES)[mod12(pc)];
}

/** Nome falado de uma nota: "Fá sustenido", "Si bemol". */
export function spokenNote(letter, accidental = '') {
  const base = LETTER_SOLFEGE[letter.toUpperCase()];
  if (accidental === '#' || accidental === '♯') return `${base} sustenido`;
  if (accidental === 'b' || accidental === '♭') return `${base} bemol`;
  return base;
}

export function spokenPc(pc) {
  const name = SHARP_NAMES[mod12(pc)];
  return spokenNote(name[0], name[1] || '');
}

export function displaySolfege(letter, accidental = '') {
  const base = LETTER_SOLFEGE[letter.toUpperCase()];
  if (accidental === '#' || accidental === '♯') return base + '♯';
  if (accidental === 'b' || accidental === '♭') return base + '♭';
  return base;
}

// ---------------------------------------------------------------------------
// Acordes
// ---------------------------------------------------------------------------

const ROOT_RE = /^([A-G])([#b♯♭]?)/;
// Sufixos aceitos (cifra brasileira e americana). Usado para validar tokens.
const SUFFIX_RE = /^(?:maj|min|dim|aug|sus|add|M|m|°|º|ø|\+|-|\d+|[#b♭♯]|\(|\)|,|\.)*$/;

/** Verifica se um token parece um acorde (para separar cifra de letra). */
export function isChordToken(token) {
  if (!token) return false;
  let t = token.trim();
  const slash = t.match(/\/([A-G][#b♯♭]?)$/);
  if (slash) t = t.slice(0, -slash[0].length);
  const m = t.match(ROOT_RE);
  if (!m) return false;
  return SUFFIX_RE.test(t.slice(m[0].length));
}

/**
 * Interpreta um símbolo de acorde. Retorna null se inválido.
 * { symbol, root, rootName, bass, quality, intervals, core, spoken, solfege }
 */
export function parseChord(symbol) {
  if (!isChordToken(symbol)) return null;
  let s = symbol.trim();
  let bass = null;
  const slash = s.match(/\/([A-G])([#b♯♭]?)$/);
  if (slash) {
    bass = mod12(LETTER_PC[slash[1]] + accidentalOffset(slash[2]));
    s = s.slice(0, -slash[0].length);
  }
  const m = s.match(ROOT_RE);
  const letter = m[1];
  const acc = m[2];
  const root = mod12(LETTER_PC[letter] + accidentalOffset(acc));
  let suf = s.slice(m[0].length).replace(/[()\s,.]/g, '').replace(/♯/g, '#').replace(/♭/g, 'b');

  // Normalizações
  suf = suf
    .replace(/maj7|7M|M7|7\+/g, 'Δ')
    .replace(/[°º]/g, 'dim')
    .replace(/ø/g, 'm7b5')
    .replace(/min/g, 'm');
  if (/^\+|aug|5\+|#5/.test(suf)) suf = suf.replace(/^\+|aug|5\+/, 'aug');

  let third = 4;
  let fifth = 7;
  const extra = new Set();
  let quality = 'maj';

  if (/^dim/.test(suf)) {
    third = 3; fifth = 6; quality = 'dim';
    if (/dim7/.test(suf)) extra.add(9);
  } else if (/^aug/.test(suf)) {
    fifth = 8; quality = 'aug';
  } else if (/^m(?!aj)/.test(suf)) {
    third = 3; quality = 'min';
  }
  if (/sus2/.test(suf)) { third = 2; quality = 'sus2'; }
  else if (/sus4?/.test(suf)) { third = 5; quality = 'sus4'; }
  if (/^5$/.test(suf)) { third = null; quality = 'power'; }
  if (/b5|-5/.test(suf)) fifth = 6;
  if (/#5/.test(suf)) fifth = 8;

  if (/Δ/.test(suf)) extra.add(11);
  else if (/(^|[^1])7/.test(suf.replace(/dim7/, ''))) extra.add(10);
  if (/(^|[^1])6/.test(suf) && !/b6/.test(suf)) extra.add(9);
  if (/9/.test(suf)) { extra.add(2); if (!/add9/.test(suf) && !extra.has(11)) extra.add(10); }
  if (/11/.test(suf)) extra.add(5);
  if (/13/.test(suf)) extra.add(9);

  const core = [0];
  if (third !== null) core.push(third);
  core.push(fifth);
  const intervals = [...new Set([...core, ...extra])];

  const normSuffix = normalizedSuffix(quality, extra, suf);
  return {
    symbol: symbol.trim(),
    root,
    rootLetter: letter,
    rootAcc: acc,
    bass,
    quality,
    suffix: normSuffix,
    intervals,
    core,
    pcs: intervals.map((i) => mod12(root + i)),
    spoken: spokenChord(letter, acc, quality, extra, suf),
    solfege: displaySolfege(letter, acc) + displaySuffix(quality, extra, suf),
  };
}

function accidentalOffset(a) {
  if (a === '#' || a === '♯') return 1;
  if (a === 'b' || a === '♭') return -1;
  return 0;
}

function normalizedSuffix(quality, extra, suf) {
  if (quality === 'power') return '5';
  if (/m7b5/.test(suf)) return 'm7b5';
  if (quality === 'dim') return extra.has(9) ? 'dim7' : 'dim';
  if (quality === 'aug') return 'aug';
  if (quality === 'sus2') return 'sus2';
  if (quality === 'sus4') return extra.has(10) ? '7sus4' : 'sus4';
  const minor = quality === 'min';
  if (extra.has(11)) return minor ? 'm(maj7)' : 'maj7';
  if (/9/.test(suf) && !/add9/.test(suf)) return minor ? 'm9' : '9';
  if (/add9/.test(suf)) return minor ? 'madd9' : 'add9';
  if (extra.has(10)) return minor ? 'm7' : '7';
  if (extra.has(9)) return minor ? 'm6' : '6';
  return minor ? 'm' : '';
}

function displaySuffix(quality, extra, suf) {
  const n = normalizedSuffix(quality, extra, suf);
  return n.replace('maj7', '7M');
}

function spokenChord(letter, acc, quality, extra, suf) {
  const parts = [spokenNote(letter, acc)];
  if (quality === 'power') { parts.push('quinta'); return parts.join(' '); }
  if (/m7b5/.test(suf)) { parts.push('meio diminuto'); return parts.join(' '); }
  if (quality === 'min') parts.push('menor');
  if (quality === 'dim') parts.push('diminuto');
  if (quality === 'aug') parts.push('aumentado');
  if (extra.has(11)) parts.push('com sétima maior');
  else if (extra.has(10)) parts.push('com sétima');
  if (/9/.test(suf)) parts.push('com nona');
  else if (extra.has(9) && quality !== 'dim') parts.push('com sexta');
  if (quality === 'sus4') parts.push('com quarta');
  if (quality === 'sus2') parts.push('com segunda');
  return parts.join(' ');
}

/** Dois acordes são "o mesmo" para efeito de detecção (mesma fundamental e tríade). */
export function sameChordFamily(a, b) {
  if (!a || !b) return false;
  return a.root === b.root && triadClass(a) === triadClass(b);
}

export function triadClass(chord) {
  if (chord.quality === 'sus2' || chord.quality === 'sus4' || chord.quality === 'power') return 'maj';
  return chord.quality;
}

/** Chave usada para comparar acordes idênticos (ex.: Db == C#). */
export function chordKey(chord) {
  return chord.root + ':' + chord.suffix + (chord.bass != null && chord.bass !== chord.root ? '/' + chord.bass : '');
}

/**
 * Acorde que realmente soa quando se usa capotraste/afinação diferente.
 * Ex.: "G" com capo 2 soa como A. Mantém o símbolo escrito para exibição.
 */
export function transposeChord(chord, semis) {
  if (!chord || !semis) return chord;
  return {
    ...chord,
    root: mod12(chord.root + semis),
    bass: chord.bass == null ? null : mod12(chord.bass + semis),
    pcs: chord.pcs.map((p) => mod12(p + semis)),
  };
}

// Afinações (midi da corda 6 → corda 1)
export const TUNINGS = {
  padrao: { name: 'Padrão (E A D G B E)', strings: [40, 45, 50, 55, 59, 64] },
  meioTom: { name: 'Meio tom abaixo (Eb)', strings: [39, 44, 49, 54, 58, 63] },
  dropD: { name: 'Drop D (D A D G B E)', strings: [38, 45, 50, 55, 59, 64] },
  dadgad: { name: 'DADGAD', strings: [38, 45, 50, 55, 57, 62] },
  openG: { name: 'Open G (D G D G B D)', strings: [38, 43, 50, 55, 59, 62] },
};

/** Quantos semitons os acordes escritos soam deslocados (capo + afinação). */
export function soundingOffset({ capo = 0, tuning = 'padrao' } = {}) {
  const t = TUNINGS[tuning] || TUNINGS.padrao;
  return (Number(capo) || 0) + (t.strings[1] - 45); // pela corda Lá
}
