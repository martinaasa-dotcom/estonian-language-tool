import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { ArrowRight } from "lucide-react";
import { EVIDENCE_LABEL } from "@/lib/exam/readiness";
import type { Reading } from "@/lib/readiness/rungs";
import { nextStep } from "@/lib/readiness/narrative";
import { RungChip } from "./Rung";

/**
 * One situation in the list: the course's claim, where the learner stands on
 * it, what the evidence is worth, and the one thing in the way.
 *
 * The rung and its tier are printed together and always, because a rung on
 * its own is the number this screen exists to replace: "take part" on eleven
 * answers and on two hundred are two different sentences.
 */
export function SituationRow({ reading }: { reading: Reading }) {
  const { situation, rung, evidence } = reading;
  const step = nextStep(reading);
  return (
    <Link
      href={`/progress/readiness/${situation.id}`}
      className="lift flex items-start gap-4 rounded-[var(--r)] border p-4"
      style={{ borderColor: "var(--rule-soft)", background: "var(--surface)" }}
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <RungChip rung={rung} />
          {rung !== "unmet" && (
            <span className="text-xs" style={{ color: "var(--ink-3)" }}>{EVIDENCE_LABEL[evidence]}</span>
          )}
        </span>
        <span className="mt-2 block text-[15px] font-semibold" style={{ color: "var(--ink)" }}>
          {situation.claim}
        </span>
        <span className="mt-0.5 block text-xs" style={{ color: "var(--ink-3)" }}>
          <span lang="et">{situation.title}</span> · {situation.subtitle}
          {situation.live && " · a live exchange"}
        </span>
        {step && (
          <span className="mt-1.5 block text-sm" style={{ color: "var(--ink-2)" }}>{step}</span>
        )}
        {reading.tryThis && rung === "lead" && (
          <span className="mt-1.5 block text-sm" style={{ color: "var(--mint-ink)" }}>Try it: {reading.tryThis}</span>
        )}
      </span>
      <ArrowRight size={16} aria-hidden className="mt-1 shrink-0" style={{ color: "var(--ink-3)" }} />
    </Link>
  );
}
