// Inicialização do app, navegação, ajustes e instalação (PWA).
import { engine } from './audio/engine.js';
import { settings } from './services/storage.js';
import { speak } from './services/speech.js';
import { measureLatency } from './services/sound.js';
import { initTuner, enterTuner, leaveTuner } from './ui/tuner.js';
import { initPlay, leavePlay } from './ui/play.js';
import { initTab, leaveTab } from './ui/tabView.js';
import { initProgress, renderProgress } from './ui/progress.js';
import { initEditor } from './ui/editor.js';
import { $, $$, ensureMic, onMicChange, toast } from './ui/util.js';

let currentView = null;

function go(view) {
  if (view === currentView) return;
  // sai da tela anterior (para sessões em andamento)
  if (currentView === 'tuner') leaveTuner();
  if (currentView === 'play') leavePlay();
  if (currentView === 'tab') leaveTab();
  currentView = view;
  $$('.view').forEach((v) => v.classList.toggle('active', v.dataset.view === view));
  $$('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.nav === view));
  if (view === 'tuner') {
    enterTuner();
    if (!engine.running) ensureMic();
  }
  if (view === 'progress') renderProgress();
  if (location.hash !== '#' + view) history.replaceState(null, '', '#' + view);
  window.scrollTo(0, 0);
}

function updateMicButton(on) {
  const b = $('#btn-mic');
  b.classList.toggle('mic-on', on);
  b.classList.toggle('mic-off', !on);
  $('.mic-label', b).textContent = on ? 'Ouvindo' : 'Ativar microfone';
}

function initSettings() {
  const dlg = $('#settings');
  const form = $('#settings-form');
  const fill = () => {
    const s = settings.get();
    form.elements.sensitivity.value = s.sensitivity;
    $('#sens-val').textContent = s.sensitivity;
    form.elements.voice.checked = s.voice;
    form.elements.announce.value = s.announce;
    form.elements.voiceRate.value = s.voiceRate;
    form.elements.metronomeVolume.value = s.metronomeVolume;
    form.elements.latencyMs.value = s.latencyMs;
    $('#lat-val').textContent = s.latencyMs;
  };
  $('#btn-settings').onclick = () => { fill(); dlg.showModal(); };
  dlg.querySelector('[data-close]').onclick = () => dlg.close();
  form.addEventListener('input', () => {
    settings.set({
      sensitivity: +form.elements.sensitivity.value,
      voice: form.elements.voice.checked,
      announce: form.elements.announce.value,
      voiceRate: +form.elements.voiceRate.value,
      metronomeVolume: +form.elements.metronomeVolume.value,
      latencyMs: +form.elements.latencyMs.value,
    });
    $('#sens-val').textContent = form.elements.sensitivity.value;
    $('#lat-val').textContent = form.elements.latencyMs.value;
  });
  $('#btn-calibrate').onclick = async (e) => {
    const btn = e.currentTarget;
    if (!(await ensureMic())) return;
    btn.disabled = true;
    btn.textContent = 'Ouvindo os cliques…';
    try {
      const ms = await measureLatency();
      settings.set({ latencyMs: Math.min(300, Math.max(0, ms)) });
      fill();
      toast(`Atraso medido: ${ms} ms`);
    } catch (err) {
      toast(err.message, 5000);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Calibrar automaticamente';
    }
  };
  $('#btn-test-voice').onclick = () => speak('Agora Ré menor', { force: true });
}

function initInstall() {
  let deferred = null;
  const btn = $('#btn-install');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    btn.classList.remove('hidden');
  });
  btn.onclick = async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    btn.classList.add('hidden');
  };
  window.addEventListener('appinstalled', () => toast('App instalado! 🎸'));

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e));
  }
}

function init() {
  initTuner();
  initPlay();
  initTab();
  initProgress();
  initEditor();
  initSettings();
  initInstall();

  updateMicButton(false);
  onMicChange(updateMicButton);
  $('#btn-mic').onclick = async () => {
    if (engine.running) {
      engine.stop();
      updateMicButton(false);
    } else {
      await ensureMic();
    }
  };

  $$('.tabbar button').forEach((b) => (b.onclick = () => go(b.dataset.nav)));
  window.addEventListener('hashchange', () => go(location.hash.slice(1) || 'play'));
  const start = location.hash.slice(1);
  go(['tuner', 'play', 'tab', 'progress'].includes(start) ? start : 'play');
}

init();
