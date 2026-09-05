/**
 * What the other side says about a question the scene did not anticipate.
 *
 * A learner told `Minge otse edasi.` who writes `okei, otse, ja kuhu siis?`
 * has asked a question the beat did not ask for, and the first version of
 * this module walked straight past it to the next move. That is the machine
 * showing through: a person caught off guard by a question still answers it,
 * as best they can from what they know, and then gets back to what they were
 * doing. This is the "as best they can", said once, and it is a ladder like
 * the one for a beat's own line, cheapest and surest first:
 *
 *   1. the beat's own answer  where the beat asked for the question, the
 *                             bank holds what they say (`answer:<beat>`)
 *   2. how are you            `Hästi, aitäh.`, because that is the answer
 *   3. a fact off the card    "when?" gets the day and the time the run dealt
 *   4. more about it          another line for the beat they just spoke, so
 *                             "and where then?" gets the rest of the directions
 *   5. a model                one line inside the list, gated, in the route
 *   6. don't know             `Ei tea.`, which is what a stranger says
 *
 * WHAT IT MAY WRITE. Nothing. Every rung is a line the dictionary already
 * vouches for: the course's own phrases as parts (`ASIDES`), a case form off
 * `Lexicon.caseForm`, a line drafted and gated for the beat, or a line the
 * route composed and gated. The one verb form in it, `tea` after `ei`, is
 * the derived negative of `teadma` and is withheld whole where the rule
 * cannot reach it. A question this cannot answer is answered with the fifth
 * rung rather than with silence, because silence is the one thing a person
 * never does with a question.
 *
 * Pure: no React, no Next, no Prisma, no network, no clock.
 */
import { ASIDES } from "./catalogue";
import type { SpokenLine } from "./line";
import { caseKeyFor, type Lexicon } from "./lexicon";
import type { RoleCard } from "./props";
import { partsLine } from "./reply";
import { leafNeeds, type BeatSpec, type MoveKind } from "./types";

export interface AsideInput {
  /** The question word the learner used, or `?` for a bare mark. Null where nothing was asked. */
  readonly asked: string | null;
  /** Every lowercased word of the learner's turn. */
  readonly spoken: readonly string[];
  /** The beat the turn was read against, whose line the question is probably about. */
  readonly answered: BeatSpec | null;
  readonly card: RoleCard | null;
  readonly lexicon: Lexicon;
  /** Lines this run has not yet said for the answered beat, best first. */
  readonly more: readonly string[];
  /**
   * The beat's own banked answers (`answer:<beat>`), where the beat asked
   * the learner for a question: "ask whether it is near" is met by a
   * question and this is what answers it. Empty where the beat wanted no
   * question or the bank has nothing for it.
   */
  readonly answers: readonly string[];
}

/** Question words that ask about a place, a time, a price. Keys, not vocabulary. */
const PLACE = new Set(["kus", "kuhu", "kust"]);
const TIME = new Set(["millal"]);
const HOW = new Set(["kuidas"]);

/**
 * Moves on which the other side was giving information, so "more" is more of
 * it. A question after a greeting or after they asked something is not
 * answered with a second greeting.
 */
const INFORMING: ReadonlySet<MoveKind> = new Set(["instruct", "offer", "confirm", "refuse", "correct"]);

/**
 * The aside, or null where the route should try a model and then the shrug.
 * `shrug` is what to say when both of those have nothing.
 */
export function asideFor(input: AsideInput): SpokenLine | null {
  if (!input.asked) return null;
  const { asked, spoken, answered, card, lexicon } = input;

  /*
    The beat asked for this question, so the answer is the beat's own and
    was written for it. First, because it is the one rung that knows what
    was asked rather than guessing from the question word. And where the
    bank holds none, nothing: the next move is the answer, which is how
    "where is the station?" is answered by the directions and not by a shrug.
  */
  if (answered && wantsQuestion(answered)) {
    const banked = input.answers[0];
    return banked ? { text: banked, provenance: "scripted" } : null;
  }

  /*
    "Kuidas läheb?" is the one question everybody can answer, and the answer
    is two course words. Read as the question word beside a form of `minema`,
    since `Kuidas?` on its own is somebody asking to hear it again.
  */
  const goes = lexicon.byLemma.get("minema");
  if (HOW.has(asked) && goes && spoken.some((w) => goes.has(w))) {
    return partsLine(ASIDES.howAreYou, { lexicon, mark: ".", join: ", " });
  }

  /*
    A fact off the card. "When?" is answered with the day and the time this
    run dealt, in the shape an offer already takes: the weekday in the
    adessive off the case table, and the clock time as the card spells it.
    Only where the card holds one, and then whole.
  */
  if (TIME.has(asked) || (asked === "mis" && spoken.includes("kell")) || spoken.includes("kell")) {
    const when = whenOffCard(card, lexicon);
    if (when) return when;
  }

  /*
    More about what they just said. A question straight after directions, an
    offer or a refusal is nearly always about them, and the bank usually holds
    a second line for the beat: "and where then?" gets "Otse edasi ja siis
    vasakule, see on lähedal." A place question in particular; a bare `?` or
    a `mis` too, since those are "sorry, what?" as often as anything.
  */
  const about = answered && INFORMING.has(answered.move);
  if (about && (PLACE.has(asked) || asked === "?" || asked === "mis" || asked === "kuidas")) {
    const next = input.more[0];
    if (next) return { text: next, provenance: "scripted" };
  }

  return null;
}

/**
 * Whether a question on this turn is owed an answer nothing else supplies,
 * so the route should ask a model and, failing that, shrug. False where the
 * beat itself wanted the question, since then the next move answers it.
 */
export function asideOwed(input: AsideInput): boolean {
  if (!input.asked) return false;
  return !(input.answered && wantsQuestion(input.answered));
}

function wantsQuestion(beat: BeatSpec): boolean {
  return leafNeeds(beat.needs).some(({ need }) => need.kind === "question");
}

/** `Ei tea.`, off the course: what a stranger says to a question they cannot answer. */
export function shrug(lexicon: Lexicon): SpokenLine | null {
  return partsLine(ASIDES.unknown, { lexicon, mark: "." });
}

function whenOffCard(card: RoleCard | null, lexicon: Lexicon): SpokenLine | null {
  if (!card) return null;
  const pieces: string[] = [];
  const day = card.props.find((prop) => prop.theirs && prop.lemmas.length > 0);
  if (day) {
    const form = day.lemmas[0] ? lexicon.caseForm.get(caseKeyFor(day.lemmas[0], "ADESSIVE")) : undefined;
    if (form) pieces.push(form);
  }
  const time = card.props.find((prop) => /^\d{1,2}:\d{2}$/.test(prop.value));
  if (time && lexicon.byLemma.has("kell")) pieces.push(`kell ${time.value}`);
  if (pieces.length === 0) return null;
  const text = pieces.join(" ");
  return { text: `${text.charAt(0).toUpperCase()}${text.slice(1)}.`, provenance: "attested", from: day?.lemmas[0] ?? "kell" };
}
