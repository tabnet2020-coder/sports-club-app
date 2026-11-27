/* global workbox */
importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.1.0/workbox-sw.js');

const OFFLINE_URL = '/offline.html';
const CACHE_VERSION = 'smart-fitness-club-vite-v2';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll([OFFLINE_URL, '/manifest.json', '/icons/icon-192.webp']))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

if (typeof workbox !== 'undefined') {
  // Never cache IP check APIs
  workbox.routing.registerRoute(
    ({ url }) => url.hostname.includes('ipify.org') || url.hostname.includes('ipwho.is'),
    new workbox.strategies.NetworkOnly()
  );

  // Cache static assets
  workbox.routing.registerRoute(
    ({ request }) => ['style', 'script', 'image', 'font'].includes(request.destination),
    new workbox.strategies.StaleWhileRevalidate({ cacheName: 'sfc-assets-cache' })
  );

  // Navigation with offline.html fallback
  workbox.routing.registerRoute(
    ({ request }) => request.mode === 'navigate',
    async ({ event }) => {
      try {
        return await new workbox.strategies.NetworkFirst({ cacheName: 'sfc-pages-cache' }).handle({
          event
        });
      } catch {
        return caches.match(OFFLINE_URL);
      }
    }
  );
}
