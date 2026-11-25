// Voz do app (Web Speech API) em português.
import { settings } from './storage.js';

let voice = null;
let speakingUntil = 0;

function pickVoice() {
  if (!('speechSynthesis' in window)) return;
  const voices = speechSynthesis.getVoices();
  voice =
    voices.find((v) => v.lang === 'pt-BR' && /google|natural|online/i.test(v.name)) ||
    voices.find((v) => v.lang === 'pt-BR') ||
    voices.find((v) => v.lang?.startsWith('pt')) ||
    null;
}

if ('speechSynthesis' in window) {
  pickVoice();
  speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
}

export function speak(text, { force = false } = {}) {
  const s = settings.get();
  if ((!s.voice && !force) || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'pt-BR';
  if (voice) u.voice = voice;
  u.rate = s.voiceRate;
  // estimativa de duração para o app saber quando a voz pode "vazar" no microfone
  speakingUntil = performance.now() + 250 + text.length * 70;
  u.onend = () => { speakingUntil = performance.now(); };
  speechSynthesis.speak(u);
}

export function isSpeaking() {
  return performance.now() < speakingUntil;
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  speakingUntil = 0;
}
