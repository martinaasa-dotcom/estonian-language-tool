import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { LOCAL_USER_ID, supabaseConfigured } from "@/lib/auth/mode";
import { boundedTransport, readIdentity, type Identity, type Learner } from "@/lib/auth/identity";

export type { Learner } from "@/lib/auth/identity";

/**
 * The request's identity, resolved once and shared.
 *
 * `requireUserId` and `currentLearner` used to be two `cache()` entries around
 * two clients, so a page that wanted the owner id and the learner's name paid
 * for two separate trips to the auth service, one after the other, for two
 * halves of one answer. They are one call now, and on a project using
 * asymmetric signing keys that call verifies the token here and reaches the
 * network not at all. See lib/auth/identity.ts for what that trades.
 */
const identity = cache(async (): Promise<Identity> => {
  const transport = boundedTransport();
  const supabase = await createClient(transport.fetch);
  return readIdentity(supabase, transport);
});

/**
 * The same answer, for the one caller outside this file that needs it.
 *
 * `lib/auth/admin.ts` was resolving who is asking with a bare
 * `supabase.auth.getUser()` on an ordinary client, which is the call
 * everything else here stopped making: no 2,500ms deadline, no local
 * verification of the token's signature, and no sharing with the
 * `requireUserId` the same request had already resolved. So an admin page paid
 * two unbounded round trips for one question, and a bad minute at the auth
 * service hung the review queue rather than failing it.
 *
 * Exported rather than reimplemented, because two answers to "who is asking"
 * is the fault this file was written to remove and a privilege check is the
 * worst place to have a second one.
 */
export const currentIdentity = identity;

/**
 * The signed-in user's id, for scoping every query to their own data.
 *
 * With Supabase configured the middleware already redirects unauthenticated
 * requests to /sign-in before a server action or page runs, so throwing here
 * means the session was gone or unverifiable between middleware and handler.
 * That is worth a loud failure rather than silently leaking another user's
 * data, and it is the reason the middleware is allowed to let an unresolved
 * request through at all: this is the check that actually decides.
 *
 * With no Supabase keys the app runs as a single local learner
 * (lib/auth/mode.ts) and every row belongs to LOCAL_USER_ID.
 *
 * Deduplicated per request, which is what makes it cheap enough for every
 * action and page to resolve the user itself. That is the point: an owner id
 * must never be a parameter a caller can supply. Everything in
 * `app/actions.ts` is a public endpoint (`"use server"`), so an `ownerId`
 * argument there would let any signed-in user name somebody else's id and
 * read or write their data.
 */
export const requireUserId = cache(async (): Promise<string> => {
  if (!supabaseConfigured()) return LOCAL_USER_ID;
  const who = await identity();
  if (who.state !== "in") throw new Error("Not signed in.");
  return who.learner.id;
});

/** Who is signed in, for greetings and the opt-in class leaderboard. */
export const currentLearner = cache(async (): Promise<Learner> => {
  if (!supabaseConfigured()) {
    return { id: LOCAL_USER_ID, name: "you", email: null, avatarUrl: null };
  }
  const who = await identity();
  if (who.state !== "in") throw new Error("Not signed in.");
  return who.learner;
});
