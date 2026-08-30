import { createClient } from "@supabase/supabase-js";
import { reportError } from "@/lib/observability/report";
import { supabaseConfigured } from "@/lib/auth/mode";

/**
 * Erasing the sign-in identity, which is the half of deletion the app used to
 * leave behind.
 *
 * `deleteMyAccount` empties every table this app owns, in one transaction, and
 * /privacy promised that as the whole of it. It was not: the identity itself
 * lives in Supabase Auth, not in our schema, so a learner who deleted
 * everything and signed out left their email address, their Google subject id
 * and their sign-in history sitting in the auth store with no route to remove
 * them and nothing on the page admitting it. Article 17 is a right to erasure
 * of personal data, and an email address is personal data wherever it is
 * stored.
 *
 * It needs the service-role key, which is the same key the shared audio cache
 * uses and is server-only for the same reason: it bypasses row-level security.
 * Where that key is not configured the identity genuinely cannot be removed
 * from here, so this returns "cannot" and the caller says so to the learner in
 * as many words. A deletion that quietly leaves something behind is worse than
 * one that reports what it could not reach, because only the second can be
 * followed up.
 */
export type ErasureOutcome =
  /** The auth user is gone. */
  | { erased: true }
  /** There was no auth user to erase: this is a local single-learner install. */
  | { erased: false; reason: "local" }
  /** Configured for sign-in, but this deployment holds no key that can erase. */
  | { erased: false; reason: "no-service-key" }
  /** The call was made and refused. */
  | { erased: false; reason: "failed"; message: string };

export async function eraseAuthIdentity(userId: string): Promise<ErasureOutcome> {
  // No sign-in on this deployment means no identity anywhere but the rows we
  // just deleted. Nothing to do, and nothing to warn about.
  if (!supabaseConfigured()) return { erased: false, reason: "local" };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { erased: false, reason: "no-service-key" };

  try {
    const admin = createClient(url, key, { auth: { persistSession: false } });
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      // Already gone counts as gone. Deleting twice is a thing that happens
      // when somebody presses the button, loses the connection, and presses it
      // again, and telling them the second attempt failed would be a lie.
      if (/not.?found/i.test(error.message)) return { erased: true };
      reportError(new Error(error.message), { at: "auth/erase", ownerId: userId });
      return { erased: false, reason: "failed", message: error.message };
    }
    return { erased: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    reportError(error, { at: "auth/erase", ownerId: userId });
    return { erased: false, reason: "failed", message };
  }
}

/**
 * What the learner is told after their rows are gone.
 *
 * The rows are deleted either way: the identity is a separate store and a
 * failure to reach it must not roll back an erasure that already succeeded.
 * So this is never an error, only a sentence about what is left, and it is
 * empty in the two cases where nothing is.
 */
export function remainingIdentityNote(outcome: ErasureOutcome): string | null {
  if (outcome.erased) return null;
  if (outcome.reason === "local") return null;
  return (
    "Everything this app stored about you is deleted. Your sign-in record, which is " +
    "your email address held by the sign-in provider rather than by this app, could " +
    "not be removed from here. Ask whoever runs this installation to delete it. The " +
    "contact is on the privacy page."
  );
}
