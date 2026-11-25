// Desenhos de acordes (shapes) e renderização em SVG.
import { mod12, SHARP_NAMES, TUNINGS } from './theory.js';

// frets da corda 6 (E grave) → corda 1 (e aguda). -1 = não tocar.
const OPEN_SHAPES = {
  'C': [-1, 3, 2, 0, 1, 0], 'D': [-1, -1, 0, 2, 3, 2], 'E': [0, 2, 2, 1, 0, 0],
  'F': [1, 3, 3, 2, 1, 1], 'G': [3, 2, 0, 0, 0, 3], 'A': [-1, 0, 2, 2, 2, 0],
  'Am': [-1, 0, 2, 2, 1, 0], 'Dm': [-1, -1, 0, 2, 3, 1], 'Em': [0, 2, 2, 0, 0, 0],
  'A7': [-1, 0, 2, 0, 2, 0], 'B7': [-1, 2, 1, 2, 0, 2], 'C7': [-1, 3, 2, 3, 1, 0],
  'D7': [-1, -1, 0, 2, 1, 2], 'E7': [0, 2, 0, 1, 0, 0], 'G7': [3, 2, 0, 0, 0, 1],
  'Am7': [-1, 0, 2, 0, 1, 0], 'Em7': [0, 2, 0, 0, 0, 0], 'Dm7': [-1, -1, 0, 2, 1, 1],
  'Bm7': [-1, 2, 0, 2, 0, 2], 'Cmaj7': [-1, 3, 2, 0, 0, 0], 'Fmaj7': [-1, -1, 3, 2, 1, 0],
  'Gmaj7': [3, 2, 0, 0, 0, 2], 'Amaj7': [-1, 0, 2, 1, 2, 0], 'Dmaj7': [-1, -1, 0, 2, 2, 2],
  'Emaj7': [0, 2, 1, 1, 0, 0], 'Asus4': [-1, 0, 2, 2, 3, 0], 'Dsus4': [-1, -1, 0, 2, 3, 3],
  'Esus4': [0, 2, 2, 2, 0, 0], 'Asus2': [-1, 0, 2, 2, 0, 0], 'Dsus2': [-1, -1, 0, 2, 3, 0],
  'C6': [-1, 3, 2, 2, 1, 0], 'A6': [-1, 0, 2, 2, 2, 2], 'E6': [0, 2, 2, 1, 2, 0],
  'Cadd9': [-1, 3, 2, 0, 3, 0], 'Gadd9': [3, 2, 0, 2, 0, 3], 'Bdim': [-1, 2, 3, 4, 3, -1],
};

// Shapes móveis (pestana) relativos à casa da fundamental
const E_SHAPE = {
  '': [0, 2, 2, 1, 0, 0], 'm': [0, 2, 2, 0, 0, 0], '7': [0, 2, 0, 1, 0, 0],
  'm7': [0, 2, 0, 0, 0, 0], 'sus4': [0, 2, 2, 2, 0, 0], '5': [0, 2, 2, -1, -1, -1],
  'maj7': [0, -1, 1, 1, 0, -1], '7sus4': [0, 2, 0, 2, 0, 0],
};
const A_SHAPE = {
  '': [-1, 0, 2, 2, 2, 0], 'm': [-1, 0, 2, 2, 1, 0], '7': [-1, 0, 2, 0, 2, 0],
  'm7': [-1, 0, 2, 0, 1, 0], 'maj7': [-1, 0, 2, 1, 2, 0], 'sus4': [-1, 0, 2, 2, 3, 0],
  'sus2': [-1, 0, 2, 2, 0, 0], '5': [-1, 0, 2, 2, -1, -1], 'dim': [-1, 0, 1, 2, 1, -1],
  'm7b5': [-1, 0, 1, 0, 1, -1], 'dim7': [-1, 0, 1, 2, 1, 2], '6': [-1, 0, 2, 2, 2, 2],
  'm6': [-1, 0, 2, 2, 1, 2], '9': [-1, 0, -1, 0, 0, 0], 'aug': [-1, 0, 3, 2, 2, 1],
  '7sus4': [-1, 0, 2, 0, 3, 0], 'add9': [-1, 0, 2, 2, 0, 0],
};

/** Devolve { frets, baseFret, barre } para o acorde, ou null. */
export function shapeFor(chord) {
  if (!chord) return null;
  const name = SHARP_NAMES[chord.root];
  const flatAlias = { 'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb' };
  const keys = [name + chord.suffix, (flatAlias[name] || name) + chord.suffix];
  for (const k of keys) if (OPEN_SHAPES[k]) return finalize(OPEN_SHAPES[k]);

  const suffix = chord.suffix === 'm(maj7)' ? 'm' : chord.suffix === 'madd9' ? 'm' : chord.suffix === 'm9' ? 'm7' : chord.suffix;
  const eFret = mod12(chord.root - 4);
  const aFret = mod12(chord.root - 9);
  const options = [];
  if (E_SHAPE[suffix]) options.push({ base: eFret || 12, shape: E_SHAPE[suffix] });
  if (A_SHAPE[suffix]) options.push({ base: aFret || 12, shape: A_SHAPE[suffix] });
  if (!options.length) {
    const fallback = chord.quality === 'min' ? 'm' : '';
    options.push({ base: eFret || 12, shape: E_SHAPE[fallback] }, { base: aFret || 12, shape: A_SHAPE[fallback] });
  }
  options.sort((a, b) => a.base - b.base);
  const { base, shape } = options[0];
  return finalize(shape.map((f) => (f < 0 ? -1 : f + base)), true);
}

function finalize(frets, movable = false) {
  const played = frets.filter((f) => f > 0);
  const min = played.length ? Math.min(...played) : 1;
  const max = played.length ? Math.max(...played) : 1;
  const baseFret = max > 4 ? min : 1;
  let barre = null;
  if (movable || frets.filter((f) => f === min).length >= 3) {
    const idx = frets.map((f, i) => (f === min ? i : -1)).filter((i) => i >= 0);
    if (idx.length >= 2 && min > 0) barre = { fret: min, from: idx[0], to: idx[idx.length - 1] };
  }
  return { frets, baseFret, barre };
}

/** MIDIs soados pelo shape (para tocar o acorde de exemplo). */
export function shapeMidis(shape, tuningKey = 'padrao') {
  const open = TUNINGS[tuningKey]?.strings || TUNINGS.padrao.strings;
  return shape.frets.map((f, i) => (f < 0 ? null : open[i] + f)).filter((m) => m != null);
}

export function renderChordSvg(shape, { width = 120 } = {}) {
  if (!shape) return '<div class="no-shape">sem desenho</div>';
  const W = 100, H = 120, left = 15, top = 22, gapX = 14, gapY = 18;
  const { frets, baseFret, barre } = shape;
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${width}" class="chord-svg" role="img" aria-label="Desenho do acorde">`;
  // pestana/nut
  if (baseFret === 1) s += `<rect x="${left - 1}" y="${top - 3}" width="${gapX * 5 + 2}" height="3" class="nut"/>`;
  else s += `<text x="${left - 4}" y="${top + gapY * 0.7}" class="fret-label" text-anchor="end">${baseFret}ª</text>`;
  for (let i = 0; i < 6; i++) s += `<line x1="${left + i * gapX}" y1="${top}" x2="${left + i * gapX}" y2="${top + gapY * 5}" class="str"/>`;
  for (let j = 0; j <= 5; j++) s += `<line x1="${left}" y1="${top + j * gapY}" x2="${left + gapX * 5}" y2="${top + j * gapY}" class="fret"/>`;
  if (barre) {
    const y = top + (barre.fret - baseFret + 0.5) * gapY;
    s += `<rect x="${left + barre.from * gapX - 5}" y="${y - 5}" width="${(barre.to - barre.from) * gapX + 10}" height="10" rx="5" class="dot"/>`;
  }
  frets.forEach((f, i) => {
    const x = left + i * gapX;
    if (f < 0) s += `<text x="${x}" y="${top - 7}" class="mark" text-anchor="middle">×</text>`;
    else if (f === 0) s += `<circle cx="${x}" cy="${top - 10}" r="3.5" class="open"/>`;
    else if (!(barre && f === barre.fret && i >= barre.from && i <= barre.to)) {
      const y = top + (f - baseFret + 0.5) * gapY;
      s += `<circle cx="${x}" cy="${y}" r="5.5" class="dot"/>`;
    }
  });
  s += '</svg>';
  return s;
}
