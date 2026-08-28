/*
 * Kodukeel's service worker.
 *
 * Scope, deliberately narrow: keep the app *openable* without a connection, so
 * a review session can start on a bus. It is not a sync engine — grades made
 * offline are held by lib/offline/queue.ts in localStorage and replayed by the
 * page itself, because replaying a Server Action from a worker would mean
 * duplicating auth, ordering and conflict handling out here where none of it
 * can be tested.
 *
 * Two rules keep this from ever serving something wrong:
 *
 * 1. **Only GETs are touched.** Every mutation in this app is a POST (Server
 *    Actions and Route Handlers), and a cached mutation is a corrupted deck.
 * 2. **Navigations are network-first.** The cache is a fallback for when the
 *    network fails, never a faster stale answer — a flashcard app that shows
 *    yesterday's due count because it felt quicker is worse than a slow one.
 */

const VERSION = "kodukeel-v1";
const SHELL = `${VERSION}-shell`;
const PAGES = `${VERSION}-pages`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll([OFFLINE_URL, "/app-icon.svg"])).catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Audio is proxied through /api/tts and is worth keeping: the same word is
  // pronounced over and over, and it is a POST — so it is excluded above and
  // handled by the page's own in-memory cache instead. Everything else under
  // /api/ is live data and must never be served stale.
  if (url.pathname.startsWith("/api/")) return;

  // Build output is immutable and hashed: cache-first is safe and makes a
  // repeat visit instant.
  if (url.pathname.startsWith("/_next/static/") || url.pathname === "/app-icon.svg") {
    event.respondWith(
      caches.match(request).then((hit) =>
        hit ?? fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(SHELL).then((cache) => cache.put(request, copy)).catch(() => undefined);
          return response;
        }),
      ),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(PAGES).then((cache) => cache.put(request, copy)).catch(() => undefined);
          return response;
        })
        .catch(async () =>
          (await caches.match(request)) ??
          (await caches.match(OFFLINE_URL)) ??
          new Response("Offline", { status: 503, headers: { "content-type": "text/plain" } }),
        ),
    );
  }
});
