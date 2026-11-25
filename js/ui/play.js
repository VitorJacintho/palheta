// Aba "Tocar": lista (busca/filtros), configuração, sessão, gravação de durações e resultado.
import { settings, history } from '../services/storage.js';
import { library } from '../services/library.js';
import { songSegments } from '../music/songParser.js';
import { itemToFile } from '../music/songFile.js';
import { shapeFor, renderChordSvg, shapeMidis } from '../music/chordShapes.js';
import { ChordSession } from '../practice/chordSession.js';
import { strum } from '../services/sound.js';
import { renderResults } from './results.js';
import { openEditor } from './editor.js';
import { createListFilter, metaTags } from './listFilter.js';
import { $, $$, esc, showPanel, ensureMic, toast, keepAwake, scoreClass, copyText } from './util.js';

const PANELS = ['play-list-panel', 'play-setup-panel', 'play-session-panel', 'play-results-panel'];
let current = null; // música selecionada
let mode = 'follow';
let session = null;
let raf = 0;
let filter;

export function initPlay() {
  filter = createListFilter($('#song-filters'), renderList, 'palheta:songFilter');
  $('#btn-new-song').onclick = () => openEditor('song', null, afterEdit);
  $('#btn-edit-song').onclick = () => {
    if (current.source === 'catalog') {
      // música do catálogo não é editada direto: vira uma cópia sua
      const { id, source, ...rest } = current;
      openEditor('song', { ...rest, title: `${current.title} (minha versão)` }, afterEdit, { isCopy: true });
    } else openEditor('song', current, afterEdit);
  };
  $('#btn-copy-song').onclick = async () => {
    const ok = await copyText(itemToFile(current, 'song'));
    toast(ok ? 'Música copiada como texto.' : 'Não foi possível copiar.');
  };
  $('#btn-record-song').onclick = () => start('record');
  $$('[data-back=play]').forEach((b) => (b.onclick = () => showPanel(PANELS, 'play-list-panel')));

  $$('#mode-seg button').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
  $('#bpm-range').oninput = (e) => ($('#bpm-val').textContent = e.target.value);
  $('#opt-voice').onchange = (e) => settings.set({ voice: e.target.checked });
  $('#btn-start-song').onclick = () => start(mode);
  $('#btn-stop').onclick = () => session?.stop(session.state.phase === 'play');
  $('#btn-skip').onclick = () => session?.skip();
  $('#btn-hear').onclick = () => {
    const seg = session?.segments[session.state.index];
    const shape = seg && shapeFor(seg.chord);
    if (shape) strum(shapeMidis(shape));
  };
  // espaço = marcar troca (gravando) / pular (seguindo)
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || !session || session.state.phase !== 'play' || session.mode === 'metronome') return;
    if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(document.activeElement?.tagName)) return;
    e.preventDefault();
    session.skip();
  });
  setMode('follow');
}

/** Chamado depois que o catálogo carregou. */
export function refreshPlay() {
  renderList();
}

function afterEdit(saved) {
  renderList();
  if (saved) select(saved.id); else showPanel(PANELS, 'play-list-panel');
}

export function leavePlay() {
  if (session && session.state.phase !== 'done') session.stop(false);
}

function setMode(m) {
  mode = m;
  $$('#mode-seg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
  $('#mode-help').textContent = m === 'follow'
    ? 'O app espera você trocar de acorde e acompanha o seu andamento. Ideal para aprender a música.'
    : 'O metrônomo dita o tempo e os acordes trocam sozinhos. Ideal para treinar tocar no tempo.';
  $('#opt-click-wrap').classList.toggle('hidden', m === 'follow');
}

function renderList() {
  const best = bestScores();
  const all = library.songs();
  const items = filter.apply(all);
  const errs = library.catalogErrors();
  $('#song-list').innerHTML = (errs.length ? `<p class="note">⚠ ${esc(errs[0])}</p>` : '') + (items.length ? items.map((s) => {
    const uniq = [...new Set(safeSegments(s).map((x) => x.symbol))];
    const b = best[s.id];
    return `
      <button class="item" type="button" data-id="${esc(s.id)}">
        <div class="icon">${esc(uniq[0] || '?')}</div>
        <div class="meta"><b>${esc(s.title)}${s.source === 'user' ? '<span class="tag-src">minha</span>' : ''}</b><span>${esc(s.artist || '')}${s.artist ? ' · ' : ''}${uniq.slice(0, 6).map(esc).join(' ')}${uniq.length > 6 ? '…' : ''}</span></div>
        ${b != null ? `<span class="badge ${scoreClass(b)}">${b}</span>` : ''}
      </button>`;
  }).join('') : `<p class="empty">${all.length ? 'Nenhuma música encontrada com esse filtro.' : 'Carregando músicas…'}</p>`);
  $$('#song-list .item').forEach((el) => (el.onclick = () => select(el.dataset.id)));
}

function safeSegments(song) {
  try {
    return songSegments(song).segments;
  } catch {
    return [];
  }
}

function bestScores() {
  const out = {};
  history.all().filter((h) => h.kind === 'chords').forEach((h) => { out[h.itemId] = Math.max(out[h.itemId] ?? 0, h.score); });
  return out;
}

function select(id) {
  current = library.song(id);
  if (!current) return;
  const bpb = current.beatsPerBar || 4;
  $('#setup-title').textContent = current.title;
  $('#setup-artist').textContent = [current.artist, `${current.bpm} BPM`, `${bpb}/4`].filter(Boolean).join(' · ');
  $('#setup-meta').innerHTML = metaTags(current);
  $('#btn-edit-song').textContent = current.source === 'catalog' ? 'Duplicar e editar' : 'Editar';

  const { segments, usedRecording, recordingMismatch } = songSegments(current);
  const rec = $('#setup-recording');
  if (recordingMismatch) {
    rec.innerHTML = '⚠ As durações gravadas não batem mais com a cifra (ela mudou). Grave de novo. <button class="btn ghost small" type="button" data-clear>Apagar gravação</button>';
  } else if (usedRecording) {
    rec.innerHTML = library.hasOwnRecording(current)
      ? '✓ Usando as durações que <b>você gravou</b>. <button class="btn ghost small" type="button" data-clear>Voltar às originais</button>'
      : '✓ Durações gravadas tocando (catálogo).';
  }
  rec.classList.toggle('hidden', !usedRecording && !recordingMismatch);
  const clr = rec.querySelector('[data-clear]');
  if (clr) clr.onclick = () => { library.clearDurations(current); toast('Gravação apagada.'); select(current.id); };

  // chips: sequência final (com seções), com duração quando não é 1 compasso
  let lastSec;
  $('#setup-chords').innerHTML = segments.map((it) => {
    const sec = it.section && it.section !== lastSec ? `<span class="sec">${esc(it.section)}</span>` : '';
    lastSec = it.section;
    return `${sec}<span>${esc(it.symbol)}${it.beats !== bpb ? ` <small>${+it.beats.toFixed(1)}t</small>` : ''}</span>`;
  }).join('') || '<span class="muted">Nenhum acorde reconhecido — edite a música.</span>';
  $('#bpm-range').value = current.bpm || 80;
  $('#bpm-val').textContent = current.bpm || 80;
  $('#opt-voice').checked = settings.get().voice;
  showPanel(PANELS, 'play-setup-panel');
}

async function start(sessionMode) {
  if (!current) return;
  if (!(await ensureMic())) return;
  try {
    session = new ChordSession(current, {
      mode: sessionMode,
      bpm: +$('#bpm-range').value,
      countIn: sessionMode === 'record' ? true : $('#opt-countin').checked,
      clickDuringSong: $('#opt-click').checked,
    });
  } catch (e) {
    toast(e.message);
    return;
  }
  const recording = sessionMode === 'record';
  $('#sess-title').textContent = current.title;
  $('#sess-sub').innerHTML = recording
    ? `<span class="recording-badge">● GRAVANDO</span> · metrônomo a ${$('#bpm-range').value} BPM — troque de acorde no tempo da música`
    : sessionMode === 'follow' ? 'Seguindo o seu ritmo' : `Metrônomo a ${$('#bpm-range').value} BPM`;
  $('#btn-skip').classList.toggle('hidden', sessionMode === 'metronome');
  $('#btn-skip').textContent = recording ? 'Marcar troca (espaço)' : 'Pular acorde';
  $('#btn-stop').textContent = recording ? '■ Terminar' : '■ Parar';
  renderTimeline();
  showPanel(PANELS, 'play-session-panel');
  keepAwake(true);
  session.onFinish(finish);
  session.start();
  lastIndex = -1;
  loop();
}

function renderTimeline() {
  const rec = session.mode === 'record';
  $('#timeline').innerHTML = session.segments.map((s, i) =>
    `<div class="seg-block" data-i="${i}" style="min-width:${rec ? 52 : Math.max(44, s.beats * 14)}px">${esc(s.symbol)}<small>${rec ? '?' : +s.beats.toFixed(1) + 't'}</small></div>`).join('');
}

let lastIndex = -1;
function loop() {
  cancelAnimationFrame(raf);
  if (!session || session.state.phase === 'done') return;
  const st = session.state;
  const i = st.index;
  const seg = session.segments[i];
  const next = session.segments[i + 1];
  const recording = session.mode === 'record';

  // contagem
  const count = $('#sess-count');
  if (st.phase === 'countin') {
    count.classList.remove('hidden');
    const left = st.beatsLeft ?? 0;
    count.innerHTML = `<div>${left > 0 ? left : '!'}<small>${left > 0 ? 'prepare-se' : 'vai!'}</small></div>`;
    if (st.hint) count.innerHTML = `<div style="font-size:1.4rem">${esc(st.hint)}</div>`;
    if (session.mode === 'follow' && left === 0) count.innerHTML = `<div>${esc(seg.symbol)}<small>toque para começar</small></div>`;
  } else {
    count.classList.add('hidden');
  }

  if (i !== lastIndex) {
    lastIndex = i;
    $('#sess-chord').textContent = seg.symbol;
    $('#sess-chord-name').textContent = seg.chord.spoken;
    $('#sess-shape').innerHTML = renderChordSvg(shapeFor(seg.chord), { width: 120 });
    $('#sess-next').textContent = next ? next.symbol : 'Fim';
    $$('#timeline .seg-block').forEach((el, k) => {
      el.classList.toggle('cur', k === i);
      if (k < i) {
        if (recording) {
          const pos = session.changeTimes;
          const beats = Math.round(((pos[k] ?? 0) - (k ? pos[k - 1] : session.playStart)) / session.beatSec);
          el.querySelector('small').textContent = `${Math.max(1, beats)}t`;
          el.classList.add('done-good');
        } else {
          const r = session.results[k];
          const acc = r.voiced ? r.matched / r.voiced : 0;
          el.classList.add(acc >= 0.6 ? 'done-good' : 'done-bad');
        }
      }
    });
    $(`#timeline .seg-block[data-i="${i}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    const dots = recording ? 8 : Math.max(1, Math.round(seg.beats));
    $('#sess-beats').innerHTML = Array.from({ length: dots }, () => '<i></i>').join('');
  }

  // tempos dentro do acorde atual
  const beatPos = st.phase === 'play' ? Math.floor(st.beatInSeg ?? 0) : -1;
  $$('#sess-beats i').forEach((el, k) => {
    const p = recording ? beatPos % 8 : beatPos;
    el.classList.toggle('on', k === p);
    el.classList.toggle('past', k < p);
  });

  $('#sess-chord').classList.toggle('ok', !!st.matchNow);
  $('#sess-detected').textContent = st.detectedLabel || '–';
  const dot = $('#sess-match');
  dot.className = 'match-dot ' + (st.detected ? (st.matchNow ? 'ok' : 'no') : '');
  $('#sess-hint').textContent = st.phase === 'play' ? st.hint || '' : '';
  $('#sess-bpm').textContent = Math.round(60 / session.beatSec);

  raf = requestAnimationFrame(loop);
}

function finish(summary) {
  cancelAnimationFrame(raf);
  keepAwake(false);
  if (!summary) {
    showPanel(PANELS, 'play-setup-panel');
    return;
  }
  if (summary.kind === 'record') return showRecording(summary);
  history.add({ kind: 'chords', mode: summary.mode, itemId: summary.itemId, title: summary.title, score: summary.score, metrics: summary.metrics.map((m) => ({ name: m.name, value: m.value })), bpm: summary.extra.bpmAvg });
  renderResults($('#play-results-panel'), summary, {
    onRetry: () => { select(current.id); start(mode); },
    onBack: () => { renderList(); select(current.id); },
  });
  showPanel(PANELS, 'play-results-panel');
  renderList();
}

/** Revisão da gravação: mostra antes/depois e deixa salvar. */
function showRecording(r) {
  const box = $('#play-results-panel');
  const changed = r.rows.filter((x) => x.recorded && x.before !== x.after).length;
  let lastSec;
  box.innerHTML = `
    <div class="card">
      <h2>Gravação: ${esc(r.title)}</h2>
      <p class="muted">${r.bpm} BPM · ${r.recordedCount} de ${r.rows.length} acordes medidos · ${changed} duração(ões) diferente(s) da cifra</p>
      ${r.complete ? '' : '<p class="note">⚠ A gravação parou antes do último acorde. Os acordes que faltaram ficam com a duração original.</p>'}
      <table class="detail">
        <thead><tr><th>Acorde</th><th>Antes</th><th>Gravado</th></tr></thead>
        <tbody>${r.rows.map((x) => {
          const sec = x.section && x.section !== lastSec ? `<tr><td colspan="3" class="muted small">${esc(x.section)}</td></tr>` : '';
          lastSec = x.section;
          return `${sec}<tr><td><b>${esc(x.symbol)}</b></td><td>${+x.before.toFixed(1)} t</td>
            <td class="${x.recorded && x.before !== x.after ? 'changed' : ''}">${x.recorded ? `${x.after} t` : '<span class="muted">—</span>'}</td></tr>`;
        }).join('')}</tbody>
      </table>
    </div>
    <div class="actions">
      <button class="btn ghost" type="button" data-act="discard">Descartar</button>
      <button class="btn ghost" type="button" data-act="again">Gravar de novo</button>
      <button class="btn primary big" type="button" data-act="save">Salvar durações</button>
    </div>`;
  box.querySelector('[data-act=discard]').onclick = () => select(current.id);
  box.querySelector('[data-act=again]').onclick = () => { select(current.id); start('record'); };
  box.querySelector('[data-act=save]').onclick = () => {
    library.saveDurations(current, r.durations, r.bpm);
    toast('Durações salvas! A música agora segue o tempo que você gravou.');
    renderList();
    select(current.id);
  };
  showPanel(PANELS, 'play-results-panel');
}
