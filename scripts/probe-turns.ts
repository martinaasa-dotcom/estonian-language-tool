/**
 * What the marker makes of what people actually type.
 *
 *   npx tsx scripts/probe-turns.ts        (no database, no key)
 *
 * `play-scene.ts` drives whole conversations with a generated learner, which
 * finds what the other side *says*. This asks the other half: given a turn a
 * real person would write, is it understood. Each line is a scene, a beat and
 * a sentence somebody at that level would plausibly type, including the wrong
 * word order, the missing verb, the English word in the middle and the
 * spelling with no diacritics; the run prints how it was read, what slipped,
 * and which words the app could not account for.
 *
 * `!!` is the line to hunt: a turn nobody could make out, which is what the
 * other side answers with "I did not catch that". Reading those is how the
 * course-wide vouching, the digits rule and the typo guard were found, and
 * how it was noticed that `minu pea valutab` was being corrected to a word
 * that is not the one the learner wrote.
 *
 * The Estonian here is a fixture, in the standing `turn.test.ts` and the fuzz
 * harness already have: it is what a learner types rather than anything the
 * app stores, and every word is a course word.
 */
import { contextFromRows, sceneLemmas, type Row } from "../lib/progress/scene";
import { sceneById } from "../lib/scenes/catalogue";
import { readTurn } from "../lib/scenes/turn";
import { dataFor } from "../lib/progress/scene";
import { planRun } from "../lib/scenes/run";
import { shippedDictionary } from "./lib/dictionary";
import { SYLLABUS } from "../lib/collections/syllabus";
import { formsOf } from "../lib/scenes/lexicon";

const rows: Row[] = shippedDictionary().map((e) => ({ id: e.lemma, lemma: e.lemma, pos: e.pos, cefr: e.cefr, parts: e.parts, extraForms: e.extraForms, usages: e.usages, government: e.government }));

const COURSE = new Set(SYLLABUS.flatMap((u) => u.lemmas));
const KNOWN = new Set<string>();
for (const r of rows) if (COURSE.has(r.lemma)) for (const f of formsOf(r)) KNOWN.add(f);

const CASES: Record<string, [string, string][]> = {
  "arsti-aeg": [
    ["greet", "tere"], ["greet", "tere hommikust"], ["greet", "tere, kuidas läheb"],
    ["reason", "mul on valu"], ["reason", "mul on pea valus"], ["reason", "minu pea valutab"],
    ["reason", "mul pea valu"], ["reason", "ma olen haige"], ["reason", "mul on migraine"],
    ["reason", "valu mul on"], ["reason", "mul on palavk"], ["reason", "ma tahan arsti juurde"],
    ["where", "pea"], ["where", "mul on peas valu"], ["where", "minu peas"],
    ["since", "esmaspäevast"], ["since", "alates esmaspäev"], ["since", "esmaspäeval"],
    ["offer", "jah sobib"], ["offer", "jah, aitäh"], ["offer", "see sobib mulle"], ["offer", "ei sobi"],
    ["close", "aitäh, head aega"], ["close", "nägemist"], ["close", "aitäh teile"],
  ],
  "poodi-piima": [
    ["going", "ma lähen poodi"], ["going", "poodi"], ["going", "ma lähen poe"], ["going", "lähen poodi piima ostma"],
    ["inside", "ma olen poes"], ["inside", "olen praegu poes"], ["inside", "poes olen"],
    ["item", "ma tahan piima"], ["item", "piima"], ["item", "ma ostan piim"], ["item", "mulle piima palun"],
    ["back", "ma tulen poest"], ["back", "poest"], ["back", "ma tulen koju"],
  ],
  "kohvikus": [
    ["order", "üks kohv palun"], ["order", "ma tahan kohvi"], ["order", "kohvi palun"], ["order", "mulle üks tee"],
    ["milk", "jah palun"], ["milk", "ei aitäh"], ["milk", "piimaga palun"], ["milk", "ilma piimata"],
    ["bill", "arve palun"], ["bill", "ma tahan maksta"], ["bill", "kui palju see maksab"], ["bill", "palun arve"],
  ],
  "tee-kusimine": [
    ["where", "vabandust, kus on pank"], ["where", "kus on pank?"], ["where", "kuidas ma saan panka"],
    ["where", "kas te teate kus on pank"], ["where", "ma otsin panka"],
    ["way", "otse"], ["way", "aitäh"], ["way", "otse edasi, selge"], ["way", "ah, otse ja vasakule"],
    ["far", "kas see on kaugel"], ["far", "kas on lähedal?"], ["far", "kui kaua läheb"],
  ],
  "bussipilet": [
    ["want", "üks pilet palun"], ["want", "ma tahan piletit"], ["want", "pilet palun"],
    ["to", "tartusse"], ["to", "ma lähen jaama"], ["to", "jaam palun"],
    ["when", "kell kaheksa"], ["when", "08:30"], ["when", "hommikul"],
    ["pay", "kaardiga"], ["pay", "ma maksan kaardiga"], ["pay", "sularahaga"], ["pay", "jah"],
  ],
};

for (const [sceneId, cases] of Object.entries(CASES)) {
  const scene = sceneById(sceneId)!;
  const ctx = contextFromRows(scene, rows.filter((r) => sceneLemmas(scene).has(r.lemma)));
  const run = planRun(scene, "probe", scene.level, "textbook");
  const data = dataFor(run.card, ctx.lexicon);
  console.log(`\n=== ${sceneId} ===  card: ${run.card.props.map((p) => `${p.slot}=${p.value}`).join(" ")}`);
  for (const [beatId, said] of cases) {
    const beat = scene.beats.find((b) => b.id === beatId)!;
    const e = readTurn(said, beat, { ...ctx.marker, data, previous: "", known: (w: string) => KNOWN.has(w) });
    const flag = e.reading === "complete" ? "  " : e.reading === "unrecognised" ? "!!" : " ~";
    const unv = e.words.filter((w) => !w.vouched).map((w) => w.word);
    console.log(`${flag} ${said.padEnd(34)} ${e.reading.padEnd(13)} ${e.slips.map((s) => s.kind + ":" + s.said + ">" + s.form).join(",")}${unv.length ? "   unvouched: " + unv.join(" ") : ""}`);
  }
}
