// Editor de músicas (cifra) e tablaturas do usuário.
// Itens do catálogo não são editados direto: "Duplicar e editar" abre uma cópia.
import { userSongs, userTabs, settings } from '../services/storage.js';
import { parseProgression, mergeRepeats } from '../music/songParser.js';
import { parseTab } from '../music/tabParser.js';
import { $, esc, show, toast } from './util.js';

let kind = 'song';
let editing = null;
let isCopy = false;
let done = null;

const field = (name) => $('#editor-form').elements[name];

export function initEditor() {
  const dlg = $('#editor');
  const form = $('#editor-form');
  dlg.querySelector('[data-close]').onclick = () => dlg.close();
  form.addEventListener('input', preview);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const base = {
      ...(editing || {}),
      title: field('title').value.trim(),
      artist: field('artist').value.trim(),
      bpm: clampNum(field('bpm').value, 30, 240, 80),
      level: field('level').value,
      tags: field('tags').value.split(',').map((t) => t.trim()).filter(Boolean),
    };
    if (isCopy) delete base.id;
    let saved;
    if (kind === 'song') {
      const bpb = clampNum(field('beatsPerBar').value, 2, 12, 4);
      const parsed = parseProgression(field('text').value, bpb);
      if (!parsed.items.length) return toast('Nenhum acorde reconhecido no texto.');
      const next = { ...base, beatsPerBar: bpb, key: field('key').value.trim(), capo: clampNum(field('capo').value, 0, 12, 0), chords: field('text').value };
      // durações gravadas só continuam valendo se a sequência de acordes não mudou
      if (next.durations && mergeRepeats(parsed.items).length !== next.durations.length) delete next.durations;
      saved = userSongs.save(next);
    } else {
      if (!parseTab(field('text').value, editing?.tuning || settings.get().tuning).events.length) return toast('Nenhuma nota encontrada na tablatura.');
      saved = userTabs.save({ ...base, perBeat: clampNum(field('perBeat').value, 1, 4, 2), tab: field('text').value });
    }
    dlg.close();
    toast(isCopy ? 'Cópia salva em "Minhas".' : 'Salvo!');
    done?.({ ...saved, source: 'user' });
  });
  $('#editor-delete').onclick = () => {
    if (!editing || isCopy) return;
    if (!confirm(`Excluir "${editing.title}"?`)) return;
    (kind === 'song' ? userSongs : userTabs).remove(editing.id);
    dlg.close();
    toast('Excluído.');
    done?.(null);
  };
}

function clampNum(v, lo, hi, def) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
}

export function openEditor(k, item, onDone, opts = {}) {
  kind = k;
  editing = item ? structuredClone(item) : null;
  isCopy = !!opts.isCopy;
  done = onDone;
  const form = $('#editor-form');
  form.reset();
  const isSong = k === 'song';
  const what = isSong ? 'música' : 'tablatura';
  $('#editor-title').textContent = isCopy ? `Sua cópia da ${what}` : (item ? 'Editar ' : 'Nova ') + what;
  $('#ed-text-label').textContent = isSong ? 'Acordes / cifra' : 'Tablatura (texto)';
  show('#ed-bpb-wrap', isSong);
  show('#ed-perbeat-wrap', !isSong);
  show('#ed-key-wrap', isSong);
  show('#ed-capo-wrap', isSong);
  show('#ed-help-chords', isSong);
  show('#ed-help-tab', !isSong);
  show('#editor-delete', !!item && !isCopy);
  field('title').value = item?.title || '';
  field('artist').value = item?.artist || '';
  field('bpm').value = item?.bpm || (isSong ? 80 : 70);
  field('beatsPerBar').value = item?.beatsPerBar || 4;
  field('perBeat').value = item?.perBeat || 2;
  field('key').value = item?.key || '';
  field('capo').value = item?.capo || 0;
  field('level').value = item?.level || 'iniciante';
  field('tags').value = (item?.tags || []).join(', ');
  field('text').value = (isSong ? item?.chords : item?.tab) || '';
  field('text').placeholder = isSong
    ? 'Cole aqui a cifra da música, ou escreva:\n[Intro]\n| G | C | D . Em . |\n[Refrão]\n| C | G |\nEstrutura: Intro, Refrão, Refrão'
    : 'e|-----------------5-8-|\nB|-------------5-8-----|\nG|---------5-7---------|\nD|-----5-7-------------|\nA|-5-7-----------------|\nE|---------------------|';
  preview();
  $('#editor').showModal();
}

function preview() {
  const out = $('#editor-preview');
  const text = field('text').value;
  if (!text.trim()) { out.innerHTML = ''; return; }
  if (kind === 'song') {
    const p = parseProgression(text, clampNum(field('beatsPerBar').value, 2, 12, 4));
    const total = p.items.reduce((a, it) => a + it.beats, 0);
    out.innerHTML = `
      <p><b>${p.items.length}</b> acordes · ${Math.round(total)} tempos${p.structure ? ` · estrutura com ${p.structure.length} partes` : ''}${p.ignoredLines ? ` · ${p.ignoredLines} linha(s) de letra ignorada(s)` : ''}</p>
      <div class="chips">${p.items.slice(0, 60).map((it) => `<span>${esc(it.symbol)}</span>`).join('')}${p.items.length > 60 ? '<span>…</span>' : ''}</div>
      ${[...p.errors.map((e) => `<p class="err">${esc(e)}</p>`), ...p.warnings.map((w) => `<p class="muted small">${esc(w)}</p>`)].join('')}`;
  } else {
    const p = parseTab(text, editing?.tuning || settings.get().tuning);
    out.innerHTML = `<p><b>${p.events.length}</b> notas em ${p.systems.length} bloco(s).</p>${p.errors.map((e) => `<p class="err">${esc(e)}</p>`).join('')}`;
  }
}
