import { baseUrl, suite } from "./lib/checks.mjs";

/*
  THE SECURITY PROPERTIES, ASSERTED AGAINST A RUNNING SERVER.

  `scripts/test-invariants.ts` reads the source and can tell you that
  `middleware.ts` mentions `isSameOriginMutation`. It cannot tell you that a
  forged POST is actually refused, because that depends on the order the
  middleware runs its branches, on which paths the matcher covers, and on what
  the platform does to a response on the way out. Every one of those has been
  wrong here before: the CSP had to move into the middleware because the static
  headers miss the files the matcher skips, and the gate had to move above the
  auth branch because a redirect keeps the method and the body.

  So this asks the server. HTTP rather than a browser, because none of it needs
  a DOM and a suite that does not launch Chromium is one that runs in seconds
  and cannot be flaky about a page load.

  WHAT THIS IS NOT. It is not a penetration test and must never be described as
  one in anything a buyer reads. It is a regression suite over the controls
  this project already claims, written by the same people who wrote them, so it
  cannot find the class of fault where the whole model is wrong. `docs/27-security.md`
  says so in its own words, and says that no external test has been done. What
  this catches is the thing that actually happens: a header quietly dropped, a
  route added without a cap, a refusal that stops refusing.

  MODE MATTERS AND IS DETECTED RATHER THAN ASSUMED. With no Supabase keys the
  app is one local learner and every route answers; with them, everything is
  gated and most of these routes refuse before they reach their own code. Both
  are correct, and each can check things the other cannot, so the suite asks
  which it is looking at and waives what that mode genuinely cannot reach.
  `scripts/test-signin.mjs` is the one that makes its own hosted build.
*/

const B = baseUrl();

// Floor: 36, measured against a local-mode build, which is what the browser
// job runs. Hosted waives the handful that need a route to answer rather than
// refuse, and says so.
const { check, absent, done } = suite("Security", { floor: 36 });

/** GET with no cleverness, returning status, headers and body together. */
async function get(path, init) {
  const res = await fetch(`${B}${path}`, { redirect: "manual", ...init });
  return { status: res.status, headers: res.headers, body: await res.text() };
}

async function status(path, init) {
  const res = await fetch(`${B}${path}`, { redirect: "manual", ...init });
  return res.status;
}

// ── Which app is this ────────────────────────────────────────────────────────

/*
  An owner-scoped route answers in local mode and refuses in hosted mode, which
  is the cheapest question that tells the two apart.

  DELIBERATELY NOT `/api/export`, WHICH IS THE OBVIOUS ONE. Its cap is six an
  hour and, since it moved onto the shared counter, that six is the same six
  whichever instance answers and whichever suite spends it. `test-restore.mjs`
  runs later in this same CI job and needs three of them, so two spent here
  would leave one, and a suite that quietly rations another suite is worse than
  a suite that checks one route fewer. `/api/reminder` is owner-scoped, is one
  indexed read, and is exempt from throttling for that reason.
*/
const probe = await status("/api/reminder");
const hosted = probe === 401 || probe === 307 || probe === 302;
console.log(`\n  Looking at a ${hosted ? "hosted" : "local-mode"} deployment (/api/reminder answered ${probe}).\n`);

// ── The headers a browser is handed ──────────────────────────────────────────

const REQUIRED = {
  "referrer-policy": /strict-origin-when-cross-origin/,
  "x-content-type-options": /nosniff/,
  "x-frame-options": /DENY/,
  "cross-origin-opener-policy": /same-origin/,
  // The one added after the review noticed that X-Frame-Options covers a
  // framed page and says nothing about a single response, which is what the
  // share card and the export are.
  "cross-origin-resource-policy": /same-origin/,
  "permissions-policy": /camera=\(self\)/,
  "strict-transport-security": /max-age=\d{7,}/,
  "content-security-policy": /default-src 'self'/,
};

for (const [path, what] of [["/welcome", "a public page"], ["/api/health", "an API route"]]) {
  const { headers } = await get(path);
  const missing = Object.entries(REQUIRED)
    .filter(([name, shape]) => !shape.test(headers.get(name) ?? ""))
    .map(([name]) => name);
  check(`${what} carries every security header`, missing.length === 0, missing.join(", ") || `${path}`);
}

{
  const csp = (await get("/welcome")).headers.get("content-security-policy") ?? "";
  check("the policy refuses framing outright", /frame-ancestors 'none'/.test(csp));
  check("the policy allows no plugins and no base tag rewrite",
    /object-src 'none'/.test(csp) && /base-uri 'self'/.test(csp));
  check("a form cannot post itself to another origin", /form-action 'self'/.test(csp));
  check("no unsafe-eval anywhere in the policy", !/unsafe-eval/.test(csp));
  /*
    `script-src` carries 'unsafe-inline' and that is argued at length in
    lib/security/headers.ts: the shell is prerendered and CDN-cached and Next
    only stamps a nonce on a dynamically rendered response. What must not
    happen is the policy widening past it.
  */
  check("connect-src names hosts rather than allowing anything",
    /connect-src [^;]*'self'/.test(csp) && !/connect-src [^;]*\*/.test(csp), csp.match(/connect-src [^;]*/)?.[0]?.slice(0, 60));
}

// ── The forged request ───────────────────────────────────────────────────────

/*
  EVERY MUTATION HERE IS A SERVER ACTION, WHICH IS A POST TO A PAGE PATH.
  A gate that only watched `/api/` would be watching the quiet door, so both
  are asked. `Sec-Fetch-Site` is set by the browser and page script cannot
  reach it; `Origin` is the fallback for a browser that does not send one.
*/
for (const [path, door] of [["/api/tutor", "an API route"], ["/settings", "the server action door"]]) {
  check(`a cross-site POST to ${door} is refused`,
    (await status(path, { method: "POST", headers: { "sec-fetch-site": "cross-site" } })) === 403);
}

check("a POST carrying a foreign Origin is refused",
  (await status("/api/tutor", { method: "POST", headers: { origin: "https://evil.example" } })) === 403);

check("an origin that only looks like ours is refused",
  (await status("/api/tutor", { method: "POST", headers: { origin: "http://localhost.evil.example" } })) === 403);

/*
  THE ONE THIS SUITE WAS WORTH WRITING FOR. `Origin: http://localhost:3000.evil.example`
  does not parse, because `3000.evil.example` is not a port, and an unreadable
  origin was falling into the branch meant for a request that sent no origin at
  all, which is allowed on the grounds that it is not a browser. A request
  carrying the header is something that thinks it is one.
*/
check("an origin that is present and will not parse is refused",
  (await status("/api/tutor", { method: "POST", headers: { origin: "http://localhost:3000.evil.example" } })) === 403);

/*
  And the two that must NOT be refused, or the gate has stopped being a gate
  and started being an outage. A same-origin POST gets past this branch and
  meets whatever the route says next, which is a 401 on a hosted deployment
  and the route's own answer on a local one. Either is fine. 403 is not.
*/
check("a same-origin POST is let through to the route",
  (await status("/api/tutor", { method: "POST", headers: { "sec-fetch-site": "same-origin" } })) !== 403);

check("a request with no browser headers at all is let through",
  /*
    Not a browser, so it has no ambient cookie to forge with, and refusing it
    would break every server-to-server caller for nothing.
  */
  (await status("/api/tutor", { method: "POST" })) !== 403);

// ── What is behind a token stays behind it ───────────────────────────────────

for (const path of ["/api/metrics", "/api/research"]) {
  check(`${path} does not exist without the token`, (await status(path)) === 404);
  check(`${path} does not exist with the wrong token`,
    (await status(path, { headers: { authorization: "Bearer not-the-token" } })) === 404);
}

// ── The health endpoint says two words and nothing else ──────────────────────

{
  const { status: code, headers, body } = await get("/api/health");
  check("the health endpoint answers", code === 200 || code === 503, String(code));
  check("it is never cached", (headers.get("cache-control") ?? "").includes("no-store"));

  let payload = null;
  try { payload = JSON.parse(body); } catch { /* reported by the next check */ }
  check("it answers in JSON", payload !== null);
  check("it says exactly what it promises and no more",
    payload !== null && JSON.stringify(Object.keys(payload).sort()) ===
      JSON.stringify(["build", "database", "status", "time"]));
  /*
    Prisma quotes the datasource in an initialisation failure, which is the
    fault `safeMessage` exists for one layer over: a response built out of what
    the database said can carry the deployment's own password.
  */
  check("it leaks no connection string and no driver message",
    !/postgres(ql)?:\/\//i.test(body) && !/prisma/i.test(body) && !/supabase/i.test(body));
  check("it names no version anybody could look up an advisory for",
    !/\d+\.\d+\.\d+/.test(body.replace(/"time":"[^"]*"/, "")));
}

// ── Nothing owner-scoped is cacheable ────────────────────────────────────────

if (hosted) {
  absent(2, "a hosted deployment, where these refuse before they answer");
} else {
  for (const path of ["/api/reminder", "/api/share"]) {
    const { headers, status: code } = await get(path);
    const cc = headers.get("cache-control") ?? "";
    check(`${path} is never stored by a cache`,
      code >= 400 || cc.includes("no-store") || cc.includes("private"), `${code}, ${cc || "no directive"}`);
  }
}

// ── A cap that actually refuses ──────────────────────────────────────────────

if (hosted) {
  absent(1, "a hosted deployment, where the limiter sits behind the auth gate");
} else {
  /*
    The restore is 12 a minute and rejects a body this small before it parses
    anything, so thirteen of them is a cheap way to watch a limiter refuse. It
    resets inside a minute, which is what keeps this from spending an allowance
    a later suite needs: the export's is six an hour and `test-restore.mjs`
    wants it.
  */
  let refused = false;
  for (let i = 0; i < 14 && !refused; i += 1) {
    const code = await status("/api/restore", {
      method: "POST",
      headers: { "sec-fetch-site": "same-origin", "content-type": "application/json" },
      body: "{}",
    });
    if (code === 429) refused = true;
  }
  check("a route with a cap on it starts refusing", refused);
}

// ── Nothing a stranger downloads carries a credential ────────────────────────

{
  const html = (await get("/welcome")).body;
  check("the page a stranger lands on carries no connection string",
    !/postgres(ql)?:\/\/[^\s"'`]*:[^\s"'`@]*@/.test(html));
  check("and no privileged key",
    !/sb_secret_|\bsbp_[A-Za-z0-9]{32}|service_role/.test(html));
  /*
    The anon key is designed to be public and is expected here. What must not
    be is anything else, which `npm run check:secrets` scans the whole bundle
    for by shape. This is the same question asked of what is actually served.
  */
}

// ── The policy pages are readable without an account, and say who to write to ─

for (const path of ["/privacy", "/terms", "/trust", "/accessibility", "/funding"]) {
  const { status: code } = await get(path);
  check(`${path} is readable without signing in`, code === 200, String(code));
}

{
  /*
    EITHER ANSWER IS CORRECT AND SILENCE IS NOT, which is the whole shape of
    `lib/legal/operator.ts`. A deployment that has been configured names a
    controller with an address a reader can write to; one that has not says so
    out loud, because a page that quietly says nothing looks finished. What
    this refuses is the third state, where the reader is told neither.

    The first version of this check asserted only the first answer and failed
    against a build with no canonical host, which is the ordinary state of a
    fresh clone and of CI. That was the check being wrong, not the page.
  */
  const privacy = (await get("/privacy")).body;
  /*
    Anchored on the two sentences the page's own branches write, because the
    obvious signal is not one: a `mailto:` is on this page either way, since
    the supervisory authority is named whether or not the operator is. The
    first version matched that and reported an unset deployment as named.
  */
  const named = /controller of your data/.test(privacy);
  const admits = /has not filled their name in/.test(privacy);
  check("the privacy page is unambiguous about who holds the data",
    named !== admits, named ? "names a controller" : admits ? "says it is unset" : "says neither");
  check("and names the authority a complaint goes to", /Andmekaitse|Data Protection Inspectorate/.test(privacy));
}

done();
