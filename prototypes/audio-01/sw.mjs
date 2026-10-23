const base = new URL('./', self.location.href)
const shell = ['', 'app.mjs', 'audio.mjs', 'storage.mjs'].map(
  (name) => new URL(name, base).href,
)
const cacheName = `auditorium-audio-01-shell-v1:${base.pathname}`
self.addEventListener('install', (event) =>
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(shell))),
)
self.addEventListener('activate', (event) =>
  event.waitUntil(self.clients.claim()),
)
self.addEventListener('fetch', (event) => {
  if (event.request.method === 'GET' && shell.includes(event.request.url))
    event.respondWith(
      caches
        .open(cacheName)
        .then((cache) =>
          cache
            .match(event.request)
            .then((response) => response || fetch(event.request)),
        ),
    )
})
