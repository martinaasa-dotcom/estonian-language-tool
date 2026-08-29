import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAllowedEmail, safeNext } from "@/lib/auth/access";

/**
 * Exchanges the Google OAuth code Supabase redirected back with for a session.
 *
 * `next` is attacker-controllable — anyone can hand out a link to
 * `/sign-in?next=…` — and it is consumed at the exact moment a fresh session
 * cookie exists, so it is narrowed to a same-origin path before use. See
 * `safeNext`.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // The allowlist is checked here as well as in the middleware so a rejected
      // address never holds a valid session even briefly.
      if (!isAllowedEmail(data.user?.email)) {
        await supabase.auth.signOut();
        return NextResponse.redirect(new URL("/sign-in?denied=1", url.origin));
      }
      return NextResponse.redirect(new URL(next, url.origin));
    }
  }

  return NextResponse.redirect(new URL("/sign-in?error=1", url.origin));
}
