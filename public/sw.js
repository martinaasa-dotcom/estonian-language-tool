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
 *
 * And a fourth, learned one layer up and not applied here until now:
 *
 * 4. **Every cache is bounded.** `lib/audio/clipCache.ts` exists because a
 *    cache that never evicts is a leak with a hit rate, and both caches down
 *    here had exactly that shape. Speech is a WAV per phrase and review plays
 *    audio on nearly every card, so a phone kept every clip it had ever heard;
 *    the shell cache is worse, because `_next/static` filenames are hashed per
 *    build and `VERSION` is typed by hand, so every deploy added a fresh set of
 *    chunks under the same cache name and nothing ever removed the old ones.
 *    Neither had a ceiling, and when storage for the origin is finally
 *    evicted the browser takes the whole thing, including /offline, which is
 *    the one entry with no fallback of its own.
 */

/*
  Bumped to v3 so `activate` clears what v2 accumulated.

  `activate` deletes every `kodukeel-` cache that is not this version's, which
  is the only thing that has ever removed a stale entry here — and since the
  version is typed by hand and had not changed across many deploys, an install
  that had been running for months was carrying every hashed chunk of every
  build it had ever seen and every clip it had ever played. The ceilings below
  stop that happening again; this bump is what clears the arrears.
*/
const VERSION = "kodukeel-v4";
/*
  Four caches, and the split between the first two is the point of it.

  SHELL is /offline and the app icon: two entries, never trimmed, because
  /offline is the fallback that has no fallback and evicting it turns a
  connection failure into a browser error page. STATIC is hashed build output,
  which is exactly what grows without limit, so that is where the ceiling
  goes. Putting both in one cache and trimming it would eventually evict the
  offline page to make room for a chunk.
*/
const SHELL = `${VERSION}-shell`;
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const AUDIO = `${VERSION}-audio`;

/** The page shown when a navigation cannot be served any other way. */
const OFFLINE_URL = "/offline";

/*
  Ceilings, in entries.

  Counted rather than measured in bytes, for the reason `clipCache.ts` gives:
  a count is a bound a person can check, and the Cache API will not tell you
  what an entry costs without reading it back.

  Audio: a long review session meets a few hundred distinct phrases, and a
  clip heard once a month ago is not one anybody is about to ask for again.
  Static: one build of this app is well under a hundred chunks, so this is
  roughly the current build plus the one before it, which is what makes a
  deploy landing mid-session survivable.
  Pages: this app has forty-five routes and nobody has all of them open.

  SHELL is deliberately absent, and absent means never trimmed rather than
  trimmed at some large number. It holds /offline.
*/
const LIMITS = { [AUDIO]: 400, [STATIC]: 220, [PAGES]: 60 };

/*
  Trim to the ceiling, oldest first.

  `cache.keys()` returns entries in insertion order, so the oldest write is the
  first key. That is a first-in-first-out rather than a true least-recently-
  used: the Cache API has no way to record a read, and re-putting an entry on
  every hit would turn a cache lookup into a cache write on the busiest path in
  the app. FIFO over a ceiling this size costs an occasional re-fetch of
  something old and saves the unbounded growth, which is the trade the ceiling
  is for.

  Failures are swallowed: a trim that cannot run leaves a cache that is too big,
  which is the state it was already in, and never a request that fails.
*/
async function trim(cacheName) {
  const limit = LIMITS[cacheName];
  if (!limit) return;
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    for (let i = 0; i < keys.length - limit; i++) await cache.delete(keys[i]);
  } catch {
    // Nothing to recover from and nothing worth failing a fetch over.
  }
}

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
    await trim(PAGES);
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
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, STATIC));
    return;
  }
  if (url.pathname === "/app-icon.svg") {
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
    caches.open(cacheName)
      .then((cache) => cache.put(request, copy))
      .then(() => trim(cacheName))
      .catch(() => undefined);
  }
  return response;
}

/**
 * The TTS route is a POST, which the Cache API cannot key on, so the request
 * body becomes part of the key. Same phrase, same clip.
 *
 * This is where speech is actually cached across page loads, and it is worth
 * saying so out loud: nothing in the HTTP layer keeps a POST response, so
 * without this a review session with the network down would be silent. The
 * Cache API stores what it is told to and pays no attention to the response's
 * `Cache-Control`, which is why the route sends an honest `no-store` rather
 * than a year of `immutable` that never applied to anything.
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
      caches.open(AUDIO)
        .then((cache) => cache.put(key, copy))
        .then(() => trim(AUDIO))
        .catch(() => undefined);
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
      caches.open(PAGES)
        .then((cache) => cache.put(request, copy))
        .then(() => trim(PAGES))
        .catch(() => undefined);
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
