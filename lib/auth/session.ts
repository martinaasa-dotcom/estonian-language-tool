import { createClient } from "@/lib/supabase/server";

/**
 * The signed-in user's id, for scoping every query to their own data.
 * The middleware already redirects unauthenticated requests to /sign-in
 * before a server action or page runs, so this throwing here means the
 * session cookie was missing or expired between middleware and handler —
 * worth a loud failure rather than silently leaking another user's data.
 */
export async function requireUserId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return user.id;
}
