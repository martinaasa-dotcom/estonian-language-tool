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

/** Files with no session in them, needed whatever happens. */
const SHELL_URLS = [OFFLINE_URL, "/app-icon.svg"];

/*
  THE DAILY PATH, WARMED AT INSTALL, BECAUSE OTHERWISE IT IS WARMED BY LUCK.

  The page cache below fills as a side effect of a navigation the worker
  intercepts. The first navigation to a page is never one of those: the worker
  installs *during* it, so it is not controlling the client yet and does not
  see it. The page is therefore cached on the second online visit and not the
  first, and nothing in the app guarantees a second visit.

  Which made the offline promise conditional in exactly the case it is for.
  Install the app, open review, get on the bus: the worker is installed, the
  cache is empty, and /review answers with the offline screen. Measured, not
  reasoned about. After one visit the page cache held nothing; after two it
  held /review, and the same reload that had shown the offline screen showed
  the session.

  So the two pages a review session starts from are fetched at install. They
  are stale the moment they are stored, which is fine and is already the
  design: the cached copy of /review is a shell, and the queue is rebuilt from
  IndexedDB on mount rather than read out of the HTML.
*/
const WARM_URLS = ["/", "/review"];

/**
 * One at a time rather than `addAll`, which is atomic: a single URL that
 * cannot be fetched would throw away the whole batch, and the offline page is
 * in that batch. A warm page that does not arrive costs a slower first
 * offline session; the offline page not arriving costs the fallback itself.
 */
function cacheEach(cache, urls) {
  return Promise.all(urls.map((url) => cache.add(url).catch(() => undefined)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(SHELL).then((cache) => cacheEach(cache, SHELL_URLS)),
      caches.open(PAGES).then((cache) => cacheEach(cache, WARM_URLS)),
    ]).catch(() => undefined),
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
