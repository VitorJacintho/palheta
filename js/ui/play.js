// Aba "Tocar": lista de músicas, configuração, sessão de acompanhamento e resultado.
import { songs, settings, history } from '../services/storage.js';
import { parseProgression, mergeRepeats } from '../music/songParser.js';
import { shapeFor, renderChordSvg, shapeMidis } from '../music/chordShapes.js';
import { ChordSession } from '../practice/chordSession.js';
import { strum } from '../services/sound.js';
import { renderResults } from './results.js';
import { openEditor } from './editor.js';
import { $, $$, esc, showPanel, ensureMic, toast, keepAwake, scoreClass } from './util.js';

const PANELS = ['play-list-panel', 'play-setup-panel', 'play-session-panel', 'play-results-panel'];
let current = null; // música selecionada
let mode = 'follow';
let session = null;
let raf = 0;

export function initPlay() {
  $('#btn-new-song').onclick = () => openEditor('song', null, (saved) => { renderList(); if (saved) select(saved.id); });
  $('#btn-edit-song').onclick = () => openEditor('song', current, (saved) => {
    renderList();
    if (saved) select(saved.id); else showPanel(PANELS, 'play-list-panel');
  });
  $$('[data-back=play]').forEach((b) => (b.onclick = () => showPanel(PANELS, 'play-list-panel')));

  $$('#mode-seg button').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
  $('#bpm-range').oninput = (e) => ($('#bpm-val').textContent = e.target.value);
  $('#opt-voice').onchange = (e) => settings.set({ voice: e.target.checked });
  $('#btn-start-song').onclick = start;
  $('#btn-stop').onclick = () => session?.stop(session.state.phase === 'play');
  $('#btn-skip').onclick = () => session?.skip();
  $('#btn-hear').onclick = () => {
    const seg = session?.segments[session.state.index];
    const shape = seg && shapeFor(seg.chord);
    if (shape) strum(shapeMidis(shape));
  };
  renderList();
  setMode('follow');
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
  const items = songs.all();
  $('#song-list').innerHTML = items.length ? items.map((s) => {
    const segs = safeSegments(s);
    const uniq = [...new Set(segs.map((x) => x.symbol))];
    const b = best[s.id];
    return `
      <button class="item" type="button" data-id="${esc(s.id)}">
        <div class="icon">${esc(uniq[0] || '?')}</div>
        <div class="meta"><b>${esc(s.title)}</b><span>${esc(s.artist || '')}${s.artist ? ' · ' : ''}${uniq.slice(0, 6).map(esc).join(' ')}${uniq.length > 6 ? '…' : ''}</span></div>
        ${b != null ? `<span class="badge ${scoreClass(b)}">${b}</span>` : ''}
      </button>`;
  }).join('') : '<p class="muted">Nenhuma música ainda.</p>';
  $$('#song-list .item').forEach((el) => (el.onclick = () => select(el.dataset.id)));
}

function safeSegments(song) {
  try {
    return mergeRepeats(parseProgression(song.chords, song.beatsPerBar || 4).items);
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
  current = songs.get(id);
  if (!current) return;
  $('#setup-title').textContent = current.title;
  $('#setup-artist').textContent = [current.artist, `${current.bpm} BPM`, `${current.beatsPerBar || 4}/4`].filter(Boolean).join(' · ');
  const { items } = parseProgression(current.chords, current.beatsPerBar || 4);
  let lastSec;
  $('#setup-chords').innerHTML = items.map((it) => {
    const sec = it.section && it.section !== lastSec ? `<span class="sec">${esc(it.section)}</span>` : '';
    lastSec = it.section;
    return `${sec}<span>${esc(it.symbol)}${it.beats !== (current.beatsPerBar || 4) ? ` <small>${+it.beats.toFixed(1)}t</small>` : ''}</span>`;
  }).join('') || '<span class="muted">Nenhum acorde reconhecido — edite a música.</span>';
  $('#bpm-range').value = current.bpm || 80;
  $('#bpm-val').textContent = current.bpm || 80;
  $('#opt-voice').checked = settings.get().voice;
  showPanel(PANELS, 'play-setup-panel');
}

async function start() {
  if (!current) return;
  if (!(await ensureMic())) return;
  try {
    session = new ChordSession(current, {
      mode,
      bpm: +$('#bpm-range').value,
      countIn: $('#opt-countin').checked,
      clickDuringSong: $('#opt-click').checked,
    });
  } catch (e) {
    toast(e.message);
    return;
  }
  $('#sess-title').textContent = current.title;
  $('#sess-sub').textContent = mode === 'follow' ? 'Seguindo o seu ritmo' : `Metrônomo a ${$('#bpm-range').value} BPM`;
  $('#btn-skip').classList.toggle('hidden', mode !== 'follow');
  renderTimeline();
  showPanel(PANELS, 'play-session-panel');
  keepAwake(true);
  session.onFinish(finish);
  session.start();
  lastIndex = -1;
  loop();
}

function renderTimeline() {
  $('#timeline').innerHTML = session.segments.map((s, i) =>
    `<div class="seg-block" data-i="${i}" style="min-width:${Math.max(44, s.beats * 14)}px">${esc(s.symbol)}<small>${+s.beats.toFixed(1)}t</small></div>`).join('');
}

let lastIndex = -1;
function loop() {
  cancelAnimationFrame(raf);
  if (!session || session.state.phase === 'done') return;
  const st = session.state;
  const i = st.index;
  const seg = session.segments[i];
  const next = session.segments[i + 1];

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
        const r = session.results[k];
        const acc = r.voiced ? r.matched / r.voiced : 0;
        el.classList.add(acc >= 0.6 ? 'done-good' : 'done-bad');
      }
    });
    const cur = $(`#timeline .seg-block[data-i="${i}"]`);
    cur?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    $('#sess-beats').innerHTML = Array.from({ length: Math.max(1, Math.round(seg.beats)) }, () => '<i></i>').join('');
  }

  // tempos dentro do acorde atual
  const beatPos = st.phase === 'play' ? Math.floor(st.beatInSeg ?? 0) : -1;
  $$('#sess-beats i').forEach((el, k) => {
    el.classList.toggle('on', k === beatPos);
    el.classList.toggle('past', k < beatPos);
  });

  $('#sess-chord').classList.toggle('ok', !!st.matchNow);
  $('#sess-detected').textContent = st.detected ? st.detected.symbol : '–';
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
  history.add({ kind: 'chords', mode: summary.mode, itemId: summary.itemId, title: summary.title, score: summary.score, metrics: summary.metrics.map((m) => ({ name: m.name, value: m.value })), bpm: summary.extra.bpmAvg });
  renderResults($('#play-results-panel'), summary, {
    onRetry: () => { select(current.id); start(); },
    onBack: () => { renderList(); select(current.id); },
  });
  showPanel(PANELS, 'play-results-panel');
  renderList();
}
