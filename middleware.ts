import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAllowedEmail, safeNext } from "@/lib/auth/access";
import { testUserId } from "@/lib/auth/testSession";

/**
 * Refreshes the Supabase session cookie on every request (required by
 * @supabase/ssr — Server Components can't write cookies themselves) and
 * gates every route except sign-in, its OAuth callback and the public policy
 * pages behind a session.
 *
 * Also enforces the sign-in allowlist. That check lives here rather than only in
 * the callback so that revoking access takes effect on the next request a user
 * makes, not whenever their session happens to expire.
 */
export async function middleware(request: NextRequest) {
  // Local browser tests only; impossible in a production build. See testSession.
  if (testUserId()) return NextResponse.next({ request });

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

  const { pathname } = request.nextUrl;
  const isPublicPath =
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/auth/callback") ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/terms");

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
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    const signIn = request.nextUrl.clone();
    signIn.pathname = "/sign-in";
    signIn.search = "";
    signIn.searchParams.set("next", safeNext(pathname + request.nextUrl.search));
    return NextResponse.redirect(signIn);
  }

  if (user && pathname.startsWith("/sign-in")) {
    const home = request.nextUrl.clone();
    home.pathname = "/";
    home.search = "";
    return NextResponse.redirect(home);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
