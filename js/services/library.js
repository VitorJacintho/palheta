// Biblioteca = catálogo (arquivos em /catalog, sempre atualizado) + itens do usuário.
import { songFromFile, tabFromFile } from '../music/songFile.js';
import { userSongs, userTabs, overrides, migrateLegacy } from './storage.js';

const CATALOG_URL = new URL('../../catalog/', import.meta.url);

let catalog = { songs: [], tabs: [], errors: [] };

async function fetchText(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${r.status} em ${url}`);
  return r.text();
}

/** Carrega o índice e todos os arquivos do catálogo. */
export async function loadCatalog() {
  const errors = [];
  let index = { songs: [], tabs: [] };
  try {
    index = JSON.parse(await fetchText(new URL('index.json', CATALOG_URL)));
  } catch (e) {
    errors.push('Não foi possível carregar o catálogo: ' + e.message);
  }
  const load = (ids, folder, fromFile) => Promise.all((ids || []).map(async (id) => {
    try {
      return { ...fromFile(id, await fetchText(new URL(`${folder}/${id}.txt`, CATALOG_URL))), source: 'catalog' };
    } catch (e) {
      errors.push(`${folder}/${id}: ${e.message}`);
      return null;
    }
  }));
  const [songs, tabs] = await Promise.all([load(index.songs, 'songs', songFromFile), load(index.tabs, 'tabs', tabFromFile)]);
  catalog = { songs: songs.filter(Boolean), tabs: tabs.filter(Boolean), errors };
  // só limpa cópias antigas quando o catálogo realmente carregou (senão sumiriam offline)
  if (catalog.songs.length) migrateLegacy([...catalog.songs, ...catalog.tabs].map((x) => x.id));
  return catalog;
}

export const library = {
  catalogErrors: () => catalog.errors,
  songs() {
    return [
      ...userSongs.all().map((s) => ({ ...s, source: 'user' })),
      ...catalog.songs.map((s) => ({ ...s, ...(overrides.get(s.id) || {}) })),
    ];
  },
  song(id) {
    return this.songs().find((s) => s.id === id) || null;
  },
  tabs() {
    return [...userTabs.all().map((t) => ({ ...t, source: 'user' })), ...catalog.tabs];
  },
  tab(id) {
    return this.tabs().find((t) => t.id === id) || null;
  },
  /** Salva durações gravadas: na própria música (do usuário) ou como ajuste (catálogo). */
  saveDurations(song, durations, bpm) {
    if (song.source === 'catalog') overrides.set(song.id, { durations, bpm });
    else userSongs.save({ ...song, durations, bpm });
  },
  clearDurations(song) {
    if (song.source === 'catalog') overrides.clear(song.id);
    else {
      const { durations, ...rest } = song;
      userSongs.save(rest);
    }
  },
  /** Música do catálogo tem durações gravadas pelo usuário? */
  hasOwnRecording(song) {
    return song.source === 'catalog' ? !!overrides.get(song.id)?.durations : !!song.durations?.length;
  },
};
