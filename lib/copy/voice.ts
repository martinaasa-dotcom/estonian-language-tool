/*
  THE VOICE. ONE TABLE OF WHAT GIVES A SENTENCE AWAY AS GENERATED.

  Every screen in this app is one person explaining Estonian to another. That
  is not decoration. Somebody using this is usually also sitting in a class in
  Tallinn or reading a textbook at a kitchen table, and the moment a screen
  starts sounding like a product brochure they stop reading it the way they
  read their teacher. A learner skims marketing. They do not skim a teacher.

  The rule was already half here and in two places. `readerCopy.test.ts` swept
  the whole tree for a dash and swept six public files for nine brochure words;
  `humanize.ts` stripped a handful of stock openers out of Anu on the way past;
  `prompt.ts` asked the model for the same thing in its own words. Three lists,
  none of them the same, and the one that covered hand-written copy covered six
  files out of four hundred. So a phrase banned in Anu's answer was fine in the
  panel beside it.

  This is the one table. `readerCopy.test.ts` reads it to sweep hand-written
  copy, `humanize.ts` reads the rewritable subset to clean Anu's stream, and
  `prompt.ts` reads `VOICE_RULES` so what the model is asked for is what the
  sweep enforces. A copy of any of it living in one of those files is the fault
  this file exists to end, the same argument `PROVIDER_KEY_ENV` makes about
  itself.

  WHAT THIS CAN AND CANNOT DO. It catches the mechanical tells: a character, a
  phrase, a sentence shape. It cannot see whether a paragraph is warm, and it
  cannot see whether it is too long. Those are a review standard and they are
  written down in `docs/18-voice.md` with worked examples, because a rule with
  no example is a rule everybody reads as agreeing with what they already
  wrote. What is here is the half a machine can hold.

  ADDING ONE. A tell has to be a phrase that is never right on a screen in this
  app, not a word somebody dislikes. `perfect` is not on the list, because
  taisminevik is the perfect tense and a grammar page has to be able to say so.
  `unlock` is not on the list, because the exam recordings genuinely unlock.
  A tell that fires on honest copy gets waived, and a check everybody waives
  is a check nobody reads.
*/

/**
 * The two characters, kept here rather than beside the code that strips them.
 *
 * A dash used as a clause break is the loudest single tell there is, which is
 * why it was the first rule written and why it lives at the top of the table
 * everything else now hangs off.
 */
export const EM_DASH = "—";
export const EN_DASH = "–";

export interface Tell {
  /** A short name, printed when a sweep fails so the failure says what it found. */
  readonly name: string;
  /** The shape, unanchored, matched case-insensitively against a line of copy. */
  readonly find: RegExp;
  /** What a teacher would have written instead. Printed with the failure. */
  readonly instead: string;
  /**
   * How Anu's stream removes it, where removing it is safe.
   *
   * Only a phrase that carries no information gets one of these. A brochure
   * adjective has no mechanical replacement (there is no rule that turns
   * "seamless" into the thing the writer actually meant), so it is detected in
   * hand-written copy, asked against in the prompt, and left alone in a stream
   * rather than rewritten into something the model did not say.
   */
  readonly rewrite?: { readonly pattern: RegExp; readonly with: string };
}

/**
 * Openers that carry no information at all.
 *
 * A learner who asked how the partitive works should meet the answer, not walk
 * past a sentence of throat-clearing to reach it. These are the ones with a
 * safe rewrite, because deleting them leaves exactly the sentence the writer
 * meant and nothing else.
 */
const OPENERS: Tell[] = [
  {
    name: "important to note",
    find: /\bit'?s important to note\b|\bit is important to note\b|\bit should be noted\b/i,
    instead: "Say the thing. If it were not worth noting it would not be on the screen.",
    rewrite: { pattern: /^it'?s important to note that\s+/i, with: "" },
  },
  {
    name: "worth noting",
    find: /\bit'?s worth noting\b|\bit is worth noting\b|\bit'?s worth mentioning\b/i,
    instead: "Say the thing.",
    rewrite: { pattern: /^it'?s worth noting that\s+/i, with: "" },
  },
  {
    name: "worth noting (long form)",
    find: /\bit is worth noting that\b/i,
    instead: "Say the thing.",
    rewrite: { pattern: /^it is worth noting that\s+/i, with: "" },
  },
  {
    name: "at the end of the day",
    find: /\bat the end of the day\b/i,
    instead: "Nothing. Cut it and read the sentence again.",
    rewrite: { pattern: /^at the end of the day,?\s+/i, with: "" },
  },
  {
    name: "in essence",
    find: /\bin essence\b/i,
    instead: "Nothing, or the plain summary it was standing in for.",
    rewrite: { pattern: /^in essence,?\s+/i, with: "" },
  },
  {
    name: "great question",
    find: /\bgreat question\b|\bexcellent question\b|\bthat'?s a great\b/i,
    instead: "The answer.",
    rewrite: { pattern: /^great question!?\s*/i, with: "" },
  },
  {
    name: "certainly",
    find: /^\s*certainly[!,.]/i,
    instead: "The answer.",
    rewrite: { pattern: /^certainly!?\s*/i, with: "" },
  },
  {
    name: "in conclusion",
    find: /\bin conclusion\b|\bto sum up\b|\bin summary,/i,
    instead: "A short screen needs no summary. A long one needs to be shorter.",
    rewrite: { pattern: /^in conclusion,?\s+/i, with: "" },
  },
  {
    name: "moreover",
    find: /\bmoreover\b|\bfurthermore\b/i,
    instead: "A full stop and the next sentence, or 'and'.",
    rewrite: { pattern: /^(moreover|furthermore),?\s+/i, with: "" },
  },
  {
    name: "additionally",
    find: /\badditionally,/i,
    instead: "'Also', or nothing.",
    rewrite: { pattern: /^additionally,?\s+/i, with: "" },
  },
  {
    name: "needless to say",
    find: /\bneedless to say\b|\brest assured\b/i,
    instead: "If it is needless, cut it. If it is not, say it plainly.",
    rewrite: { pattern: /^(needless to say|rest assured),?\s+/i, with: "" },
  },
  {
    name: "that being said",
    find: /\bthat being said\b/i,
    instead: "'But', or a full stop and the next sentence.",
    rewrite: { pattern: /^that being said,?\s+/i, with: "" },
  },
];

/**
 * Sentence shapes rather than words.
 *
 * These are the ones people miss when they sweep for vocabulary, because every
 * word in them is ordinary. The construction is the tell: a small claim
 * inflated by being denied first. A teacher says what a thing is.
 */
const SHAPES: Tell[] = [
  {
    name: "not just X, but Y",
    find: /\bnot just\s+[^,.;]+,\s+but\b/i,
    instead: "'X, and Y'. Say both things without staging a reveal.",
    rewrite: { pattern: /\bnot just\s+([^,.;]+),\s+but\s+/gi, with: "$1, and " },
  },
  {
    name: "it is not about X, it is about Y",
    find: /\bit'?s not (just )?about\b[^.!?]{0,60}\bit'?s about\b/i,
    instead: "Say what it is about, once.",
  },
  {
    name: "more than just",
    find: /\bmore than just\b|\bisn'?t just\b|\bis not just a\b/i,
    instead: "Say what it is.",
  },
  {
    name: "that is where X comes in",
    find: /\bthat'?s where\b[^.!?]{0,40}\bcomes in\b/i,
    instead: "Say what the thing does.",
  },
];

/**
 * The brochure.
 *
 * None of these has ever been the most accurate word available for anything on
 * a screen in this app, and every one of them is what a sentence reaches for
 * when it has decided to sound impressive before it has decided what to say.
 * They are detected, never rewritten: there is no mechanical translation from
 * "seamless" back into whatever was meant.
 */
const BROCHURE: Tell[] = [
  {
    name: "delve",
    find: /\bdelv(e|es|ing)\b/i,
    instead: "'Look at', 'read', 'go through'.",
  },
  {
    name: "leverage",
    find: /\bleverag(e|es|ed|ing)\b/i,
    instead: "'Use'. Nobody has ever leveraged a flashcard.",
  },
  {
    name: "utilise",
    find: /\butili[sz](e|es|ed|ing|ation)\b/i,
    instead: "'Use'. It is the same word with fewer letters.",
  },
  {
    name: "seamless",
    find: /\bseamless(ly)?\b|\beffortless(ly)?\b|\bfrictionless\b/i,
    instead: "Say what actually happens. Nothing here is effortless, it is spaced repetition.",
  },
  {
    name: "cutting edge",
    find: /\bcutting[- ]edge\b|\bstate[- ]of[- ]the[- ]art\b|\bnext[- ]generation\b/i,
    instead: "Name the thing and let the reader judge it.",
  },
  {
    name: "groundbreaking",
    find: /\bgroundbreaking\b|\brevolutionar(y|ise|ize)\b|\brevoluti[sz]?on(ise|ize|ising|izing)\b|\bgame[- ]chang(er|ing)\b/i,
    instead: "Say what it does differently from what came before.",
  },
  {
    name: "world class",
    find: /\bworld[- ]class\b|\bbest[- ]in[- ]class\b|\bindustry[- ]leading\b|\bunparalleled\b/i,
    instead: "A claim a reader can check, or nothing.",
  },
  {
    name: "transformative",
    find: /\btransformative\b|\bholistic\b|\bsyner(gy|gies|gistic)\b|\bparadigm shift\b/i,
    instead: "Plain words. There is no holistic way to learn the partitive.",
  },
  {
    name: "bespoke",
    find: /\bbespoke\b|\bmeticulous(ly)?\b|\bcurated\b|\bhand[- ]crafted\b/i,
    instead: "'Chosen', 'written', 'checked', and say by whom.",
  },
  {
    name: "plethora",
    find: /\bplethora\b|\bmyriad\b|\bmultitude of\b|\ba wide (range|variety) of\b|\ban array of\b/i,
    instead: "A number. This app knows how many words it has.",
  },
  {
    name: "tapestry",
    find: /\b(rich )?tapestry\b|\bin the realm of\b|\blandscape of\b/i,
    instead: "The plain noun.",
  },
  {
    name: "ever-evolving",
    find: /\bever[- ](evolving|changing|growing)\b|\bfast[- ]paced\b|\bin today'?s\b/i,
    instead: "Say what changed, or cut the sentence.",
  },
  {
    name: "testament to",
    find: /\b(a|is a) testament to\b/i,
    instead: "'Shows', or say the fact directly.",
  },
  {
    name: "embark",
    find: /\bembark(ing)? on\b|\byour (\w+ )?journey\b|\bthe journey (to|of)\b/i,
    instead: "'Start'. Somebody learning Estonian is learning Estonian.",
  },
  {
    name: "unleash",
    find: /\bunleash\b|\bsupercharge\b|\bturbocharge\b|\bskyrocket\b/i,
    instead: "Say what improves and roughly by how much.",
  },
  {
    name: "empower",
    find: /\bempower(s|ing|ed)?\b|\belevate your\b|\bunlock (the|your) (power|potential|secret)/i,
    instead: "'Lets you', and then what.",
  },
  {
    name: "harness the",
    find: /\bharness(es|ing)? the\b/i,
    instead: "'Use', and then say what for.",
  },
  {
    name: "next level",
    find: /\b(take|takes|bring|brings)\b[^.!?]{0,40}\bto the next level\b/i,
    instead: "Say what gets better.",
  },
  {
    name: "dive in",
    find: /\b(let'?s )?div(e|ing) (in|into)\b|\bdeep dive\b/i,
    instead: "'Start', 'open', 'read'.",
  },
  {
    name: "look no further",
    find: /\blook no further\b|\bsay goodbye to\b|\bwe'?ve got you covered\b/i,
    instead: "Cut it. It is an advertisement, and this is a study tool.",
  },
  {
    name: "whether you are a beginner",
    find: /\bwhether you'?re (a|an|new|just|looking)\b|\bwhether you are (a|an|new|just|looking)\b/i,
    instead: "Address the one person reading, at the level the app already knows they are.",
  },
  {
    name: "hollow praise",
    find: /\b(awesome|amazing|fantastic|incredible|stellar|phenomenal)\b/i,
    instead:
      "Say what they did. 'Six days in a row' is warmer than 'amazing' because it is about them.",
  },
  {
    name: "as an AI",
    find: /\bas an ai\b|\bas a language model\b|\bi'?m here to help\b|\bhappy (learning|studying)\b/i,
    instead: "Anu is a teacher on every screen she appears on. She does not narrate her own nature.",
  },
];

/**
 * Everything, in the order a reader would notice it.
 *
 * The dash is not in here. It is checked separately and against every line of
 * the tree including the ones these patterns would be too slow to reach, and
 * it needs no `instead`: a comma, a full stop or a pair of brackets, decided
 * per sentence.
 */
export const TELLS: readonly Tell[] = [...OPENERS, ...SHAPES, ...BROCHURE];

/**
 * The rewritable subset, in the shape `humanize.ts` applies them in.
 *
 * Order is the table's order, which puts the openers before the shapes, and
 * that is the order they have to run in: an opener is anchored to the start of
 * a line and a shape is not, so a shape removing text first would move the
 * opener off the anchor.
 */
export const OPENER_REWRITES: readonly [RegExp, string][] = TELLS.flatMap((t) =>
  t.rewrite ? ([[t.rewrite.pattern, t.rewrite.with]] as [RegExp, string][]) : [],
);

/*
  Emoji, which this app uses nowhere and a generated bullet list uses at the
  head of every item.

  DRAWN NARROWLY, AND THE FIRST VERSION WAS NOT. Sweeping the symbol blocks
  wholesale flagged twenty-two honest lines: the arrow in "Estonian to English"
  is written as an arrow on nine screens, the keyboard hints draw a real return
  key and a real command key, the daily strip ticks a day with a check mark and
  Anu's connection failure is marked with a warning sign. Those are typographic
  glyphs doing a job no word does as well, in one colour, matching the text
  around them. What is banned is the pictographic kind: the block that holds
  the rocket and the party popper, the variation selector that is what turns a
  monochrome dingbat into a coloured picture, and the few dingbats that are
  never anything but emoji.
*/
export const EMOJI = /[\u{1F300}-\u{1FAFF}\u{FE0F}\u{2728}\u{2705}\u{274C}\u{2764}\u{2B50}\u{2B55}]/u;

/** Which tells a line of copy contains. Empty is the answer we want. */
export function findTells(text: string): Tell[] {
  return TELLS.filter((t) => t.find.test(text));
}

/**
 * The voice, in the words Anu is given.
 *
 * Exported rather than typed into `prompt.ts` so the model is asked for the
 * thing the sweep enforces. When these two drift, the model is being blamed
 * for following the instruction it was actually given.
 */
export const VOICE_RULES: readonly string[] = [
  `Never use an em dash (${EM_DASH}) or an en dash (${EN_DASH}). Use a comma, a full stop, or a pair of brackets. A dash used as a clause break is the loudest sign a sentence was generated rather than written, and this learner is being taught by a person. Write a range as "2 to 3 weeks" or "2028-2029".`,
  `Never open with "It's important to note that", "At the end of the day", "In essence", "Great question", "Moreover", "Furthermore" or anything else that carries no information. Start with the answer.`,
  `Never inflate a small claim by denying it first. "Not just a rule, but a pattern" is "a rule, and a pattern". Say what a thing is.`,
  `Never reach for a brochure word: delve, leverage, utilise, seamless, cutting-edge, groundbreaking, holistic, bespoke, meticulously, a plethora of, embark on, unleash, empower, elevate. Use the plain word a teacher would use out loud.`,
  `No emoji. No exclamation-mark praise. "Six days in a row" is warmer than "amazing", because it is about the learner and not about you.`,
  `Be warm, and be short. Warmth is attention: notice what they got right, name the specific thing, and stop. It is not enthusiasm, and it is never padding. Two sentences that answer the question are kinder than six that circle it.`,
];
