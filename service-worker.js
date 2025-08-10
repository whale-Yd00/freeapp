const CACHE_NAME = 'whale-llt-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/js/api.js',
  '/lib/db.js',
  '/config/sync-config.js',
  '/utils/promptBuilder.js',
  '/utils/memoryTable.js',
  '/utils/fileStorageManager.js',
  '/utils/imageStorageAPI.js',
  '/utils/imageDisplayHelper.js',
  '/utils/imageMigrationManager.js',
  '/utils/chatEmojiMigrationManager.js',
  '/utils/dataMigrator.js',
  '/utils/announcementManager.js',
  '/utils/characterMemory.js',
  'https://cdn.jsdelivr.net/npm/marked/marked.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      }
    )
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});