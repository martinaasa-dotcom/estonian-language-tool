import Link from "next/link";
import { Check, Lock } from "lucide-react";
import { requireUserId } from "@/lib/auth/session";
import { deckSnapshot, pathWithProgress } from "@/lib/progress/summary";
import { AddUnitButton } from "@/components/AddUnitButton";
import { ButtonLink } from "@/components/Button";
import { icon } from "@/components/icons";
import { Chip, Meter, Page, Ring } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * The learning path.
 *
 * A vertical run of units rather than a grid, because the point is *order* —
 * the next thing to do should be obvious without reading every card. Progress
 * is computed from the deck (lib/progress/summary.ts), so a unit fills up as
 * its words are genuinely learned, not as they are clicked on.
 */
export default async function LearnPage() {
  const ownerId = await requireUserId();
  const snapshot = await deckSnapshot(ownerId);
  const units = await pathWithProgress(ownerId, snapshot);

  const done = units.filter((u) => u.state === "done").length;
  const started = units.filter((u) => u.state === "learning").length;
  const totalWords = units.reduce((sum, u) => sum + u.available, 0);
  const knownWords = units.reduce((sum, u) => sum + u.known, 0);
  const overall = totalWords > 0 ? Math.round((knownWords / totalWords) * 100) : 0;
  const next = units.find((u) => u.state === "learning") ?? units.find((u) => u.state === "new");

  return (
    <Page
      title="Learning path"
      lead="The built-in dictionary, arranged into units. Each one is a sitting's worth of words, and adding a unit builds real flashcards with audio and full paradigms."
    >
      <div
        className="mb-7 flex flex-wrap items-center gap-5 rounded-[var(--r-lg)] border p-5"
        style={{ borderColor: "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow)" }}
      >
        <Ring pct={overall} size={72} label={`${overall}% of the path learned`}>
          <span className="tnum text-[14px] font-bold" style={{ color: "var(--ink)" }}>{overall}%</span>
        </Ring>
        <div className="min-w-0 flex-1">
          <p className="text-[15px]" style={{ color: "var(--ink)" }}>
            {done} unit{done === 1 ? "" : "s"} finished
            {started > 0 ? `, ${started} in progress` : ""} · {knownWords} of {totalWords} words known
          </p>
          <p className="mt-1 text-[13px]" style={{ color: "var(--ink-3)" }}>
            A word counts as known once every card made from it has graduated in the scheduler,
            not just answered right once.
          </p>
        </div>
        {next && (
          <ButtonLink href={`/learn/${next.unit.id}`} variant="primary">
            {next.state === "new" ? "Start" : "Continue"}: {next.unit.title}
          </ButtonLink>
        )}
      </div>

      <ol className="relative flex flex-col gap-3">
        {/* The spine of the path. Decorative — the list itself carries the order. */}
        <span
          aria-hidden
          className="absolute left-[27px] top-6 bottom-6 hidden w-px sm:block"
          style={{ background: "var(--rule)" }}
        />
        {units.map((u) => {
          const Icon = icon(u.unit.icon);
          const locked = u.state === "locked";
          const complete = u.state === "done";
          return (
            <li
              key={u.unit.id}
              className={`relative flex flex-wrap items-center gap-4 rounded-[var(--r-lg)] border p-4 sm:pl-5 ${locked ? "" : "lift"}`}
              style={{
                borderColor: complete ? "var(--mint)" : u.state === "learning" ? "var(--accent)" : "var(--rule)",
                background: "var(--surface)",
                boxShadow: "var(--shadow-sm)",
                opacity: locked ? 0.55 : 1,
              }}
            >
              <span
                className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                style={{
                  background: complete ? "var(--mint)" : u.state === "learning" ? "var(--accent)" : "var(--raised)",
                  color: complete || u.state === "learning" ? "var(--surface)" : "var(--ink-3)",
                  outline: "4px solid var(--ground)",
                }}
              >
                {locked ? <Lock size={18} aria-hidden /> : complete ? <Check size={20} aria-hidden /> : <Icon size={19} aria-hidden />}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <Link
                    href={`/learn/${u.unit.id}`}
                    lang="et"
                    className="est text-[19px] font-bold hover:underline"
                    style={{ color: "var(--ink)" }}
                  >
                    {u.unit.title}
                  </Link>
                  <span className="text-[13px]" style={{ color: "var(--ink-3)" }}>{u.unit.subtitle}</span>
                  <Chip tone={complete ? "good" : u.state === "learning" ? "accent" : "sky"}>{u.unit.cefr}</Chip>
                </div>
                <p className="mt-1 max-w-[62ch] text-[13.5px]" style={{ color: "var(--ink-2)" }}>{u.unit.blurb}</p>
                <div className="mt-2.5 flex items-center gap-3">
                  <span className="max-w-[220px] flex-1">
                    <Meter
                      pct={u.pct}
                      label={`${u.unit.title}: ${u.known} of ${u.available} words known`}
                      tone={complete ? "var(--good)" : "var(--accent)"}
                      height={7}
                    />
                  </span>
                  <span className="tnum text-[12px]" style={{ color: "var(--ink-3)" }}>
                    {u.known}/{u.available} known
                  </span>
                </div>
              </div>

              <div className="flex w-full shrink-0 gap-2 sm:w-auto">
                {u.state === "new" ? (
                  <AddUnitButton unitId={u.unit.id} words={u.available} started={false} className="flex-1 sm:w-44" />
                ) : (
                  <ButtonLink href={`/learn/${u.unit.id}`} className="flex-1 justify-center sm:w-44">
                    {complete ? "Review unit" : "Open unit"}
                  </ButtonLink>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <p className="mt-6 text-[13px]" style={{ color: "var(--ink-3)" }}>
        Units are shortcuts into the same dictionary, not a separate course, everything in them can
        also be found by searching, and anything the dictionary is missing you can{" "}
        <Link href="/dictionary" className="underline" style={{ color: "var(--accent)" }}>add yourself</Link>.
      </p>
    </Page>
  );
}
