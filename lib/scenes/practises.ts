/**
 * What a scene practises, in the words a class uses.
 *
 * Read off the beats' own requirements rather than typed beside the title,
 * so the line on the tile cannot drift from what the marker asks for: a
 * scene that asks for `pood` in three cases says so, and one that asks for
 * the time off the card says that. The case is named the way a class names
 * it (`CASES[].et`, ADR on Estonian terms leading), which is the name a
 * learner sitting in a course will recognise on a tile.
 *
 * Pure: no React, no Next, no Prisma.
 */
import { CASES } from "@/lib/estonian/cases";
import type { SceneSpec } from "./types";

export function practises(scene: SceneSpec): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (label: string) => { if (!seen.has(label)) { seen.add(label); out.push(label); } };
  for (const beat of scene.beats) {
    for (const need of beat.needs) {
      if (need.kind === "case") {
        const spec = CASES.find((c) => c.key === need.grammCase);
        if (spec) add(spec.et);
      } else if (need.kind === "datum") {
        const prop = scene.props.find((p) => p.slot === need.slot);
        if (prop?.kind === "time") add("the time");
        else if (prop?.kind === "weekday") add("a day of the week");
        else if (prop?.kind === "number") add("a number");
        else if (prop?.kind === "word") add("a word off your card");
      } else if (need.kind === "question") {
        add("asking a question");
      } else if (need.kind === "negation") {
        add("saying no");
      }
    }
  }
  if (scene.register === "teie") add("the polite you");
  return out;
}
