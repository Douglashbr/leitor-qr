/* Service worker do Leitor de QR: deixa o app funcionando offline
   e recebe imagens compartilhadas pelo Android (Web Share Target). */
const VERSION = 'qr-v1.1';
const JSQR = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
const LOCAL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(LOCAL);
    try {
      const r = await fetch(JSQR, { mode: 'cors' });
      if (r.ok) await cache.put(JSQR, r);
    } catch (e) { /* tenta de novo no primeiro uso */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION && k !== 'qr-shared').map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Imagem compartilhada a partir da galeria (Android)
  if (req.method === 'POST' && url.pathname.endsWith('/share-target')) {
    event.respondWith((async () => {
      let n = 0;
      try {
        const data = await req.formData();
        const files = data.getAll('image').filter(f => f && f.size);
        const cache = await caches.open('qr-shared');
        for (const f of files.slice(0, 10)) {
          await cache.put('shared/' + n, new Response(f, { headers: { 'Content-Type': f.type || 'image/png' } }));
          n++;
        }
      } catch (e) {}
      return Response.redirect('./?shared=' + n, 303);
    })());
    return;
  }

  if (req.method !== 'GET') return;

  // Páginas: tenta a rede primeiro (pega atualizações), cai no cache se estiver offline
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(VERSION);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (e) {
        return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Demais arquivos (biblioteca, fontes, ícones): cache primeiro
  const cacheable = url.origin === location.origin ||
    url.hostname === 'cdn.jsdelivr.net' ||
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com';
  if (!cacheable) return;

  event.respondWith((async () => {
    const hit = await caches.match(req.url);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') {
        const cache = await caches.open(VERSION);
        cache.put(req.url, res.clone());
      }
      return res;
    } catch (e) {
      return Response.error();
    }
  })());
});
