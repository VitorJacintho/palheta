// Sessão de acompanhamento de acordes.
//
// Modo "seguir": o app espera o guitarrista trocar de acorde e se adapta ao andamento dele.
// Modo "metrônomo": andamento fixo, o app conta o tempo e avalia se você acompanha.

import { engine, getAudioContext } from '../audio/engine.js';
import { recognizeChord } from '../audio/chroma.js';
import { parseProgression, mergeRepeats } from '../music/songParser.js';
import { speak, isSpeaking, stopSpeaking } from '../services/speech.js';
import { Metronome } from '../services/sound.js';
import { settings } from '../services/storage.js';
import { clamp, mean, median, stdev, relScore, msScore, weighted, grade } from './scoring.js';

const CHANGE_FRAMES = 4; // ~80 ms de confirmação para aceitar uma troca

export class ChordSession {
  constructor(song, { mode = 'follow', bpm, countIn = true, clickDuringSong = true } = {}) {
    this.song = song;
    this.mode = mode;
    this.bpm = bpm || song.bpm || 80;
    this.beatsPerBar = song.beatsPerBar || 4;
    this.countIn = countIn;
    this.clickDuringSong = clickDuringSong;
    this.segments = mergeRepeats(parseProgression(song.chords, this.beatsPerBar).items);
    if (!this.segments.length) throw new Error('Essa música não tem acordes reconhecidos.');
    this.results = this.segments.map((s) => ({
      symbol: s.symbol, chord: s.chord, beats: s.beats,
      voiced: 0, matched: 0, wrong: 0, reached: false, skipped: false,
      actualSec: null, expectedSec: null, latency: null,
    }));
    this.onsets = [];
    this.state = { phase: 'idle', index: 0, detected: null, matchNow: false, hint: null, beat: 0 };
    this.listeners = new Set();
  }

  onFinish(fn) { this.listeners.add(fn); }

  start() {
    const ctx = getAudioContext();
    this.beatSec = 60 / this.bpm;
    this.tempoSamples = [];
    this.latency = (settings.get().latencyMs || 0) / 1000;
    const t0 = ctx.currentTime + 0.4;
    const countBeats = this.countIn ? this.beatsPerBar : 0;
    this.playStart = t0 + countBeats * this.beatSec;
    this.totalBeats = this.segments.reduce((a, s) => a + s.beats, 0);

    // Limites fixos (modo metrônomo)
    let acc = 0;
    this.bounds = this.segments.map((s) => {
      const b = { start: this.playStart + acc * this.beatSec };
      acc += s.beats;
      b.end = this.playStart + acc * this.beatSec;
      return b;
    });

    this.state.phase = 'countin';
    this.state.index = 0;
    this.state.beatsLeft = countBeats;

    const totalMetroBeats = this.mode === 'metronome'
      ? countBeats + Math.ceil(this.totalBeats) + 1
      : countBeats;
    if (totalMetroBeats > 0) {
      this.metronome = new Metronome({
        bpm: this.bpm,
        beatsPerBar: this.beatsPerBar,
        startTime: t0,
        totalBeats: totalMetroBeats,
        audible: true,
        onBeat: (b) => {
          this.state.beat = b;
          this.state.beatsLeft = Math.max(0, countBeats - b - 1);
          if (this.mode === 'metronome' && b >= countBeats && !this.clickDuringSong) this.metronome.audible = false;
        },
      });
    }
    speak(`Comece com ${this.segments[0].chord.spoken}`);
    this.announced = new Set([0]);
    this.unsub = engine.subscribe((f) => this.onFrame(f));
    this.nextStreak = 0;
    this.wrongStreak = 0;
    this.matchStreak = 0;
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

  skip() {
    if (this.mode !== 'follow' || this.state.phase !== 'play') return;
    const t = getAudioContext().currentTime;
    if (this.state.index >= this.segments.length - 1) return this.stop(true);
    this.advance(t, true);
  }

  // -------------------------------------------------------------------------

  onFrame(f) {
    if (f.onset) this.onsets.push((f.onsetTime ?? f.t) - this.latency);
    if (this.mode === 'follow') this.followFrame(f);
    else this.metronomeFrame(f);
  }

  followFrame(f) {
    const st = this.state;
    const seg = this.segments[0];

    if (st.phase === 'countin') {
      if (f.t >= this.playStart - 0.35 && f.voiced) {
        const r = recognizeChord(f.chroma, seg.chord);
        if (f.onset || r.match) this.begin(f.t);
      } else if (f.t >= this.playStart + 8) {
        st.hint = `Toque ${seg.symbol} para começar`;
      }
      return;
    }
    if (st.phase !== 'play') return;

    const i = st.index;
    const cur = this.segments[i];
    const rec = this.results[i];
    const elapsed = f.t - this.segStart;
    const expected = cur.beats * this.beatSec;
    const speaking = isSpeaking();

    let curMatch = null;
    if (f.voiced) {
      curMatch = recognizeChord(f.chroma, cur.chord);
      st.detected = curMatch.best;
      st.matchNow = curMatch.match;
      if (elapsed > 0.15 && !speaking) {
        rec.voiced++;
        if (curMatch.match) rec.matched++;
      }
    } else {
      st.matchNow = false;
    }

    // Detecção de troca para o próximo acorde
    if (i < this.segments.length - 1) {
      const next = this.segments[i + 1];
      let nextOk = false;
      if (f.voiced) {
        const r2 = recognizeChord(f.chroma, next.chord);
        nextOk = r2.match && r2.targetScore > (curMatch?.targetScore ?? 0) + 0.02;
      }
      if (nextOk) {
        if (this.nextStreak === 0) this.streakStart = f.t;
        this.nextStreak++;
        if (this.nextStreak >= (speaking ? CHANGE_FRAMES * 2 : CHANGE_FRAMES)) {
          const recentOnset = [...this.onsets].reverse().find((o) => o <= this.streakStart + 0.02 && o >= this.streakStart - 0.35);
          this.advance(recentOnset ?? this.streakStart);
          return;
        }
      } else {
        this.nextStreak = 0;
      }

      // Acorde errado tocado com convicção
      if (f.voiced && !curMatch.match && curMatch.bestScore > 0.78 && !nextOk && !speaking) {
        this.wrongStreak++;
        if (this.wrongStreak === 15) {
          rec.wrong++;
          st.hint = `Isso parece ${curMatch.best.symbol}. O acorde é ${cur.symbol}.`;
        }
      } else if (curMatch?.match) {
        this.wrongStreak = 0;
      }

      // Anúncio do próximo acorde
      const s = settings.get();
      const lead = s.announce === 'before' ? this.beatSec + 0.25 : 0.15;
      if (!this.announced.has(i + 1) && elapsed >= expected - lead) {
        this.announced.add(i + 1);
        speak(s.announce === 'before' ? next.chord.spoken : `Agora ${next.chord.spoken}`);
      }

      if (elapsed > expected * 2.5 + 2.5) st.hint = st.hint || `Troque para ${next.symbol} quando quiser — ou toque em "Pular".`;
    } else {
      // Último acorde: termina depois da duração esperada
      if (elapsed >= expected + 0.2) this.stop(true);
    }

    st.elapsed = elapsed;
    st.beatInSeg = Math.min(cur.beats, elapsed / this.beatSec);
  }

  begin(t) {
    this.state.phase = 'play';
    this.state.hint = null;
    this.segStart = t;
    this.results[0].reached = true;
  }

  advance(t, skipped = false) {
    const st = this.state;
    const i = st.index;
    const cur = this.segments[i];
    const rec = this.results[i];
    rec.actualSec = t - this.segStart;
    rec.expectedSec = cur.beats * this.beatSec;
    rec.skipped = skipped;

    if (!skipped && rec.actualSec > 0.2) {
      const observedBeat = rec.actualSec / cur.beats;
      const ratio = clamp(observedBeat / this.beatSec, 0.6, 1.6);
      rec.observedBpm = 60 / observedBeat;
      this.tempoSamples.push(rec.observedBpm);
      this.beatSec = this.beatSec * (1 - 0.4) + this.beatSec * ratio * 0.4;
    }

    st.index = i + 1;
    st.hint = null;
    if (!skipped) this.results[i + 1].reached = true;
    this.segStart = t;
    this.nextStreak = 0;
    this.wrongStreak = 0;
  }

  metronomeFrame(f) {
    const st = this.state;
    if (st.phase === 'countin') {
      if (f.t >= this.playStart) st.phase = 'play';
      else return;
    }
    if (st.phase !== 'play') return;

    const lastEnd = this.bounds[this.bounds.length - 1].end;
    if (f.t >= lastEnd + 0.1) return this.stop(true);

    let i = st.index;
    while (i < this.bounds.length - 1 && f.t >= this.bounds[i].end) i++;
    if (i !== st.index) {
      st.index = i;
      st.hint = null;
      this.matchStreak = 0;
    }
    const cur = this.segments[i];
    const rec = this.results[i];
    const b = this.bounds[i];
    const elapsed = f.t - b.start;
    st.elapsed = elapsed;
    st.beatInSeg = elapsed / this.beatSec;

    if (f.voiced) {
      const r = recognizeChord(f.chroma, cur.chord);
      st.detected = r.best;
      st.matchNow = r.match;
      if (elapsed > 0.15 && !isSpeaking()) {
        rec.voiced++;
        if (r.match) rec.matched++;
      }
      if (r.match) {
        this.matchStreak++;
        if (this.matchStreak === 3 && rec.latency == null) {
          rec.latency = f.t - 0.04 - this.latency - b.start;
          rec.reached = true;
        }
      } else this.matchStreak = 0;
    } else {
      st.matchNow = false;
    }

    // anúncio
    const s = settings.get();
    if (i + 1 < this.segments.length && !this.announced.has(i + 1)) {
      const lead = s.announce === 'before' ? this.beatSec + 0.25 : 0.15;
      if (f.t >= this.bounds[i + 1].start - lead) {
        this.announced.add(i + 1);
        const sp = this.segments[i + 1].chord.spoken;
        speak(s.announce === 'before' ? sp : `Agora ${sp}`);
      }
    }
  }

  // -------------------------------------------------------------------------

  summary() {
    const R = this.results;
    const accuracyPerSeg = R.map((r) => (r.voiced >= 5 ? r.matched / r.voiced : r.reached ? 0.5 : 0));
    const accuracy = Math.round(mean(accuracyPerSeg) * 100);
    const metrics = [{ key: 'acc', name: 'Precisão dos acordes', value: accuracy, weight: 45 }];
    let extra = {};

    if (this.mode === 'follow') {
      // ritmo: cada acorde durou o número certo de tempos, medido no andamento
      // do PRÓPRIO guitarrista (mediana), não no BPM original da música
      const beatDurs = R.filter((r) => r.actualSec != null && !r.skipped && r.actualSec > 0.2)
        .map((r) => r.actualSec / r.beats);
      const med = median(beatDurs);
      const rhythm = beatDurs.length ? Math.round(mean(beatDurs.map((d) => relScore(d / med - 1, 0.4))) * 100) : 0;
      // estabilidade: acelerou ou atrasou ao longo da música?
      const bpms = this.tempoSamples;
      let stability = rhythm;
      let drift = 0;
      if (bpms.length >= 3) {
        const third = Math.max(1, Math.floor(bpms.length / 3));
        const first = mean(bpms.slice(0, third));
        const last = mean(bpms.slice(-third));
        drift = (last - first) / mean(bpms);
        stability = Math.round(relScore(drift, 0.25) * 100);
      }
      const reached = R.filter((r) => r.reached).length;
      const completion = Math.round((reached / R.length) * 100);
      metrics.push(
        { key: 'rhythm', name: 'Ritmo (duração de cada acorde)', value: rhythm, weight: 30 },
        { key: 'stab', name: 'Estabilidade do andamento', value: stability, weight: 15 },
        { key: 'comp', name: 'Trocas completadas', value: completion, weight: 10 },
      );
      extra = {
        drift,
        bpmAvg: med > 0 ? Math.round(60 / med) : this.bpm,
        bpmMin: bpms.length ? Math.round(Math.min(...bpms)) : null,
        bpmMax: bpms.length ? Math.round(Math.max(...bpms)) : null,
      };
    } else {
      // ritmo: palhetadas perto da grade de colcheias
      const half = this.beatSec / 2;
      const songOnsets = this.onsets.filter((t) => t >= this.playStart - 0.1 && t <= this.bounds[this.bounds.length - 1].end);
      const errs = songOnsets.map((t) => {
        const pos = (t - this.playStart) / half;
        return (pos - Math.round(pos)) * half * 1000;
      });
      const rhythm = errs.length ? Math.round(mean(errs.map((e) => msScore(e, 30, 140))) * 100) : 0;
      const lats = R.map((r) => r.latency);
      const changes = Math.round(mean(lats.map((l) => (l == null ? 0 : msScore(l * 1000, 120, 120 + this.beatSec * 1000)))) * 100);
      metrics.push(
        { key: 'rhythm', name: 'Ritmo (palhetadas no tempo)', value: rhythm, weight: 30 },
        { key: 'changes', name: 'Trocas na hora certa', value: changes, weight: 25 },
      );
      extra = { bpmAvg: this.bpm, avgOnsetErrMs: errs.length ? Math.round(mean(errs.map(Math.abs))) : null };
    }

    const score = weighted(metrics);
    const perChord = aggregateByChord(R, accuracyPerSeg);
    return {
      kind: 'chords',
      mode: this.mode,
      title: this.song.title,
      itemId: this.song.id,
      score,
      grade: grade(score),
      metrics,
      extra,
      segments: R.map((r, i) => ({
        symbol: r.symbol, beats: r.beats, accuracy: Math.round(accuracyPerSeg[i] * 100),
        actualSec: r.actualSec, expectedSec: r.expectedSec, latency: r.latency, skipped: r.skipped, wrong: r.wrong,
      })),
      perChord,
      tips: chordTips(metrics, perChord, this.mode, extra, this.bpm),
    };
  }
}

function aggregateByChord(R, acc) {
  const map = new Map();
  R.forEach((r, i) => {
    const m = map.get(r.symbol) || { symbol: r.symbol, n: 0, acc: 0 };
    m.n++;
    m.acc += acc[i];
    map.set(r.symbol, m);
  });
  return [...map.values()].map((m) => ({ symbol: m.symbol, accuracy: Math.round((m.acc / m.n) * 100) }))
    .sort((a, b) => a.accuracy - b.accuracy);
}

function chordTips(metrics, perChord, mode, extra, bpm) {
  const tips = [];
  const by = Object.fromEntries(metrics.map((m) => [m.key, m.value]));
  const hard = perChord.filter((c) => c.accuracy < 60).slice(0, 3).map((c) => c.symbol);
  if (hard.length) tips.push(`Os acordes mais difíceis foram ${hard.join(', ')}. Treine cada um parado, conferindo se todas as cordas soam limpas.`);
  if (by.rhythm < 60) tips.push(mode === 'follow'
    ? 'A duração dos acordes variou bastante. Conte os tempos em voz alta (1, 2, 3, 4) enquanto toca.'
    : 'Suas palhetadas estão fora do clique. Baixe o BPM e toque só nas cabeças de tempo.');
  if (by.stab != null && by.stab < 70) tips.push(`Você ${extra.drift > 0 ? 'acelerou' : 'foi atrasando'} ao longo da música (entre ${extra.bpmMin} e ${extra.bpmMax} BPM). Tente o modo metrônomo para firmar o tempo.`);
  if (by.changes != null && by.changes < 60) tips.push('As trocas chegaram atrasadas. Comece a mover a mão no último tempo do compasso anterior.');
  if (by.comp != null && by.comp < 100) tips.push('Algumas trocas não foram reconhecidas. Confira a afinação e deixe o acorde soar bem antes de trocar.');
  if (!tips.length) tips.push(mode === 'follow'
    ? `Ótimo controle! Tente o modo metrônomo a ${Math.round((extra.bpmAvg || bpm) * 1.1)} BPM.`
    : `Mandou bem! Suba o metrônomo para ${Math.round(bpm * 1.1)} BPM.`);
  return tips;
}
