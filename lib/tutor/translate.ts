import { after } from "next/server";
import { buildSystemPrompt } from "./prompt";
import { openWithFallback, resolveProviders } from "./provider";
import { authoriseCall, recordUsage, releaseReservation } from "@/lib/usage/ledger";

/**
 * What came back, or why nothing did.
 *
 * A bare `string | null` could not tell "the model did not know that word"
 * apart from "you have asked for thirty of these today", and the second is a
 * thing a person can act on. The dictionary treats both as a blank either way;
 * the caller that has a screen to say something on says the right thing.
 */
export type TranslationOutcome =
  | { ok: true; text: string }
  /** No provider configured, or the model had nothing useful to say. */
  | { ok: false; reason: "unavailable" }
  /** The daily allowance or the deployment's budget said no. */
  | { ok: false; reason: "quota"; message: string; retryAfterSeconds?: number };

/**
 * One short answer from whichever provider will give one.
 *
 * These two callers want a handful of words, not a conversation, so they get
 * the chain's fallback behavior and none of its streaming: a gloss that
 * arrives a word at a time is a gloss nobody watches arrive. `cap` stops a
 * model that has decided to write an essay from being read to the end.
 *
 * THE METER IS IN HERE RATHER THAN IN EACH CALLER, BECAUSE IT WAS IN NEITHER.
 * Every route that reaches a paid provider calls `authoriseCall` before and
 * `recordUsage` after, and CLAUDE.md states that as a rule with no exceptions.
 * These two functions were the exception: a dictionary search that missed
 * locally and missed on Wiktionary fired a real completion with no burst
 * limit, no daily allowance, no global budget check, and no row in the ledger
 * afterwards. Fifty pasted words was fifty unmetered calls that the Settings
 * usage meter would then report as nothing having been spent, which is the
 * one failure mode a cap must not have: quietly measuring less than was spent.
 *
 * Putting it in `ask` rather than in the two callers is deliberate. The next
 * short helper that wants a sentence out of a model will be written by
 * reaching for this function, and it inherits the meter by doing so.
 *
 * `GRADER` is the right kind: a few hundred tokens about one word, capped
 * below at 200 or 400 characters of reply, which is what that allowance was
 * sized for. It is not a new tier, because a new tier is a new number nobody
 * has a reason for.
 */
async function ask(
  ownerId: string,
  instruction: string,
  cap: number,
): Promise<TranslationOutcome> {
  const chain = resolveProviders();
  if (chain.length === 0) return { ok: false, reason: "unavailable" };

  const decision = await authoriseCall(ownerId, "GRADER");
  if (!decision.allowed) {
    return {
      ok: false,
      reason: "quota",
      // Every refusal the quota can return carries a sentence; the type allows
      // it not to, and a blank error box would be the one refusal a learner
      // cannot act on.
      message: decision.message ?? "That is as many as the daily allowance covers. Try again tomorrow.",
      retryAfterSeconds: decision.retryAfterSeconds,
    };
  }

  let open;
  try {
    open = await openWithFallback(
      chain,
      buildSystemPrompt("B1"),
      [{ role: "user", content: instruction }],
      // Settles the reservation above, charged to the provider that actually
      // answered. Reported even when the reply is thrown away below for being
      // too long or unusable: the tokens were spent whatever we did with them,
      // and a cap that only counts the answers it liked is not counting.
      (usage, config) => {
        after(() => recordUsage({
          ownerId, kind: "GRADER", provider: config.name, model: config.model,
          inputTokens: usage.inputTokens, outputTokens: usage.outputTokens,
          reservation: decision.reservation,
        }));
      },
    );
  } catch (error) {
    // No provider took the question, so nothing was spent and the
    // authorization goes back. Without this, a gloss nobody could get would
    // still count against the day.
    const booking = decision.reservation;
    if (booking) after(() => releaseReservation(booking));
    throw error;
  }

  let text = "";
  for await (const chunk of open.chunks) {
    text += chunk;
    if (text.length > cap) break;
  }
  return { ok: true, text };
}

/**
 * Last-resort English gloss for a word neither the seed nor Wiktionary has.
 *
 * This is the only place the model is asked to *produce* Estonian-related content
 * rather than explain it, and it is deliberately narrow: a short English gloss for
 * a word whose authoritative Estonian forms we already hold from Ekilex. The model
 * never supplies an inflected form (ADR-005), and anything it returns is stored as
 * a translation the learner can overwrite.
 */
export async function translateWithAnu(
  ownerId: string,
  lemma: string,
): Promise<TranslationOutcome> {
  const instruction =
    `Give the English translation of the Estonian word "${lemma}". ` +
    `Reply with the translation only, at most six words, no explanation, no quotes. ` +
    `If you do not know the word, reply exactly: UNKNOWN`;

  try {
    const answer = await ask(ownerId, instruction, 200);
    if (!answer.ok) return answer;

    const cleaned = answer.text
      .replace(/^["'\s]+|["'\s.]+$/g, "")
      .split("\n")[0]
      ?.trim();

    if (!cleaned || /^unknown$/i.test(cleaned) || cleaned.length > 80) {
      return { ok: false, reason: "unavailable" };
    }
    return { ok: true, text: cleaned };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

/**
 * English for one attested Estonian sentence.
 *
 * The same narrow permission as `translateWithAnu`: the model translates *into*
 * English, which is the direction ADR-005 allows. It is never asked to produce
 * the Estonian — that sentence came from Ekilex and is not ours to rewrite — so
 * the worst a bad model can do here is gloss it clumsily, never teach an
 * invented form. What comes back is stored tagged as AI and shown as such.
 */
export async function translateSentenceWithAnu(
  ownerId: string,
  sentence: string,
): Promise<TranslationOutcome> {
  const instruction =
    `Translate this Estonian sentence into natural English: "${sentence}"\n` +
    `Reply with the English translation only, one sentence, no quotes, no notes. ` +
    `If you cannot translate it, reply exactly: UNKNOWN`;

  try {
    const answer = await ask(ownerId, instruction, 400);
    if (!answer.ok) return answer;

    const cleaned = answer.text.replace(/^["'\s]+|["'\s]+$/g, "").split("\n")[0]?.trim();
    if (!cleaned || /^unknown$/i.test(cleaned) || cleaned.length > 240) {
      return { ok: false, reason: "unavailable" };
    }
    return { ok: true, text: cleaned };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
