/**
 * Service worker for offline review.
 *
 * Scope is deliberately narrow. This does not try to make the whole app work
 * without a network — the dictionary needs Ekilex and the tutor needs a
 * provider, and pretending otherwise would just produce convincing stale pages.
 * It makes *review* work, because review is the daily path and the one thing
 * CLAUDE.md requires to survive a lost connection.
 *
 * Grades are not synced here. They go to an IndexedDB outbox that the app
 * replays through a server action (see lib/offline/), which keeps the
 * append-only Review write on the one code path that understands FSRS.
 */

const VERSION = "v1";
const SHELL = `kodukeel-shell-${VERSION}`;
const ASSETS = `kodukeel-assets-${VERSION}`;
const AUDIO = `kodukeel-audio-${VERSION}`;

/** The page shown when a navigation cannot be served any other way. */
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((cache) => cache.addAll([OFFLINE_URL, "/manifest.webmanifest"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((n) => n.startsWith("kodukeel-") && ![SHELL, ASSETS, AUDIO].includes(n))
          .map((n) => caches.delete(n)),
      ))
      .then(() => self.clients.claim()),
  );
});

/** Immutable build output — safe to serve from cache forever. */
const isBuildAsset = (url) =>
  url.pathname.startsWith("/_next/static/") || url.pathname === "/icon.svg";

const isAudio = (url) => url.pathname === "/api/tts";

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" && !isAudio(new URL(request.url))) return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache a server action, an auth exchange, or the tutor stream.
  if (url.pathname.startsWith("/auth/") || url.pathname === "/api/tutor") return;

  if (isBuildAsset(url)) {
    event.respondWith(cacheFirst(request, ASSETS));
    return;
  }

  // Pronunciation never changes, so a clip heard once is available for good.
  if (isAudio(url) && request.method === "POST") {
    event.respondWith(audioWithCache(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(navigateWithFallback(request));
  }
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

/**
 * The TTS route is a POST, which the Cache API cannot key on directly, so the
 * request body becomes the key. Same phrase, same clip.
 */
async function audioWithCache(request) {
  let key;
  try {
    key = new Request(`${request.url}?k=${encodeURIComponent(await request.clone().text())}`);
  } catch {
    return fetch(request);
  }

  const cache = await caches.open(AUDIO);
  const hit = await cache.match(key);
  if (hit) return hit;

  try {
    const response = await fetch(request);
    if (response.ok) cache.put(key, response.clone());
    return response;
  } catch (error) {
    return new Response(JSON.stringify({ error: "Offline — that word has not been heard yet." }), {
      status: 503, headers: { "content-type": "application/json" },
    });
  }
}

/**
 * Network first for pages: a review session is about what is due *now*, so a
 * cached copy is only ever a fallback, never a preference.
 *
 * The cached copy is the last successfully loaded /review page. Its card list is
 * stale by definition, which is why the app reloads the queue from IndexedDB on
 * mount rather than trusting the HTML it was served.
 */
async function navigateWithFallback(request) {
  const url = new URL(request.url);
  try {
    const response = await fetch(request);
    if (response.ok && url.pathname.startsWith("/review")) {
      const cache = await caches.open(SHELL);
      cache.put("/review", response.clone());
    }
    return response;
  } catch {
    if (url.pathname.startsWith("/review")) {
      const cached = await caches.match("/review");
      if (cached) return cached;
    }
    const offline = await caches.match(OFFLINE_URL);
    return offline ?? Response.error();
  }
}
