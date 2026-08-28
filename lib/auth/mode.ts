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

/** The owner id every row belongs to when running without sign-in. */
export const LOCAL_USER_ID = "local-single-user";
