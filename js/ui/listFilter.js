// Busca e filtros (nível / minhas) para as listas de músicas e tablaturas.
import { LEVEL_LABEL } from '../music/songFile.js';
import { esc } from './util.js';

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const FILTERS = [
  { id: '', label: 'Todas' },
  { id: 'iniciante', label: LEVEL_LABEL.iniciante },
  { id: 'intermediario', label: LEVEL_LABEL.intermediario },
  { id: 'avancado', label: LEVEL_LABEL.avancado },
  { id: 'mine', label: 'Minhas' },
];

/**
 * Liga a caixa de busca e os botões de filtro de um container.
 * Retorna { apply(items) } — filtra e ordena conforme o estado atual.
 */
export function createListFilter(container, onChange, storageKey) {
  const input = container.querySelector('.search');
  const chipsBox = container.querySelector('.filter-chips');
  let state = { q: '', level: '' };
  try { state = { ...state, ...JSON.parse(sessionStorage.getItem(storageKey) || '{}') }; } catch { /* opcional */ }
  input.value = state.q;

  const save = () => { try { sessionStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* opcional */ } };

  function renderChips(counts = {}) {
    chipsBox.innerHTML = FILTERS.map((f) => `
      <button type="button" data-f="${f.id}" class="${state.level === f.id ? 'on' : ''}">
        ${esc(f.label)}${counts[f.id] != null ? ` <small>${counts[f.id]}</small>` : ''}
      </button>`).join('');
    chipsBox.querySelectorAll('button').forEach((b) => (b.onclick = () => {
      state.level = b.dataset.f;
      save();
      onChange();
    }));
  }

  input.addEventListener('input', () => { state.q = input.value; save(); onChange(); });

  return {
    apply(items) {
      const terms = norm(state.q).split(/\s+/).filter(Boolean);
      const byText = items.filter((it) => {
        if (!terms.length) return true;
        const hay = norm([it.title, it.artist, it.key, ...(it.tags || [])].join(' '));
        return terms.every((t) => hay.includes(t));
      });
      const counts = { '': byText.length, mine: byText.filter((i) => i.source === 'user').length };
      ['iniciante', 'intermediario', 'avancado'].forEach((l) => { counts[l] = byText.filter((i) => (i.level || 'iniciante') === l).length; });
      renderChips(counts);
      return byText.filter((it) => {
        if (!state.level) return true;
        if (state.level === 'mine') return it.source === 'user';
        return (it.level || 'iniciante') === state.level;
      });
    },
    get active() { return !!(state.q || state.level); },
  };
}

export function metaTags(item, { showSource = true } = {}) {
  const tags = [];
  const lv = item.level || 'iniciante';
  tags.push(`<span class="lv-${lv}">${LEVEL_LABEL[lv]}</span>`);
  if (item.key) tags.push(`<span>Tom: ${esc(item.key)}</span>`);
  if (item.capo) tags.push(`<span>Capo na ${item.capo}ª casa</span>`);
  if (item.tuning && item.tuning !== 'padrao') tags.push(`<span>Afinação: ${esc(item.tuning)}</span>`);
  (item.tags || []).slice(0, 4).forEach((t) => tags.push(`<span>${esc(t)}</span>`));
  if (showSource) tags.push(`<span>${item.source === 'user' ? 'Minha' : 'Catálogo'}</span>`);
  return tags.join('');
}
