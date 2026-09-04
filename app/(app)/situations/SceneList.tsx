"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { finishScene } from "@/app/actions";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { ChoiceChip, ChoiceGroup } from "@/components/Choice";
import { Chip } from "@/components/ui";
import { DIFFICULTIES } from "@/lib/scenes/curveballs";
import { dropPending, readPending } from "./resume";

export interface SceneRow {
  id: string;
  title: string;
  place: string;
  level: string;
  canDo: string;
  required: number;
  /** How the last run ended, in a sentence, or null. */
  last: { outcome: string; done: number; of: number; when: string } | null;
  runs: number;
}

/**
 * The scenes, with the difficulty dial beside them.
 *
 * The dial sits here rather than in Settings because it is a decision about
 * this conversation rather than a preference about the app, and somebody who
 * found the last one hard should be able to turn it down at the moment they
 * feel that. It is one number a learner can move by one (design §9).
 */
export function SceneList({ scenes, level }: { scenes: SceneRow[]; level: string }) {
  const [difficulty, setDifficulty] = useState<number>(2);
  const router = useRouter();

  /* A run finished with no connection goes up now. */
  useEffect(() => {
    const pending = readPending();
    if (pending.length === 0) return;
    void (async () => {
      let sent = 0;
      for (const p of pending) {
        try {
          const result = await finishScene({
            sceneId: p.sceneId, seed: p.seed, difficulty: p.difficulty, turns: p.turns, helped: p.helped, walkedOut: p.walkedOut,
          });
          if (result.ok || result.error) { dropPending(p.id); sent++; }
        } catch {
          // Still no connection. Next time.
        }
      }
      if (sent > 0) router.refresh();
    })();
  }, [router]);

  return (
    <div className="flex flex-col gap-6">
      <ChoiceGroup label="How the day goes">
        {DIFFICULTIES.map((d) => (
          <ChoiceChip key={d.level} selected={difficulty === d.level} onSelect={() => setDifficulty(d.level)} title={d.feels}>
            {d.name}
          </ChoiceChip>
        ))}
      </ChoiceGroup>
      <p className="-mt-3 text-xs" style={{ color: "var(--ink-3)" }}>
        {DIFFICULTIES.find((d) => d.level === difficulty)?.feels} Each step adds one thing that does not go to plan, and you can walk out of any of them.
      </p>

      <ul className="grid gap-3 md:grid-cols-2">
        {scenes.map((s) => {
          const fresh = Math.random().toString(36).slice(2, 10);
          const near = s.level === level;
          return (
            <li key={s.id}>
              <Link
                href={`/situations/${s.id}?seed=${fresh}&d=${difficulty}`}
                className="lift flex h-full flex-col gap-2 rounded-[var(--r-lg)] border p-5"
                style={{ borderColor: near ? "var(--accent)" : "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow-sm)" }}
              >
                <span className="flex items-center gap-2">
                  <Chip tone={near ? "accent" : "neutral"}>{s.level}</Chip>
                  <span className="text-2xs" style={{ color: "var(--ink-3)" }}>{s.required} things to get done · five to eight minutes</span>
                </span>
                <span className="text-lg font-semibold" style={{ color: "var(--ink)" }}>{s.title}</span>
                <span className="text-sm" style={{ color: "var(--ink-2)" }}>{s.place}.</span>
                <span className="text-xs" style={{ color: "var(--ink-3)" }}>Checks that you can {s.canDo.charAt(0).toLowerCase()}{s.canDo.slice(1)}</span>
                {s.last ? (
                  <span className="mt-auto text-xs" style={{ color: "var(--ink-2)" }}>
                    Last time, {s.last.when}: {s.last.done} of {s.last.of} done. {s.runs} {s.runs === 1 ? "run" : "runs"} so far.
                  </span>
                ) : (
                  <span className="mt-auto text-xs" style={{ color: "var(--ink-3)" }}>Not tried yet.</span>
                )}
                <span className="inline-flex items-center gap-1 text-sm font-semibold" style={{ color: "var(--accent-deep)" }}>
                  Walk in <ArrowRight size={14} aria-hidden />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
