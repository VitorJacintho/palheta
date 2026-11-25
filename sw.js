// Service worker: deixa o app funcionando offline depois da primeira visita.
const CACHE = 'palheta-v3';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './js/main.js',
  './js/audio/engine.js',
  './js/audio/yin.js',
  './js/audio/chroma.js',
  './js/music/theory.js',
  './js/music/songParser.js',
  './js/music/tabParser.js',
  './js/music/chordShapes.js',
  './js/data/defaults.js',
  './js/practice/scoring.js',
  './js/practice/chordSession.js',
  './js/practice/tabSession.js',
  './js/services/storage.js',
  './js/services/speech.js',
  './js/services/sound.js',
  './js/ui/util.js',
  './js/ui/tuner.js',
  './js/ui/play.js',
  './js/ui/tabView.js',
  './js/ui/results.js',
  './js/ui/editor.js',
  './js/ui/progress.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
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
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))),
  );
});
