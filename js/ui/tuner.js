// Tela do afinador + detector de acordes.
import { engine, gateFromSensitivity } from '../audio/engine.js';
import { recognizeChord } from '../audio/chroma.js';
import { TUNINGS, midiToName, SOLFEGE, mod12, SHARP_NAMES } from '../music/theory.js';
import { settings } from '../services/storage.js';
import { pluck } from '../services/sound.js';
import { $, esc } from './util.js';

let unsub = null;
const recent = [];
let inTuneSince = 0;

export function initTuner() {
  const sel = $('#tuning-select');
  sel.innerHTML = Object.entries(TUNINGS).map(([k, t]) => `<option value="${k}">${esc(t.name)}</option>`).join('');
  sel.value = settings.get().tuning;
  sel.addEventListener('change', () => { settings.set({ tuning: sel.value }); renderStrings(); });
  renderStrings();

  const bars = $('#chroma-bars');
  bars.innerHTML = SHARP_NAMES.map((n) => `<div><span>${n}</span></div>`).join('');
}

function renderStrings() {
  const t = TUNINGS[settings.get().tuning] || TUNINGS.padrao;
  $('#strings').innerHTML = t.strings.map((m, i) => `
    <button class="string-btn" type="button" data-midi="${m}" data-i="${i}">
      <b>${midiToName(m).replace(/\d+$/, '')}</b><small>${6 - i}ª · ${midiToName(m)}</small>
    </button>`).join('');
  $('#strings').querySelectorAll('.string-btn').forEach((b) =>
    b.addEventListener('click', () => pluck(+b.dataset.midi)));
}

export function enterTuner() {
  if (unsub) return;
  unsub = engine.subscribe(onFrame);
}

export function leaveTuner() {
  unsub?.();
  unsub = null;
}

function onFrame(f) {
  // nível do microfone
  const lvl = Math.min(1, Math.sqrt(f.rms / 0.25));
  $('#level-bar').style.width = (lvl * 100).toFixed(1) + '%';
  $('#level-gate').style.left = (Math.sqrt(gateFromSensitivity(settings.get().sensitivity) / 0.25) * 100).toFixed(1) + '%';

  // cromagrama + acorde
  const bars = $('#chroma-bars').children;
  for (let i = 0; i < 12; i++) bars[i].style.height = Math.max(2, f.chroma[i] * 100).toFixed(0) + '%';
  if (f.voiced) {
    const r = recognizeChord(f.chroma);
    $('#detector-chord').textContent = r.bestScore > 0.6 ? r.best.symbol : '?';
  } else if (f.rms < f.gate * 0.5) {
    $('#detector-chord').textContent = '–';
  }

  // afinação (mediana das últimas leituras para estabilidade)
  if (f.pitch) {
    recent.push(f.pitch.midi);
    if (recent.length > 5) recent.shift();
  } else if (!f.voiced) {
    recent.length = 0;
  }
  if (recent.length < 3) {
    if (!f.voiced) {
      $('#tuner-status').textContent = 'Aguardando som…';
      $('#tuner-status').className = 'tuner-status';
    }
    return;
  }
  const sorted = [...recent].sort((a, b) => a - b);
  let midi = sorted[Math.floor(sorted.length / 2)];
  const refShift = 12 * Math.log2(settings.get().refA / 440);
  midi -= refShift;
  const nearest = Math.round(midi);
  const cents = Math.round((midi - nearest) * 100);
  const pc = mod12(nearest);
  const name = SHARP_NAMES[pc];
  $('#tuner-letter').innerHTML = `${name}<sub>${Math.floor(nearest / 12) - 1}</sub>`;
  $('#tuner-solfege').textContent = SOLFEGE[pc];
  $('#tuner-cents').textContent = `${cents > 0 ? '+' : ''}${cents} cents`;
  $('#tuner-freq').textContent = `${(440 * Math.pow(2, (midi + refShift - 69) / 12)).toFixed(1)} Hz`;
  const needle = $('#tuner-needle');
  needle.style.left = `${50 + Math.max(-50, Math.min(50, cents))}%`;
  const ok = Math.abs(cents) <= 5;
  needle.classList.toggle('in-tune', ok);

  // corda mais próxima da afinação escolhida
  const t = TUNINGS[settings.get().tuning] || TUNINGS.padrao;
  let bestI = 0;
  t.strings.forEach((m, i) => { if (Math.abs(m - midi) < Math.abs(t.strings[bestI] - midi)) bestI = i; });
  const diff = (midi - t.strings[bestI]) * 100;
  const btns = $('#strings').children;
  [...btns].forEach((b, i) => b.classList.toggle('target', i === bestI));

  const status = $('#tuner-status');
  if (Math.abs(diff) <= 5) {
    if (!inTuneSince) inTuneSince = f.t;
    status.textContent = `✓ Corda ${6 - bestI} afinada`;
    status.className = 'tuner-status good';
    if (f.t - inTuneSince > 0.6) btns[bestI].classList.add('tuned');
  } else {
    inTuneSince = 0;
    const s = 6 - bestI;
    if (Math.abs(diff) > 250) {
      status.textContent = `Corda ${s}?`;
      status.className = 'tuner-status';
    } else {
      status.textContent = diff < 0 ? `Corda ${s}: aperte (está baixa)` : `Corda ${s}: afrouxe (está alta)`;
      status.className = 'tuner-status ' + (diff < 0 ? 'low' : 'high');
    }
  }
}
