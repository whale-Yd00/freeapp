const CACHE_NAME = 'whale-llt-v11'; // 🔥 重构后新版本
const CACHE_VERSION = Date.now(); // 添加时间戳确保版本唯一性
const FORCE_CACHE_BUST = true; // 🚨 强制清理所有旧缓存
const MIGRATION_KEY = 'cache-migration-v7-unified'; // 🔑 迁移完成标记
const urlsToCache = [
  '/',
  '/index.html',
  '/interact.html',
  '/sync-key-generator.html',
  '/style.css',
  '/script.js',
  '/bubble.html',
  '/manifest.json',
  '/js/api.js',
  '/js/environment-indicator.js',
  '/lib/db.js',
  '/config/sync-config.js',
  '/config/environment-config.js',
  '/utils/UnifiedDBManager.js',
  '/utils/apiConfigManager.js',
  '/utils/characterMemory.js',
  '/utils/chatEmojiMigrationManager.js',
  '/utils/colorUtils.js',
  '/utils/fileStorageExporter.js',
  '/utils/fileStorageImporter.js',
  '/utils/fontLoader.js',
  '/utils/formatUtils.js',
  '/utils/imageDisplayHelper.js',
  '/utils/imageKeywordGenerator.js',
  '/utils/imageMigrationManager.js',
  '/utils/imageStorageAPI.js',
  '/utils/memoryTable.js',
  '/utils/promptBuilder.js',
  '/utils/systemUtilities.js',
  '/utils/uiManager.js',
  '/utils/uiUtils.js',
  '/utils/voiceStorageAPI.js',
  'https://cdn.jsdelivr.net/npm/marked/marked.min.js'
];

self.addEventListener('install', event => {
  console.log('🔥 Service Worker 安装中... (数据库重构版)', CACHE_VERSION);
  event.waitUntil(
    Promise.all([
      // 🗑️ 安装时立即清理所有旧缓存
      FORCE_CACHE_BUST ? 
        caches.keys().then(cacheNames => {
          console.log('🔥 安装时强制清理所有缓存:', cacheNames);
          return Promise.all(cacheNames.map(name => caches.delete(name)));
        }) : 
        Promise.resolve(),
      
      // 📦 重新创建新缓存
      caches.open(CACHE_NAME)
        .then(cache => {
          console.log('📦 缓存已打开，开始缓存资源...');
          return cache.addAll(urlsToCache);
        })
    ])
    .then(() => {
      console.log('✅ 所有资源已缓存，跳过等待...');
      return self.skipWaiting();
    })
    .catch(err => {
      console.error('❌ Service Worker 安装失败:', err);
      throw err;
    })
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
      })
      .catch(error => {
        console.warn('Fetch failed:', event.request.url, error);
        // 对于关键资源失败，返回一个基本的响应
        if (event.request.url.includes('.html') || event.request.url.includes('.js') || event.request.url.includes('.css')) {
          return new Response('', { status: 200, statusText: 'OK' });
        }
        // 对于其他资源，重新抛出错误
        throw error;
      })
  );
});

self.addEventListener('activate', event => {
  console.log('🔥 Service Worker 激活中... (数据库重构版)', CACHE_VERSION);
  event.waitUntil(
    // 检查是否需要执行迁移清理
    caches.open('sw-migration-flags').then(migrationCache => {
      return migrationCache.match(MIGRATION_KEY).then(migrationFlag => {
        const needsMigration = !migrationFlag || FORCE_CACHE_BUST;
        
        if (needsMigration) {
          console.log('🚨 检测到数据库重构，执行强制缓存清理...');
          
          return Promise.all([
            // 1. 强制清理所有旧缓存（包括同名缓存）
            caches.keys().then(cacheNames => {
              console.log('🗑️ 发现缓存:', cacheNames);
              const deletePromises = cacheNames.map(cacheName => {
                if (cacheName !== 'sw-migration-flags') { // 保留迁移标记缓存
                  console.log('🔥 强制删除缓存:', cacheName);
                  return caches.delete(cacheName);
                }
              });
              return Promise.all(deletePromises);
            }),
            
            // 2. 清理所有页面的内存缓存
            self.clients.matchAll().then(clients => {
              console.log('🔄 通知所有页面重新加载 (共', clients.length, '个页面)');
              clients.forEach(client => {
                client.postMessage({
                  type: 'CACHE_BUSTED',
                  message: '数据库重构，强制清理缓存',
                  timestamp: Date.now()
                });
              });
            }),
            
            // 3. 标记迁移完成
            migrationCache.put(MIGRATION_KEY, new Response('migrated', {
              headers: { 'Content-Type': 'text/plain' }
            }))
          ]);
        } else {
          console.log('✅ 缓存迁移已完成，跳过清理');
          return Promise.resolve();
        }
      });
    }).then(() => {
      console.log('✅ Service Worker 激活完成，强制接管所有页面');
      // 立即接管所有页面，不需要等待页面刷新
      return self.clients.claim();
    }).catch(error => {
      console.error('❌ Service Worker 激活失败:', error);
      throw error;
    })
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});