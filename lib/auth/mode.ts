/**
 * Whether this deployment has Supabase Auth wired up.
 *
 * Two ways to run Kodukeel, and the app has to be honest about which one it is in:
 *
 * - **Hosted**, with Supabase configured: every request is gated by the middleware
 *   and each person sees only their own deck. This is the default for anything on
 *   the public internet.
 * - **Local**, with no Supabase keys: a single learner on one machine — the case a
 *   student or a teacher's laptop actually starts from. Demanding an OAuth project
 *   before the first flashcard is a wall, not security, so we drop the gate and
 *   own the data under one fixed local id.
 *
 * The fallback triggers *only* when the keys are absent. A configured deployment
 * can never be talked into local mode, so this is not an auth bypass.
 */
export function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/**
 * The one shape of this that is neither mode, and must not be read as either.
 *
 * ADR-013 keys local mode on the *absence* of configuration, and a deployment
 * with the URL set and the anon key misspelt is not an absence: it is somebody
 * standing up a hosted install who has made one mistake in a dashboard. Read
 * as local mode it opens that install to the internet under one shared id,
 * with `isAdmin()` true for every visitor, and the sign-in screen reads as
 * "set up later" rather than "the door is open". Read as hosted it would fail
 * on the first Supabase call with a message about a missing key, which is a
 * worse way to find out but at least says so.
 *
 * So it is a third state and the middleware answers 503 while it holds.
 */
export function halfConfigured(): string | null {
  const url = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (url === key) return null;
  return url ? "NEXT_PUBLIC_SUPABASE_ANON_KEY" : "NEXT_PUBLIC_SUPABASE_URL";
}

/** The owner id every row belongs to when running without sign-in. */
export const LOCAL_USER_ID = "local-single-user";
