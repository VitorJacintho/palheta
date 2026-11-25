// Tela de resultado (comum a acordes e tablatura).
import { esc, scoreClass } from './util.js';

export function renderResults(container, s, { onRetry, onBack }) {
  const C = 2 * Math.PI * 70;
  const color = s.score >= 75 ? 'var(--good)' : s.score >= 50 ? 'var(--accent)' : 'var(--bad)';
  const extra = [];
  if (s.extra.bpmAvg) extra.push(`<span>Andamento: <b>${s.extra.bpmAvg} BPM</b></span>`);
  if (s.extra.bpmMin != null && s.extra.bpmMax != null && s.extra.bpmMin !== s.extra.bpmMax)
    extra.push(`<span>Variação: <b>${s.extra.bpmMin}–${s.extra.bpmMax}</b></span>`);
  if (s.extra.avgOnsetErrMs != null) extra.push(`<span>Erro médio: <b>${s.extra.avgOnsetErrMs} ms</b></span>`);
  if (s.extra.avgErrMs != null) extra.push(`<span>Erro médio: <b>${s.extra.avgErrMs} ms</b></span>`);
  if (s.extra.notesPerMin) extra.push(`<span>Velocidade: <b>${s.extra.notesPerMin} notas/min</b></span>`);

  let detail = '';
  if (s.kind === 'chords') {
    detail = `
      <details class="card"><summary><b>Detalhe por acorde</b></summary>
        <table class="detail">
          <thead><tr><th>Acorde</th><th>Precisão</th><th>${s.mode === 'follow' ? 'Duração (real / esperada)' : 'Troca'}</th></tr></thead>
          <tbody>${s.segments.map((g) => `
            <tr>
              <td><b>${esc(g.symbol)}</b> <small class="muted">${fmtBeats(g.beats)}</small></td>
              <td><span class="badge ${scoreClass(g.accuracy)}">${g.accuracy}%</span>${g.wrong ? ` <small class="muted">${g.wrong} erro(s)</small>` : ''}</td>
              <td>${s.mode === 'follow'
                ? (g.skipped ? '<span class="muted">pulado</span>' : g.actualSec != null ? `${g.actualSec.toFixed(1)}s / ${g.expectedSec.toFixed(1)}s` : '–')
                : (g.latency == null ? '<span class="muted">não reconhecido</span>' : `${g.latency >= 0 ? '+' : ''}${Math.round(g.latency * 1000)} ms`)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </details>`;
  } else {
    detail = `
      <details class="card"><summary><b>Detalhe por nota</b></summary>
        <table class="detail">
          <thead><tr><th>#</th><th>Corda / casa</th><th>Resultado</th></tr></thead>
          <tbody>${s.notes.map((n, i) => `
            <tr><td>${i + 1}</td>
              <td>${n.notes.map((x) => `${x.string}ª casa ${x.fret}`).join(' + ')}</td>
              <td>${!n.matched ? '<span class="badge bad">faltou</span>'
                : n.firstTry === false || n.wrong ? `<span class="badge mid">${n.wrong} erro(s)</span>`
                : '<span class="badge good">ok</span>'}${n.errMs != null ? ` <small class="muted">${n.errMs > 0 ? '+' : ''}${Math.round(n.errMs)} ms</small>` : ''}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </details>`;
  }

  container.innerHTML = `
    <div class="card results">
      <div class="muted">${esc(s.title)} · ${s.mode === 'follow' || s.mode === 'wait' ? 'no seu ritmo' : 'com metrônomo'}</div>
      <div class="score-ring">
        <svg viewBox="0 0 160 160" width="170" height="170">
          <circle cx="80" cy="80" r="70" fill="none" stroke="var(--surface-2)" stroke-width="12"/>
          <circle cx="80" cy="80" r="70" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round"
            stroke-dasharray="${C}" stroke-dashoffset="${C}" class="ring-val"/>
        </svg>
        <div class="val"><div>${s.score}<small>de 100</small></div></div>
      </div>
      <div class="grade">${s.grade.emoji} ${esc(s.grade.label)}</div>
      <div class="extra-stats">${extra.join('')}</div>
      ${s.metrics.map((m) => `
        <div class="metric">
          <div class="row-between"><span>${esc(m.name)}</span><b>${m.value}</b></div>
          <div class="bar"><div class="${m.value >= 75 ? 'good' : m.value < 45 ? 'bad' : ''}" style="width:${m.value}%"></div></div>
        </div>`).join('')}
    </div>
    <div class="card">
      <h3>Dicas</h3>
      <ul class="tips">${s.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    </div>
    ${detail}
    <div class="actions">
      <button class="btn ghost" type="button" data-act="back">Voltar</button>
      <button class="btn primary big" type="button" data-act="retry">↻ Tocar de novo</button>
    </div>`;

  requestAnimationFrame(() => {
    const ring = container.querySelector('.ring-val');
    ring.style.transition = 'stroke-dashoffset 1s ease';
    ring.style.strokeDashoffset = String(C * (1 - s.score / 100));
  });
  container.querySelector('[data-act=retry]').onclick = onRetry;
  container.querySelector('[data-act=back]').onclick = onBack;
}

function fmtBeats(b) {
  return `${Number.isInteger(b) ? b : b.toFixed(1)} t`;
}
