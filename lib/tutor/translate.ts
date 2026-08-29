import { buildSystemPrompt } from "./prompt";
import { openWithFallback, resolveProviders } from "./provider";

/**
 * One short answer from whichever provider will give one.
 *
 * These two callers want a handful of words, not a conversation, so they get
 * the chain's fallback behaviour and none of its streaming: a gloss that
 * arrives a word at a time is a gloss nobody watches arrive. `cap` stops a
 * model that has decided to write an essay from being read to the end.
 */
async function ask(instruction: string, cap: number): Promise<string | null> {
  const chain = resolveProviders();
  if (chain.length === 0) return null;

  const open = await openWithFallback(chain, buildSystemPrompt("B1"), [
    { role: "user", content: instruction },
  ]);

  let text = "";
  for await (const chunk of open.chunks) {
    text += chunk;
    if (text.length > cap) break;
  }
  return text;
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
export async function translateWithAnu(lemma: string): Promise<string | null> {
  const instruction =
    `Give the English translation of the Estonian word "${lemma}". ` +
    `Reply with the translation only, at most six words, no explanation, no quotes. ` +
    `If you do not know the word, reply exactly: UNKNOWN`;

  try {
    const text = await ask(instruction, 200);
    if (text === null) return null;

    const cleaned = text
      .replace(/^["'\s]+|["'\s.]+$/g, "")
      .split("\n")[0]
      ?.trim();

    if (!cleaned || /^unknown$/i.test(cleaned) || cleaned.length > 80) return null;
    return cleaned;
  } catch {
    return null;
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
export async function translateSentenceWithAnu(sentence: string): Promise<string | null> {
  const instruction =
    `Translate this Estonian sentence into natural English: "${sentence}"\n` +
    `Reply with the English translation only, one sentence, no quotes, no notes. ` +
    `If you cannot translate it, reply exactly: UNKNOWN`;

  try {
    const text = await ask(instruction, 400);
    if (text === null) return null;

    const cleaned = text.replace(/^["'\s]+|["'\s]+$/g, "").split("\n")[0]?.trim();
    if (!cleaned || /^unknown$/i.test(cleaned) || cleaned.length > 240) return null;
    return cleaned;
  } catch {
    return null;
  }
}
