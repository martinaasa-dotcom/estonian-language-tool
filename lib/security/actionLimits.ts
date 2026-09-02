import { bucketForOwner, checkRateLimit } from "./rateLimit";

/**
 * How often one learner may run the actions that do real work per call.
 *
 * THE GATE WAS ON THE WRONG DOOR, AND ONLY ON ONE OF THEM.
 *
 * Five Route Handlers call `checkRateLimit`. Every mutation a learner makes
 * here is a Server Action instead, which is a POST to a page path, and not one
 * of the forty-odd of them had a throttle. The same-origin gate and
 * `requireUserId` mean this is not reachable by an anonymous scraper, so this
 * is not the hole `/api/tutor` would be without its limiter — but sign-up is
 * open by default, and one signed-in account could call any action as fast as
 * it liked. `serverActions.bodySizeLimit` is 16 MB, raised for backup
 * restores and therefore the ceiling on *every* action's payload, so a loop
 * posting near-16 MB bodies at a database-touching action had nothing in the
 * app slowing it down.
 *
 * Not every action needs one. Grading a card, starring a word or toggling a
 * task is a single indexed write, and a person tapping quickly is a person
 * using the app: a limit there would be felt by learners and by nobody else.
 * What is listed here is the work that is genuinely per-call expensive — a
 * whole passage scanned against the dictionary, a backup parsed and written
 * row by row, a class roster read and written, a table of forms built and stored.
 *
 * The numbers are deliberately far above real use. A person importing three
 * word lists in a minute should never meet one of these; a script should meet
 * it immediately. They are a ceiling on abuse, not a pace for anybody.
 */
export const ACTION_LIMITS = {
  /** Reads the deck and scans a pasted passage against the dictionary. */
  buildCloze: { perMinute: 10 },
  /** Writes a row and a card per line of a pasted list. */
  importWords: { perMinute: 10 },
  /** Writes a lexeme and its principal parts into the shared dictionary. */
  editDictionary: { perMinute: 30 },
  /** Resolves a confirmed page against the dictionary and builds cards. */
  saveScan: { perMinute: 15 },
  /** Allocates a join code, which means a uniqueness search per attempt. */
  createClassroom: { perMinute: 6 },
  /**
   * Guessing a code is the reason this one is tightest. Six characters from a
   * 29-symbol alphabet is around 600 million codes, which no human is
   * brute-forcing, and ten a minute makes it no faster than that either.
   */
  joinClassroom: { perMinute: 10 },
  /** Writes a task per member of a class. */
  assignUnit: { perMinute: 10 },
  /** Writes a task per member of a class. */
  assignHomework: { perMinute: 10 },
  /** Parses and writes a whole backup: the most expensive call in the app. */
  restoreBackup: { perMinute: 4 },
  /**
   * Parses a whole backup and writes nothing.
   *
   * `app/api/restore` limits itself and its comment said that limit was "the
   * only thing standing in front of the parse", which was true of the route
   * and not of this file: `inspectBackup` is an export of a `"use server"`
   * module, so it is an endpoint of its own, and it ran `JSON.parse` over a
   * 16 MB body plus a zod walk of every row with nothing in front of it.
   * Higher than the restore's four because looking before you leap is the
   * thing this exists to encourage, and low enough that a loop is not free.
   */
  inspectBackup: { perMinute: 10 },
  /**
   * Sending a suggested fix.
   *
   * Offered on every dead end in the app, which is what makes it the one
   * action a frustrated person can reach several times in a minute without
   * doing anything wrong. Twenty is well past that and far under a script.
   * The row it writes is small; what it is really protecting is the review
   * queue, which is read by a person and only works while its volume means
   * something.
   */
  sendSuggestion: { perMinute: 20 },
  /**
   * Acting on one, which can write to the shared dictionary.
   *
   * Higher than the rest on purpose: working through a queue is exactly the
   * case where a person clicks fast for a long time, and a limit a reviewer
   * meets is a limit that stops the queue being cleared.
   */
  reviewSuggestion: { perMinute: 120 },
} as const;

export type ActionLimit = keyof typeof ACTION_LIMITS;

/**
 * The refusal, in the shape every one of these actions already returns.
 *
 * Worded for a person rather than for a log, and honest about the fact that
 * nothing was lost: somebody who hits one of these was probably clicking
 * twice, and "nothing has changed" is the sentence that stops them worrying
 * about whether half of it went through.
 */
export interface ActionRefusal {
  ok: false;
  error: string;
}

/**
 * Charges one call of `action` to `ownerId`, or returns the refusal to send.
 *
 * Charged to the learner, never to their address, for the reason the whole
 * limiter module gives: twenty-five students in one classroom are one IP.
 */
export function throttleAction(ownerId: string, action: ActionLimit): ActionRefusal | null {
  const { perMinute } = ACTION_LIMITS[action];
  const limit = checkRateLimit(`action:${action}:${bucketForOwner(ownerId)}`, perMinute, 60_000);
  if (limit.ok) return null;
  return {
    ok: false,
    error:
      `That is a lot of requests at once, so this one was not run. Nothing has changed. ` +
      `Try again in ${limit.retryAfterSec ?? 60} seconds.`,
  };
}
