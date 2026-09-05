import { spawn, spawnSync } from "node:child_process";
import { request as httpRequest } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { launchChromium } from "./lib/browser.mjs";
import { suite } from "./lib/checks.mjs";

/*
  THE DOOR EVERY STRANGER COMES THROUGH, AND THE ONE SCREEN NOTHING RENDERED.

  Every other browser suite runs against a local-mode build, because that is
  what makes them possible at all: with no Supabase keys this app is one
  learner on one machine, so a suite can drive it without anybody automating a
  Google sign-in. The cost was invisible until somebody looked for it. In local
  mode `/sign-in` correctly draws a panel explaining that this copy has no
  accounts, so the real sign-in screen, the Google button, the mailed link, and
  the two refusals the callback can send somebody back with, had never been
  rendered by any check in the repository.

  That is the wrong screen to have no coverage on. It is the first thing anyone
  who is not the author ever sees, and the last one where a fault is
  recoverable: somebody who cannot get in cannot report that they cannot get
  in.

  WHICH MODE IS A PROPERTY OF THE BUILD, NOT OF THE SERVER. `NEXT_PUBLIC_`
  variables are inlined when the bundle is built, so starting a server with the
  keys cleared still gates every route if the build had them. Measured, not
  assumed: a build carrying them served `/settings` as a 307 to `/sign-in` with
  the variables removed from the environment. So this suite makes its own build
  in hosted mode, into its own `distDir` so it cannot disturb the one the other
  suites are running against, and starts it on its own port for the same
  reason `test-error.mjs` does.

  `EMAIL_SIGN_IN` is *not* a `NEXT_PUBLIC_` variable and the page is
  `force-dynamic`, so that half is read when the server starts. That is what
  lets one build cover both states from two processes, and it is worth checking
  both. On is the default, and the default is measured with the variable
  absent rather than set, because a deployment that never heard of the switch
  is the one the default is for: that is the state the app's own deployment
  sat in for weeks with Google as its only door. `off` is what a copy whose
  mail does not go out sets, and it has to still take the door away.

  Nothing here signs in. The keys below are shaped like Supabase's and belong
  to nobody, which is the point: this suite is about what the screen says and
  offers, and the one place it needs a provider to answer, it answers for it.
*/

/*
  Clear of the other suites rather than next door to them.

  This was 3198, which put its pair on 3198 and 3199, and `test-error.mjs`
  defaults to 3199 and runs immediately before this one. That suite was
  leaking its server, so the guard below found a live server on 3199 and
  refused to run, correctly and on the first CI run of this file. The leak is
  fixed where it lives; the adjacency is fixed here, because a suite that
  only works while the one before it cleans up perfectly is a suite waiting
  to fail again.
*/
const PORT = Number(process.env.SIGNIN_SUITE_PORT ?? 3210);
const OFF_PORT = PORT + 1;
const DIST = ".next-signin";

const { check, done, absent } = suite("The sign-in screen", { floor: 22 });

/*
  A project ref and a key shaped like the real thing, signed with nothing.

  The anon key is a JWT the browser is meant to hold, so its shape matters to
  `@supabase/ssr` (it reads the project ref out of the URL to name its cookie)
  and its signature does not: no request in this suite reaches Supabase. A real
  key here would be a credential in the repository for no gain.
*/
const SUPABASE_URL = "https://kodukeeltestproject.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
  "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtvZHVrZWVsdGVzdHByb2plY3QiLCJyb2xlIjoiYW5vbiJ9." +
  "not-a-real-signature-and-never-verified";

/** What a deployment that has named its operator sets, so the denial can name them. */
const OPERATOR_EMAIL = "hello@example.test";

/** Where this copy says it lives, for the one request that arrives elsewhere. */
const SITE_URL = "https://kodukeel.example";

const hostedEnv = {
  ...process.env,
  NEXT_DIST_DIR: DIST,
  NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,
  OPERATOR_NAME: "A Test Operator",
  OPERATOR_ADDRESS: "1 Test Street, Tallinn",
  OPERATOR_EMAIL,
  /*
    The address this copy lives at. Every request the suite makes is to a
    loopback address, which is never redirected, so the servers below answer
    as themselves; what this switches on is the redirect for a request that
    arrives naming some other host, checked once below with a `Host` header.
  */
  NEXT_PUBLIC_SITE_URL: SITE_URL,
};


/*
  A PORT SOMEBODY ELSE IS HOLDING IS NOT THIS SUITE'S SERVER, AND ANSWERING IS
  THE WORST THING IT COULD DO.

  This was found the way these things are found. An early run of this suite
  threw part way through, so its two servers were never killed; the next run
  spawned its own, they could not bind, they died, and `waitFor` was satisfied
  by the corpses of the previous run. Two runs then reported on a build that
  was several edits old, which is the exact failure `scripts/lib/prefs.mjs`
  exists for one layer up: a suite that states its preconditions rather than
  inheriting them.

  So a port that already answers ends the run in seven milliseconds and in
  words, rather than thirty seconds and a locator.
*/
for (const port of [PORT, OFF_PORT]) {
  const taken = await fetch(`http://127.0.0.1:${port}/welcome`)
    .then(() => true).catch(() => false);
  if (taken) {
    console.log(
      `FAIL  something is already listening on ${port}, so this suite would have\n` +
      "      measured it instead of its own build. Stop it, or set\n" +
      "      SIGNIN_SUITE_PORT to a free pair.",
    );
    process.exit(1);
  }
}

console.log(`Building in hosted mode into ${DIST}/ ...`);
const built = spawnSync("npx", ["next", "build"], { env: hostedEnv, stdio: "ignore" });
if (built.status !== 0) {
  /*
    A build that will not run is a fact about this machine rather than about
    the screen, so it is waived rather than failed, with the reason. It is also
    the whole suite, so `done()` will refuse to call that a pass: waiving more
    than half fails outright, which is exactly right here.
  */
  absent(22, `a hosted-mode build into ${DIST}, which did not complete on this machine`);
  done();
}

/*
  Start the built app on a port, with email sign-in left at its default or
  switched off. The default is the variable being *absent*, so the on server
  is given nothing at all and never `"on"`, which would pass whatever the
  default happened to be.

  `detached` is the load-bearing word. `npx next start` is a launcher that
  spawns the actual server as a grandchild, so `child.kill()` kills the
  launcher and leaves the server holding the port: measured here, with both
  ports still answering after a clean run had supposedly stopped them.
  Detached makes the child a process group leader, so the group can be killed
  as a group and the server goes with it.
*/
function serve(port, emailLink) {
  const { EMAIL_SIGN_IN: _inherited, ...env } = hostedEnv;
  return spawn("npx", ["next", "start", "-p", String(port)], {
    env: emailLink ? env : { ...env, EMAIL_SIGN_IN: "off" },
    stdio: "ignore",
    detached: true,
  });
}

/** Kill a server and the grandchild actually listening, ignoring one already gone. */
function halt(child) {
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    // Already dead, or never started. Either way there is nothing to stop.
  }
}

async function waitFor(base) {
  for (let i = 0; i < 60; i++) {
    const ok = await fetch(`${base}/welcome`).then((r) => r.ok).catch(() => false);
    if (ok) return true;
    await delay(500);
  }
  return false;
}

const withMail = serve(PORT, true);
const withoutMail = serve(OFF_PORT, false);
const B = `http://127.0.0.1:${PORT}`;
const OFF = `http://127.0.0.1:${OFF_PORT}`;

/*
  Killed however this ends, and not only on the happy path. The first version
  killed them at the bottom of the file, so a throw anywhere above left two
  servers running and poisoned every later run (see the port check above).
*/
const stop = () => { halt(withMail); halt(withoutMail); };
process.on("exit", stop);
process.on("uncaughtException", (error) => {
  stop();
  throw error;
});

if (!(await waitFor(B)) || !(await waitFor(OFF))) {
  absent(22, `a server on ${PORT} and ${OFF_PORT}, and neither came up`);
  stop();
  done();
}

const browser = await launchChromium();
const errors = [];

/** A phone, because this app is measured on one and sign-in is not exempt. */
const ctx = await browser.newContext({ viewport: { width: 360, height: 780 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(e.message));

// ── Both doors are drawn ────────────────────────────────────────────────────
await page.goto(`${B}/sign-in`, { waitUntil: "domcontentloaded" });

check("the hosted screen offers Google",
  (await page.getByRole("button", { name: /Continue with Google/ }).count()) > 0);
check("and a mailed link beside it, so a Google account is not the price of entry",
  (await page.getByRole("button", { name: /Email me a link/ }).count()) > 0);
check("with a field to put an address in",
  (await page.getByLabel(/Your email address/i).count()) > 0);
check("and it says where to open the link, because the verifier lives in this browser",
  /open the link in this browser/i.test(await page.locator("main").innerText()));
check("it does not tell a signed-out stranger this copy has no accounts",
  (await page.getByText(/running in local mode/i).count()) === 0);

// ── The switch, for a deployment whose mail does not go out ─────────────────
const offPage = await ctx.newPage();
await offPage.goto(`${OFF}/sign-in`, { waitUntil: "domcontentloaded" });
check("with EMAIL_SIGN_IN=off the mailed link is not offered at all",
  (await offPage.getByRole("button", { name: /Email me a link/ }).count()) === 0);
check("and Google is still there, so the door that works is the one drawn",
  (await offPage.getByRole("button", { name: /Continue with Google/ }).count()) > 0);
await offPage.close();

// ── What somebody sees after asking for a link ──────────────────────────────
/*
  The one request this suite answers for. `signInWithOtp` posts to the
  project's `/auth/v1/otp`, which belongs to nobody here, so without this the
  form would report a network failure and the "check your email" state, which
  is the whole point of the screen, would never be reached.
*/
await ctx.route("**/auth/v1/otp*", (route) =>
  route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));

await page.getByLabel(/Your email address/i).fill("learner@example.test");
await page.getByRole("button", { name: /Email me a link/ }).click();
await page.getByText(/Check your email/i).waitFor({ timeout: 10_000 }).catch(() => {});

const sentText = await page.locator("main").innerText();
check("asking for a link says it was sent, rather than leaving the button pending",
  /Check your email/i.test(sentText));
check("and names the address it went to, so a typo is visible",
  /learner@example\.test/.test(sentText));
check("and says it stops working, because a link that looks live for ever is a trap",
  /stops working after an hour/i.test(sentText));
check("and offers a way back for somebody who typed it wrong",
  (await page.getByRole("button", { name: /different address/i }).count()) > 0);

// ── The two refusals the callback can send somebody back with ───────────────
/*
  Both were written into the URL by `/auth/callback` and read by nothing, so
  the one person who needed telling why they could not get in was shown the
  button that had just refused them.
*/
await page.goto(`${B}/sign-in?denied=1`, { waitUntil: "domcontentloaded" });
const deniedText = await page.locator("main").innerText();
check("a refused address is told that it was refused",
  /cannot use this copy/i.test(deniedText));
check("and who to ask, from the operator this deployment named",
  deniedText.includes(OPERATOR_EMAIL));

await page.goto(`${B}/sign-in?error=1`, { waitUntil: "domcontentloaded" });
check("a sign-in that did not complete says so, and why a link may be spent",
  /did not go through/i.test(await page.locator("main").innerText()));

// ── A sign-in that came back to the wrong place ─────────────────────────────
/*
  Google sends the learner back to the project's Site URL wherever the origin
  they started on is not on its Redirect URLs, so the code arrives in a
  browser holding no verifier for it. That used to be reported as a spent
  link, on a host nobody had typed. The callback tells the two apart by the
  verifier cookie, and the app stops the host half of it by redirecting every
  other host it answers on to the one it lives at.
*/
const bounced = await fetch(`${B}/auth/callback?code=not-a-real-code`, { redirect: "manual" });
check("a code arriving with no verifier cookie is sent back as bounced, not as a spent link",
  bounced.status >= 300 && bounced.status < 400
    && new URL(bounced.headers.get("location") ?? "", B).search === "?bounced=1",
  `${bounced.status} ${bounced.headers.get("location")}`);

await page.goto(`${B}/sign-in?bounced=1`, { waitUntil: "domcontentloaded" });
const bouncedText = await page.locator("main").innerText();
check("and the screen says the browser has nothing to finish it with, and who to tell",
  /nothing to finish/i.test(bouncedText) && bouncedText.includes(OPERATOR_EMAIL));

/*
  `fetch` strips a `Host` header rather than sending it, silently, so this one
  request goes through `node:http`, which sends whatever it is given. It is
  the only way to arrive at a loopback server naming another host.
*/
const elsewhere = await new Promise((resolve, reject) => {
  const req = httpRequest({
    host: "127.0.0.1",
    port: PORT,
    path: "/sign-in?next=%2Fprogress",
    method: "GET",
    headers: { host: "kodukeel-old.example" },
  }, (res) => {
    res.resume();
    resolve({ status: res.statusCode, headers: { get: (name) => res.headers[name] ?? null } });
  });
  req.on("error", reject);
  req.end();
});
check("a request on any other host is sent to the one address, keeping its path and query",
  elsewhere.status === 308
    && elsewhere.headers.get("location") === `${SITE_URL}/sign-in?next=%2Fprogress`,
  `${elsewhere.status} ${elsewhere.headers.get("location")}`);

// ── The gate itself ─────────────────────────────────────────────────────────
const gated = await page.goto(`${B}/progress`, { waitUntil: "domcontentloaded" });
check("a gated route sends a signed-out visitor to sign in",
  new URL(gated?.url() ?? B).pathname === "/sign-in", gated?.url());
check("carrying the page they were going to, so signing in does not lose it",
  new URL(gated?.url() ?? B).searchParams.get("next") === "/progress");

// ── The shape of it on a phone ──────────────────────────────────────────────
/*
  `test-mobile.mjs` asks this of fourteen routes and cannot ask it of this one,
  since in local mode there is no form here to measure. Same rule, same
  selector: a button, or something acting as one.
*/
await page.goto(`${B}/sign-in`, { waitUntil: "domcontentloaded" });
const overflow = await page.evaluate(() =>
  document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("the screen does not scroll sideways on a 360px phone", overflow <= 0, `${overflow}px`);

const small = await page.evaluate(() =>
  [...document.querySelectorAll("button, [role=button], a[role=button]")]
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && (r.height < 44 || r.width < 44))
    .map(({ el, r }) => `${(el.textContent || "?").trim().slice(0, 20)} ${Math.round(r.width)}x${Math.round(r.height)}`));
check("every control on it clears 44px", small.length === 0, small.join(", "));

check("no page error on the way through", errors.length === 0, errors[0] ?? "");

await browser.close();
stop();
done();
