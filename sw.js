/* Web de ligas: funciona sin conexión con los últimos datos descargados. */
const CACHE = 'ligas-v11';
const BASE = ['./', 'index.html', 'liga.css', 'liga.js', 'icono.svg', 'logo-f5.png', 'logo-fs1.png', 'logo-fs2.png', 'manifest.webmanifest', 'liga-core.js', 'logo.png', 'fuentes/montserrat-500.woff2', 'fuentes/montserrat-600.woff2', 'fuentes/montserrat-700.woff2', 'fuentes/montserrat-800.woff2'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) =>
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('ligas-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
);
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const esDatos = /\/data\/liga\.json$/.test(new URL(req.url).pathname);
  if (req.method !== 'GET' || (new URL(req.url).origin !== location.origin && !esDatos)) return;
  const clave = req.url.split('?')[0];
  e.respondWith(
    (req.mode === 'navigate' ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(req, { cache: 'no-cache' }))
      .then((r) => {
        if (r.ok) {
          const copia = r.clone();
          caches.open(CACHE).then((c) => c.put(clave, copia));
        }
        return r;
      })
      .catch(() => caches.match(clave).then((r) => r || caches.match(new URL('index.html', self.registration.scope).href)))
  );
});
