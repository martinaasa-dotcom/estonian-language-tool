import { Bell, Download, Keyboard, Shield, Smartphone } from "lucide-react";
import { prisma } from "@/lib/db";
import { currentLearner, requireUserId } from "@/lib/auth/session";
import { supabaseConfigured } from "@/lib/auth/mode";
import { resolveProvider } from "@/lib/tutor/provider";
import { BADGES } from "@/lib/achievements/badges";
import { dailyGoalFrom, numberSetting, readSettings, reviewModeFrom, SETTING_KEYS } from "@/lib/settings/store";
import { BadgeShelf } from "@/components/achievements/BadgeShelf";
import { Card, Chip, Page, SectionTitle } from "@/components/ui";
import { DailyGoalPanel } from "./DailyGoalPanel";
import { ImportPanel } from "./ImportPanel";
import { LeaderboardPanel, ReviewModePanel } from "./PreferencesPanel";
import { RestorePanel } from "./RestorePanel";
import { SetupGuide } from "./SetupGuide";

export const dynamic = "force-dynamic";

const SHORTCUTS: [string, string][] = [
  ["⌘K / Ctrl-K", "Jump to any screen, or look a word up"],
  ["Space", "Show the answer"],
  ["Enter", "Check a typed answer, then grade it"],
  ["1-4", "Again · Hard · Good · Easy"],
  ["u", "Undo the last grade"],
  ["1-4 (listening, choice)", "Pick an option"],
];

export default async function SettingsPage() {
  const ownerId = await requireUserId();
  const provider = resolveProvider();
  const hosted = supabaseConfigured();

  const [words, cards, reviews, earned, settings, learner] = await Promise.all([
    prisma.lexeme.count(),
    prisma.card.count({ where: { ownerId } }),
    prisma.review.count({ where: { card: { ownerId } } }),
    prisma.achievement.findMany({ where: { ownerId }, select: { key: true } }),
    readSettings(ownerId, [
      SETTING_KEYS.dailyGoal, SETTING_KEYS.streakShields, SETTING_KEYS.reviewMode,
      SETTING_KEYS.displayName, SETTING_KEYS.leaderboard,
    ]),
    currentLearner(),
  ]);

  const earnedKeys = new Set(earned.map((a) => a.key));
  const dailyGoal = dailyGoalFrom(settings[SETTING_KEYS.dailyGoal]);
  const shields = numberSetting(settings[SETTING_KEYS.streakShields], 0);
  const mode = reviewModeFrom(settings[SETTING_KEYS.reviewMode]);
  const displayName = settings[SETTING_KEYS.displayName] ?? (learner.name === "you" ? "" : learner.name);
  const optedIn = settings[SETTING_KEYS.leaderboard] === "1";

  return (
    <Page
      title="Settings"
      lead={
        hosted
          ? "Your deck, reviews and tasks belong to your account and are visible only to you."
          : "This copy runs locally: everything is stored in the database on this machine, and nothing is uploaded anywhere."
      }
    >
      <div className="flex flex-col gap-8">
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
                className="press inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-[14px] font-semibold transition-all hover:-translate-y-px"
                style={{ borderColor: "var(--rule)", color: "var(--ink)", background: "var(--surface)", boxShadow: "var(--shadow-sm)" }}
              >
                <Download size={15} aria-hidden /> Download a backup
              </a>
            </div>
            <p className="mt-3 text-[13px]" style={{ color: "var(--ink-3)" }}>
              Your review history is the one thing here that can&rsquo;t be recreated. Downloading a
              copy now and then is worth the ten seconds.
            </p>
            <div className="mt-5 border-t pt-5" style={{ borderColor: "var(--rule-soft)" }}>
              <RestorePanel currentReviews={reviews} />
            </div>
          </Card>
        </section>

        <section>
          <SectionTitle hint={mode === "type" ? "typing" : "flipping"}>How review asks</SectionTitle>
          <ReviewModePanel current={mode} />
          <p className="mt-2 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
            Either way, brand-new cards are shown with their answer first, being asked to produce a
            word you have never seen teaches nothing.
          </p>
        </section>

        <section>
          <SectionTitle hint={`${dailyGoal} reviews/day`}>Daily goal</SectionTitle>
          <Card>
            <p className="mb-4 text-[14px]" style={{ color: "var(--ink-2)" }}>
              Sets how full the ring on Today fills up, and the target of your first daily quest.
              Purely motivational. It never caps or blocks a session.
            </p>
            <DailyGoalPanel currentGoal={dailyGoal} />
          </Card>
        </section>

        <section>
          <SectionTitle hint={optedIn ? "you're on it" : "off"}>Class leaderboard</SectionTitle>
          <Card>
            <LeaderboardPanel currentName={displayName} optedIn={optedIn} />
          </Card>
        </section>

        <section>
          <SectionTitle>Import words</SectionTitle>
          <ImportPanel />
        </section>

        <section>
          <SectionTitle hint={provider ? undefined : "Anu is off until you add a key"}>AI tutor</SectionTitle>
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
                  through a single day you miss entirely, no action needed, it is spent
                  automatically the next time you&rsquo;re back.
                </p>
              </div>
            </div>
          </Card>
        </section>

        <section>
          <SectionTitle>Keyboard</SectionTitle>
          <Card>
            <div className="flex items-start gap-3">
              <Keyboard size={18} aria-hidden className="mt-0.5 shrink-0" style={{ color: "var(--accent)" }} />
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px]" style={{ color: "var(--ink-2)" }}>
                  A whole session can be done without touching the mouse.
                </p>
                <dl className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                  {SHORTCUTS.map(([keys, what]) => (
                    <div key={keys} className="flex items-baseline gap-3">
                      <dt>
                        <kbd
                          className="rounded border px-1.5 py-0.5 text-[11.5px]"
                          style={{ borderColor: "var(--rule)", color: "var(--ink-2)" }}
                        >
                          {keys}
                        </kbd>
                      </dt>
                      <dd className="text-[13px]" style={{ color: "var(--ink-3)" }}>{what}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </Card>
        </section>

        <section>
          <SectionTitle hint="a calendar event, not a notification">Daily reminder</SectionTitle>
          <Card>
            <div className="flex items-start gap-3">
              <Bell size={18} aria-hidden className="mt-0.5 shrink-0" style={{ color: "var(--accent)" }} />
              <div>
                <p className="text-[14px]" style={{ color: "var(--ink-2)" }}>
                  Add a repeating reminder to the calendar you already use. It fires on your phone
                  whether or not this app is open, needs no account and no permission from us, and
                  you can delete it like any other event.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {["08:00", "12:30", "18:00", "20:30"].map((time) => (
                    <a
                      key={time}
                      href={`/api/reminder?at=${time}`}
                      className="rounded-md border px-3 py-1.5 text-[13.5px]"
                      style={{ borderColor: "var(--rule)", color: "var(--ink-2)", background: "var(--surface)" }}
                    >
                      {time}
                    </a>
                  ))}
                </div>
                <p className="mt-2 text-[12px]" style={{ color: "var(--ink-3)" }}>
                  Web push was the alternative. It needs a server that stays awake and still does
                  nothing on an iPhone unless the app is installed. A calendar entry just works.
                </p>
              </div>
            </div>
          </Card>
        </section>

        <section>
          <SectionTitle>Install it</SectionTitle>
          <Card>
            <div className="flex items-start gap-3">
              <Smartphone size={18} aria-hidden className="mt-0.5 shrink-0" style={{ color: "var(--accent)" }} />
              <div>
                <p className="text-[14px]" style={{ color: "var(--ink-2)" }}>
                  Kodukeel installs as an app, &ldquo;Add to Home Screen&rdquo; on iOS, &ldquo;Install&rdquo;
                  in the address bar on desktop Chrome. Installed, it opens straight into review and
                  keeps working without a connection.
                </p>
                <p className="mt-2 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                  Anything you grade offline is saved on the device and sent as soon as you are back
                  online, with the time you actually answered, so an offline session still counts
                  towards the right day&rsquo;s streak.
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
              into C1. Search an inflected form you met in class, <span lang="et">toas</span>,{" "}
              <span lang="et">lugesin</span>, and it will find the word and tell you which form you
              typed. Audio comes from the University of Tartu&rsquo;s Estonian speech service and
              needs no key.
            </p>
            <p className="mt-3 text-[13px]" style={{ color: "var(--ink-3)" }}>
              A free Ekilex API key from the Institute of the Estonian Language extends search to the
              full Estonian lexicon, and stores each word it fetches so the next lookup is local.
            </p>
          </Card>
        </section>
      </div>
    </Page>
  );
}
