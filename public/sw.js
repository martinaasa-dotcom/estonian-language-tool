/*
 * Kodukeel's service worker.
 *
 * Scope, deliberately narrow: keep the app *openable* without a connection, so
 * a review session can start on a bus. It does not try to make the whole app
 * work offline — the dictionary needs Ekilex and the tutor needs a provider, and
 * pretending otherwise would serve convincing stale pages.
 *
 * It is not a sync engine either. Grades made offline are held in IndexedDB by
 * lib/offline/db.ts and replayed by the page through a Server Action, because
 * replaying one from a worker would mean duplicating auth, ordering and
 * idempotency out here where none of it can be tested.
 *
 * Three rules keep this from ever serving something wrong:
 *
 * 1. **Only GETs are cached.** Every mutation in this app is a POST (Server
 *    Actions and Route Handlers), and a cached mutation is a corrupted deck.
 *    The one exception is /api/tts, handled explicitly below.
 * 2. **Navigations are network-first.** The cache is a fallback for when the
 *    network fails, never a faster stale answer — a flashcard app that shows
 *    yesterday's due count because it felt quicker is worse than a slow one.
 * 3. **Nothing under /api/ is cached** except that speech, which is immutable.
 */

const VERSION = "kodukeel-v2";
const SHELL = `${VERSION}-shell`;
const PAGES = `${VERSION}-pages`;
const AUDIO = `${VERSION}-audio`;

/** The page shown when a navigation cannot be served any other way. */
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((cache) => cache.addAll([OFFLINE_URL, "/app-icon.svg"]))
      .catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith("kodukeel-") && !k.startsWith(VERSION))
          .map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

const isAudio = (url) => url.pathname === "/api/tts";

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Pronunciation never changes, so a clip heard once is available for good.
  // This is the only POST the worker touches, and it is safe because it is a
  // read dressed as a POST — it changes nothing.
  if (isAudio(url) && request.method === "POST") {
    event.respondWith(audioWithCache(request));
    return;
  }

  if (request.method !== "GET") return;

  // Everything else under /api/ is live data and must never be served stale.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  // Build output is immutable and hashed: cache-first is safe and makes a
  // repeat visit instant.
  if (url.pathname.startsWith("/_next/static/") || url.pathname === "/app-icon.svg") {
    event.respondWith(cacheFirst(request, SHELL));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(navigateWithFallback(request));
  }
});

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const copy = response.clone();
    caches.open(cacheName).then((cache) => cache.put(request, copy)).catch(() => undefined);
  }
  return response;
}

/**
 * The TTS route is a POST, which the Cache API cannot key on, so the request
 * body becomes part of the key. Same phrase, same clip.
 */
async function audioWithCache(request) {
  let key;
  try {
    key = new Request(`${request.url}?k=${encodeURIComponent(await request.clone().text())}`);
  } catch {
    return fetch(request);
  }

  const cached = await caches.match(key);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const copy = response.clone();
      caches.open(AUDIO).then((cache) => cache.put(key, copy)).catch(() => undefined);
    }
    return response;
  } catch {
    return new Response(
      JSON.stringify({ error: "Offline — that word has not been heard yet." }),
      { status: 503, headers: { "content-type": "application/json" } },
    );
  }
}

/**
 * Network first for pages: a review session is about what is due *now*, so a
 * cached copy is only ever a fallback, never a preference.
 *
 * The cached copy of /review is stale by definition, which is why the app
 * reloads its queue from IndexedDB on mount rather than trusting the HTML it
 * was served.
 */
async function navigateWithFallback(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const copy = response.clone();
      caches.open(PAGES).then((cache) => cache.put(request, copy)).catch(() => undefined);
    }
    return response;
  } catch {
    return (
      (await caches.match(request)) ??
      (await caches.match(OFFLINE_URL)) ??
      new Response("Offline", { status: 503, headers: { "content-type": "text/plain" } })
    );
  }
}
