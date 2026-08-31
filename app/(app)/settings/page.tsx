import Link from "next/link";
import type { ReactNode } from "react";
import { Bell, Download, Keyboard, Shield, Smartphone } from "lucide-react";
import { prisma } from "@/lib/db";
import { currentLearner, requireUserId } from "@/lib/auth/session";
import { supabaseConfigured } from "@/lib/auth/mode";
import { resolveProvider } from "@/lib/tutor/provider";
import { ekilexConfigured } from "@/lib/ekilex/client";
import { BADGES } from "@/lib/achievements/badges";
import { dailyGoalFrom, numberSetting, readSettings, reviewModeFrom, SETTING_KEYS } from "@/lib/settings/store";
import { letterBarFrom } from "@/lib/ux/letterBar";
import { goalsFor, latestFor } from "@/lib/progress/assessment";
import { levelLabel } from "@/components/assessment/PlanPanel";
import { BadgeShelf } from "@/components/achievements/BadgeShelf";
import { Card, Chip, Page, SectionTitle, Stack } from "@/components/ui";
import { DailyGoalPanel } from "./DailyGoalPanel";
import { EkilexSetupGuide } from "./EkilexSetupGuide";
import { GoalsPanel } from "./GoalsPanel";
import { ImportPanel } from "./ImportPanel";
import { InstallPanel } from "./InstallPanel";
import { LeaderboardPanel, LetterBarPanel, ReviewModePanel } from "./PreferencesPanel";
import { RestorePanel } from "./RestorePanel";
import { SetupGuide } from "./SetupGuide";
import { providerResilience } from "@/lib/tutor/provider";

export const metadata = { title: "Settings" };

export const dynamic = "force-dynamic";

const SHORTCUTS: [string, string][] = [
  ["⌘K / Ctrl-K", "Jump to any screen, or look a word up"],
  ["Space", "Show the answer"],
  ["Enter", "Check a typed answer, then grade it"],
  ["1-4", "Again · Hard · Good · Easy"],
  ["u", "Undo the last grade"],
  ["1-4 (listening, choice)", "Pick an option"],
];

/**
 * A landmark above a cluster of sections, nothing more.
 *
 * Twelve sections in one unbroken scroll is a real usability cost, and
 * grouping them fixes exactly that without the churn a restructure would
 * cost: every section below keeps its own `SectionTitle`, its own anchor,
 * its own content, in the same order it was in before. This adds a label to
 * jump to, not a click to open — nothing here is collapsed or hidden, which
 * is the same argument `lib/ux/disclosure.ts` makes about withholding a
 * panel rather than deleting it.
 */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6 border-t pt-8 first:border-t-0 first:pt-0" style={{ borderColor: "var(--rule-soft)" }}>
      <h2 className="text-lg font-bold" style={{ color: "var(--ink)" }}>{title}</h2>
      {children}
    </div>
  );
}

export default async function SettingsPage() {
  const ownerId = await requireUserId();
  const provider = resolveProvider();
  const resilience = providerResilience();
  const hosted = supabaseConfigured();
  const ekilexOn = ekilexConfigured();

  const [words, cards, reviews, earned, settings, learner, goals, latestCheck] = await Promise.all([
    prisma.lexeme.count(),
    prisma.card.count({ where: { ownerId } }),
    prisma.review.count({ where: { ownerId } }),
    prisma.achievement.findMany({ where: { ownerId }, select: { key: true } }),
    readSettings(ownerId, [
      SETTING_KEYS.dailyGoal, SETTING_KEYS.streakShields, SETTING_KEYS.reviewMode,
      SETTING_KEYS.letterBar,
      SETTING_KEYS.displayName, SETTING_KEYS.leaderboard,
    ]),
    currentLearner(),
    goalsFor(ownerId),
    latestFor(ownerId),
  ]);

  const earnedKeys = new Set(earned.map((a) => a.key));
  const dailyGoal = dailyGoalFrom(settings[SETTING_KEYS.dailyGoal]);
  const shields = numberSetting(settings[SETTING_KEYS.streakShields], 0);
  const mode = reviewModeFrom(settings[SETTING_KEYS.reviewMode]);
  const letters = letterBarFrom(settings[SETTING_KEYS.letterBar]);
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
      <Stack>
        <Group title="Study">
          <section>
            <SectionTitle hint={mode === "type" ? "typing" : "flipping"}>How review asks</SectionTitle>
            <ReviewModePanel current={mode} />
            <p className="mt-2 text-xs" style={{ color: "var(--ink-3)" }}>
              Either way, brand-new cards are shown with their answer first, being asked to produce a
              word you have never seen teaches nothing.
            </p>
          </section>

          <section id="goals">
            <SectionTitle
              hint={latestCheck ? `measured ${levelLabel((latestCheck.overall ?? null) as never)}` : "not measured yet"}
            >
              Why you are here
            </SectionTitle>
            <Card>
              <p className="mb-4 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
                These answers build the timeline on the level check screen: how many hours the level you
                want usually takes, how many of them your daily goal covers, and what is left to find
                elsewhere. Change them whenever the answer changes.
              </p>
              <GoalsPanel current={goals} />
              <p className="mt-5 text-sm" style={{ color: "var(--ink-3)" }}>
                <Link href="/assess" className="underline underline-offset-2" style={{ color: "var(--accent-deep)" }}>
                  Take the level check
                </Link>{" "}
                to measure where you are, or read{" "}
                <Link href="/guide" className="underline underline-offset-2" style={{ color: "var(--accent-deep)" }}>
                  what this app can and cannot do
                </Link>
                .
              </p>
            </Card>
          </section>

          <section>
            <SectionTitle hint={`${dailyGoal} reviews/day`}>Daily goal</SectionTitle>
            <Card>
              <p className="mb-4 text-sm" style={{ color: "var(--ink-2)" }}>
                Sets how full the ring on Today fills up, and the target of your first daily quest.
                Purely motivational. It never caps or blocks a session.
              </p>
              <DailyGoalPanel currentGoal={dailyGoal} />
            </Card>
          </section>

          <section>
            <SectionTitle hint={ekilexOn ? "connected" : "built-in set only"}>Dictionary</SectionTitle>
            <Card>
              <p className="text-sm" style={{ color: "var(--ink-2)" }}>
                The built-in dictionary has {words} words with checked principal parts, covering A1 up
                into C1. Search an inflected form you met in class, <span lang="et">toas</span>,{" "}
                <span lang="et">lugesin</span>, and it will find the word and tell you which form you
                typed. Audio comes from the University of Tartu&rsquo;s Estonian speech service and
                needs no key.
              </p>
              {ekilexOn ? (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Chip tone="good">Connected</Chip>
                  <p className="text-xs" style={{ color: "var(--ink-3)" }}>
                    Words beyond the built-in set are fetched live from Ekilex, at the Institute of the
                    Estonian Language, and stored as they arrive so the next lookup is local and works
                    offline. Example sentences, dictation and the fuller mock exam all draw on this.
                  </p>
                </div>
              ) : (
                <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--rule-soft)" }}>
                  <p className="mb-3 text-sm" style={{ color: "var(--ink-2)" }}>
                    No Ekilex key is configured on this deployment, so search stops at the {words}{" "}
                    built-in words: nothing outside that set can be looked up, and dictation, the
                    sentence builder and the mock exam&rsquo;s reading and listening parts stay thin or
                    empty because the built-in set carries almost no attested sentences.
                  </p>
                  <EkilexSetupGuide />
                </div>
              )}
            </Card>
          </section>
        </Group>

        <Group title="Progress and sharing">
          <section>
            <SectionTitle hint={`${earnedKeys.size} of ${BADGES.length}`}>Achievements</SectionTitle>
            <Card>
              <BadgeShelf earnedKeys={earnedKeys} />
              <div className="mt-5 flex items-start gap-3 border-t pt-5" style={{ borderColor: "var(--rule-soft)" }}>
                <Shield size={18} aria-hidden className="shrink-0" style={{ color: "var(--accent-deep)" }} />
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>
                    {shields} streak shield{shields === 1 ? "" : "s"} banked
                  </p>
                  <p className="mt-0.5 text-xs" style={{ color: "var(--ink-3)" }}>
                    Earned automatically at 7-, 30- and 100-day streaks. Each one protects your streak
                    through a single day you miss entirely, no action needed, it is spent
                    automatically the next time you&rsquo;re back.
                  </p>
                </div>
              </div>
            </Card>
          </section>

          <section>
            <SectionTitle hint={optedIn ? "you're on it" : "off"}>Class leaderboard</SectionTitle>
            <Card>
              <LeaderboardPanel currentName={displayName} optedIn={optedIn} />
            </Card>
          </section>
        </Group>

        <Group title="Words and Anu">
          <section>
            <SectionTitle>Import words</SectionTitle>
            <ImportPanel />
          </section>

          <section>
            <SectionTitle hint={provider ? undefined : "Anu is off until you add a key"}>AI tutor</SectionTitle>
            <Card>
              {provider ? (
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Chip tone="good">Connected</Chip>
                    <span className="text-sm" style={{ color: "var(--ink-2)" }}>
                      {provider.label} · <code className="text-xs">{provider.model}</code>
                    </span>
                  </div>
                  <p className="mt-2 text-xs" style={{ color: "var(--ink-3)" }}>
                    {resilience.models === 1
                      ? "One model is configured."
                      : `${resilience.models} models are tried in order, across ${resilience.providers.join(" and ")}.`}
                  </p>
                  {/*
                    Said plainly because it is invisible otherwise. A chain of
                    several OpenRouter models reads as redundancy and is not: they
                    share one account and one balance, so when it ran out here
                    every link answered 402 at the same moment and the tutor went
                    down. A second provider is the only thing that changes that.
                  */}
                  {resilience.singlePointOfFailure && (
                    <p className="mt-2 text-xs" style={{ color: "var(--ink-3)" }}>
                      Everything above is {resilience.providers[0]}, on one account. If that key stops
                      answering, whether it runs out of credit or has a bad minute, Anu stops with it.
                      Adding <code className="text-xs">GROQ_API_KEY</code> or{" "}
                      <code className="text-xs">GEMINI_API_KEY</code> to <code className="text-xs">.env</code>{" "}
                      gives the chain somewhere to fall through to. Both have a free tier and neither
                      asks for a card. Read the note beside them in{" "}
                      <code className="text-xs">.env.example</code> first: a free tier is usually free
                      because the provider may look at what goes through it.
                    </p>
                  )}
                </div>
              ) : (
                <SetupGuide />
              )}
            </Card>
          </section>
        </Group>

        <Group title="Device and data">
          <section>
            <SectionTitle>Your data</SectionTitle>
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="text-sm" style={{ color: "var(--ink-2)" }}>
                  <span className="tnum" style={{ color: "var(--ink)" }}>{words}</span> words ·{" "}
                  <span className="tnum" style={{ color: "var(--ink)" }}>{cards}</span> cards ·{" "}
                  <span className="tnum" style={{ color: "var(--ink)" }}>{reviews}</span> reviews
                </p>
                <a
                  href="/api/export"
                  className="press inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold transition-ui hover:-translate-y-px"
                  style={{ borderColor: "var(--rule)", color: "var(--ink)", background: "var(--surface)", boxShadow: "var(--shadow-sm)" }}
                >
                  <Download size={15} aria-hidden /> Download a backup
                </a>
              </div>
              <p className="mt-3 text-xs" style={{ color: "var(--ink-3)" }}>
                Your review history is the one thing here that can&rsquo;t be recreated. Downloading a
                copy now and then is worth the ten seconds.
              </p>
              <div className="mt-5 border-t pt-5" style={{ borderColor: "var(--rule-soft)" }}>
                <RestorePanel currentReviews={reviews} />
              </div>
            </Card>
          </section>

          {/*
            Desktop only, and the whole section goes with the choice rather than
            being left as a heading over nothing. See app/globals.css: a phone
            draws no letter bar, so there is nothing here to decide.
          */}
          <section className="letters-choice">
            <SectionTitle hint={letters === "on" ? "shown" : "hidden"}>Typing Estonian</SectionTitle>
            <LetterBarPanel current={letters} />
            <p className="mt-2 text-xs" style={{ color: "var(--ink-3)" }}>
              Only ever on a computer. A phone keyboard already has these letters, on a long press
              or a keyboard switched to Estonian, so no row is drawn there either way.
            </p>
          </section>

          <section>
            <SectionTitle>Keyboard</SectionTitle>
            <Card>
              <div className="flex items-start gap-3">
                <Keyboard size={18} aria-hidden className="mt-0.5 shrink-0" style={{ color: "var(--accent-deep)" }} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm" style={{ color: "var(--ink-2)" }}>
                    A whole session can be done without touching the mouse.
                  </p>
                  <dl className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                    {SHORTCUTS.map(([keys, what]) => (
                      <div key={keys} className="flex items-baseline gap-3">
                        <dt>
                          <kbd
                            className="rounded-md border px-1.5 py-0.5 text-2xs"
                            style={{ borderColor: "var(--rule)", color: "var(--ink-2)" }}
                          >
                            {keys}
                          </kbd>
                        </dt>
                        <dd className="text-xs" style={{ color: "var(--ink-3)" }}>{what}</dd>
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
                <Bell size={18} aria-hidden className="mt-0.5 shrink-0" style={{ color: "var(--accent-deep)" }} />
                <div>
                  <p className="text-sm" style={{ color: "var(--ink-2)" }}>
                    Add a repeating reminder to the calendar you already use. It fires on your phone
                    whether or not this app is open, needs no account and no permission from us, and
                    you can delete it like any other event.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {["08:00", "12:30", "18:00", "20:30"].map((time) => (
                      <a
                        key={time}
                        href={`/api/reminder?at=${time}`}
                        className="rounded-md border px-3 py-1.5 text-sm"
                        style={{ borderColor: "var(--rule)", color: "var(--ink-2)", background: "var(--surface)" }}
                      >
                        {time}
                      </a>
                    ))}
                  </div>
                  <p className="mt-2 text-xs" style={{ color: "var(--ink-3)" }}>
                    The time is read on your own clock, wherever you are, and stays put when the
                    clocks change.
                  </p>
                  <p className="mt-2 text-xs" style={{ color: "var(--ink-3)" }}>
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
                <Smartphone size={18} aria-hidden className="mt-0.5 shrink-0" style={{ color: "var(--accent-deep)" }} />
                <div>
                  <p className="text-sm" style={{ color: "var(--ink-2)" }}>
                    Kodukeel installs as an app, &ldquo;Add to Home Screen&rdquo; on iOS, &ldquo;Install&rdquo;
                    in the address bar on desktop Chrome. Installed, it opens straight into review and
                    keeps working without a connection.
                  </p>
                  <p className="mt-2 text-xs" style={{ color: "var(--ink-3)" }}>
                    Anything you grade offline is saved on the device and sent as soon as you are back
                    online, with the time you actually answered, so an offline session still counts
                    towards the right day&rsquo;s streak.
                  </p>
                  <InstallPanel />
                </div>
              </div>
            </Card>
          </section>
        </Group>
      </Stack>
    </Page>
  );
}
