import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isAllowedEmail, safeNext } from "@/lib/auth/access";
import { hasSessionCookie } from "@/lib/auth/identity";

/**
 * Where every way in lands: Google's OAuth code, and a mailed sign-in link.
 *
 * `next` is attacker-controllable, anyone can hand out a link to
 * `/sign-in?next=…`, and it is consumed at the exact moment a fresh session
 * cookie exists, so it is narrowed to a same-origin path before use. See
 * `safeNext`.
 *
 * TWO SHAPES ARRIVE HERE AND BOTH ARE HANDLED, which is one route rather than
 * two because everything after the exchange is identical: the same allowlist
 * check, the same narrowed redirect, the same refusals. Splitting them would
 * be two places to remember the allowlist, and the allowlist is the one thing
 * on this path that must never be forgotten.
 *
 *   A `code`, from Google and from a mailed link on a Supabase project using
 *   the default email template. PKCE, so the verifier is a cookie in the
 *   browser that asked, which is why the sign-in screen says to open the link
 *   there.
 *
 *   A `token_hash` and a `type`, which is what the email template shape
 *   Supabase documents for server-rendered apps sends instead. It carries its
 *   own proof, so it survives being opened in another browser. Nothing has to
 *   change here to adopt it: an operator edits the template and this route
 *   already answers.
 */

/** The `type` values a mailed link may legitimately carry. */
const EMAIL_OTP_TYPES: readonly EmailOtpType[] = [
  "magiclink",
  "signup",
  "invite",
  "recovery",
  "email_change",
  "email",
];

function emailOtpType(raw: string | null): EmailOtpType | null {
  return EMAIL_OTP_TYPES.find((t) => t === raw) ?? null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = emailOtpType(url.searchParams.get("type"));
  const next = safeNext(url.searchParams.get("next"));

  const settle = async (email: string | null | undefined) => {
    // The allowlist is checked here as well as in the middleware so a rejected
    // address never holds a valid session even briefly.
    if (!isAllowedEmail(email)) {
      const supabase = await createClient();
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL("/sign-in?denied=1", url.origin));
    }
    return NextResponse.redirect(new URL(next, url.origin));
  };

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return settle(data.user?.email);
  } else if (tokenHash && type) {
    /*
      A MAILED LINK CARRIES ITS OWN PROOF, WHICH IS WHY IT NEEDS THIS ONE.

      The PKCE branch above is tied to the browser that asked, because the
      verifier is a cookie there. This branch deliberately is not: a
      `token_hash` survives being opened in another browser, which is the
      whole reason the template shape exists. The cost is that nothing ties
      the link to the person clicking it, so an attacker who requests a magic
      link for an address they control and gets a signed-in learner to open it
      lands that learner in the attacker's account, silently, already at
      whatever `next` says. Everything the learner then writes, every word
      they add, every conversation with Anu, is written into a deck somebody
      else can read.

      So a link that would change who is signed in never just does it. The
      session in the browser is ended and the learner is sent to sign in
      again, with a sentence saying what happened. `next` is deliberately
      dropped: it was chosen by whoever wrote the link, and following it after
      refusing the account it came with is following half of an instruction.

      Nobody signed in is the ordinary case and is untouched, which is what
      makes this safe to do: the mailed link works exactly as it always did
      for the person it was mailed to.
    */
    const names = [...request.headers.get("cookie")?.matchAll(/(?:^|;\s*)([^=;]+)=/g) ?? []]
      .map((m) => m[1]!.trim());
    if (hasSessionCookie(names)) {
      const supabase = await createClient();
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL("/sign-in?switched=1", url.origin));
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return settle(data.user?.email);
  }

  return NextResponse.redirect(new URL("/sign-in?error=1", url.origin));
}
