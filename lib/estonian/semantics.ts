/**
 * WHAT KIND OF THING A WORD IS, AS THE INSTITUTE CLASSIFIED IT.
 *
 * Estonian picks between two whole sets of local cases on a fact about
 * meaning rather than about spelling. A room is somewhere you can be inside, so
 * `tuba` goes `toas`, `toast`, `tuppa`. A person or an animal is not, so a
 * mother goes `emal`, `emalt`, `emale`, and `emasse` is not a way of saying
 * anything anybody says. Every course teaches this in its first fortnight,
 * usually as `Kellele sa helistad? Emale.`, and the app was drilling the other
 * trio for every animate noun in the dictionary: `hobune → millesse? kuhu?`
 * with `hobusesse` on the back, `koer → milles? kus?` with `koeras`,
 * `õpetaja → millesse?` with `õpetajasse`. A learner who passes that card has
 * learned to say `ma annan raamatu õpetajasse`.
 *
 * `lib/estonian/place.ts` is the rule this one joins, and it says in its own
 * header why it could not reach this: it tests the ending `-maa`, and an
 * ending is all a spelling can tell you. Nothing about the letters in `hobune`
 * says it is an animal.
 *
 * SO IT IS READ FROM EKILEX, NOT DECIDED HERE. The Institute records a
 * semantic type against each meaning, in the same `/word/details` response the
 * forms and the sentences come from: `hobune` is `loom`, `õpetaja` is
 * `in_elukutse`, `arst` is `esitus_tiitel in_elukutse`, `tuba` is
 * `koht_hoone`. The expansion and the course harvest have both been fetching
 * that response since the day they were written and dropping this field on the
 * floor, exactly as they dropped the Estonian definitions before them.
 * `scripts/harvest-semantics.ts` is what asks; `Lexeme.semanticTypes` holds
 * the codes as Ekilex spells them, unedited, and this module is the only place
 * they are read.
 *
 * WHY THE CODES ARE STORED AND THE READING IS NOT. It is the shape
 * `government` already takes: Ekilex's own question words are stored and
 * `parseGovernment` interprets them, so a correction to the reading is a code
 * change rather than a re-harvest of a service somebody else runs.
 *
 * ADR-005 IS UNTOUCHED. A classifier code is not a form and not a sentence;
 * nothing here is generated and nothing here reaches a screen. What reaches a
 * screen is which of two case sets to ask about, and the dictionary's own
 * attested forms answer that.
 */

/**
 * What the app asks the classification for.
 *
 * `ANIMATE` is a person or an animal: something you talk *to* and not
 * something you can be *inside*. `THING` is everything else the Institute
 * named. `MIXED` is a word it named as both, which is a third answer rather
 * than a failure to decide, and `UNKNOWN` is a word it has no type for at all
 * — one somebody added by hand, confirmed off a photograph or pasted in.
 */
export type SemanticGroup = "ANIMATE" | "THING" | "MIXED" | "UNKNOWN";

export const SEMANTIC_GROUPS: readonly SemanticGroup[] = ["ANIMATE", "THING", "MIXED", "UNKNOWN"];

/**
 * Every code the Institute puts on a person or an animal.
 *
 * WRITTEN OUT RATHER THAN MATCHED BY PREFIX, and that is a correction to the
 * first version of this file rather than a preference. Its codes look
 * segmented — `in_elukutse`, `in_roll` and `in_sugulane` are all people,
 * `loom_lind` and `loom_putukas` are both animals — and a rule reading the
 * first segment gets `in_rahvas_keel` wrong, which is not a person at all. It
 * is the code on `emakeel`, and `emakeeles` is how you say "in one's mother
 * tongue": a rule that classified a language as a being would have taken the
 * commonest form of that word off the card and put `emakeelele` on it.
 *
 * The neighbours that are deliberately absent are worth as much as the
 * entries. `kehaosa_loom` is an animal's tail rather than the animal.
 * `organism` is on `keha` and `sugu` as well as on `loom`, and a body is
 * something you are inside. `taim` is a plant, which is a `mis` in Estonian
 * and takes the inside cases like anything else you can put something into.
 * `esitus_tiitel` is here by *not* being a disqualifier below: it is a title
 * rather than a person, and it sits beside `in_elukutse` on `arst`, `doktor`
 * and `proua`.
 */
const ANIMATE_CODES: readonly string[] = [
  // People.
  "inimene",        // inimolend, isik, indiviid
  "in_omadus",      // esilduva omadusega inimene
  "in_elukutse",    // elukutse, amet
  "in_roll",        // esilduva rolliga olend, sotsiaalse staatuse esindaja
  "in_tegija",      // agent, tegevuse tegija
  "in_sugulane",    // teatava sugulussuhte esindaja
  "in_rahvas",      // teatud rahva esindaja
  "in_müt",         // üleloomulik olend, muinasjututegelane
  // Animals.
  "loom",           // loom
  "loom_lind",      // lind
  "loom_kala",      // kala
  "loom_putukas",   // putukas, mardikas, lülijalgne
  "loom_liik",      // loomaliik
  "loom_omadus",    // esilduva omadusega loom
];

/**
 * Codes that say the word is also somewhere you can be, or something you can
 * hold.
 *
 * A WORD THAT IS BOTH IS THE THIRD ANSWER, NOT THE FIRST. The Institute uses
 * `inimene` for a person and for a body of people alike, so `politsei` is
 * `in_elukutse koht_asutus`, `grupp` is `ese inimene` and `orkester` carries
 * `grupp` beside three person codes. Both sets of local cases are ordinary
 * Estonian for every one of them: you join `politseisse` and you work
 * `politseis`, you are `grupis` and you speak `grupile`. That is exactly the
 * position `bothSetsOrdinary` describes for `maa`, and it gets the same
 * answer, because a card cannot ask which of two right answers a learner
 * meant.
 *
 * It costs 26 words their three local cards, which is a tenth of a percent of
 * the deck, and it is the side to err on: the alternative is picking one of
 * two true answers for the learner and marking the other wrong.
 */
const MIXED_CODES: readonly string[] = [
  "grupp",          // grupp, rühm (nt kari, kamp)
  "ese",            // ese, objekt
];

/** Prefixes of the same kind, where the Institute subdivides a category. */
const MIXED_PREFIXES: readonly string[] = [
  "koht",           // koht_asutus, koht_hoone, koht_ala, koht_geogr, ...
  "ese_",           // ese_instru, ese_anum, ese_riie, ...
];

function codesOf(value: readonly string[] | string | null | undefined): string[] {
  const list = typeof value === "string" ? value.split(/\s+/) : value ?? [];
  return list.map((code) => code.trim().toLowerCase()).filter((code) => code.length > 0);
}

const isAnimateCode = (code: string) => ANIMATE_CODES.includes(code);

const isMixedCode = (code: string) =>
  MIXED_CODES.includes(code) || MIXED_PREFIXES.some((prefix) => code.startsWith(prefix));

/**
 * Reads the codes on one entry.
 *
 * ANY OF THE PRIMARY SENSE'S CODES, NOT THE FIRST. Ekilex puts several on one
 * meaning and the one that matters is not always at the front: `arst` is
 * `esitus_tiitel in_elukutse` and only the second says it is a person.
 * *Which* senses are read is `scripts/harvest-semantics.ts`'s decision and it
 * takes the primary one alone, because a word's later senses wander far
 * enough to be wrong here: `jõgi` carries `inimene` on a metaphor about a
 * river of people, and `pilv` carries `loom_putukas`.
 */
export function semanticGroup(codes: readonly string[] | string | null | undefined): SemanticGroup {
  const real = codesOf(codes);
  if (real.length === 0) return "UNKNOWN";
  if (!real.some(isAnimateCode)) return "THING";
  return real.some(isMixedCode) ? "MIXED" : "ANIMATE";
}

/** True only where the dictionary says so, and says nothing against it. */
export function isAnimate(codes: readonly string[] | string | null | undefined): boolean {
  return semanticGroup(codes) === "ANIMATE";
}

/**
 * True where the Institute called the word both a being and a place or a
 * thing, so neither set of local cases can be asked for.
 */
export function bothLocalSetsOrdinary(
  codes: readonly string[] | string | null | undefined,
): boolean {
  return semanticGroup(codes) === "MIXED";
}
