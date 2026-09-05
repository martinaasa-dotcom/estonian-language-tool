import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { halfConfigured, supabaseConfigured } from "@/lib/auth/mode";
import { isAllowedEmail, safeNext } from "@/lib/auth/access";
import { canonicalRedirect } from "@/lib/auth/canonical";
import { boundedTransport, hasSessionCookie, readIdentity } from "@/lib/auth/identity";
import { buildContentSecurityPolicy } from "@/lib/security/headers";
import { isMutatingRequest, isSameOriginMutation } from "@/lib/security/sameOrigin";

/**
 * Three jobs, in the order they have to happen.
 *
 * 1. **Refuse a forged mutation**, before anything else looks at the request.
 * 2. **Refresh the Supabase session cookie** (required by `@supabase/ssr`,
 *    since Server Components cannot write cookies themselves) and gate every
 *    route except the public ones: the landing page, sign-in, the OAuth
 *    callback and the offline fallback.
 * 3. **Set the Content Security Policy** on whatever response comes out.
 *
 * With no Supabase keys configured the app is a single-learner local install
 * (lib/auth/mode.ts) and there is no session to refresh or gate, so step two
 * steps aside entirely rather than redirecting to a sign-in page that could
 * never sign anyone in. Steps one and three still run: a local install is
 * still a browser, and it is still worth not being framed.
 *
 * THIS RUNS ON EVERY REQUEST, WHICH IS WHAT MADE STEP TWO EXPENSIVE. It asked
 * the Supabase auth service who was signed in over the network, every time,
 * with no deadline on the answer: on the landing page and the privacy notice
 * as readily as on somebody's deck, and for a visitor who had never signed in
 * at all. A slow minute at that service was therefore a slow minute for the
 * whole app, and once it stopped answering entirely the middleware sat there
 * until the platform gave up on it and served a 504, which is the least
 * useful sentence available for "the login server is busy".
 *
 * Three things in order, cheapest first, and each one is a question the next
 * one no longer has to ask.
 *
 * A public page that reads the same signed in or out needs no identity, so it
 * is answered without building a client. A request carrying no session cookie
 * is signed out, definitively, and that is the first visit every new learner
 * makes. Only what is left goes to `readIdentity`, which verifies the token
 * rather than asking about it, and does so under a deadline.
 */
export async function middleware(request: NextRequest) {
  const csp = buildContentSecurityPolicy();
  const withCsp = <T extends NextResponse>(response: T): T => {
    response.headers.set("Content-Security-Policy", csp);
    return response;
  };

  /*
    A REQUEST ON THE WRONG HOST IS ANSWERED WITH WHERE THE APP LIVES, AND
    WITH NOTHING ELSE.

    A deployment answers on the platform's own name as well as its domain,
    and sign-in cannot survive the difference: the PKCE verifier is a cookie
    on the origin the learner pressed the button on, and Supabase sends them
    back to its Site URL wherever the origin they asked for is not on its
    list, so one sign-in was starting on the domain and finishing on
    `kodukeel.vercel.app` with nothing to finish it with. With
    `NEXT_PUBLIC_SITE_URL` set there is one origin, permanently, and a stale
    bookmark lands on it too. See lib/auth/canonical.ts for what is exempt.

    It comes before the forged-request gate rather than after it, because a
    308 keeps the method and the body, and the gate is going to see the same
    mutation again on the host it belongs to, carrying whatever the browser
    says about where it came from. Nothing about the request is read here
    but its host, and nothing about it is acted on.
  */
  const home = canonicalRedirect(
    request.headers.get("host") ?? request.nextUrl.host,
    request.nextUrl.pathname + request.nextUrl.search,
  );
  if (home) return withCsp(NextResponse.redirect(home, 308));

  /*
    THE FORGED-REQUEST GATE COMES FIRST AMONG THE CHECKS THAT READ THE
    REQUEST, AND IT COVERS EVERY PATH.

    The obvious place to put this is inside a `/api/` branch, and that would
    be watching the quiet door. Every mutation a learner makes in this app,
    grading a card, adding a word, renaming a unit, joining a class, is a
    Server Action, and a Server Action is a POST to a *page* path. Next.js
    does check the Origin against the Host for actions, but that is again a
    default owned by a dependency; this is the same rule stated by the app, in
    one place, over every method that can change something.

    Refused only when a browser says out loud that the mutation came from
    another site. A caller with no browser behind it has no ambient cookie to
    forge with and passes through. See lib/security/sameOrigin.ts.
  */
  if (isMutatingRequest(request.method) && !isSameOriginMutation(request)) {
    const path = request.nextUrl.pathname;
    return withCsp(
      path.startsWith("/api/")
        ? NextResponse.json({ error: "That request did not come from this site." }, { status: 403 })
        : new NextResponse("That request did not come from this site.", {
            status: 403,
            headers: { "content-type": "text/plain; charset=utf-8" },
          }),
    );
  }

  /*
    A HALF-CONFIGURED DEPLOYMENT IS NEITHER MODE, AND IS ANSWERED AS NEITHER.

    Local mode is the absence of the Supabase keys; one of the two present is
    a hosted install with a typo in it, and letting that fall through here
    would run it open to the internet under one shared id. See
    lib/auth/mode.ts.
  */
  const missing = halfConfigured();
  if (missing) {
    return withCsp(new NextResponse(
      `This installation is half configured: ${missing} is not set. `
      + "Set it, or unset the other Supabase variable to run as a single local learner.",
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
    ));
  }

  if (!supabaseConfigured()) return withCsp(NextResponse.next({ request }));

  const path = request.nextUrl.pathname;

  const isPublicPath =
    path.startsWith("/sign-in") ||
    path.startsWith("/welcome") ||
    path.startsWith("/auth/callback") ||
    // What the app stores has to be readable before anyone signs in to it.
    path.startsWith("/privacy") ||
    path.startsWith("/terms") ||
    // What it costs to run and who pays for it is the same kind of question,
    // and the people most likely to ask it have no account here.
    path.startsWith("/funding") ||
    // The two pages somebody deciding whether to put this in front of a class
    // is sent to. Both are written for a reader who has no account here and is
    // not going to make one to read them.
    path.startsWith("/trust") ||
    path.startsWith("/accessibility") ||
    // Whether the app is up is not a question with an owner. It carries no
    // count, no identifier and nothing about anybody, and a health check
    // behind a session is one no monitor can make.
    path.startsWith("/api/health") ||
    // The offline fallback holds no data and has to render from the service
    // worker's cache, where there is no session to check.
    path.startsWith("/offline") ||
    // Aggregate metrics carry their own bearer token and are read by whoever
    // runs the deployment, not by a signed-in learner. Past this gate it
    // authenticates itself, and with no token configured it 404s.
    path.startsWith("/api/metrics") ||
    // The same, for the anonymised research export. Neither belongs to a
    // learner, so neither can be reached by resolving one: a session here
    // would be a session with nothing to say about whether the caller may
    // read a deployment-wide aggregate.
    path.startsWith("/api/research");

  /*
    What a signed-out request gets, in one place because two branches need it.

    A route handler is told so in JSON. A page is redirected. Getting that
    backwards is easy to do and quiet: an API call answered with a 302 to
    /sign-in arrives at the caller as an HTML page with a 200 on it, which is
    the shape a fetch reads as success.
  */
  const signedOut = () =>
    path.startsWith("/api/")
      ? NextResponse.json({ error: "Sign in required." }, { status: 401 })
      : NextResponse.redirect(signedOutTarget(request));

  /*
    A public page that renders the same either way is answered here.

    /sign-in is the exception, and the only one: it is public because somebody
    signed out has to reach it, and it still has to send somebody who is
    already signed in back home rather than offering them a sign-in button.
    The rest of the list is the landing page, the two policy pages, the
    offline fallback and the OAuth callback, none of which read the identity
    they were paying a round trip for. The callback is about to establish a
    session of its own, so asking about the one it does not have yet was pure
    cost on the slowest step of signing in.

    The session refresh goes with it on those paths, which is fine: it happens
    on the next request that is actually gated, and none of these is.
  */
  if (isPublicPath && !path.startsWith("/sign-in")) {
    return withCsp(NextResponse.next({ request }));
  }

  /*
    NO SESSION COOKIE IS AN ANSWER, AND IT IS FREE.

    A first-time visitor, a signed-out one, a crawler: none of them carry
    `sb-<project>-auth-token`, so there is nothing to verify and nothing to
    ask anybody about. The whole Supabase client below is skipped.
  */
  if (!hasSessionCookie(request.cookies.getAll().map((cookie) => cookie.name))) {
    if (isPublicPath) return withCsp(NextResponse.next({ request }));
    return withCsp(signedOut());
  }

  let response = NextResponse.next({ request });

  /*
    The transport carries the deadline, so it covers the token refresh and the
    sign-out below as well as the claims check. It also records whether the
    service answered at all, which is what lets an unreachable auth service be
    told apart from an expired session. See lib/auth/identity.ts.
  */
  const transport = boundedTransport();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: transport.fetch },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const identity = await readIdentity(supabase, transport);

  // A signed-in address that is no longer on the allowlist is signed out here
  // rather than only in the OAuth callback, so revoking access takes effect on
  // the next request somebody makes instead of whenever their session expires.
  // The address is a claim inside the token, so this still runs on every gated
  // request now that the token is verified rather than asked about.
  if (identity.state === "in" && !isAllowedEmail(identity.learner.email)) {
    await supabase.auth.signOut().catch(() => undefined);
    const denied = request.nextUrl.clone();
    denied.pathname = "/sign-in";
    denied.search = "";
    denied.searchParams.set("denied", "1");
    const refusal = NextResponse.redirect(denied);
    /*
      The cleared cookies have to be copied onto the redirect, and were not.
      `signOut` writes them through the adapter above, which rebuilds
      `response`; returning a fresh redirect threw that away, so the session
      survived every refusal and the same person was signed out again on every
      request they made for as long as the token lasted.
    */
    for (const cookie of response.cookies.getAll()) refusal.cookies.set(cookie);
    return withCsp(refusal);
  }

  if (identity.state === "out" && !isPublicPath) return withCsp(signedOut());

  // /welcome stays reachable when signed in: it is a page you might want to
  // show someone. Only the sign-in form itself is pointless once you are in.
  if (identity.state === "in" && path.startsWith("/sign-in")) {
    const home = request.nextUrl.clone();
    home.pathname = "/";
    home.search = "";
    return withCsp(NextResponse.redirect(home));
  }

  /*
    `unreachable` lands here, and passing it through is the decision rather
    than an oversight. A timeout is not an answer, and answering it as "signed
    out" would take a learner's own deck away from them over a bad minute at
    somebody else's server, on the one screen they open every day. It cannot
    leak anything either: every page, action and route resolves its own owner
    through `requireUserId()`, which throws when the session cannot be
    verified. That is the check that decides; this one is the redirect that
    makes being signed out look like a sign-in page rather than an error.
  */
  return withCsp(response);
}

/**
 * Where a signed-out request is sent.
 *
 * A first-time visitor has nothing to sign back in to, so the front door is
 * the landing page rather than an account form. Anywhere deeper keeps the old
 * behavior: sign in, then carry on to where they were going. `next` is
 * attacker-controllable and is consumed at the moment a fresh session cookie
 * exists, so it is narrowed to a same-origin path.
 */
function signedOutTarget(request: NextRequest): URL {
  const target = request.nextUrl.clone();
  target.search = "";
  if (request.nextUrl.pathname === "/") {
    target.pathname = "/welcome";
    return target;
  }
  target.pathname = "/sign-in";
  target.searchParams.set("next", safeNext(request.nextUrl.pathname + request.nextUrl.search));
  return target;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
