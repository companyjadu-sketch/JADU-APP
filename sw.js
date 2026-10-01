// Service Worker لتطبيق جادو — تثبيت كتطبيق + عمل بدون إنترنت
// ملاحظة: بيانات الأصناف (الشيت) وبيانات الإدارة (Firestore) تُجلب دائمًا من الشبكة
// مباشرة من كود الصفحة نفسها (مع نسخة احتياطية محليًا عبر localStorage)،
// هذا الملف مسؤول فقط عن تخزين "هيكل" التطبيق (الصفحة، الصور، المكتبات) عشان يفتح بدون إنترنت.

const CACHE_NAME = 'jadu-app-v1';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './jadu-logo.png',
  './jadu-intro-poster.jpg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_ASSETS))
      .catch(err => console.warn('تعذّر تخزين بعض ملفات التطبيق الأساسية', err))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // طلب فتح الصفحة نفسها: جرّب الشبكة أول (عشان آخر تحديث)، ولو ما فيه إنترنت ارجع للنسخة المخزنة
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // باقي الملفات (صور، خطوط، مكتبات JS الخارجية): كاش أول لسرعة فورية، وتحديث بالخلفية
  event.respondWith(
    caches.match(req).then(cached => {
      const networkFetch = fetch(req)
        .then(res => {
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
