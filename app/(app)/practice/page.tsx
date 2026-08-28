import Link from "next/link";
import { GraduationCap, Grid2x2, Headphones, Target, Zap } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { deckSnapshot } from "@/lib/progress/summary";
import { caseAccuracy } from "@/lib/stats/history";
import { numberSetting, readSettings, SETTING_KEYS } from "@/lib/settings/store";
import { ButtonLink } from "@/components/Button";
import { Card, Chip, Empty, Meter, Page, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Every way to practise, in one place, with the state that decides whether each
 * one is worth doing right now — how many cards are due, your best sprint, your
 * fastest match. A hub that just lists modes makes you guess; this one answers
 * "what should I do with the next five minutes".
 */
export default async function PracticePage() {
  const ownerId = await requireUserId();
  const [snapshot, settings, caseReviews] = await Promise.all([
    deckSnapshot(ownerId),
    readSettings(ownerId, [SETTING_KEYS.sprintBest, SETTING_KEYS.matchBest]),
    prisma.review.findMany({
      where: { targetCase: { not: null }, card: { ownerId } },
      select: { targetCase: true, rating: true },
      take: 5000,
    }),
  ]);

  const sprintBest = numberSetting(settings[SETTING_KEYS.sprintBest], 0);
  const matchBest = numberSetting(settings[SETTING_KEYS.matchBest], 0);
  const weakCases = caseAccuracy(caseReviews).slice(0, 5);

  const modes = [
    {
      href: "/review",
      icon: GraduationCap,
      title: "Review",
      subtitle: "The daily loop",
      body: "Everything due, scheduled by FSRS. Type the answer or flip the card — your choice in Settings.",
      meta: snapshot.dueCount > 0
        ? `${snapshot.dueCount} due now`
        : snapshot.newCount > 0 ? `${Math.min(snapshot.newCount, 10)} new waiting` : "Nothing due",
      primary: snapshot.dueCount > 0,
    },
    {
      href: "/review/sprint",
      icon: Zap,
      title: "Case Sprint",
      subtitle: "60 seconds",
      body: "As many cards as you can in a minute, weighted towards the ones you keep slipping on.",
      meta: sprintBest > 0 ? `Best: ${sprintBest}` : "No score yet",
      primary: false,
    },
    {
      href: "/review/match",
      icon: Grid2x2,
      title: "Match",
      subtitle: "Eight pairs",
      body: "Pair each word with its meaning against the clock. Clean pairs count as a review.",
      meta: matchBest > 0 ? `Best: ${matchBest}s` : "No time yet",
      primary: false,
    },
    {
      href: "/review/listening",
      icon: Headphones,
      title: "Listening",
      subtitle: "Ear first",
      body: "Hear an Estonian word and pick the meaning — the one skill reading practice never builds.",
      meta: "Audio from TartuNLP",
      primary: false,
    },
  ];

  return (
    <Page
      title="Practice"
      lead="Four ways to work the same deck, plus a drill for whichever case you keep missing. They all write to the same review log, so anything you do here moves the same schedule forward."
    >
      {snapshot.totalCards === 0 ? (
        <Empty
          title="Nothing to practise yet"
          body="Every mode here draws on your own deck. Start a unit on the path and all of them light up at once."
          action={<ButtonLink href="/learn" variant="primary">Open the learning path</ButtonLink>}
        />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid gap-3 sm:grid-cols-2">
            {modes.map((m) => (
              <Link
                key={m.href}
                href={m.href}
                className="flex flex-col gap-2 rounded-lg border p-5 transition-opacity hover:opacity-85"
                style={{
                  borderColor: m.primary ? "var(--accent)" : "var(--rule)",
                  background: "var(--surface)",
                  boxShadow: "var(--shadow)",
                }}
              >
                <span className="flex items-center gap-3">
                  <span
                    className="flex h-10 w-10 items-center justify-center rounded-full"
                    style={{
                      background: m.primary ? "var(--accent)" : "var(--accent-soft)",
                      color: m.primary ? "var(--accent-ink)" : "var(--accent)",
                    }}
                  >
                    <m.icon size={19} aria-hidden />
                  </span>
                  <span>
                    <span className="est block text-[18px] font-semibold" style={{ color: "var(--ink)" }}>
                      {m.title}
                    </span>
                    <span className="block text-[12.5px]" style={{ color: "var(--ink-3)" }}>{m.subtitle}</span>
                  </span>
                  <span className="ml-auto"><Chip tone={m.primary ? "accent" : "neutral"}>{m.meta}</Chip></span>
                </span>
                <span className="text-[13.5px]" style={{ color: "var(--ink-2)" }}>{m.body}</span>
              </Link>
            ))}
          </div>

          <section>
            <SectionTitle hint="weakest first">Drill one case</SectionTitle>
            <Card>
              {weakCases.length === 0 ? (
                <p className="text-[14px]" style={{ color: "var(--ink-2)" }}>
                  Once you have answered a few case-form cards, the cases you keep missing show up
                  here with a one-click drill. Add a noun unit from the{" "}
                  <Link href="/learn" className="underline" style={{ color: "var(--accent)" }}>path</Link>{" "}
                  to start generating them.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {weakCases.map((c) => (
                    <li key={c.grammCase}>
                      <Link
                        href={`/review?case=${c.grammCase}`}
                        className="flex items-center gap-3 rounded-md px-2 py-1.5 transition-opacity hover:opacity-75"
                        aria-label={`Drill the ${c.grammCase.toLowerCase()}, currently ${c.accuracy} percent over ${c.total} reviews`}
                      >
                        <Target size={15} aria-hidden style={{ color: "var(--ink-3)" }} />
                        <span className="w-28 text-[14px]" style={{ color: "var(--ink-2)" }}>
                          {c.grammCase.toLowerCase()}
                        </span>
                        <span className="max-w-[200px] flex-1">
                          <Meter
                            pct={c.accuracy}
                            label={`${c.grammCase.toLowerCase()} accuracy`}
                            tone={c.accuracy >= 85 ? "var(--good)" : c.accuracy >= 65 ? "var(--hard)" : "var(--again)"}
                            height={5}
                          />
                        </span>
                        <span className="tnum w-20 text-right text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                          {c.accuracy}% · {c.total}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>
        </div>
      )}
    </Page>
  );
}
