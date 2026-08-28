import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session cookie on every request (required by
 * @supabase/ssr — Server Components can't write cookies themselves) and
 * gates every route except the public marketing pages behind a session.
 */
export async function middleware(request: NextRequest) {
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
    request.nextUrl.pathname.startsWith("/auth/callback");

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
      target.searchParams.set("next", request.nextUrl.pathname);
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
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
