// Sessão de treino de solo com tablatura.
//
// Modo "espera": o app aguarda cada nota certa (no seu tempo).
// Modo "metrônomo": as notas passam no andamento escolhido.

import { engine, getAudioContext } from '../audio/engine.js';
import { parseTab } from '../music/tabParser.js';
import { midiToName, spokenPc } from '../music/theory.js';
import { speak, stopSpeaking } from '../services/speech.js';
import { Metronome } from '../services/sound.js';
import { settings } from '../services/storage.js';
import { mean, median, relScore, msScore, weighted, grade } from './scoring.js';

export function noteMatches(midi, event) {
  return event.notes.some((n) => Math.abs(midi - n.midi) < 0.5 || Math.abs(Math.abs(midi - n.midi) - 12) < 0.5);
}

export class TabSession {
  constructor(item, { mode = 'wait', bpm, perBeat, countIn = true } = {}) {
    this.item = item;
    this.mode = mode;
    this.bpm = bpm || item.bpm || 70;
    this.perBeat = perBeat || item.perBeat || 2;
    this.countIn = countIn;
    this.tuning = settings.get().tuning;
    const parsed = parseTab(item.tab, this.tuning);
    this.events = parsed.events;
    this.systems = parsed.systems;
    if (!this.events.length) throw new Error('Não encontrei notas nessa tablatura.');
    this.results = this.events.map(() => ({ matched: false, firstTry: null, wrong: 0, time: null, errMs: null }));
    this.state = { phase: 'idle', index: 0, detected: null, matchNow: false, hint: null };
    this.listeners = new Set();
  }

  onFinish(fn) { this.listeners.add(fn); }

  start() {
    const ctx = getAudioContext();
    this.unitSec = 60 / this.bpm / this.perBeat;
    this.latency = (settings.get().latencyMs || 0) / 1000;
    const countBeats = this.mode === 'metronome' && this.countIn ? 4 : 0;
    const t0 = ctx.currentTime + 0.4;
    this.playStart = t0 + countBeats * (60 / this.bpm);
    let acc = 0;
    this.times = this.events.map((ev) => {
      const t = this.playStart + acc * this.unitSec;
      acc += ev.units;
      return t;
    });
    this.endTime = this.playStart + acc * this.unitSec + 0.3;

    if (this.mode === 'metronome') {
      this.metronome = new Metronome({
        bpm: this.bpm, beatsPerBar: 4, startTime: t0,
        totalBeats: countBeats + Math.ceil(acc / this.perBeat) + 1,
        onBeat: (b) => { this.state.beat = b; },
      });
      this.state.phase = 'countin';
    } else {
      this.state.phase = 'play';
      this.announce(0);
    }

    this.armed = true;
    this.wrongArmed = true;
    this.lastAccepted = null;
    this.stableMidi = null;
    this.stableCount = 0;
    this.lastOnset = -1;
    this.unsub = engine.subscribe((f) => this.onFrame(f));
  }

  stop(finished = false) {
    this.unsub?.();
    this.metronome?.stop();
    stopSpeaking();
    if (this.state.phase === 'done') return;
    this.state.phase = 'done';
    const summary = finished ? this.summary() : null;
    this.listeners.forEach((fn) => fn(summary));
  }

  announce(i) {
    const ev = this.events[i];
    if (!ev) return;
    const n = ev.notes[ev.notes.length - 1];
    speak(`${i === 0 ? 'Comece: ' : ''}${spokenPc(n.midi)}, corda ${n.string}, casa ${n.fret}`);
  }

  onFrame(f) {
    const st = this.state;
    if (f.onset) {
      this.armed = true;
      this.wrongArmed = true;
      this.lastOnset = (f.onsetTime ?? f.t) - this.latency;
    }
    let midi = null;
    if (f.pitch) {
      midi = Math.round(f.pitch.midi);
      if (midi === this.stableMidi) this.stableCount++;
      else {
        this.stableMidi = midi;
        this.stableCount = 1;
        // nota mudou sem ataque forte (ligado/hammer-on)
        if (this.lastAccepted != null && midi !== this.lastAccepted) {
          this.armed = true;
          this.wrongArmed = true;
        }
      }
      st.detected = { midi, name: midiToName(midi), cents: Math.round((f.pitch.midi - midi) * 100) };
    } else {
      this.stableCount = 0;
      if (!f.voiced) st.detected = null;
    }

    if (this.mode === 'wait') this.waitFrame(f, midi);
    else this.metroFrame(f, midi);
  }

  attackTime(t) {
    return this.lastOnset >= t - 0.25 ? this.lastOnset : t - 0.04 - this.latency;
  }

  waitFrame(f, midi) {
    const st = this.state;
    if (st.phase !== 'play') return;
    const i = st.index;
    const ev = this.events[i];
    const rec = this.results[i];
    if (midi == null) { st.matchNow = false; return; }
    const ok = noteMatches(midi, ev);
    st.matchNow = ok;

    if (this.armed && ok && this.stableCount >= 2) {
      rec.matched = true;
      if (rec.firstTry == null) rec.firstTry = true;
      rec.time = this.attackTime(f.t);
      this.lastAccepted = midi;
      this.armed = false;
      st.hint = null;
      st.index = i + 1;
      if (st.index >= this.events.length) {
        this.stop(true);
        return;
      }
      if (settings.get().voice && this.item.speakNotes) this.announce(st.index);
    } else if (this.wrongArmed && !ok && this.stableCount >= 3 && midi !== this.lastAccepted) {
      rec.wrong++;
      if (rec.firstTry == null) rec.firstTry = false;
      this.wrongArmed = false;
      const target = ev.notes[ev.notes.length - 1];
      st.hint = `Você tocou ${midiToName(midi)}. A nota é ${midiToName(target.midi)} (corda ${target.string}, casa ${target.fret}).`;
    }
  }

  metroFrame(f, midi) {
    const st = this.state;
    if (st.phase === 'countin') {
      if (f.t >= this.playStart - this.unitSec) st.phase = 'play';
      else return;
    }
    if (st.phase !== 'play') return;
    if (f.t >= this.endTime) return this.stop(true);

    // cursor visual: evento mais recente cujo tempo já passou
    let cur = st.index;
    while (cur < this.events.length - 1 && f.t >= this.times[cur + 1] - this.unitSec * 0.5) cur++;
    st.index = cur;
    st.cursorTime = f.t;

    if (midi == null || !this.armed || this.stableCount < 2) return;
    const at = this.attackTime(f.t);
    // procura um evento pendente na janela desse ataque
    const winBefore = this.unitSec * 0.5 + 0.1;
    const winAfter = this.unitSec * 0.75 + 0.05;
    let target = -1;
    for (let k = 0; k < this.events.length; k++) {
      if (this.results[k].matched) continue;
      const d = at - this.times[k];
      if (d < -winBefore) break;
      if (d <= winAfter) { target = k; break; }
    }
    if (target < 0) return;
    this.armed = false;
    const ev = this.events[target];
    const rec = this.results[target];
    if (noteMatches(midi, ev)) {
      rec.matched = true;
      rec.time = at;
      rec.errMs = (at - this.times[target]) * 1000;
      this.lastAccepted = midi;
      st.matchNow = true;
      st.hint = null;
    } else {
      rec.wrong++;
      st.matchNow = false;
      const t = ev.notes[ev.notes.length - 1];
      st.hint = `Nota errada: ${midiToName(midi)} — era ${midiToName(t.midi)}.`;
    }
  }

  summary() {
    const R = this.results;
    const n = R.length;
    const wrongTotal = R.reduce((a, r) => a + r.wrong, 0);
    let accuracy, rhythm, extra = {};
    if (this.mode === 'wait') {
      accuracy = Math.round((R.filter((r) => r.firstTry === true).length / n) * 100);
      const ratios = [];
      for (let i = 0; i < n - 1; i++) {
        if (R[i].time != null && R[i + 1].time != null) ratios.push((R[i + 1].time - R[i].time) / this.events[i].units);
      }
      const unit = median(ratios);
      rhythm = ratios.length ? Math.round(mean(ratios.map((r) => relScore(r / unit - 1, 0.6))) * 100) : 0;
      const bpmEst = unit > 0 ? Math.round(60 / (unit * this.perBeat)) : null;
      const span = R[n - 1].time != null && R[0].time != null ? R[n - 1].time - R[0].time : 0;
      extra = { bpmAvg: bpmEst, notesPerMin: span > 0 ? Math.round(((n - 1) / span) * 60) : null };
    } else {
      accuracy = Math.round((R.filter((r) => r.matched).length / n) * 100);
      rhythm = Math.round(mean(R.map((r) => (r.errMs == null ? 0 : msScore(r.errMs, 30, 160)))) * 100);
      const errs = R.filter((r) => r.errMs != null).map((r) => r.errMs);
      extra = { bpmAvg: this.bpm, avgErrMs: errs.length ? Math.round(mean(errs.map(Math.abs))) : null, lateBias: errs.length ? Math.round(mean(errs)) : null };
    }
    const clean = Math.round(Math.max(0, 1 - wrongTotal / n) * 100);
    const metrics = [
      { key: 'acc', name: this.mode === 'wait' ? 'Notas certas de primeira' : 'Notas acertadas', value: accuracy, weight: 50 },
      { key: 'rhythm', name: this.mode === 'wait' ? 'Regularidade do ritmo' : 'Notas no tempo', value: rhythm, weight: 30 },
      { key: 'clean', name: 'Limpeza (sem notas erradas)', value: clean, weight: 20 },
    ];
    const score = weighted(metrics);

    const tips = [];
    const missedIdx = R.map((r, i) => (r.firstTry === false || !r.matched ? i : -1)).filter((i) => i >= 0);
    if (missedIdx.length) {
      const sample = missedIdx.slice(0, 4).map((i) => {
        const nt = this.events[i].notes[0];
        return `corda ${nt.string} casa ${nt.fret}`;
      });
      tips.push(`Atenção em: ${sample.join(', ')}${missedIdx.length > 4 ? '…' : ''}.`);
    }
    if (rhythm < 60) tips.push(this.mode === 'wait'
      ? 'O intervalo entre as notas variou muito. Tente manter uma pulsação constante, mesmo devagar.'
      : extra.lateBias > 40 ? 'Você está atrasando as notas. Antecipe o movimento da mão.' : 'Muitas notas fora do tempo. Diminua o BPM.');
    if (clean < 70) tips.push('Muitas notas erradas: olhe a próxima nota antes de tocar e use o modo espera.');
    if (!tips.length) tips.push(this.mode === 'wait'
      ? 'Muito bem! Agora tente com o metrônomo.'
      : `Excelente! Suba para ${Math.round(this.bpm * 1.1)} BPM.`);

    return {
      kind: 'tab', mode: this.mode, title: this.item.title, itemId: this.item.id,
      score, grade: grade(score), metrics, extra, tips,
      notes: R.map((r, i) => ({ ...r, notes: this.events[i].notes })),
    };
  }
}
