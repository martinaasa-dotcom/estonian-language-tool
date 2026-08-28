import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseConfigured } from "@/lib/auth/mode";

/**
 * Refreshes the Supabase session cookie on every request (required by
 * @supabase/ssr — Server Components can't write cookies themselves) and
 * gates every route except sign-in and its OAuth callback behind a session.
 *
 * With no Supabase keys configured the app is a single-learner local install
 * (lib/auth/mode.ts) and there is no session to refresh or gate — so the
 * middleware steps aside entirely rather than redirecting to a sign-in page
 * that could never sign anyone in.
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
    request.nextUrl.pathname.startsWith("/auth/callback") ||
    // The offline fallback holds no data and has to render from the service
    // worker's cache, where there is no session to check.
    request.nextUrl.pathname.startsWith("/offline");

  if (!user && !isPublicPath) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    const signIn = request.nextUrl.clone();
    signIn.pathname = "/sign-in";
    signIn.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(signIn);
  }

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
