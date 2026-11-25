// Aba "Tablatura": lista, configuração, sessão de solo e resultado.
import { tabs, settings, history } from '../services/storage.js';
import { parseTab, stringName } from '../music/tabParser.js';
import { midiToName, SOLFEGE, mod12 } from '../music/theory.js';
import { TabSession, noteMatches } from '../practice/tabSession.js';
import { renderResults } from './results.js';
import { openEditor } from './editor.js';
import { $, $$, esc, showPanel, ensureMic, toast, keepAwake, scoreClass } from './util.js';

const PANELS = ['tab-list-panel', 'tab-setup-panel', 'tab-session-panel', 'tab-results-panel'];
let current = null;
let mode = 'wait';
let session = null;
let raf = 0;

const STEP = 30; // px por unidade de duração

export function renderTabSvg(events, tuningKey = 'padrao') {
  if (!events.length) return '<p class="muted" style="padding:0 12px">Nenhuma nota encontrada.</p>';
  const top = 18, gap = 20, left = 34;
  let x = left + 12;
  const xs = events.map((ev) => { const cur = x; x += Math.max(22, ev.units * STEP); return cur; });
  const width = x + 20;
  const height = top + gap * 5 + 18;
  let s = `<svg class="tab-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  for (let i = 0; i < 6; i++) {
    const y = top + i * gap;
    s += `<line class="tline" x1="${left}" y1="${y}" x2="${width - 8}" y2="${y}"/>`;
    s += `<text class="slabel" x="10" y="${y + 4}">${stringName(i + 1, tuningKey)}</text>`;
  }
  s += `<line class="cursor" id="tab-cursor" x1="0" x2="0" y1="${top - 10}" y2="${top + gap * 5 + 10}" style="display:none"/>`;
  events.forEach((ev, k) => {
    s += `<g class="nev" data-k="${k}" data-x="${xs[k]}">`;
    ev.notes.forEach((n) => {
      const y = top + (n.string - 1) * gap;
      const w = n.fret >= 10 ? 20 : 13;
      s += `<rect class="nbg" x="${xs[k] - w / 2}" y="${y - 8}" width="${w}" height="16" rx="4"/>`;
      s += `<text x="${xs[k]}" y="${y + 4.5}" text-anchor="middle">${n.fret}</text>`;
    });
    s += '</g>';
  });
  return s + '</svg>';
}

export function initTab() {
  $('#btn-new-tab').onclick = () => openEditor('tab', null, (saved) => { renderList(); if (saved) select(saved.id); });
  $('#btn-edit-tab').onclick = () => openEditor('tab', current, (saved) => {
    renderList();
    if (saved) select(saved.id); else showPanel(PANELS, 'tab-list-panel');
  });
  $$('[data-back=tab]').forEach((b) => (b.onclick = () => showPanel(PANELS, 'tab-list-panel')));
  $$('#tmode-seg button').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
  $('#tbpm-range').oninput = (e) => ($('#tbpm-val').textContent = e.target.value);
  $('#btn-start-tab').onclick = start;
  $('#btn-tstop').onclick = () => session?.stop(session.state.phase === 'play');
  renderList();
  setMode('wait');
}

export function leaveTab() {
  if (session && session.state.phase !== 'done') session.stop(false);
}

function setMode(m) {
  mode = m;
  $$('#tmode-seg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
  $('#tmode-help').textContent = m === 'wait'
    ? 'O app espera cada nota certa antes de seguir. Avalia acerto e a regularidade do seu ritmo.'
    : 'As notas passam no andamento do metrônomo. Avalia acerto e se cada nota caiu no tempo.';
  $('#tmetro-opts').classList.toggle('hidden', m !== 'metronome');
}

function renderList() {
  const best = {};
  history.all().filter((h) => h.kind === 'tab').forEach((h) => { best[h.itemId] = Math.max(best[h.itemId] ?? 0, h.score); });
  const items = tabs.all();
  $('#tab-list').innerHTML = items.length ? items.map((t) => {
    const n = parseTab(t.tab).events.length;
    return `
      <button class="item" type="button" data-id="${esc(t.id)}">
        <div class="icon">TAB</div>
        <div class="meta"><b>${esc(t.title)}</b><span>${esc(t.artist || '')}${t.artist ? ' · ' : ''}${n} notas · ${t.bpm} BPM</span></div>
        ${best[t.id] != null ? `<span class="badge ${scoreClass(best[t.id])}">${best[t.id]}</span>` : ''}
      </button>`;
  }).join('') : '<p class="muted">Nenhuma tablatura ainda.</p>';
  $$('#tab-list .item').forEach((el) => (el.onclick = () => select(el.dataset.id)));
}

function select(id) {
  current = tabs.get(id);
  if (!current) return;
  const tuning = settings.get().tuning;
  const { events } = parseTab(current.tab, tuning);
  $('#tsetup-title').textContent = current.title;
  $('#tsetup-info').textContent = [current.artist, `${events.length} notas`, `${current.bpm} BPM`].filter(Boolean).join(' · ');
  $('#tsetup-preview').innerHTML = renderTabSvg(events, tuning);
  $('#tbpm-range').value = current.bpm || 70;
  $('#tbpm-val').textContent = current.bpm || 70;
  $('#tperbeat').value = String(current.perBeat || 2);
  $('#topt-speak').checked = !!current.speakNotes;
  showPanel(PANELS, 'tab-setup-panel');
}

async function start() {
  if (!current) return;
  if (!(await ensureMic())) return;
  const item = { ...current, speakNotes: $('#topt-speak').checked };
  try {
    session = new TabSession(item, { mode, bpm: +$('#tbpm-range').value, perBeat: +$('#tperbeat').value });
  } catch (e) {
    toast(e.message);
    return;
  }
  $('#tsess-title').textContent = current.title;
  $('#tsess-sub').textContent = mode === 'wait' ? 'Modo espera — no seu tempo' : `Metrônomo a ${$('#tbpm-range').value} BPM`;
  $('#tsess-tab').innerHTML = renderTabSvg(session.events, session.tuning);
  showPanel(PANELS, 'tab-session-panel');
  keepAwake(true);
  session.onFinish(finish);
  session.start();
  lastIdx = -1;
  loop();
}

let lastIdx = -1;
function loop() {
  cancelAnimationFrame(raf);
  if (!session || session.state.phase === 'done') return;
  const st = session.state;
  const i = Math.min(st.index, session.events.length - 1);
  const ev = session.events[i];
  const groups = $$('#tsess-tab .nev');

  if (i !== lastIdx) {
    lastIdx = i;
    const main = ev.notes[ev.notes.length - 1];
    $('#tsess-note').textContent = ev.notes.map((n) => midiToName(n.midi)).join(' + ');
    $('#tsess-where').textContent = `${SOLFEGE[mod12(main.midi)]} · corda ${main.string} (${stringName(main.string, session.tuning)}), casa ${main.fret}`;
    const g = groups[i];
    if (g) {
      const box = $('#tsess-tab');
      box.scrollTo({ left: Math.max(0, +g.dataset.x - box.clientWidth * 0.3), behavior: 'smooth' });
    }
  }
  groups.forEach((g, k) => {
    const r = session.results[k];
    g.classList.toggle('n-cur', k === i && st.phase === 'play');
    g.classList.toggle('n-ok', k !== i && r.matched && r.firstTry !== false && !r.wrong);
    g.classList.toggle('n-bad', k !== i && ((r.matched && (r.firstTry === false || r.wrong > 0)) || (session.mode === 'metronome' && k < i && !r.matched)));
  });

  // cursor contínuo no modo metrônomo
  const cursor = $('#tab-cursor');
  if (session.mode === 'metronome' && st.phase === 'play' && st.cursorTime != null && groups.length) {
    const k = i;
    const t0 = session.times[k];
    const t1 = session.times[k + 1] ?? t0 + session.unitSec * ev.units;
    const x0 = +groups[k].dataset.x;
    const x1 = groups[k + 1] ? +groups[k + 1].dataset.x : x0 + 30;
    const frac = Math.max(0, Math.min(1, (st.cursorTime - t0) / (t1 - t0)));
    const x = x0 + (x1 - x0) * frac;
    cursor.setAttribute('x1', x); cursor.setAttribute('x2', x);
    cursor.style.display = '';
  } else {
    cursor.style.display = 'none';
  }

  const det = $('#tsess-detected');
  if (st.detected) {
    const ok = noteMatches(st.detected.midi, ev);
    det.textContent = st.detected.name;
    det.className = 'detected-note ' + (ok ? 'ok' : 'no');
  } else {
    det.textContent = '–';
    det.className = 'detected-note';
  }
  $('#tsess-hint').textContent = st.phase === 'countin' ? 'Prepare-se…' : st.hint || '';
  $('#tsess-progress').textContent = `${Math.min(st.index, session.events.length)}/${session.events.length}`;
  raf = requestAnimationFrame(loop);
}

function finish(summary) {
  cancelAnimationFrame(raf);
  keepAwake(false);
  if (!summary) {
    showPanel(PANELS, 'tab-setup-panel');
    return;
  }
  history.add({ kind: 'tab', mode: summary.mode, itemId: summary.itemId, title: summary.title, score: summary.score, metrics: summary.metrics.map((m) => ({ name: m.name, value: m.value })), bpm: summary.extra.bpmAvg });
  renderResults($('#tab-results-panel'), summary, {
    onRetry: () => { select(current.id); start(); },
    onBack: () => { renderList(); select(current.id); },
  });
  showPanel(PANELS, 'tab-results-panel');
  renderList();
}
