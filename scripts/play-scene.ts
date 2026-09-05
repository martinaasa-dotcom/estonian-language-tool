/**
 * Plays every scene against the shipped dictionary, as an imperfect learner,
 * and prints the conversations.
 *
 *   npx tsx scripts/play-scene.ts            (no database, no key)
 *   npx tsx scripts/play-scene.ts --scene tee-kusimine --style sloppy
 *
 * No check passes or fails here. This is the instrument for reading whether
 * the other side sounds like anybody: the route's own ladder (`sceneLine`,
 * `datumLine`, `asideFor`, `replyFor`) over `replay`, keyless, so what prints
 * is exactly what a deployment with no model says. The learner is generated
 * from each beat's own requirements, in one of three styles: `clean` says the
 * form the beat wants, `sloppy` drops a diacritic, uses the wrong case and an
 * infinitive where a person was due, and `curious` does that and asks a
 * question the beat did not ask for. Reading the sloppy and curious runs is
 * how the marker's tolerance and the asides were shaped.
 */
import { SCENES, sceneById } from "../lib/scenes/catalogue";
import { contextFromRows, replay, sceneLemmas, type Row, type StoredDraw } from "../lib/progress/scene";
import { planRun } from "../lib/scenes/run";
import { replyFor, datumLine, cardInPlay, counterBeat } from "../lib/scenes/reply";
import { asideFor, asideOwed, shrug } from "../lib/scenes/aside";
import { currentBeat, hurdleBeat, hurdleSpec, isOver } from "../lib/scenes/state";
import { sceneLine } from "../lib/scenes/line";
import { PERSONAS } from "../lib/scenes/personas";
import { answerBeatId } from "../lib/scenes/scripted";
import { caseKeyFor, words } from "../lib/scenes/lexicon";
import { leafNeeds, type BeatSpec } from "../lib/scenes/types";
import { propBySlot } from "../lib/scenes/props";
import { fold } from "../lib/estonian/fold";
import { shippedDictionary } from "./lib/dictionary";

const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const only = arg("scene");
const style = (arg("style") ?? "curious") as "clean" | "sloppy" | "curious";
const difficulty = (arg("difficulty") ?? "textbook") as "textbook" | "good" | "ordinary" | "bad";

const rows: Row[] = shippedDictionary().map((e) => ({
  id: e.lemma, lemma: e.lemma, pos: e.pos, cefr: e.cefr, parts: e.parts,
  extraForms: e.extraForms, usages: e.usages, government: e.government,
}));

/** What an imperfect learner says for a beat, off its own requirements. */
function learnerTurn(beat: BeatSpec, card: StoredDraw["card"], lexicon: ReturnType<typeof contextFromRows>["lexicon"], n: number): string {
  const parts: string[] = [];
  for (const { need } of leafNeeds(beat.needs)) {
    if (need.kind === "lemma") {
      const lemma = need.oneOf[0]!;
      if (style === "clean") { parts.push(lemma); continue; }
      const inf = lexicon.infinitives.get(lemma);
      if (inf && n % 2 === 0) { parts.push(`ma ${lemma}`); continue; }
      parts.push(n % 3 === 0 ? fold(lemma) : lemma);
    } else if (need.kind === "case") {
      const right = lexicon.caseForm.get(caseKeyFor(need.lemma, need.grammCase)) ?? need.lemma;
      parts.push(style === "clean" ? right : n % 2 === 0 ? need.lemma : fold(right));
    } else if (need.kind === "datum") {
      const prop = propBySlot(card, need.slot);
      parts.push(prop?.value ?? "");
    } else if (need.kind === "question") {
      parts.push(beat.topic[0] ? `kas ${beat.topic[0]}?` : "kus?");
    } else if (need.kind === "negation") {
      parts.push("ei ole");
    } else if (need.kind === "register") {
      parts.push("teie");
    }
    break; // one option is enough
  }
  let text = parts.join(" ");
  const kinds = leafNeeds(beat.needs).map(({ need }) => need.kind);
  if (kinds.includes("question") && kinds.includes("datum")) {
    const slot = leafNeeds(beat.needs).find(({ need }) => need.kind === "datum")!.need as { slot: string };
    text = `kus on ${propBySlot(card, slot.slot)?.value ?? ""}?`;
  }
  if (beat.shape === "sentence" && !text.includes("?") && words(text).length < 2) text = `ma tahan ${text}`;
  if (style === "curious" && n % 2 === 1 && !text.includes("?")) text += ", ja kuhu siis?";
  return text || "jah";
}

async function play(sceneId: string) {
  const scene = sceneById(sceneId)!;
  const context = contextFromRows(scene, rows.filter((r) => sceneLemmas(scene).has(r.lemma)));
  const run = planRun(scene, `play-${style}`, scene.level, difficulty);
  const draw: StoredDraw = { persona: run.persona.id, card: run.card, curveballs: run.curveballs.map((c) => ({ id: c.id, at: c.at })) };
  const persona = PERSONAS.find((p) => p.id === run.persona.id)!;
  console.log(`\n=== ${scene.title} (${scene.id}) · ${persona.id} · ${style} · ${difficulty} ===`);
  for (const prop of run.card.props) console.log(`   card: ${prop.card} ${prop.theirs ? "(theirs)" : `= ${prop.value}`}`);

  const turns: { beatId: string; said: string; helped: boolean; heard: string }[] = [];
  const used = new Set<string>();
  let heard = "";
  for (let n = 0; n < 24; n++) {
    const { state, response } = replay(context, draw, turns);
    const beat = currentBeat(scene, state);
    const standing = state.hurdle ? hurdleBeat(state.hurdle) : null;
    const speaking = response === "counter" && beat?.counter ? counterBeat(beat) : beat;
    const card = cardInPlay(draw.card, scene.beats, state.countered);
    const last = state.turns[state.turns.length - 1] ?? null;
    const answered = last ? scene.beats.find((b) => b.id === last.beatId) ?? null : null;
    const spokenFor = standing ?? speaking ?? (answered?.move === "close" ? answered : undefined);

    const askedNow = last?.asked ?? null;
    const wantsAside = Boolean(askedNow) && ["answer", "narrow", "counter", "moveOn"].includes(response);
    const fresh = (id: string | undefined) => (id ? context.scripted.get(id) ?? [] : []).filter((t) => !used.has(t));
    const asking = {
      asked: askedNow, spoken: words(last?.said ?? ""), answered, card, lexicon: context.lexicon,
      more: fresh(answered?.id), answers: answered ? fresh(answerBeatId(answered)) : [],
    };
    let aside = wantsAside ? asideFor(asking) : null;
    if (wantsAside && !aside && asideOwed(asking)) aside = shrug(context.lexicon);

    let line = null;
    if (spokenFor && !(spokenFor.awaits && !standing)) {
      const cheap = await sceneLine({
        beat: spokenFor, lexicon: context.lexicon, gate: context.gate,
        pool: context.pool.get(spokenFor.id) ?? [], topic: context.topic.get(spokenFor.id) ?? new Set(),
        hasFiniteVerb: context.hasFiniteVerb, fallback: context.fallback,
        scripted: context.scripted.get(spokenFor.id) ?? [], used,
      });
      line = cheap.provenance !== "fallback" ? cheap : datumLine(spokenFor, card, context.lexicon) ?? cheap;
    }
    const lines = replyFor({
      beat: speaking, answered: turns.length ? answered : null, response: turns.length ? response : null,
      reading: last?.reading ?? null, line, heard, card, translates: persona.translates,
      acknowledges: persona.acknowledges, echo: last?.matched?.[0] ?? null,
      recast: Boolean(last?.slips?.some((s) => s.form && s.form === last?.matched?.[0])),
      aside, met: state.done.length,
      hurdle: standing ? { beat: standing, line: standing === spokenFor ? line : null, said: hurdleSpec(state)?.said } : null,
    });
    if (last) {
      const notes = [
        ...(last.slips ?? []).map((s) => `${s.kind}: ${s.said}${s.form ? ` > ${s.form}` : ""}`),
        ...(last.asked ? [`asked: ${last.asked}`] : []),
      ];
      console.log(`      [${last.reading}${notes.length ? " · " + notes.join(", ") : ""}]`);
    }
    for (const l of lines) {
      const who = l.provenance === "unspoken" ? "   (they)" : "   THEM";
      console.log(`${who}: ${l.text}   <${l.provenance}${l.reaction ? ", reaction" : ""}>`);
      if (l.provenance === "attested" || l.provenance === "scripted") used.add(l.text);
    }
    const move = [...lines].reverse().find((l) => !l.reaction);
    if (move && move.provenance !== "unspoken") heard = move.text;
    if (isOver(scene, state)) { console.log(`   -> over: ${state.done.join(", ")}`); break; }
    const target = standing ?? beat;
    if (!target) break;
    const said = learnerTurn(target, card ?? draw.card, context.lexicon, n);
    console.log(`   YOU: ${said}      (goal: ${target.goal})`);
    turns.push({ beatId: target.id, said, helped: false, heard });
  }
}

(async () => {
  for (const scene of SCENES) if (!only || scene.id === only) await play(scene.id);
})();
