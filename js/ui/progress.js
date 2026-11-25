// Aba "Progresso": histórico de sessões.
import { history } from '../services/storage.js';
import { $, esc, fmtDate, scoreClass } from './util.js';

export function initProgress() {
  $('#btn-clear-history').onclick = () => {
    if (!history.all().length) return;
    if (confirm('Apagar todo o histórico de treinos?')) {
      history.clear();
      renderProgress();
    }
  };
}

export function renderProgress() {
  const items = history.all();
  const week = Date.now() - 7 * 864e5;
  const thisWeek = items.filter((h) => new Date(h.date).getTime() > week);
  const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, h) => a + h.score, 0) / arr.length) : '–');
  const best = items.length ? Math.max(...items.map((h) => h.score)) : '–';
  $('#progress-summary').innerHTML = `
    <div class="stat"><b>${items.length}</b><span>treinos no total</span></div>
    <div class="stat"><b>${thisWeek.length}</b><span>nos últimos 7 dias</span></div>
    <div class="stat"><b>${avg(items.slice(0, 10))}</b><span>média (últimos 10)</span></div>
    <div class="stat"><b>${best}</b><span>melhor nota</span></div>`;

  $('#history-list').innerHTML = items.length ? items.map((h) => `
    <div class="item" style="cursor:default">
      <div class="icon">${h.kind === 'tab' ? 'TAB' : '♪'}</div>
      <div class="meta">
        <b>${esc(h.title)}</b>
        <span>${fmtDate(h.date)} · ${h.mode === 'follow' || h.mode === 'wait' ? 'no seu ritmo' : 'metrônomo'}${h.bpm ? ` · ${h.bpm} BPM` : ''}</span>
        <span style="display:block">${(h.metrics || []).map((m) => `${esc(m.name.split(' (')[0])}: ${m.value}`).join(' · ')}</span>
      </div>
      <span class="badge ${scoreClass(h.score)}">${h.score}</span>
    </div>`).join('') : '<p class="muted">Seus treinos aparecem aqui. Vá em <b>Tocar</b> ou <b>Tablatura</b> para começar!</p>';
}
