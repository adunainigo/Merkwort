// Service worker: "cache first" para todos los archivos de la app.
// PARA PUBLICAR UNA ACTUALIZACIÓN: sube el número de versión de CACHE (v1 → v2 …).
const CACHE = 'vokabeln-v2';

const ARCHIVOS = [
  './',
  'index.html',
  'manifest.json',
  'css/styles.css',
  'js/app.js',
  'js/ui.js',
  'js/modelo.js',
  'js/db.js',
  'js/srs.js',
  'js/scheduler.js',
  'js/history.js',
  'js/challenges.js',
  'js/stats.js',
  'js/import.js',
  'js/niveles.js',
  'js/relaciones.js',
  'js/games/sesion.js',
  'js/games/tarjetas.js',
  'js/games/test.js',
  'js/games/escribir.js',
  'js/games/articulos.js',
  'js/games/contrarreloj.js',
  'js/games/verbos.js',
  'js/games/refuerzo.js',
  'js/games/relaciones.js',
  'js/vistas/inicio.js',
  'js/vistas/jugar.js',
  'js/vistas/biblioteca.js',
  'js/vistas/ficha.js',
  'js/vistas/estadisticas.js',
  'js/vistas/ajustes.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'data/vokabeln.json',
  'data/relaciones.json',
];

self.addEventListener('install', (ev) => {
  // `cache: 'reload'` evita que la caché HTTP del navegador sirva archivos antiguos.
  ev.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ARCHIVOS.map((u) => new Request(u, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k.startsWith('vokabeln-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// La página avisa cuando el usuario toca "recargar" para activar la versión nueva.
self.addEventListener('message', (ev) => {
  if (ev.data === 'activar') self.skipWaiting();
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  ev.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const guardado = await cache.match(req, { ignoreSearch: true });
      if (guardado) return guardado;
      try {
        return await fetch(req);
      } catch (e) {
        if (req.mode === 'navigate') return cache.match('index.html');
        throw e;
      }
    }),
  );
});
