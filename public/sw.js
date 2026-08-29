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

/**
 * One at a time rather than `addAll`, which is atomic: a single URL that
 * cannot be fetched throws away the whole batch, and the offline page is in
 * this batch. Losing the icon costs an icon; losing /offline costs the
 * fallback itself, which is the one thing in here that has no fallback.
 */
function cacheEach(cache, urls) {
  return Promise.all(urls.map((url) => cache.add(url).catch(() => undefined)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cacheEach(cache, SHELL_URLS)).catch(() => undefined),
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
      .then(() => self.clients.claim())
      .then(() => warmOpenPages()),
  );
});

/**
 * Cache the pages that are already open the moment this worker takes over.
 *
 * WITHOUT THIS THE FALLBACK IS EMPTY FOR EXACTLY THE PERSON IT EXISTS FOR.
 * `navigateWithFallback` fills the page cache as a side effect of serving a
 * navigation, and a worker does not serve the navigation that installed it: on
 * a first visit the page is fetched, the worker installs behind it, and
 * `clients.claim()` takes over a client whose own page was never seen. Go
 * offline and reload at that point and there is nothing to match, so the
 * fallback goes to /offline. Someone who opened the app for the first time on
 * the way to the bus stop got the "you need a connection" screen for the whole
 * journey, and the second journey worked, which is the worst possible shape for
 * a bug to have.
 *
 * Every open window rather than a hardcoded /review, because the rule is "the
 * page you were last on opens again", not "one route is special". Failures are
 * swallowed per client: this is a warm-up, and a page that will not fetch is
 * exactly the page that has nothing to cache anyway.
 */
async function warmOpenPages() {
  try {
    const [cache, clients] = await Promise.all([
      caches.open(PAGES),
      self.clients.matchAll({ type: "window", includeUncontrolled: true }),
    ]);
    await Promise.all(clients.map(async (client) => {
      const url = new URL(client.url);
      if (url.origin !== self.location.origin) return;
      if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;
      await cache.add(new Request(url.href, { credentials: "same-origin" })).catch(() => undefined);
    }));
  } catch {
    // A warm-up that cannot run leaves the worker exactly as it was.
  }
}

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
