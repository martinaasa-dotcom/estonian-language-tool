import { buildSystemPrompt } from "./prompt";
import { resolveProvider, streamReply } from "./provider";

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
  const config = resolveProvider();
  if (!config) return null;

  const instruction =
    `Give the English translation of the Estonian word "${lemma}". ` +
    `Reply with the translation only — at most six words, no explanation, no quotes. ` +
    `If you do not know the word, reply exactly: UNKNOWN`;

  try {
    let text = "";
    for await (const chunk of streamReply(config, buildSystemPrompt("B1"), [
      { role: "user", content: instruction },
    ])) {
      text += chunk;
      if (text.length > 200) break;
    }

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
