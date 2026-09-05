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
 * The neighbors that are deliberately absent are worth as much as the
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
  /*
    A FAMILY IS A BODY OF PEOPLE AND THE INSTITUTE DOES NOT SAY SO WITH
    `grupp`.

    `pere` and `perekond` are `inimene esitus`, and the Institute's own
    definition of the first is "ühe majandusliku üksusena elavad vanemad ja
    lapsed": parents and children living as one economic unit. Read as a person
    they take the outside trio alone, which refuses `peres`, `perre` and
    `perest` — and `meie peres räägitakse eesti keelt` and `ta sündis suurde
    perre` are ordinary Estonian anybody would say. Both sets are right here,
    which is what this list is for.

    Found by a deck audit against a real deployment, which named nine `pere`
    cards for removal beside 162 that really were `õpetajas` and `koeras`.

    THE BARE CODE AND NOT THE PREFIX, which is the difference between this
    entry and a bug. `esitus_tiitel` is a title rather than a person and sits
    beside `in_elukutse` on `arst`, `doktor` and `proua`; a prefix rule would
    make every one of them mixed and hand back the fault this file exists for.
    `MIXED_CODES` is matched exactly, and bare `esitus` reaches only a word
    that also carries a person code: measured over the shipped dictionary, that
    is `pere` and `perekond` and nothing else.
  */
  "esitus",         // esitus, kujutis (on a word the Institute also calls a person)
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

/**
 * WHAT KIND OF THING A WORD IS, IN WORDS, FOR A CLUE ON A PUZZLE.
 *
 * The same codes read for a different question. `localCasesFor` asks whether
 * the word is a being, because Estonian's two sets of local cases turn on that
 * and nothing else; Sõnad asks what a six-letter word is *about*, so that a
 * guesser who has spent three tries has somewhere to stand.
 *
 * A CATEGORY IS ONLY WORTH PRINTING WHERE IT SAYS MORE THAN THE PART OF SPEECH
 * ALREADY BESIDE IT. The board shows `verb` and `B1` from the first guess, so
 * "something you do" is not a clue, it is the chip again in a longer form. The
 * table below is deliberately partial for that reason, exactly as
 * `lib/estonian/terms.ts` is: `VERB_tegevus`, `abstr` and a bare `omadus` say
 * nothing a learner could narrow a guess with, so they map to nothing and the
 * board simply has no category to offer. Measured over the shipped dictionary:
 * 78% of the six-letter graded content words the puzzle can draw from carry
 * one, and the fifth that do not get the vowel count on the last try like
 * everybody else.
 *
 * COARSE ON PURPOSE. "an animal" narrows a search; "a bird that swims" hands
 * the word over. Every entry here is a category a school poster would have,
 * and where the Institute subdivides finely the subdivisions are rolled back
 * up: `loom_lind`, `loom_kala` and `loom_putukas` are all "an animal".
 */
const CATEGORIES: readonly (readonly [readonly string[], string])[] = [
  [["inimene", "in_omadus", "in_elukutse", "in_roll", "in_tegija", "in_sugulane",
    "in_rahvas", "in_müt"], "somebody"],
  [["loom", "loom_lind", "loom_kala", "loom_putukas", "loom_liik", "loom_omadus"], "an animal"],
  [["taim", "taim_liik", "taim_osa"], "a plant"],
  [["kehaosa", "kehaosa_loom"], "part of the body"],
  [["toit", "toit_jook", "toit_liha", "toit_mag", "toit_vili"], "food or drink"],
  [["VERB_toituma"], "eating or drinking"],
  [["ese_riie"], "something you wear"],
  [["ese_anum"], "something you keep things in"],
  [["ese_instru"], "something you use"],
  [["ese_kunst", "esitus_kujutis", "esitus_kunst"], "art or music"],
  [["ese_semio"], "a sign or a symbol"],
  [["ese_raha", "raha", "majandus"], "money"],
  [["koht_asutus"], "somewhere you go for something"],
  [["koht_hoone"], "a building"],
  [["koht", "koht_ala", "koht_geogr", "koht_loodus", "koht_ruum"], "a place"],
  [["liiklus", "sõiduk"], "getting about"],
  [["aeg", "aeg_hulk", "aeg_punkt"], "time"],
  [["seisund_haigus"], "being ill or well"],
  [["nähtus_psühh", "tunne", "omadus_psühh"], "how somebody feels"],
  [["nähtus_loodus", "ilm"], "weather or nature"],
  [["esitus_keel", "keel"], "language"],
  [["esitus_mõõt", "mõõt"], "a measurement"],
  [["materjal/aine"], "what things are made of"],
  [["sündmus"], "something that happens"],
  [["VERB_liikuma", "VERB_liigutama", "VERB_liikuma/liigutama"], "moving"],
  [["VERB_suhtlus", "tegevus_kõnetegu"], "talking"],
  [["VERB_psühh", "VERB_psühh_mõistus"], "thinking or feeling"],
  [["VERB_muutus", "VERB_muutust", "muutuma", "põhjustama"], "something changing"],
  [["VERB_seisund", "seisund"], "being in a state"],
  [["omadus_füüs"], "how something looks or feels"],
  [["omadus_kval"], "how good something is"],
];

/**
 * The one clue a puzzle may print, or nothing.
 *
 * Nothing is the honest answer for a word the Institute classified only as
 * `abstr`, and it is the answer `grammarTerm` gives for a point with no term a
 * class uses rather than a cue to invent one.
 */
export function semanticCategory(
  codes: readonly string[] | string | null | undefined,
): string | null {
  const real = codesOf(codes);
  for (const [group, label] of CATEGORIES) {
    if (real.some((code) => group.includes(code))) return label;
  }
  return null;
}
