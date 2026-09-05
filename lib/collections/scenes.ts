import { LEVELS, type Level } from "@/lib/collections/syllabus/types";

/**
 * SITUATIONS TO WRITE ABOUT, AND THE THINGS IN THEM.
 *
 * The feedback asked for two games: describe a picture, and hold a
 * conversation in a situation. They are one thing. What both are for is the
 * moment a learner has to produce Estonian about something in front of them
 * rather than recall the back of a card, and the difference between them is
 * only what sets the scene: a picture, or a place.
 *
 * So a scene is both. A situation named in English, and three things in it.
 *
 * WHY THERE IS NO ARTWORK. The picture game was approved as cartoon drawings,
 * and nothing in this project can draw one: a model that generates an image is
 * a license question nobody here can answer, a file per scene to ship, and
 * sixty of them before a round stops repeating. The things in a scene are
 * emoji, which is the argument `/review/emoji` already made and won. They are
 * characters drawn by the reader's own font, so nothing ships, no license is
 * carried, and every one of them is already joined to a dictionary headword by
 * `scripts/build-emoji.ts` against Unicode's own data file.
 *
 * WHAT IS AUTHORED HERE AND WHAT IS NOT. The situation is English, which is
 * the one language this project may write. The three words are **requests**,
 * exactly as a syllabus unit's lemmas are: naming one here does not make it a
 * word, it asks whether the dictionary has one, and `scenes.test.ts` fails on
 * a name `lib/collections/emoji.ts` does not carry. No Estonian sentence is
 * written anywhere in this file, and none is written anywhere in the mode it
 * feeds: the learner writes the Estonian, the dictionary marks it, and the
 * model answer beside it comes from a lexicographer or from a native speaker
 * who typed it into a form (ADR-005).
 *
 * NO LEVEL IS DECLARED. A scene is as hard as its hardest word, and which band
 * that word is in is a fact about the dictionary that a reseed can move. A
 * level written down here would be a second answer to it, and the first thing
 * a second answer does is go stale. `lib/progress/describe.ts` reads the bands
 * off the entries and keeps the scenes whose words are all within one band of
 * the learner, which is `bandsAround`, the same table every other screen uses.
 *
 * The ids are English slugs and are keys rather than words: a contributed
 * sentence attaches to one, so renaming one orphans somebody's work. The
 * syllabus makes the same argument about its unit ids.
 *
 * Pure. No React, no Prisma, no clock.
 */

export interface Scene {
  /** Stable key. English, kebab-case, and never renamed once contributed to. */
  readonly id: string;
  /** What is going on, in English. A card heading: two or three words. */
  readonly situation: string;
  /**
   * Three words that are in it. Requests against `WORD_EMOJI`, which is itself
   * a join against the dictionary, so a scene cannot name a word with no
   * picture and cannot name a word with no entry.
   */
  readonly lemmas: readonly [string, string, string];
}

/**
 * Sixty of them, in roughly the order a course meets the words.
 *
 * Sixty rather than a dozen because the round shows five and a learner opens
 * it more than twelve times, and rather than three hundred because each one is
 * a sentence somebody may be asked to write for it. It is a bounded ask, which
 * is what makes `npm run scenes:template` worth generating.
 */
export const SCENES: readonly Scene[] = [
  // Around the house and the table, which is where a first-year course starts.
  { id: "breakfast", situation: "Breakfast", lemmas: ["leib", "muna", "banaan"] },
  { id: "at-the-market", situation: "At the market", lemmas: ["tomat", "porgand", "sibul"] },
  { id: "getting-to-work", situation: "Getting to work", lemmas: ["buss", "auto", "jalgratas"] },
  { id: "the-house", situation: "The house", lemmas: ["maja", "uks", "aken"] },
  { id: "pets", situation: "Pets", lemmas: ["kass", "koer", "lind"] },
  { id: "fruit", situation: "Fruit", lemmas: ["arbuus", "pirn", "mandariin"] },
  { id: "in-the-classroom", situation: "In the classroom", lemmas: ["kool", "vihik", "tool"] },
  { id: "the-family", situation: "The family", lemmas: ["mees", "naine", "laps"] },
  { id: "a-journey", situation: "Setting off", lemmas: ["rong", "pilet", "laev"] },
  { id: "something-cold", situation: "Something cold", lemmas: ["jäätis", "maasikas", "jää"] },
  { id: "the-bathroom", situation: "The bathroom", lemmas: ["dušš", "vann", "tualett"] },
  { id: "cooking", situation: "Cooking", lemmas: ["kartul", "seen", "lusikas"] },
  { id: "the-face", situation: "The face", lemmas: ["nina", "suu", "kõrv"] },
  { id: "an-evening-in", situation: "An evening in", lemmas: ["televiisor", "raadio", "tool"] },
  { id: "sport", situation: "Sport", lemmas: ["korvpall", "jalg", "jalgratas"] },
  { id: "in-town", situation: "In town", lemmas: ["kino", "takso", "tramm"] },
  { id: "on-the-farm", situation: "On the farm", lemmas: ["kana", "kukk", "muna"] },
  { id: "the-children", situation: "The children", lemmas: ["poiss", "tüdruk", "laps"] },
  { id: "lunch", situation: "Lunch", lemmas: ["võileib", "tomat", "kala"] },
  { id: "by-the-fire", situation: "By the fire", lemmas: ["tuli", "kivi", "maja"] },

  // A second year: clothes, the doctor, the animals a child names first.
  { id: "getting-dressed", situation: "Getting dressed", lemmas: ["kleit", "teksad", "sall"] },
  { id: "at-the-doctor", situation: "At the doctor", lemmas: ["haigla", "kiirabi", "prillid"] },
  { id: "farm-animals", situation: "Farm animals", lemmas: ["hobune", "lehm", "siga"] },
  { id: "in-the-forest", situation: "In the forest", lemmas: ["karu", "hunt", "siil"] },
  { id: "the-post", situation: "News and dates", lemmas: ["meil", "ajaleht", "kalender"] },
  { id: "flowers", situation: "Flowers", lemmas: ["roos", "tulp", "korv"] },
  { id: "a-holiday", situation: "On holiday", lemmas: ["hotell", "fotoaparaat", "kirik"] },
  { id: "washing", situation: "Washing", lemmas: ["seep", "hambahari", "peegel"] },
  { id: "strong-flavours", situation: "Strong flavors", lemmas: ["küüslauk", "sidrun", "ananass"] },
  { id: "small-animals", situation: "Small animals", lemmas: ["hiir", "rott", "konn"] },
  { id: "an-emergency", situation: "An emergency", lemmas: ["tulekahju", "politseinik", "kiirabi"] },
  { id: "at-the-bank", situation: "At the bank", lemmas: ["pank", "prillid", "lips"] },
  { id: "birds", situation: "Birds", lemmas: ["hani", "part", "kalkun"] },
  { id: "something-sweet", situation: "Something sweet", lemmas: ["komm", "vahvel", "ananass"] },
  { id: "old-buildings", situation: "Old buildings", lemmas: ["loss", "kirik", "tehas"] },

  // Wider vocabulary: instruments, tools, the zoo, weather that has passed.
  { id: "music", situation: "Music", lemmas: ["kitarr", "viiul", "flööt"] },
  { id: "at-the-zoo", situation: "At the zoo", lemmas: ["elevant", "lõvi", "tiiger"] },
  { id: "tools", situation: "Tools", lemmas: ["haamer", "kirves", "labidas"] },
  { id: "waiting", situation: "Waiting", lemmas: ["bussipeatus", "iste", "äratuskell"] },
  { id: "in-the-water", situation: "In the water", lemmas: ["vaal", "hai", "paat"] },
  { id: "insects", situation: "Insects", lemmas: ["liblikas", "sipelgas", "kärbes"] },
  { id: "leaving-the-house", situation: "Leaving the house", lemmas: ["võti", "mantel", "käekott"] },
  { id: "a-wedding", situation: "A wedding", lemmas: ["pulm", "suudlus", "õhupall"] },
  { id: "after-the-rain", situation: "After the rain", lemmas: ["vikerkaar", "tigu", "ämber"] },
  { id: "large-birds", situation: "Large birds", lemmas: ["öökull", "kotkas", "luik"] },
  { id: "mending", situation: "Mending something", lemmas: ["kruvikeeraja", "redel", "niit"] },
  { id: "slow-creatures", situation: "Slow creatures", lemmas: ["kilpkonn", "tigu", "madu"] },
  { id: "underground", situation: "Underground", lemmas: ["metroo", "kviitung", "isik"] },
  { id: "farm-work", situation: "Farm work", lemmas: ["traktor", "eesel", "kits"] },
  { id: "late-evening", situation: "Late evening", lemmas: ["teekann", "taskulamp", "kastan"] },

  // The far end of the graded dictionary, where a scene is worth setting only
  // for somebody who has met the words.
  { id: "camping", situation: "Camping", lemmas: ["telk", "kompass", "kanuu"] },
  { id: "far-away", situation: "Far from here", lemmas: ["sebra", "kaamel", "ninasarvik"] },
  { id: "out-at-sea", situation: "Out at sea", lemmas: ["delfiin", "hüljes", "ankur"] },
  { id: "a-story", situation: "A story", lemmas: ["draakon", "prints", "haldjas"] },
  { id: "building", situation: "Building", lemmas: ["tellis", "puit", "pang"] },
  { id: "across-town", situation: "Across town", lemmas: ["rula", "tõukeratas", "krediitkaart"] },
  { id: "after-dark", situation: "After dark", lemmas: ["nahkhiir", "mäger", "kobras"] },
  { id: "looking-up", situation: "Looking up", lemmas: ["teleskoop", "vulkaan", "kalju"] },
  { id: "made-by-hand", situation: "Made by hand", lemmas: ["lõng", "lint", "sõrmus"] },
  { id: "in-the-garden", situation: "In the garden", lemmas: ["päevalill", "ürt", "lehtpuu"] },
];

/** Every word any scene names, once. What the dictionary is asked about. */
export const SCENE_LEMMAS: readonly string[] =
  [...new Set(SCENES.flatMap((s) => s.lemmas))].sort();

export function sceneById(id: string): Scene | undefined {
  return SCENES.find((s) => s.id === id);
}

/**
 * The bands a scene may be offered at, given what its words turned out to be.
 *
 * A scene is as hard as its hardest word, so the caller hands in the band of
 * each and this returns the hardest, or null where the dictionary could not
 * band one of them. Null rather than a guess: an unbanded entry is the tail of
 * the Wiktionary expansion, and the suggestion row's rule about that (ADR-024)
 * holds here for the same reason.
 */
export function sceneLevel(bands: readonly (Level | null)[]): Level | null {
  let worst = -1;
  for (const band of bands) {
    if (!band) return null;
    const at = LEVELS.indexOf(band);
    if (at < 0) return null;
    if (at > worst) worst = at;
  }
  return worst < 0 ? null : LEVELS[worst] ?? null;
}
