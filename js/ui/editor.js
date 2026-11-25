// Editor de músicas (cifra) e tablaturas.
import { songs, tabs, settings } from '../services/storage.js';
import { parseProgression } from '../music/songParser.js';
import { parseTab } from '../music/tabParser.js';
import { $, esc, show, toast } from './util.js';

let kind = 'song';
let editing = null;
let done = null;

export function initEditor() {
  const dlg = $('#editor');
  const form = $('#editor-form');
  dlg.querySelector('[data-close]').onclick = () => dlg.close();
  form.addEventListener('input', preview);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const base = {
      ...(editing || {}),
      title: fd.get('title').trim(),
      artist: fd.get('artist').trim(),
      bpm: clampNum(fd.get('bpm'), 30, 240, 80),
    };
    let saved;
    if (kind === 'song') {
      const parsed = parseProgression(fd.get('text'), clampNum(fd.get('beatsPerBar'), 2, 12, 4));
      if (!parsed.items.length) return toast('Nenhum acorde reconhecido no texto.');
      saved = songs.save({ ...base, beatsPerBar: clampNum(fd.get('beatsPerBar'), 2, 12, 4), chords: fd.get('text') });
    } else {
      if (!parseTab(fd.get('text'), settings.get().tuning).events.length) return toast('Nenhuma nota encontrada na tablatura.');
      saved = tabs.save({ ...base, perBeat: clampNum(fd.get('perBeat'), 1, 4, 2), tab: fd.get('text') });
    }
    dlg.close();
    toast('Salvo!');
    done?.(saved);
  });
  $('#editor-delete').onclick = () => {
    if (!editing) return;
    if (!confirm(`Excluir "${editing.title}"?`)) return;
    (kind === 'song' ? songs : tabs).remove(editing.id);
    dlg.close();
    toast('Excluído.');
    done?.(null);
  };
}

function clampNum(v, lo, hi, def) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
}

export function openEditor(k, item, onDone) {
  kind = k;
  editing = item ? structuredClone(item) : null;
  done = onDone;
  const form = $('#editor-form');
  form.reset();
  const isSong = k === 'song';
  $('#editor-title').textContent = (item ? 'Editar ' : 'Nova ') + (isSong ? 'música' : 'tablatura');
  $('#ed-text-label').textContent = isSong ? 'Acordes / cifra' : 'Tablatura (texto)';
  show('#ed-bpb-wrap', isSong);
  show('#ed-perbeat-wrap', !isSong);
  show('#ed-help-chords', isSong);
  show('#ed-help-tab', !isSong);
  show('#editor-delete', !!item);
  form.elements.title.value = item?.title || '';
  form.elements.artist.value = item?.artist || '';
  form.elements.bpm.value = item?.bpm || (isSong ? 80 : 70);
  form.elements.beatsPerBar.value = item?.beatsPerBar || 4;
  form.elements.perBeat.value = item?.perBeat || 2;
  form.elements.text.value = (isSong ? item?.chords : item?.tab) || '';
  form.elements.text.placeholder = isSong
    ? 'Cole aqui a cifra da música, ou escreva:\n| G | C | D . Em . |'
    : 'e|-----------------5-8-|\nB|-------------5-8-----|\nG|---------5-7---------|\nD|-----5-7-------------|\nA|-5-7-----------------|\nE|---------------------|';
  preview();
  $('#editor').showModal();
}

function preview() {
  const form = $('#editor-form');
  const out = $('#editor-preview');
  const text = form.elements.text.value;
  if (!text.trim()) { out.innerHTML = ''; return; }
  if (kind === 'song') {
    const p = parseProgression(text, clampNum(form.elements.beatsPerBar.value, 2, 12, 4));
    const total = p.items.reduce((a, it) => a + it.beats, 0);
    out.innerHTML = `
      <p><b>${p.items.length}</b> acordes · ${Math.round(total)} tempos${p.ignoredLines ? ` · ${p.ignoredLines} linha(s) de letra ignorada(s)` : ''}</p>
      <div class="chips">${p.items.slice(0, 60).map((it) => `<span>${esc(it.symbol)}</span>`).join('')}${p.items.length > 60 ? '<span>…</span>' : ''}</div>
      ${p.errors.map((e) => `<p class="err">${esc(e)}</p>`).join('')}`;
  } else {
    const p = parseTab(text, settings.get().tuning);
    out.innerHTML = `<p><b>${p.events.length}</b> notas em ${p.systems.length} bloco(s).</p>${p.errors.map((e) => `<p class="err">${esc(e)}</p>`).join('')}`;
  }
}
