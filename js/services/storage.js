// Persistência local (localStorage) para músicas, tablaturas, histórico e ajustes.
import { DEFAULT_SONGS, DEFAULT_TABS } from '../data/defaults.js';

const PREFIX = 'palheta:';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (e) {
    console.warn('Não foi possível salvar', key, e);
  }
}

const DEFAULT_SETTINGS = {
  sensitivity: 6,
  voice: true,
  voiceRate: 1.1,
  announce: 'before', // 'before' = um tempo antes, 'now' = na hora da troca
  metronomeVolume: 0.6,
  latencyMs: 30, // atraso entre o som real e a detecção (calibrável)
  tuning: 'padrao',
  refA: 440,
};

const listeners = new Set();

export const settings = {
  get() {
    return { ...DEFAULT_SETTINGS, ...read('settings', {}) };
  },
  set(patch) {
    const next = { ...this.get(), ...patch };
    write('settings', next);
    listeners.forEach((fn) => fn(next));
    return next;
  },
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function collection(key, defaults) {
  return {
    all() {
      const items = read(key, null);
      if (items === null) {
        write(key, defaults);
        return structuredClone(defaults);
      }
      return items;
    },
    get(id) {
      return this.all().find((x) => x.id === id) || null;
    },
    save(item) {
      const items = this.all();
      if (!item.id) item.id = uid();
      const i = items.findIndex((x) => x.id === item.id);
      if (i >= 0) items[i] = item; else items.unshift(item);
      write(key, items);
      return item;
    },
    remove(id) {
      write(key, this.all().filter((x) => x.id !== id));
    },
  };
}

export const songs = collection('songs', DEFAULT_SONGS);
export const tabs = collection('tabs', DEFAULT_TABS);

export const history = {
  all() {
    return read('history', []);
  },
  add(entry) {
    const items = this.all();
    items.unshift({ id: uid(), date: new Date().toISOString(), ...entry });
    write('history', items.slice(0, 300));
  },
  clear() {
    write('history', []);
  },
};
