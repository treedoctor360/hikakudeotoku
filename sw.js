// ══════════════════════════════════════════
// お買い物比較 - Service Worker
// オフライン対応・キャッシュ管理
// ══════════════════════════════════════════

const CACHE_NAME = 'okaimono-hikaku-v3-1';

// キャッシュするファイル一覧
const CACHE_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

// ── インストール時：キャッシュに保存 ──
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] キャッシュ作成:', CACHE_NAME);
      return cache.addAll(CACHE_FILES);
    })
  );
  // 即座に有効化（古いSWを待たずに起動）
  self.skipWaiting();
});

// ── アクティベート時：古いキャッシュを削除 ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] 古いキャッシュ削除:', key);
            return caches.delete(key);
          })
      )
    )
  );
  // 全クライアントを即座に制御下に置く
  self.clients.claim();
});

// ── フェッチ時：キャッシュ優先 → ネットワーク ──
// GASへのリクエスト（script.google.com）はキャッシュしない
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // GAS・外部APIへのリクエストはそのままネットワークへ
  if (url.hostname.includes('google.com') ||
      url.hostname.includes('googleapis.com') ||
      url.hostname.includes('fonts.g')) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) {
        // キャッシュがあれば返す（オフラインでも動作）
        return cached;
      }
      // キャッシュになければネットワークから取得してキャッシュに追加
      return fetch(e.request).then(response => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const toCache = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, toCache));
        return response;
      });
    })
  );
});
