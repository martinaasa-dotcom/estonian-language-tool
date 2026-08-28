import { createClient } from "@/lib/supabase/server";
import { LOCAL_USER_ID, supabaseConfigured } from "@/lib/auth/mode";

/**
 * The signed-in user's id, for scoping every query to their own data.
 *
 * With Supabase configured the middleware already redirects unauthenticated
 * requests to /sign-in before a server action or page runs, so throwing here
 * means the session cookie was missing or expired between middleware and
 * handler — worth a loud failure rather than silently leaking another user's
 * data. With no Supabase keys the app runs as a single local learner
 * (lib/auth/mode.ts) and every row belongs to LOCAL_USER_ID.
 */
export async function requireUserId(): Promise<string> {
  if (!supabaseConfigured()) return LOCAL_USER_ID;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return user.id;
}

export interface Learner {
  id: string;
  /** Google's name, the email's local part, or a local-mode placeholder. */
  name: string;
  email: string | null;
  avatarUrl: string | null;
}

/** Who is signed in, for greetings and the opt-in class leaderboard. */
export async function currentLearner(): Promise<Learner> {
  if (!supabaseConfigured()) {
    return { id: LOCAL_USER_ID, name: "you", email: null, avatarUrl: null };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const meta = user.user_metadata as { full_name?: string; name?: string; avatar_url?: string } | null;
  const name =
    meta?.full_name?.trim() ||
    meta?.name?.trim() ||
    user.email?.split("@")[0] ||
    "you";

  return {
    id: user.id,
    name,
    email: user.email ?? null,
    avatarUrl: meta?.avatar_url ?? null,
  };
}
