// Utilidades de interface.
import { engine } from '../audio/engine.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let toastTimer;
export function toast(msg, ms = 2600) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

export function show(el, on = true) {
  (typeof el === 'string' ? $(el) : el).classList.toggle('hidden', !on);
}

/** Mostra apenas um dos painéis do grupo. */
export function showPanel(ids, active) {
  ids.forEach((id) => show('#' + id, id === active));
}

const micListeners = new Set();
export function onMicChange(fn) { micListeners.add(fn); }

export async function ensureMic() {
  if (engine.running) return true;
  try {
    await engine.start();
    micListeners.forEach((fn) => fn(true));
    return true;
  } catch (e) {
    console.error(e);
    const msg = e.name === 'NotAllowedError'
      ? 'Permissão do microfone negada. Libere nas configurações do navegador.'
      : e.name === 'NotFoundError'
        ? 'Nenhum microfone encontrado. Conecte um microfone (ou use o do celular/notebook).'
        : e.message || 'Não foi possível abrir o microfone.';
    toast(msg, 5000);
    micListeners.forEach((fn) => fn(false));
    return false;
  }
}

export function scoreClass(v) {
  return v >= 75 ? 'good' : v >= 50 ? 'mid' : 'bad';
}

export function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** Copia texto para a área de transferência (com alternativa para navegadores antigos). */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* sem suporte */ }
    ta.remove();
    return ok;
  }
}

/** Mantém a tela ligada durante o treino (quando suportado). */
let wakeLock = null;
export async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { /* opcional */ }
}
