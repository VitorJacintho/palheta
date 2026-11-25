// Service worker: deixa o app funcionando offline depois da primeira visita.
// Ao adicionar um arquivo .js novo ao app, inclua-o em APP_FILES.
// Músicas/tablaturas do catálogo entram sozinhas (lidas de catalog/index.json).
const CACHE = 'palheta-v5';
const APP_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './catalog/index.json',
  './js/audio/chroma.js',
  './js/audio/engine.js',
  './js/audio/yin.js',
  './js/data/legacy.js',
  './js/main.js',
  './js/music/chordShapes.js',
  './js/music/lyrics.js',
  './js/music/songFile.js',
  './js/music/songParser.js',
  './js/music/tabParser.js',
  './js/music/theory.js',
  './js/practice/chordSession.js',
  './js/practice/scoring.js',
  './js/practice/tabSession.js',
  './js/services/library.js',
  './js/services/sound.js',
  './js/services/speech.js',
  './js/services/storage.js',
  './js/ui/editor.js',
  './js/ui/listFilter.js',
  './js/ui/lyricsView.js',
  './js/ui/play.js',
  './js/ui/progress.js',
  './js/ui/results.js',
  './js/ui/tabView.js',
  './js/ui/tuner.js',
  './js/ui/util.js',
];

const fresh = (u) => new Request(u, { cache: 'reload' });

async function precache() {
  const c = await caches.open(CACHE);
  await c.addAll(APP_FILES.map(fresh));
  // catálogo: um arquivo faltando não pode impedir a instalação
  try {
    const index = await (await fetch(fresh('./catalog/index.json'))).json();
    const files = [
      ...(index.songs || []).map((id) => `./catalog/songs/${id}.txt`),
      ...(index.tabs || []).map((id) => `./catalog/tabs/${id}.txt`),
    ];
    await Promise.all(files.map((f) => c.add(fresh(f)).catch(() => {})));
  } catch { /* sem catálogo offline por enquanto */ }
}

self.addEventListener('install', (e) => {
  e.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Rede primeiro (pega atualizações), cache como reserva offline.
// `no-cache` faz o navegador confirmar com o servidor se o arquivo mudou
// (o GitHub Pages manda guardar por 10 min), então atualizações chegam na hora.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request.url, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request.url, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))),
  );
});
