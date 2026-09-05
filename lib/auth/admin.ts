import { cache } from "react";
import { currentIdentity } from "@/lib/auth/session";
import { LOCAL_USER_ID, supabaseConfigured } from "@/lib/auth/mode";

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
 * Deduplicated per request like `requireUserId`, for the same reason: it
 * validates the token with Supabase over the network, and a page that shows
 * six admin-only sections should not ask six times.
 */
export const isAdmin = cache(async (): Promise<boolean> => {
  if (!supabaseConfigured()) return true;
  const admins = adminEmails();
  if (admins.length === 0) return false;
  /*
    Through the same bounded, per-request identity every other gate uses.
    `state !== "in"` covers an unreachable auth service as well as a signed-out
    one, and both answer no: a privilege check is the one place where "we could
    not tell" must never mean yes.
  */
  const who = await currentIdentity();
  if (who.state !== "in") return false;
  return isAdminEmail(who.learner.email, admins);
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
  const who = await currentIdentity();
  if (who.state !== "in") throw new Error("Not signed in.");
  if (!isAdminEmail(who.learner.email, adminEmails())) {
    throw new Error("That account does not review suggestions.");
  }
  return who.learner.id;
}
