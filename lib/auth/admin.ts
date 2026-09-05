import { cache } from "react";
import { LOCAL_USER_ID, supabaseConfigured } from "@/lib/auth/mode";
import { currentLearner } from "@/lib/auth/session";

/**
 * Who may read the suggestion queue and push a change through it.
 *
 * KODUKEEL IS SOFTWARE SOMEBODY INSTALLS, so "the admin" is not a role this
 * app can hand out: it is whoever runs the copy, exactly as the controller on
 * /privacy is. `lib/legal/operator.ts` answers that question from the
 * environment and refuses to invent an answer, and this is the same shape.
 *
 * Two deployments, two answers, and neither of them is a flag:
 *
 * - **Local**, with no Supabase keys, is one learner on their own machine
 *   (ADR-013). Their dictionary is their dictionary and there is nobody else
 *   to moderate, so they review their own queue. Anything else would put a
 *   feature behind an OAuth project they deliberately do not have.
 * - **Hosted**, with Supabase configured, reads `ADMIN_EMAILS`. With none set
 *   nobody is an admin and the queue says so out loud, because a page that
 *   quietly says nothing looks finished. It never falls back to "the first
 *   user" or "anybody signed in": an open sign-up plus a guessed rule is how
 *   a review queue becomes a way to edit the dictionary without review.
 *
 * There is no way to grant this from inside the app, and that is deliberate.
 * A privilege that can be granted by a request is a privilege that can be
 * granted by a forged one.
 */
/**
 * Just the variable this module reads, so a test can pass a plain object
 * rather than cast a whole `ProcessEnv` into being. The same shape
 * `lib/auth/access.ts` uses, and for the same reason.
 */
export interface AdminEnv {
  ADMIN_EMAILS?: string | undefined;
  [key: string]: string | undefined;
}

export function adminEmails(env: AdminEnv = process.env): string[] {
  return (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Exact addresses only, never a domain.
 *
 * `ALLOWED_EMAIL_DOMAINS` is the right shape for "this school may sign in";
 * it is the wrong shape entirely for "this person may rewrite the shared
 * dictionary", where the list should be short enough to read aloud.
 */
export function isAdminEmail(email: string | null | undefined, admins: string[]): boolean {
  if (admins.length === 0) return false;
  const address = (email ?? "").trim().toLowerCase();
  if (!address) return false;
  return admins.includes(address);
}

/** True when somebody has been named as a reviewer. Pure, on the env given. */
export function reviewersNamed(env: AdminEnv = process.env): boolean {
  return adminEmails(env).length > 0;
}

/**
 * True when this deployment has an answer to "who reviews these".
 *
 * A local install always does, because it is one person on one machine. A
 * hosted one has an answer only if it was given one, and the queue says so
 * rather than showing an empty list to everybody.
 */
export function adminsConfigured(): boolean {
  return !supabaseConfigured() || reviewersNamed();
}

/**
 * Whether the current request is from a reviewer.
 *
 * IT ASKS THE IDENTITY THE REQUEST ALREADY RESOLVED, rather than the auth
 * service again. Both functions here built their own Supabase client and
 * called `getUser()`, which is a network round trip with no deadline on it,
 * and `lib/auth/identity.ts` exists because that is what used to cost a page
 * three of them and a gateway error whenever Supabase had a bad minute.
 * CLAUDE.md puts it plainly: who is signed in is worked out, never asked for
 * without a deadline.
 *
 * The cost was being paid by learners rather than by reviewers. Its one caller
 * is `/suggestions`, which is an ordinary page listing the fixes somebody has
 * sent, and the answer decides whether one extra link is drawn, so every
 * signed-in person opening it paid a round trip to Supabase to be told they
 * are not an admin.
 *
 * `currentLearner()` is request-cached and resolves through the same path the
 * middleware and every action use, and the address it carries is a verified
 * claim on the token, which is exactly what `ALLOWED_EMAIL_DOMAINS` is already
 * checked against on every gated request. Nothing is trusted here that is not
 * trusted there.
 */
export const isAdmin = cache(async (): Promise<boolean> => {
  if (!supabaseConfigured()) return true;
  const admins = adminEmails();
  if (admins.length === 0) return false;
  const learner = await currentLearner().catch(() => null);
  return isAdminEmail(learner?.email, admins);
});

/**
 * The reviewer's id, or a throw.
 *
 * Every export of `app/actions.ts` is a public endpoint, so an action that
 * changes the shared dictionary on somebody's say-so has to resolve who is
 * asking rather than take it as an argument. This is the one gate in front of
 * all of them.
 */
export async function requireAdminId(): Promise<string> {
  if (!supabaseConfigured()) return LOCAL_USER_ID;
  // The same resolved identity `isAdmin` reads, and it throws where the
  // session could not be verified rather than returning a default.
  const learner = await currentLearner();
  if (!isAdminEmail(learner.email, adminEmails())) {
    throw new Error("That account does not review suggestions.");
  }
  return learner.id;
}
