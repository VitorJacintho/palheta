// Letra: diálogo "Adicionar letra" e a cifra rolando durante o treino.
import { library } from '../services/library.js';
import { songSegments } from '../music/songParser.js';
import { parseCifra, alignLyrics, lineFor, wordAt } from '../music/lyrics.js';
import { $, esc, toast } from './util.js';

let dlgSong = null;
let dlgDone = null;

/** Alinha a letra de uma música (ou null se não tiver letra). */
export function lyricsAlignment(song, segments = songSegments(song).segments) {
  const text = library.lyricsOf(song);
  if (!text) return null;
  const lines = parseCifra(text);
  if (!lines.some((l) => l.lyric)) return null;
  return alignLyrics(segments, lines);
}

export function initLyrics() {
  const dlg = $('#lyrics-dialog');
  const form = $('#lyrics-form');
  dlg.querySelector('[data-close]').onclick = () => dlg.close();
  form.elements.text.addEventListener('input', preview);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = form.elements.text.value;
    const lines = parseCifra(text);
    if (!lines.some((l) => l.lyric)) return toast('Não achei letra nesse texto. Cole a cifra completa, com a letra.');
    library.saveLyrics(dlgSong, text);
    dlg.close();
    toast('Letra salva neste aparelho.');
    dlgDone?.();
  });
  $('#lyrics-remove').onclick = () => {
    if (!confirm('Remover a letra desta música (deste aparelho)?')) return;
    library.clearLyrics(dlgSong);
    dlg.close();
    toast('Letra removida.');
    dlgDone?.();
  };
}

export function openLyricsDialog(song, onDone) {
  dlgSong = song;
  dlgDone = onDone;
  const form = $('#lyrics-form');
  $('#lyrics-song').textContent = song.title;
  // música sua que já veio com a letra no texto: começa vazio (vai substituir)
  form.elements.text.value = song.lyrics || '';
  $('#lyrics-remove').classList.toggle('hidden', !song.lyrics);
  preview();
  $('#lyrics-dialog').showModal();
}

function preview() {
  const text = $('#lyrics-form').elements.text.value;
  const out = $('#lyrics-preview');
  if (!text.trim()) { out.innerHTML = ''; return; }
  const lines = parseCifra(text);
  const lyricLines = lines.filter((l) => l.lyric).length;
  if (!lyricLines) {
    out.innerHTML = '<p class="err">Não achei letra. Copie a cifra completa (acordes + letra).</p>';
    return;
  }
  const { segments } = songSegments(dlgSong);
  const al = alignLyrics(segments, lines);
  const pct = Math.round((al.matched / al.total) * 100);
  const missing = missingSections(segments, al.anchors);
  out.innerHTML = `
    <p><b>${lyricLines}</b> linhas de letra · <b>${al.matched} de ${al.total}</b> trocas de acorde encaixadas (${pct}%)</p>
    ${pct < 60 ? '<p class="err">A cifra colada parece ser de outra versão (os acordes não batem com os da música). Confira se é a mesma música/versão.</p>' : ''}
    ${missing.length ? `<p class="muted small">Sem letra encaixada em: ${missing.map(esc).join(', ')} — nessas partes a letra fica parada na última linha.</p>` : ''}`;
}

function missingSections(segments, anchors) {
  const bySec = new Map();
  segments.forEach((s, i) => {
    const k = s.section || '—';
    const v = bySec.get(k) || { n: 0, ok: 0 };
    v.n++;
    if (anchors[i]) v.ok++;
    bySec.set(k, v);
  });
  return [...bySec.entries()].filter(([, v]) => v.ok / v.n < 0.5).map(([k]) => k);
}

/** Texto do aviso na tela da música. */
export function lyricsNote(song) {
  const al = lyricsAlignment(song);
  if (!al) return null;
  const own = !!song.lyrics;
  return `📝 Letra ${own ? 'adicionada' : 'da sua cifra'}: ${al.matched} de ${al.total} trocas encaixadas. <span class="muted">Fica só neste aparelho.</span>`;
}

// ---------------------------------------------------------------------------
// Cifra rolando no treino

function chordRow(line, onIdx) {
  let html = '';
  let pos = 0;
  line.chords.forEach((c, i) => {
    const col = Math.max(c.col, pos + (i ? 1 : 0));
    html += ' '.repeat(col - pos) + `<b class="${i === onIdx ? 'on' : ''}">${esc(c.symbol)}</b>`;
    pos = col + c.symbol.length;
  });
  return html || ' ';
}

function lyricRow(line, highlight) {
  if (line.lyric == null) return '<span class="lv-inst">(instrumental)</span>';
  if (!highlight) return esc(line.lyric) || ' ';
  const [s, e] = highlight;
  return esc(line.lyric.slice(0, s)) + `<mark>${esc(line.lyric.slice(s, e))}</mark>` + esc(line.lyric.slice(e));
}

export function createLyricsView(container, alignment) {
  let last = '';
  let hidden = false;
  container.classList.toggle('hidden', !alignment);
  if (!alignment) return { update() {}, destroy() {} };

  function render(pos) {
    const { lines } = alignment;
    const from = Math.max(0, pos.line - 1);
    const to = Math.min(lines.length, pos.line + 3);
    let html = `<div class="lv-head"><span class="now-label">Letra</span><button type="button" data-toggle>${hidden ? 'mostrar' : 'ocultar'}</button></div>`;
    if (!hidden) {
      let prevSec = from > 0 ? lines[from - 1].section : null;
      for (let li = from; li < to; li++) {
        const line = lines[li];
        if (line.section && line.section !== prevSec) html += `<div class="lv-sec">${esc(line.section)}</div>`;
        prevSec = line.section;
        const isCur = li === pos.line;
        const onIdx = isCur ? pos.chord : -1;
        const hl = isCur && onIdx >= 0 && line.lyric ? wordAt(line.lyric, line.chords[onIdx].col) : null;
        html += `<div class="lv-line ${isCur ? 'cur' : li === pos.line + 1 ? 'next' : ''}">` +
          `<div class="lv-ch">${chordRow(line, onIdx)}</div><div class="lv-ly">${lyricRow(line, hl)}</div></div>`;
      }
    }
    container.innerHTML = html;
    container.querySelector('[data-toggle]').onclick = () => { hidden = !hidden; last = ''; render(pos); };
    // mantém a palavra/acorde atual visível em telas estreitas
    const cur = container.querySelector('.lv-line.cur');
    const mark = cur?.querySelector('mark, b.on');
    if (cur && mark) cur.scrollLeft = Math.max(0, mark.offsetLeft - cur.clientWidth * 0.35);
  }

  return {
    update(segIndex, frac) {
      const pos = lineFor(alignment, segIndex, frac);
      const key = `${pos.line}:${pos.chord}:${hidden}`;
      if (key === last) return;
      last = key;
      render(pos);
    },
    destroy() { container.innerHTML = ''; container.classList.add('hidden'); },
  };
}
