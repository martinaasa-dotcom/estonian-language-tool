/**
 * Throws hostile and odd turns at every scene and checks what a conversation
 * must never do.
 *
 *   npm run fuzz:scenes   (needs DATABASE_URL, reads the dictionary, writes nothing)
 *
 * Every scene, at the easiest and the hardest difficulty, over six seeds and
 * four sequences: hostile text, a mix of hostile and real, seventy turns of
 * nonsense, seventy turns of one word. After every turn the reply is checked:
 * it exists unless the scene is over, no line is blank, no stage direction
 * carries a slot or an Estonian letter, the repair phrase is never said about
 * a turn that was read, no Estonian line carries a digit except the time off
 * the card, and a scene held under seventy turns of anything ends. That last
 * one found four scenes a learner could hold for ever by typing one word at a
 * beat that wanted a sentence, which no unit test had asked.
 *
 * The route and the screen are not in the loop: this drives `replay`,
 * `sceneLine` and `replyFor` the way the route does, against the real
 * dictionary, which is where every rule about a turn lives.
 */
import { prisma } from "../lib/db";
import { SCENES, FALLBACK_PHRASE } from "../lib/scenes/catalogue";
import { replay, sceneContext, type StoredDraw } from "../lib/progress/scene";
import { planRun } from "../lib/scenes/run";
import { replyFor, datumLine } from "../lib/scenes/reply";
import { currentBeat, hurdleBeat, hurdleSpec, isOver } from "../lib/scenes/state";
import { sceneLine } from "../lib/scenes/line";
import { PERSONAS } from "../lib/scenes/personas";

const NASTY = [
  "", " ", "\t\n", "?", "!!!", "...", "1234", "13:30", "kell 13:30", "Tere Tere Tere Tere Tere Tere Tere Tere Tere",
  "<script>alert(1)</script>", "'; DROP TABLE Review; --", "{{beat.they}}", "${time}", "{time}",
  "I don't understand what you want", "yes", "no", "ok", "hello", "Hello, do you speak English?",
  "TERE!", "tere.", "Tere, tere, tere.", "Ma ei saa aru", "Ma ei saa aru.", "Kuhu sa lähed?", "Head aega!",
  "Nägemist", "aitäh", "Aitäh!", "jah", "ei", "Jah?", "Ei.", "poodi poodi poodi", "õäöüšž", "ÕÄÖÜ",
  "x".repeat(400), "Tere " .repeat(80), "😀😀😀", "Тере", "Mul on palavik 🤒", "Kell viis.", "pool kaksteist",
  "Ma lähen poodi ja ostan piima ja tulen poest koju.", "Tere! Ma lähen poodi. Ma olen poes. Piima. Tulen poest. Head aega!",
  "mul ei ole", "Mul ei ole seda.", "Kui kaua?", "Millal?", "Miks?", "Kus?", "vasakule", "otse", "Kesklinna, palun.",
];

function pick<T>(arr: readonly T[], i: number): T { return arr[i % arr.length]!; }

let failures = 0;
function bad(msg: string) { failures++; console.log("BAD " + msg); }

async function main() {
  for (const scene of SCENES) {
    const context = await sceneContext(scene.id);
    if (!context) { bad(`${scene.id}: no context`); continue; }
    for (const difficulty of ["textbook", "bad"] as const) {
      for (let seedNo = 0; seedNo < 6; seedNo++) {
        const run = planRun(scene, `fuzz-${seedNo}`, scene.level, difficulty);
        const draw: StoredDraw = { persona: run.persona.id, card: run.card, curveballs: run.curveballs.map((c) => ({ id: c.id, at: c.at })) };
        const persona = PERSONAS.find((p) => p.id === run.persona.id)!;
        // sequences: pure garbage, alternating garbage/real, and all-real
        const sequences: string[][] = [];
        sequences.push(Array.from({ length: 40 }, (_, i) => pick(NASTY, i + seedNo)));
        sequences.push(Array.from({ length: 40 }, (_, i) => pick(NASTY, i * 7 + seedNo)));
        sequences.push(Array.from({ length: 70 }, () => "blorp xyzzy"));
        sequences.push(Array.from({ length: 70 }, () => "Tere!"));
        for (const seq of sequences) {
          const turns: { beatId: string; said: string; helped: boolean; heard: string }[] = [];
          let heard = "";
          let over = false;
          for (let i = 0; i < seq.length && !over; i++) {
            let state, response;
            try {
              ({ state, response } = replay(context, draw, turns));
            } catch (e) { bad(`${scene.id} ${difficulty} replay threw: ${(e as Error).message}`); break; }
            const beat = currentBeat(scene, state);
            const standing = state.hurdle ? hurdleBeat(state.hurdle) : null;
            const spokenFor = standing ?? beat;
            let line = null;
            if (spokenFor) {
              const cheap = await sceneLine({
                beat: spokenFor, lexicon: context.lexicon, gate: context.gate,
                pool: context.pool.get(spokenFor.id) ?? [], topic: context.topic.get(spokenFor.id) ?? new Set(),
                hasFiniteVerb: context.hasFiniteVerb, fallback: context.fallback,
                scripted: context.scripted.get(spokenFor.id) ?? [], used: new Set(),
              });
              line = cheap.provenance !== "fallback" ? cheap : (datumLine(spokenFor, draw.card) ?? cheap);
            }
            const last = state.turns[state.turns.length - 1] ?? null;
            const answered = last ? scene.beats.find((b) => b.id === last.beatId) ?? null : null;
            let lines;
            try {
              lines = replyFor({
                beat, answered: turns.length ? answered : null, response: turns.length ? response : null,
                reading: last?.reading ?? null, line, heard: last?.heard ?? null, card: draw.card,
                translates: persona.translates, acknowledges: persona.acknowledges,
                echo: last?.matched?.[0] ?? null, met: state.done.length,
                hurdle: standing ? { beat: standing, line: standing === spokenFor ? line : null, said: hurdleSpec(state)?.said } : null,
              });
            } catch (e) { bad(`${scene.id} replyFor threw: ${(e as Error).message}`); break; }
            over = isOver(scene, state);
            if (!over && lines.length === 0) bad(`${scene.id} ${difficulty} turn ${i}: empty reply (response ${response}, reading ${last?.reading})`);
            for (const l of lines) {
              if (!l.text.trim()) bad(`${scene.id}: blank line`);
              if (/\{\w+\}/.test(l.text)) bad(`${scene.id}: placeholder on screen: ${l.text}`);
              if (l.provenance === "unspoken" && /[õäöüšž]/i.test(l.text)) bad(`${scene.id}: Estonian in a stage direction: ${l.text}`);
              if (l.text === FALLBACK_PHRASE && last && last.reading !== "unrecognised" && last.reading !== "echo") bad(`${scene.id}: repair phrase at reading ${last.reading} for "${last.said}"`);
              if (l.provenance !== "unspoken" && l.provenance !== "english" && /\d/.test(l.text) && !/^Kell /.test(l.text)) bad(`${scene.id}: digit in an Estonian line: ${l.text}`);
            }
            // what the learner is now answering
            const move = [...lines].reverse().find((l) => !l.reaction);
            if (move) heard = move.provenance === "unspoken" ? "" : move.text;
            if (over) break;
            turns.push({ beatId: beat?.id ?? "", said: seq[i]!, helped: false, heard });
          }
          if (!over && seq.length >= 70) bad(`${scene.id} ${difficulty} seed ${seedNo}: not over after ${seq.length} turns of "${seq[0]}"`);
        }
      }
    }
    console.log(`${scene.id}: done`);
  }
  console.log(failures === 0 ? "\nNO FAILURES" : `\n${failures} failures`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
