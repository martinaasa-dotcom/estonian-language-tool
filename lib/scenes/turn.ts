/**
 * The learner's turn, which is the half with no model in it.
 *
 * `readTurn` is the one producer of `Evidence` and `advance` in `run.ts` is
 * its one consumer, and the type is what keeps a model out: a caller holding
 * only a model's opinion cannot satisfy it (design §8). Every requirement is
 * decided against the dictionary, through the scene's own closed word list,
 * by string comparison, exactly as the writing exercise decides a form.
 *
 * FIVE OUTCOMES, NOT TWO. A turn that did the beat, one that did part of it,
 * one nothing could be made of, one made of real words that were not the
 * point, and one in English. They matter because the other side answers each
 * differently, and because "I did not understand" said to somebody who wrote
 * a clear English sentence is a lie. English is counted and never scolded:
 * reaching for it under pressure is the thing being practised against.
 *
 * Two holes closed on purpose. A bare word is an answer where the beat says
 * so and a dodge where it does not, so a `sentence` beat wants three words.
 * And a turn that repeats the other side's line back is not a turn, however
 * many vouched words it holds.
 *
 * Pure. The context is built by whoever has the dictionary; this file has
 * sets of strings.
 */
import { looksLikeSentence } from "@/lib/estonian/writing";
import { words, type Lexicon } from "./lexicon";
import type { PropValue } from "./props";
import type { Requirement } from "./types";

export interface TurnContext {
  readonly lexicon: Lexicon;
  /** Every form of every question word the course teaches. */
  readonly questionWords: ReadonlySet<string>;
  /** Every form of the negators. */
  readonly negation: ReadonlySet<string>;
  /** Every form of the pronoun the scene's register expects. */
  readonly register: ReadonlySet<string>;
  /** The drawn props, with their accepted spellings already widened by forms. */
  readonly props: readonly PropValue[];
  /** `lemma|CASE` to the spellings that count, for a `case` requirement. */
  readonly caseForms: ReadonlyMap<string, readonly string[]>;
}

export type TurnOutcome =
  /** Every requirement met. */
  | "complete"
  /** Some met, some not. They answer, and ask for the part that is missing. */
  | "incomplete"
  /** Nothing matched and few of the words were vouched for. */
  | "unrecognised"
  /** Vouched words, none of them the point. A narrower re-ask. */
  | "offTarget"
  /** A turn with no Estonian in it. */
  | "english"
  /** The other side's line said back. Not a turn. */
  | "repeat"
  /** One word where a sentence was wanted. A look, and a wait. */
  | "tooShort";

export interface Evidence {
  readonly outcome: TurnOutcome;
  /** Per requirement, in order: met, and with what. */
  readonly met: readonly { met: boolean; with: string | null }[];
  /** Tokens the scene's word list could vouch for. */
  readonly recognised: readonly string[];
  /** Tokens it could not. */
  readonly unknown: readonly string[];
}

/** Common English function words: enough to tell an English sentence from a mistyped Estonian one. */
const ENGLISH_TELLS = new Set([
  "the", "i", "you", "is", "are", "to", "a", "an", "do", "have", "can", "my", "it", "and", "not",
  "what", "how", "please", "sorry", "yes", "no", "want", "need", "this", "that", "for", "of", "in",
  "on", "at", "me", "we", "he", "she", "they", "with", "from", "when", "where", "why", "your",
]);

export function requirementMet(need: Requirement, tokens: readonly string[], text: string, ctx: TurnContext): string | null {
  const has = (set: ReadonlySet<string> | undefined) => tokens.find((t) => set?.has(t)) ?? null;
  switch (need.kind) {
    case "any":
      return tokens[0] ?? "";
    case "lemma":
      for (const lemma of need.oneOf) {
        // A phrase's own words are its forms, so `Tere hommikust!` matches on either half.
        const hit = has(ctx.lexicon.byLemma.get(lemma));
        if (hit) return hit;
      }
      return null;
    case "case": {
      const accepted = ctx.caseForms.get(`${need.lemma}|${need.grammCase}`) ?? [];
      const lower = new Set(accepted.map((a) => a.toLowerCase()));
      return tokens.find((t) => lower.has(t)) ?? null;
    }
    case "datum": {
      const prop = ctx.props.find((p) => p.slot === need.slot);
      if (!prop) return null;
      const lowerText = text.toLowerCase();
      for (const spelling of prop.accepted) {
        const s = spelling.toLowerCase();
        if (/^\d/.test(s)) {
          // Digits are matched as a whole number, so "14" does not hide in "140".
          const re = new RegExp(`(^|[^\\d])${s.replace(/[.:]/g, "[.:]")}(?![\\d])`);
          if (re.test(lowerText)) return spelling;
        } else if (tokens.includes(s)) {
          return spelling;
        }
      }
      return null;
    }
    case "question":
      if (text.trim().endsWith("?")) return "?";
      return has(ctx.questionWords);
    case "negation":
      return has(ctx.negation);
    case "register":
      return has(ctx.register);
  }
}

export function readTurn(input: {
  text: string;
  needs: readonly Requirement[];
  shape: "word" | "sentence";
  ctx: TurnContext;
  /** The other side's last line, so a repeat of it can be told apart. */
  lastLine: string | null;
}): Evidence {
  const { text, needs, shape, ctx, lastLine } = input;
  const tokens = words(text);
  const recognised = tokens.filter((t) => ctx.lexicon.forms.has(t));
  const unknown = tokens.filter((t) => !ctx.lexicon.forms.has(t));
  const met = needs.map((need) => {
    const found = requirementMet(need, tokens, text, ctx);
    return { met: found !== null, with: found };
  });
  const nothing: Evidence = { outcome: "unrecognised", met: met.map(() => ({ met: false, with: null })), recognised, unknown };

  if (tokens.length === 0) return nothing;

  // English before anything else: a clear English sentence is not unreadable Estonian.
  const englishTells = tokens.filter((t) => ENGLISH_TELLS.has(t)).length;
  if (recognised.length === 0 && englishTells >= 1 && tokens.length >= 2) {
    return { ...nothing, outcome: "english" };
  }
  if (recognised.length === 0 && englishTells >= 2) return { ...nothing, outcome: "english" };

  // A line said back is not a turn, however many vouched words it holds.
  if (lastLine) {
    const theirs = new Set(words(lastLine));
    if (tokens.length >= 2 && tokens.every((t) => theirs.has(t))) return { ...nothing, outcome: "repeat" };
  }

  const wanted = met.filter((m) => m.met).length;
  const allMet = met.every((m) => m.met);

  // Nothing the dictionary knows is nothing, however short: the reply is "say again".
  if (recognised.length === 0 && !allMet) return nothing;

  if (shape === "sentence" && !looksLikeSentence(text) && !(allMet && needs.every((n) => n.kind === "datum"))) {
    // A datum can honestly be one word: "Neljapäeval." answers "since when".
    return { outcome: "tooShort", met, recognised, unknown };
  }

  if (allMet) return { outcome: "complete", met, recognised, unknown };
  if (wanted > 0) return { outcome: "incomplete", met, recognised, unknown };
  if (recognised.length >= Math.max(1, Math.ceil(tokens.length / 2))) {
    return { outcome: "offTarget", met, recognised, unknown };
  }
  return { outcome: "unrecognised", met, recognised, unknown };
}
