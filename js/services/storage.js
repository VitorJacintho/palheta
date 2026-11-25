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

// Itens padrão da primeira versão (antes de existir o controle de "já oferecidos").
const LEGACY_DEFAULT_IDS = ['ex-gcd', 'ex-pop', 'ex-blues', 'ex-menores', 'ex-cifra', 'tab-penta', 'tab-crom', 'tab-maior', 'tab-lick'];

function collection(key, defaults) {
  const seededKey = key + ':seeded';
  return {
    all() {
      let items = read(key, null);
      if (items === null) {
        write(key, defaults);
        write(seededKey, defaults.map((d) => d.id));
        return structuredClone(defaults);
      }
      // Músicas padrão novas (de atualizações do app) entram na lista uma única vez;
      // se o usuário excluir, não voltam.
      const seeded = new Set(read(seededKey, null) ?? [...LEGACY_DEFAULT_IDS, ...items.map((x) => x.id)]);
      const fresh = defaults.filter((d) => !seeded.has(d.id) && !items.some((x) => x.id === d.id));
      if (fresh.length || read(seededKey, null) === null) {
        items = [...structuredClone(fresh), ...items];
        fresh.forEach((d) => seeded.add(d.id));
        write(key, items);
        write(seededKey, [...seeded]);
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
