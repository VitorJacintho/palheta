// Persistência local (localStorage): músicas/tablaturas do usuário, durações
// gravadas para músicas do catálogo, histórico e ajustes.
// As músicas do catálogo NÃO ficam aqui — vêm sempre de /catalog (ver library.js).
import { LEGACY_SONGS, LEGACY_TABS } from '../data/legacy.js';

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

function remove(key) {
  try { localStorage.removeItem(PREFIX + key); } catch { /* ignora */ }
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

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function userCollection(key) {
  return {
    all() {
      return read(key, []);
    },
    get(id) {
      return this.all().find((x) => x.id === id) || null;
    },
    save(item) {
      const items = this.all();
      if (!item.id) item.id = 'u-' + uid();
      const { source, ...clean } = item; // "source" é calculado, não salvo
      const i = items.findIndex((x) => x.id === clean.id);
      if (i >= 0) items[i] = clean; else items.unshift(clean);
      write(key, items);
      return clean;
    },
    remove(id) {
      write(key, this.all().filter((x) => x.id !== id));
    },
  };
}

export const userSongs = userCollection('songs');
export const userTabs = userCollection('tabs');

/** Ajustes pessoais em músicas do catálogo (ex.: durações gravadas tocando). */
export const overrides = {
  get(id) {
    return read('overrides', {})[id] || null;
  },
  set(id, patch) {
    const all = read('overrides', {});
    all[id] = { ...(all[id] || {}), ...patch };
    write('overrides', all);
  },
  clear(id, field) {
    const all = read('overrides', {});
    if (!all[id]) return;
    if (field) delete all[id][field]; else delete all[id];
    if (all[id] && !Object.keys(all[id]).length) delete all[id];
    write('overrides', all);
  },
};

/**
 * Instalações antigas (v1/v2) guardavam cópias das músicas padrão no aparelho.
 * Agora o catálogo fornece essas músicas: cópias intactas são removidas,
 * cópias que o usuário editou viram músicas dele ("minha versão").
 */
export function migrateLegacy(catalogIds) {
  if (read('migrated', 0) >= 3) return;
  const ids = new Set(catalogIds);
  const fix = (key, legacy, field) => {
    const items = read(key, null);
    if (!items) return;
    const byId = new Map(legacy.map((x) => [x.id, x]));
    const out = [];
    for (const it of items) {
      const orig = byId.get(it.id);
      const same = orig && orig.title === it.title && (orig[field] || '') === (it[field] || '') && orig.bpm === it.bpm;
      if (same) continue;
      if (orig || ids.has(it.id)) out.push({ ...it, id: it.id + '-minha', title: `${it.title} (minha versão)` });
      else out.push(it);
    }
    write(key, out);
  };
  fix('songs', LEGACY_SONGS, 'chords');
  fix('tabs', LEGACY_TABS, 'tab');
  remove('songs:seeded');
  remove('tabs:seeded');
  write('migrated', 3);
}

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
