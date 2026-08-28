import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * The signed-in user's id, for scoping every query to their own data.
 * The middleware already redirects unauthenticated requests to /sign-in
 * before a server action or page runs, so this throwing here means the
 * session cookie was missing or expired between middleware and handler —
 * worth a loud failure rather than silently leaking another user's data.
 *
 * Deduplicated per request with React `cache`, because `getUser()` validates
 * the token with Supabase over the network. That makes it cheap enough for
 * every action and page to resolve the user itself, which is the point: an
 * owner id must never be a parameter a caller can supply. Everything in
 * `app/actions.ts` is a public endpoint (`"use server"`), so an `ownerId`
 * argument there would let any signed-in user name somebody else's id and
 * read or write their data.
 */
export const requireUserId = cache(async (): Promise<string> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return user.id;
});
