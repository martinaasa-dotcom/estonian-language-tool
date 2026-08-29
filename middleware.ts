import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseConfigured } from "@/lib/auth/mode";
import { isAllowedEmail, safeNext } from "@/lib/auth/access";
import { buildContentSecurityPolicy } from "@/lib/security/headers";
import { isMutatingRequest, isSameOriginMutation } from "@/lib/security/sameOrigin";

/**
 * Three jobs, in the order they have to happen.
 *
 * 1. **Refuse a forged mutation**, before anything else looks at the request.
 * 2. **Refresh the Supabase session cookie** (required by `@supabase/ssr` --
 *    Server Components cannot write cookies themselves) and gate every route
 *    except the public ones: the landing page, sign-in, the OAuth callback and
 *    the offline fallback.
 * 3. **Set the Content Security Policy** on whatever response comes out.
 *
 * With no Supabase keys configured the app is a single-learner local install
 * (lib/auth/mode.ts) and there is no session to refresh or gate, so step two
 * steps aside entirely rather than redirecting to a sign-in page that could
 * never sign anyone in. Steps one and three still run: a local install is
 * still a browser, and it is still worth not being framed.
 */
export async function middleware(request: NextRequest) {
  const csp = buildContentSecurityPolicy();
  const withCsp = <T extends NextResponse>(response: T): T => {
    response.headers.set("Content-Security-Policy", csp);
    return response;
  };

  /*
    THE FORGED-REQUEST GATE COMES FIRST, AND IT COVERS EVERY PATH.

    The obvious place to put this is inside a `/api/` branch, and that would
    be watching the quiet door. Every mutation a learner makes in this app --
    grading a card, adding a word, renaming a unit, joining a class -- is a
    Server Action, and a Server Action is a POST to a *page* path. Next.js
    does check the Origin against the Host for actions, but that is again a
    default owned by a dependency; this is the same rule stated by the app, in
    one place, over every method that can change something.

    Refused only when a browser says out loud that the mutation came from
    another site. A caller with no browser behind it has no ambient cookie to
    forge with and passes through -- see lib/security/sameOrigin.ts.
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

  if (!supabaseConfigured()) return withCsp(NextResponse.next({ request }));

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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

  const { data: { user } } = await supabase.auth.getUser();

  const isPublicPath =
    request.nextUrl.pathname.startsWith("/sign-in") ||
    request.nextUrl.pathname.startsWith("/welcome") ||
    request.nextUrl.pathname.startsWith("/auth/callback") ||
    // What the app stores has to be readable before anyone signs in to it.
    request.nextUrl.pathname.startsWith("/privacy") ||
    request.nextUrl.pathname.startsWith("/terms") ||
    // The offline fallback holds no data and has to render from the service
    // worker's cache, where there is no session to check.
    request.nextUrl.pathname.startsWith("/offline") ||
    // Aggregate metrics carry their own bearer token and are read by whoever
    // runs the deployment, not by a signed-in learner. Past this gate it
    // authenticates itself, and with no token configured it 404s.
    request.nextUrl.pathname.startsWith("/api/metrics");

  // A signed-in address that is no longer on the allowlist is signed out here
  // rather than only in the OAuth callback, so revoking access takes effect on
  // the next request somebody makes instead of whenever their session expires.
  if (user && !isAllowedEmail(user.email)) {
    await supabase.auth.signOut();
    const denied = request.nextUrl.clone();
    denied.pathname = "/sign-in";
    denied.search = "";
    denied.searchParams.set("denied", "1");
    return withCsp(NextResponse.redirect(denied));
  }

  if (!user && !isPublicPath) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return withCsp(NextResponse.json({ error: "Sign in required." }, { status: 401 }));
    }
    // A first-time visitor has nothing to sign back in to, so the front door is
    // the landing page rather than an account form. Anywhere deeper keeps the
    // old behaviour: sign in, then carry on to where they were going.
    const target = request.nextUrl.clone();
    if (request.nextUrl.pathname === "/") {
      target.pathname = "/welcome";
      target.search = "";
    } else {
      target.pathname = "/sign-in";
      target.search = "";
      // `next` is attacker-controllable and is consumed at the moment a fresh
      // session cookie exists, so it is narrowed to a same-origin path.
      target.searchParams.set(
        "next", safeNext(request.nextUrl.pathname + request.nextUrl.search),
      );
    }
    return withCsp(NextResponse.redirect(target));
  }

  // /welcome stays reachable when signed in — it is a page you might want to
  // show someone. Only the sign-in form itself is pointless once you are in.
  if (user && request.nextUrl.pathname.startsWith("/sign-in")) {
    const home = request.nextUrl.clone();
    home.pathname = "/";
    home.search = "";
    return withCsp(NextResponse.redirect(home));
  }

  return withCsp(response);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
