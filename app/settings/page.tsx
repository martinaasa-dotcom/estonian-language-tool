import { Shield } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { resolveProvider } from "@/lib/tutor/provider";
import { BADGES } from "@/lib/achievements/badges";
import { BadgeShelf } from "@/components/achievements/BadgeShelf";
import { Card, Chip, Page, SectionTitle } from "@/components/ui";
import { DailyGoalPanel } from "./DailyGoalPanel";
import { ImportPanel } from "./ImportPanel";
import { RestorePanel } from "./RestorePanel";
import { SetupGuide } from "./SetupGuide";
import { UsagePanel } from "./UsagePanel";

export const dynamic = "force-dynamic";
const DEFAULT_DAILY_GOAL = 15;

export default async function SettingsPage() {
  const ownerId = await requireUserId();
  const provider = resolveProvider();
  const [words, cards, reviews, earned, dailyGoalSetting, shieldSetting] = await Promise.all([
    prisma.lexeme.count(),
    prisma.card.count({ where: { ownerId } }),
    prisma.review.count({ where: { ownerId } }),
    prisma.achievement.findMany({ where: { ownerId }, select: { key: true } }),
    prisma.setting.findUnique({ where: { ownerId_key: { ownerId, key: "dailyGoal" } } }),
    prisma.setting.findUnique({ where: { ownerId_key: { ownerId, key: "streakShields" } } }),
  ]);
  const earnedKeys = new Set(earned.map((a) => a.key));
  const dailyGoal = dailyGoalSetting ? Number(dailyGoalSetting.value) || DEFAULT_DAILY_GOAL : DEFAULT_DAILY_GOAL;
  const shields = shieldSetting ? Number(shieldSetting.value) || 0 : 0;

  return (
    <Page
      title="Settings"
      lead="Your deck, your review history and your tasks are yours — export them any time."
    >
      <div className="flex flex-col gap-8">
        {provider && <UsagePanel ownerId={ownerId} />}
        <section>
          <SectionTitle>Your data</SectionTitle>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-[14px]" style={{ color: "var(--ink-2)" }}>
                <span className="tnum" style={{ color: "var(--ink)" }}>{words}</span> words ·{" "}
                <span className="tnum" style={{ color: "var(--ink)" }}>{cards}</span> cards ·{" "}
                <span className="tnum" style={{ color: "var(--ink)" }}>{reviews}</span> reviews
              </p>
              <a
                href="/api/export"
                className="inline-flex items-center gap-2 rounded-md border px-3.5 py-2 text-[14px] font-medium"
                style={{ borderColor: "var(--rule)", color: "var(--ink)", background: "var(--surface)" }}
              >
                Download a backup
              </a>
            </div>
            <p className="mt-3 text-[13px]" style={{ color: "var(--ink-3)" }}>
              Your review history is the one thing here that can&rsquo;t be recreated. Downloading a
              copy now and then is worth the ten seconds. See{" "}
              <a href="/privacy" className="underline underline-offset-2">privacy</a> for what is
              stored and what leaves the site.
            </p>
            <div className="mt-5 border-t pt-5" style={{ borderColor: "var(--rule-soft)" }}>
              <RestorePanel currentReviews={reviews} />
            </div>
          </Card>
        </section>

        <section>
          <SectionTitle>Import words</SectionTitle>
          <ImportPanel />
        </section>

        <section>
          <SectionTitle
            hint={provider ? undefined : "Anu is off until you add a key"}
          >
            AI tutor
          </SectionTitle>
          <Card>
            {provider ? (
              <div className="flex flex-wrap items-center gap-3">
                <Chip tone="good">Connected</Chip>
                <span className="text-[14px]" style={{ color: "var(--ink-2)" }}>
                  {provider.label} · <code className="text-[13px]">{provider.model}</code>
                </span>
              </div>
            ) : (
              <SetupGuide />
            )}
          </Card>
        </section>

        <section>
          <SectionTitle hint={`${dailyGoal} reviews/day`}>Daily goal</SectionTitle>
          <Card>
            <p className="mb-4 text-[14px]" style={{ color: "var(--ink-2)" }}>
              Sets how full the ring on Today fills up. Purely motivational — it never caps or
              blocks a session.
            </p>
            <DailyGoalPanel currentGoal={dailyGoal} />
          </Card>
        </section>

        <section>
          <SectionTitle hint={`${earnedKeys.size} of ${BADGES.length}`}>Achievements</SectionTitle>
          <Card>
            <BadgeShelf earnedKeys={earnedKeys} />
            <div className="mt-5 flex items-start gap-3 border-t pt-5" style={{ borderColor: "var(--rule-soft)" }}>
              <Shield size={18} aria-hidden className="shrink-0" style={{ color: "var(--accent)" }} />
              <div>
                <p className="text-[13.5px] font-medium" style={{ color: "var(--ink)" }}>
                  {shields} streak shield{shields === 1 ? "" : "s"} banked
                </p>
                <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                  Earned automatically at 7-, 30- and 100-day streaks. Each one protects your streak
                  through a single day you miss entirely — no action needed, it is spent
                  automatically the next time you&rsquo;re back.
                </p>
              </div>
            </div>
          </Card>
        </section>

        <section>
          <SectionTitle>Dictionary</SectionTitle>
          <Card>
            <p className="text-[14px]" style={{ color: "var(--ink-2)" }}>
              The built-in dictionary has {words} words with checked principal parts, covering A1 up
              into C1. Search an inflected form you met in class — <span lang="et">toas</span>,{" "}
              <span lang="et">lugesin</span> — and it will find the word and tell you which form you
              typed. Audio comes from the University of Tartu&rsquo;s Estonian speech service and
              needs no key.
            </p>
            <p className="mt-3 text-[13px]" style={{ color: "var(--ink-3)" }}>
              A free Ekilex API key from the Institute of the Estonian Language would extend search to
              the full Estonian lexicon. It is not needed for anything you can do today.
            </p>
          </Card>
        </section>
      </div>
    </Page>
  );
}
