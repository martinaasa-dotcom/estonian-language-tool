import { BookOpen, Headphones, Mic, PenLine } from "lucide-react";
import { Card, Chip, SectionTitle } from "@/components/ui";
import { NO_VALUE } from "@/lib/copy/values";
import { PRE_A1, type Confidence, type Placement, type SkillResult } from "@/lib/assessment/types";
import { levelLabel } from "./PlanPanel";
import type { ReactNode } from "react";

/**
 * The result, said plainly.
 *
 * Four numbers and a paragraph of caveats, in that order, because the caveats
 * are the part that makes the numbers usable. A learner told "you are B1" by an
 * app they met half an hour ago will either believe it and sit an exam they fail,
 * or disbelieve it and ignore everything else here. Told "reading looks B1,
 * writing looks A2, from nine questions, which is thin", they have something
 * they can actually use.
 */

const SKILL_META: Record<string, { icon: typeof BookOpen; label: string; note: string }> = {
  reading: { icon: BookOpen, label: "Reading", note: "Words, endings and sentences from the dictionary." },
  listening: { icon: Headphones, label: "Listening", note: "Estonian audio with nothing written down." },
  writing: { icon: PenLine, label: "Writing", note: "Your own sentence, checked for the form it needed to contain." },
  speaking: { icon: Mic, label: "Speaking", note: "Your own rating. Never scored here, and never part of the level." },
};

const CONFIDENCE_COPY: Record<Confidence, string> = {
  rough: "Very few questions, so treat this as a first guess rather than a measurement.",
  indicative: "Enough questions to point in a direction, not enough to be sure of the letter.",
  reasonable: "Enough questions to be worth acting on, though it is still not an exam.",
};

function SkillRow({ result }: { result: SkillResult }) {
  const meta = SKILL_META[result.skill]!;
  const Icon = meta.icon;
  const speaking = result.skill === "speaking";

  return (
    <li className="flex items-start gap-4 border-t py-4 first:border-t-0" style={{ borderColor: "var(--rule)" }}>
      <span
        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        style={{ background: "var(--raised)", color: "var(--ink-2)" }}
      >
        <Icon size={17} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-lg font-bold" style={{ color: "var(--ink)" }}>{meta.label}</span>
          <span className="tnum text-lg font-bold" style={{ color: "var(--accent-deep)" }}>
            {speaking
              ? result.selfRating
                ? `${Math.round(result.selfRating * 10) / 10} of 4, your own rating`
                : NO_VALUE
              : result.measured
                ? levelLabel(result.level)
                : "not measured"}
          </span>
        </div>
        <p className="mt-1 text-sm" style={{ color: "var(--ink-3)" }}>{meta.note}</p>
        {!speaking && result.bands.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {result.bands.map((band) => (
              <Chip
                key={band.band}
                tone={band.ratio >= 2 / 3 ? "good" : band.ratio >= 0.5 ? "hard" : "again"}
                title={`${Math.round(band.credit * 10) / 10} of ${band.items} at ${band.band}`}
              >
                {band.band} {Math.round(band.ratio * 100)}%
              </Chip>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

export function ResultPanel({ result, heading = "Where you are" }: { result: Placement; heading?: ReactNode }) {
  const measured = result.skills.filter((s) => s.measured && s.skill !== "speaking");
  const overall = levelLabel(result.overall);

  return (
    <div className="flex flex-col gap-5">
      <Card tone="accent">
        <p className="label-xs" style={{ color: "var(--accent-deep)" }}>{heading}</p>
        <p className="mt-2 text-5xl font-bold leading-none" style={{ color: "var(--ink)" }}>
          {overall}
        </p>
        {result.nearly && (
          <p className="mt-2 text-lg font-semibold" style={{ color: "var(--accent-deep)" }}>
            A confident {overall}, and nearly {levelLabel(result.nearly)}.
          </p>
        )}
        <p className="mt-3 max-w-[58ch] text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
          {result.overall === null
            ? "Nothing was measured, so there is no level to report. That is an honest blank rather than a zero."
            : result.overall === PRE_A1
              ? "You have not reached the first band yet, which is where almost everybody starts. It is a starting point, not a verdict."
              : result.nearly
                ? "Your skills averaged out between two bands, so this is the lower one. You are at the top of it rather than the bottom."
                : "That is the average of the skills this measured. One weak section does not pull the whole level down, and one strong one does not carry it."}
          {result.ceiling && result.ceiling !== result.overall && (
            <> Your strongest measured skill looks like {levelLabel(result.ceiling)}, which is worth knowing too.</>
          )}
        </p>
        <p className="mt-3 text-sm" style={{ color: "var(--ink-2)" }}>
          {result.itemsAnswered} scored {result.itemsAnswered === 1 ? "question" : "questions"}
          {result.decisive > 0 && result.decisive < result.itemsAnswered
            ? `, ${result.decisive} of them at the levels this turned on`
            : ""}.{" "}
          {CONFIDENCE_COPY[result.confidence]}
        </p>
      </Card>

      <Card>
        <SectionTitle hint={`${measured.length} of 3 skills measured`}>Skill by skill</SectionTitle>
        <ul className="flex flex-col">
          {result.skills.map((skill) => <SkillRow key={skill.skill} result={skill} />)}
        </ul>
      </Card>

      <Card>
        <SectionTitle>What this is not</SectionTitle>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
          <li>
            Not a certificate. The exams that count are the state language exams, run at A2, B1, B2
            and C1 by the authority that sets them. This is half an hour in an app.
          </li>
          <li>
            Not a measurement of your speaking. Nothing here can score how you say Estonian
            honestly, so the speaking line is how confident you said you felt and is kept out of
            the level entirely.
          </li>
          <li>
            Not a measurement of conversation. Nothing in this app talks back to you at real speed,
            and reading a sentence when you can take your time is easier than following one as it
            is spoken.
          </li>
          <li>
            Built from this dictionary. Every word and sentence came from Ekilex and the same set
            the rest of the app teaches from, which is broad but not the whole language.
          </li>
        </ul>
      </Card>
    </div>
  );
}
