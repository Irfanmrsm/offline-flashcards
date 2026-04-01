const CACHE_NAME = "flashcards-cache-v1";

const urlsToCache = [
  "/flashcards-sync-app/",
  "/flashcards-sync-app/index.html",
  "/flashcards-sync-app/app.js",
  "/flashcards-sync-app/database.js",
  "/flashcards-sync-app/main.css",
  "/flashcards-sync-app/dexie.js"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener("fetch", e => {
  e.respondWith(
    caches.match(e.request).then(res => res || fetch(e.request))
  );
});