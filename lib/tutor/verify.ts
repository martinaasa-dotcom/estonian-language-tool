/**
 * Enforces ADR-005 on what the grader says, rather than asking it nicely.
 *
 * The grader prompt tells the model it may only mention Estonian forms it was
 * given. A live test showed it does reach for forms unprompted — in that case
 * one that happened to be on the list, which is precisely why this cannot be
 * left to luck. A prompt is a request; this is the check.
 *
 * The rule: every Estonian word the model writes must be one that was supplied
 * to it, or one the learner wrote themselves. Anything else is a form the model
 * produced from its own knowledge of Estonian morphology, which is the thing the
 * whole project refuses to trust. A comment that breaks the rule is withheld
 * rather than shown with a caveat, because a caveat still puts a wrong form in
 * front of someone who is trying to memorize forms.
 *
 * Pure, and deliberately conservative about what counts as Estonian: the cost of
 * a false negative (an English word missed) is nothing, while the cost of a
 * false positive is a withheld comment that was fine.
 */

import { TAGGED_LINE } from "@/lib/tutor/markers";

/** Letters that only appear in Estonian, never in the English around them. */
const ESTONIAN_LETTERS = /[õäöüšž]/i;

/** Words the model may write in Estonian without them being *forms* of anything. */
const GRAMMATICAL_TERMS = new Set([
  "osastav", "omastav", "nimetav", "sisseütlev", "seesütlev", "seestütlev",
  "alaleütlev", "alalütlev", "alaltütlev", "saav", "rajav", "olev", "ilmaütlev",
  "kaasaütlev", "astmevaheldus", "rektsioon", "välde", "tegusõna", "nimisõna",
  "ainsus", "mitmus", "eesti", "tere",
]);

function normalise(word: string): string {
  return word.toLowerCase().replace(/[^\p{L}\p{M}-]/gu, "");
}

/**
 * Words the comment is allowed to contain: everything supplied to the model,
 * plus everything the learner wrote (quoting the learner back is not inventing).
 */
export function buildAllowlist(
  knownForms: string[],
  learnerSentence: string,
  englishGlosses: string[] = [],
): Set<string> {
  const allowed = new Set<string>();
  // The English translation is fair game: quoting "history" while discussing
  // ajalugu is an explanation, not a morphological claim.
  for (const gloss of englishGlosses) {
    for (const part of gloss.split(/[\s,;/()-]+/)) {
      const key = normalise(part);
      if (key) allowed.add(key);
    }
  }
  for (const form of knownForms) {
    const key = normalise(form);
    if (key) allowed.add(key);
    // Compounds are supplied whole but discussed by part.
    for (const part of form.split(/[\s-]+/)) {
      const p = normalise(part);
      if (p) allowed.add(p);
    }
  }
  for (const word of learnerSentence.split(/\s+/)) {
    const key = normalise(word);
    if (key) allowed.add(key);
  }
  for (const term of GRAMMATICAL_TERMS) allowed.add(term);
  return allowed;
}

/**
 * Estonian-looking words in the comment.
 *
 * Two signals, because neither alone is enough. A word in single or double
 * quotes is one the model is presenting *as* a form — that is the shape a
 * correction takes. A word containing õäöüšž is Estonian whether quoted or not.
 * An unquoted, undiacriticked Estonian word is indistinguishable from English
 * here and is let through; that is the deliberate false-negative side of the
 * trade.
 */
export function estonianTokens(comment: string): string[] {
  const found = new Set<string>();

  for (const match of comment.matchAll(/["'“”‘’]([\p{L}\p{M}-]{2,})["'“”‘’]/gu)) {
    const word = normalise(match[1] ?? "");
    if (word) found.add(word);
  }

  for (const match of comment.matchAll(/[\p{L}\p{M}-]{2,}/gu)) {
    const word = match[0];
    if (ESTONIAN_LETTERS.test(word)) {
      const key = normalise(word);
      if (key) found.add(key);
    }
  }

  return [...found];
}

/**
 * Which of the two things a withheld note actually did, because the learner is
 * told about it and the two sentences are not interchangeable.
 *
 * `estonian-form` is certain: the word carried one of õäöüšž, so it is Estonian
 * whatever else it is. `unvouched-word` is the weaker inference `looksInflected`
 * makes, that a word of five letters or more which nothing supplied is more
 * likely an inflected form than an English word the note happened to quote. That
 * inference is deliberately biased toward withholding and it is wrong sometimes:
 * `gradeComposition` is handed no glosses and an allowlist of the learner's own
 * text, so Anu quoting "weather" in an otherwise English note lands here. The
 * note is still withheld, which is the safe error. Telling the learner she used
 * an Estonian form is not, because that is a claim about what happened rather
 * than about what could be ruled out, and a guard that overstates what it caught
 * is a guard nobody believes the day it catches something real.
 */
export type WithholdReason = "estonian-form" | "unvouched-word";

export interface VerifiedComment {
  /** The comment, or null when it must not be shown. */
  comment: string | null;
  /** Forms the model introduced that it was never given. */
  unverified: string[];
  /** Why it was withheld, or null when nothing was. */
  reason: WithholdReason | null;
}

/**
 * Checks a grader comment against what the model was actually given.
 *
 * An English word in quotes ("the word 'room' is...") is not an Estonian form
 * and would be a false positive, so a token is only counted against the model
 * when it is absent from the allowlist *and* looks Estonian — either it carries
 * an Estonian letter, or it is not a word of the English the comment is written
 * in. The second is approximated by a small stop-list, which is enough: the
 * failure this guards against is a *morphological* form, and those are long and
 * distinctive.
 */
export function verifyComment(
  comment: string,
  knownForms: string[],
  learnerSentence: string,
  englishGlosses: string[] = [],
): VerifiedComment {
  if (!comment.trim()) return { comment: null, unverified: [], reason: null };

  const allowed = buildAllowlist(knownForms, learnerSentence, englishGlosses);
  const unverified: string[] = [];
  // Whether anything caught is certainly Estonian, rather than merely long
  // enough that withholding was the safer guess. Both withhold; they are not
  // the same thing to say out loud, so the caller is told which happened.
  let certain = false;

  for (const token of estonianTokens(comment)) {
    if (allowed.has(token)) continue;
    // A quoted English word is common in an explanation; only flag a token that
    // is actually Estonian-looking or long enough to be an inflected form.
    if (!isCandidateForm(token)) continue;
    unverified.push(token);
    if (ESTONIAN_LETTERS.test(token)) certain = true;
  }

  return unverified.length > 0
    ? { comment: null, unverified, reason: certain ? "estonian-form" : "unvouched-word" }
    : { comment, unverified: [], reason: null };
}

/**
 * English words an explanation quotes about itself.
 *
 * Not an attempt at an English dictionary — the words a *grammar note* puts in
 * quotes are a small and predictable set, and the vocabulary being discussed is
 * covered by the glosses instead.
 */
const ENGLISH_STOPWORDS = new Set([
  "the", "and", "but", "for", "not", "you", "your", "this", "that", "with",
  "into", "from", "onto", "about", "there", "here", "which", "would", "should",
  "correct", "wrong", "case", "form", "verb", "noun", "adjective", "sentence",
  "partitive", "genitive", "nominative", "illative", "inessive", "elative",
  "allative", "adessive", "ablative", "translative", "terminative", "essive",
  "abessive", "comitative", "singular", "plural", "ongoing", "complete",
  "completed", "object", "subject", "negation", "aspect", "stem", "ending",
  "gradation", "infinitive", "participle", "present", "past", "tense", "word",
  "words", "order", "meaning", "means", "instead", "because", "still",
]);

/**
 * Whether a quoted word is plausibly an Estonian inflected form rather than an
 * English word the explanation happens to quote.
 */
function looksInflected(token: string): boolean {
  if (ENGLISH_STOPWORDS.has(token)) return false;
  // Estonian inflected forms are rarely shorter than five letters, and an
  // English word that long being quoted in a grammar note is uncommon enough
  // that withholding the comment is the safer error.
  return token.length >= 5;
}

/**
 * Whether a token `estonianTokens` found is worth checking against anything
 * at all, shared by `verifyComment` and `chatEstonianTokens` so the two
 * cannot drift into judging the same token by different rules. A
 * grammatical term names the lesson, not a word in it; anything else has to
 * carry an Estonian letter or be long enough that an English word that long
 * being quoted here would be unusual.
 */
function isCandidateForm(token: string): boolean {
  if (GRAMMATICAL_TERMS.has(token)) return false;
  return ESTONIAN_LETTERS.test(token) || looksInflected(token);
}

/** Lines the UI already boxes and tags "AI · verify" on their own: a
 *  corrected sentence (`FIX:`) and a suggested word pair (`VOCAB:`), both
 *  parsed out of the reply by `AnuParts.tsx`. Flagging a word inside one of
 *  these a second time would be noise, not information. The shape is
 *  `lib/tutor/markers.ts`'s, so this and the UI cannot disagree about which
 *  lines those are. */

/**
 * Estonian-looking words in Anu's free chat prose, the parts of a reply that
 * carry none of the grader's tagging and none of its allowlist either: there
 * is no one word or one sentence this call was about, so there is nothing to
 * check a token *against* here, only whether it looks like a form at all.
 * `app/api/tutor/route.ts` takes what this returns and checks each one
 * against the dictionary itself, the same way a scanned word is vouched for
 * (ADR-021).
 *
 * Conservative in exactly the way `estonianTokens` already is: an unquoted,
 * undiacriticked Estonian word is indistinguishable from English here and is
 * let through, because the cost of missing one is nothing next to the cost
 * of a false alarm on a genuine explanation.
 *
 * WHICH MAKES THIS THE WEAKER OF THE TWO GUARDS, ON THE BUSIER PATH, AND THAT
 * IS DELIBERATE RATHER THAN OVERLOOKED. `verifyComment` is a gate: it runs on a
 * complete reply and withholds it, so the learner never sees the form at all.
 * This cannot be, because the chat streams on purpose and most of a reply is
 * already on screen by the time it ends, so `flagUnverifiedEstonian` is a notice
 * printed under an answer the learner has already read. The hole that leaves is
 * worth naming rather than implying: `isCandidateForm` only reaches a word that
 * is quoted or carries õäöüšž, and a great deal of Estonian is neither, so
 * `sa oled kodus` written straight into a sentence of prose passes untouched.
 *
 * Widening the extractor is not the obvious fix it looks like. The dictionary
 * behind this one removes a false positive only where the word happens to be an
 * Estonian lemma; an English word that is not one comes back unmatched and would
 * be flagged as an unverified Estonian form, which trains the learner to ignore
 * the line on the day it is right. So the recall stays where the precision is,
 * and the reply's Estonian claims are boxed and tagged in the UI instead.
 * ADR-005, amendment 2.
 */
export function chatEstonianTokens(reply: string): string[] {
  const untagged = reply
    .split("\n")
    .filter((line) => !TAGGED_LINE.test(line.trim()))
    .join("\n");
  return estonianTokens(untagged).filter(isCandidateForm);
}
