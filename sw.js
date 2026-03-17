// sw.js
const CACHE_NAME = 'flashcard-cache-v1';

// The exact files we want to save to the phone's hard drive
const urlsToCache = [
    './',
    './index.html',
    './styles/main.css',
    './src/database.js',
    './src/app.js',
    'https://unpkg.com/dexie/dist/dexie.js'
];

// 1. Install Event: Save the files to the cache
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache and saving files...');
                return cache.addAll(urlsToCache);
            })
    );
});

// 2. Fetch Event: Intercept network requests
self.addEventListener('fetch', event => {
    // IMPORTANT: We never want to cache the sync.php API call!
    // We only want that to run when we have a real network connection.
    if (event.request.url.includes('sync.php')) {
        return; 
    }

    // For all other files (HTML, CSS, JS), check the cache first.
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // If the file is in the cache, return it instantly.
                // Otherwise, try to fetch it from the network.
                return response || fetch(event.request);
            })
    );
});