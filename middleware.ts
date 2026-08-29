import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseConfigured } from "@/lib/auth/mode";
import { isAllowedEmail, safeNext } from "@/lib/auth/access";

/**
 * Refreshes the Supabase session cookie on every request (required by
 * @supabase/ssr — Server Components can't write cookies themselves) and
 * gates every route except the public ones — the landing page, sign-in, the
 * OAuth callback and the offline fallback — behind a session.
 *
 * With no Supabase keys configured the app is a single-learner local install
 * (lib/auth/mode.ts) and there is no session to refresh or gate — so the
 * middleware steps aside entirely rather than redirecting to a sign-in page
 * that could never sign anyone in.
 *
 * It also enforces the optional sign-in allowlist, here rather than only in the
 * OAuth callback, so revoking access takes effect on the next request somebody
 * makes instead of whenever their session happens to expire.
 */
export async function middleware(request: NextRequest) {
  if (!supabaseConfigured()) return NextResponse.next({ request });

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
    request.nextUrl.pathname.startsWith("/privacy") ||
    request.nextUrl.pathname.startsWith("/terms") ||
    // The offline fallback holds no data and has to render from the service
    // worker's cache, where there is no session to check.
    request.nextUrl.pathname.startsWith("/offline");

  // A signed-in address that is no longer on the allowlist is signed out here,
  // before any page or server action reads its data.
  if (user && !isAllowedEmail(user.email)) {
    await supabase.auth.signOut();
    const denied = request.nextUrl.clone();
    denied.pathname = "/sign-in";
    denied.search = "";
    denied.searchParams.set("denied", "1");
    return NextResponse.redirect(denied);
  }

  if (!user && !isPublicPath) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
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
      target.searchParams.set(
        "next", safeNext(request.nextUrl.pathname + request.nextUrl.search),
      );
    }
    return NextResponse.redirect(target);
  }

  // /welcome stays reachable when signed in — it is a page you might want to
  // show someone. Only the sign-in form itself is pointless once you are in.
  if (user && request.nextUrl.pathname.startsWith("/sign-in")) {
    const home = request.nextUrl.clone();
    home.pathname = "/";
    home.search = "";
    return NextResponse.redirect(home);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
