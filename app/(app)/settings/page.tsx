import { PrefetchLink as Link } from "@/components/PrefetchLink";
import type { ReactNode } from "react";
import { Bell, Download, Keyboard, Smartphone } from "lucide-react";
import { prisma } from "@/lib/db";
import { currentLearner, requireUserId } from "@/lib/auth/session";
import { supabaseConfigured } from "@/lib/auth/mode";
import { resolveProvider } from "@/lib/tutor/provider";
import { ekilexConfigured } from "@/lib/ekilex/client";
import { dailyGoalFrom, readSettings, reviewModeFrom, SETTING_KEYS } from "@/lib/settings/store";
import { letterBarFrom } from "@/lib/ux/letterBar";
import { participationFrom, researchExportConfigured } from "@/lib/research/participation";
import { goalsFor, latestFor } from "@/lib/progress/assessment";
import { levelLabel } from "@/components/assessment/PlanPanel";
import { courseLevelFor } from "@/lib/progress/level";
import { Card, Chip, Page, SectionTitle, Stack } from "@/components/ui";
import { DailyGoalPanel } from "./DailyGoalPanel";
import { LevelPanel } from "./LevelPanel";
import { EkilexSetupGuide } from "./EkilexSetupGuide";
import { GoalsPanel } from "./GoalsPanel";
import { ImportPanel } from "./ImportPanel";
import { InstallPanel } from "./InstallPanel";
import { ClassNamePanel, LetterBarPanel, ResearchPanel, ReviewModePanel } from "./PreferencesPanel";
import { AutoplayPanel, CurrentVoiceSample, FeedbackSoundsPanel, HearingPanel, VoicePanel } from "./AudioPanel";
import { hearingFrom } from "@/lib/audio/conditions";
import { GlossLanguagePanel } from "./GlossLanguagePanel";
import { GLOSS_LANGUAGES, glossLanguageFrom } from "@/lib/collections/glossLanguage";
import { autoplayFrom, feedbackSoundsFrom, voiceFrom, VOICES } from "@/lib/audio/voice";
import { RestorePanel } from "./RestorePanel";
import { UsagePanel } from "./UsagePanel";
import { DangerZone } from "./DangerZone";
import { SetupGuide } from "./SetupGuide";
import { providerResilience } from "@/lib/tutor/provider";

export const metadata = { title: "Settings" };

export const dynamic = "force-dynamic";

/*
  The word importer runs here, and it is the one action on this page whose cost
  is set by what somebody pasted rather than by the page. `MAX_IMPORT_ROWS` is
  500, and a cap on rows is not a cap on time: measured against a local
  database, where a round trip is nearly free, five hundred rows take about
  two and a half seconds, and a deployment reaches its database over a pooler
  where every one of those round trips costs a great deal more. Without a
  budget the action inherits the platform's default, which on several of them
  is ten seconds, and a paste that runs past it leaves a half-finished import
  and an error that says nothing about how much landed.

  Sixty seconds, the same figure the writing routes use. It is a ceiling rather
  than a reservation: a page render that takes a millisecond still takes a
  millisecond.
*/
export const maxDuration = 60;

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

  const [words, cards, reviews, settings, learner, goals, latestCheck, courseLevel] = await Promise.all([
    prisma.lexeme.count(),
    prisma.card.count({ where: { ownerId } }),
    prisma.review.count({ where: { ownerId } }),
    readSettings(ownerId, [
      SETTING_KEYS.dailyGoal, SETTING_KEYS.reviewMode,
      SETTING_KEYS.letterBar, SETTING_KEYS.researchOptOut,
      SETTING_KEYS.displayName,
      SETTING_KEYS.ttsVoice, SETTING_KEYS.autoplayAudio, SETTING_KEYS.feedbackSounds,
      SETTING_KEYS.hearing, SETTING_KEYS.glossLanguage,
    ]),
    currentLearner(),
    goalsFor(ownerId),
    latestFor(ownerId),
    /*
      The level the app is actually going on, which is not always the last
      check: `courseLevelFor` takes whichever of the measurement and the
      learner's own answer was stated later. Reading the check alone here
      would print one level in the hint and hand the picker another.
    */
    courseLevelFor(ownerId),
  ]);

  const dailyGoal = dailyGoalFrom(settings[SETTING_KEYS.dailyGoal]);
  const mode = reviewModeFrom(settings[SETTING_KEYS.reviewMode]);
  const letters = letterBarFrom(settings[SETTING_KEYS.letterBar]);
  const participation = participationFrom(settings[SETTING_KEYS.researchOptOut]);
  const researchExported = researchExportConfigured();
  const voice = voiceFrom(settings[SETTING_KEYS.ttsVoice]);
  const voiceName = VOICES.find((v) => v.id === voice)?.name ?? voice;
  const autoplay = autoplayFrom(settings[SETTING_KEYS.autoplayAudio]);
  const sounds = feedbackSoundsFrom(settings[SETTING_KEYS.feedbackSounds]);
  const hearing = hearingFrom(settings[SETTING_KEYS.hearing]);
  const glossLanguage = glossLanguageFrom(settings[SETTING_KEYS.glossLanguage]);
  const glossLanguageName =
    GLOSS_LANGUAGES.find((l) => l.id === glossLanguage)?.label ?? "English";
  const displayName = settings[SETTING_KEYS.displayName] ?? (learner.name === "you" ? "" : learner.name);
  /*
    Whether the level on screen is one a check produced, which is the only
    thing the panel's copy changes on. Compared by value rather than by asking
    which source won, because a check that put somebody at B1 and a learner who
    then picked B1 are the same claim and saying "you set this" over it would
    be the app arguing with itself about a number both agree on.
  */
  const measuredIsCurrent = (latestCheck?.overall ?? null) === courseLevel;

  return (
    <Page
      title="Settings"
      lead={
        hosted
          ? "Your deck, reviews and tasks are yours alone. Nobody else can see them."
          : "This is running on your own computer. Nothing is uploaded anywhere."
      }
    >
      <Stack>
        <Group title="Study">
          <section>
            <SectionTitle hint={mode === "type" ? "typing" : "flipping"}>How review asks</SectionTitle>
            <ReviewModePanel current={mode} />
            <p className="mt-2 text-xs" style={{ color: "var(--ink-3)" }}>
              Either way, brand-new cards are shown with their answer first. Being asked to produce a
              word you have never seen teaches nothing.
            </p>
          </section>

          {/*
            How Estonian sounds. Three questions in one section because they
            are one decision about the same thing: who says it, whether they
            say it unasked, and whether the app answers back. The voices come
            from the same Tartu service every clip in the app does.
          */}
          <section>
            <SectionTitle hint={voiceName}>Voice</SectionTitle>
            <Card className="flex flex-col gap-5">
              <div>
                <p className="mb-3 flex flex-wrap items-center gap-2 text-sm" style={{ color: "var(--ink-2)" }}>
                  Who reads Estonian to you. Press the ear beside a name to hear it, and the chip to keep it.
                  <CurrentVoiceSample />
                </p>
                <VoicePanel current={voice} />
                <p className="mt-2 text-xs" style={{ color: "var(--ink-3)" }}>
                  Twelve voices from the University of Tartu&rsquo;s speech synthesis. The state examination
                  is read by more than one speaker, so it is worth changing this now and then.
                </p>
              </div>
              <div>
                <h3 className="label-xs mb-2" style={{ color: "var(--ink-3)" }}>When it speaks</h3>
                <AutoplayPanel current={autoplay} />
              </div>
              <div>
                <h3 className="label-xs mb-2" style={{ color: "var(--ink-3)" }}>Right and wrong</h3>
                <FeedbackSoundsPanel current={sounds} />
              </div>
              <div>
                <h3 className="label-xs mb-2" style={{ color: "var(--ink-3)" }}>Listening and dictation</h3>
                <HearingPanel current={hearing} />
                <p className="mt-2 text-xs" style={{ color: "var(--ink-3)" }}>
                  The words never change. What changes is the pace, the reader, and the room,
                  because the receptionist will not slow down for you and the shop is never quiet.
                </p>
              </div>
            </Card>
          </section>

          {/*
            WHICH LANGUAGE A MEANING IS GIVEN IN, WHICH IS NOT A COSMETIC
            SETTING HERE.

            Most people learning Estonian in Estonia already speak Russian or
            Ukrainian, and an app that can only say `kohv` is "coffee" asks
            them to reach a word through the language they are least sure of.
            The equivalents are the Institute's own, out of the same Ekilex
            response as the forms and the sentences: no model is anywhere near
            them.
          */}
          <section id="meanings">
            <SectionTitle hint={glossLanguageName}>Meanings</SectionTitle>
            <Card>
              <p className="mb-3 text-sm" style={{ color: "var(--ink-2)" }}>
                What a word means, in the language you think in. The English gloss stays on every
                entry; this decides what is printed beside it.
              </p>
              <GlossLanguagePanel current={glossLanguage} />
              <p className="mt-2 text-xs" style={{ color: "var(--ink-3)" }}>
                The Russian and Ukrainian come from Ekilex, written by the same lexicographers as
                the Estonian. Where they recorded none, the entry says so by showing the English
                on its own.
              </p>
            </Card>
          </section>

          <section id="level">
            <SectionTitle hint={courseLevel}>Your level</SectionTitle>
            <Card>
              <LevelPanel current={courseLevel} measured={measuredIsCurrent} />
            </Card>
          </section>

          <section id="goals">
            <SectionTitle
              hint={latestCheck ? `measured ${levelLabel((latestCheck.overall ?? null) as never)}` : "not measured yet"}
            >
              Why you are here
            </SectionTitle>
            <Card>
              <p className="mb-4 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
                These answers shape the timeline on the level check screen: how many hours the level
                you want usually takes, how many of them your daily goal covers, and what is left to
                find elsewhere. Change them whenever the answer changes.
              </p>
              <GoalsPanel current={goals} />
              <p className="mt-5 text-sm" style={{ color: "var(--ink-3)" }}>
                <Link href="/assess" className="underline underline-offset-2" style={{ color: "var(--accent-deep)" }}>
                  Take the level check
                </Link>{" "}
                to measure where you are.
              </p>
            </Card>
          </section>

          <section>
            <SectionTitle hint={`${dailyGoal} reviews/day`}>Daily goal</SectionTitle>
            <Card>
              <p className="mb-4 text-sm" style={{ color: "var(--ink-2)" }}>
                This sets how full the ring on Today gets, and what your first daily quest aims for.
                It is only there to motivate you. It never stops you from reviewing more.
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
                    Words beyond the built-in set come straight from Ekilex, at the Institute of the
                    Estonian Language, and are saved here so the next lookup works offline too.
                    Example sentences, dictation and the fuller mock exam all draw on this.
                  </p>
                </div>
              ) : (
                <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--rule-soft)" }}>
                  <p className="mb-3 text-sm" style={{ color: "var(--ink-2)" }}>
                    There is no Ekilex key set up here yet, so search stops at the {words}{" "}
                    built-in words: nothing outside that set can be looked up, and dictation, the
                    sentence builder and the mock exam&rsquo;s reading and listening parts stay thin or
                    empty, because the built-in set has almost no real example sentences.
                  </p>
                  <EkilexSetupGuide />
                </div>
              )}
            </Card>
          </section>
        </Group>

        <Group title="Sharing">
          <section>
            <SectionTitle>Your name in a class</SectionTitle>
            <Card>
              <ClassNamePanel currentName={displayName} />
            </Card>
          </section>
        </Group>

        <Group title="Words and Anu">
          <section>
            <SectionTitle>Import words</SectionTitle>
            <ImportPanel />
          </section>

          <section>
            {/* Named the way every other screen names her. "AI tutor" here
                against "Anu" everywhere else made two things out of one. */}
            <SectionTitle hint={provider ? undefined : "off until you add a key"}>Anu</SectionTitle>
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
                      ? "Just one model is set up right now."
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
                      Everything above runs through {resilience.providers[0]}, on one account. If
                      that key stops answering, whether it runs out of credit or just has a bad
                      minute, Anu stops with it.
                      Adding <code className="text-xs">GROQ_API_KEY</code> or{" "}
                      <code className="text-xs">GEMINI_API_KEY</code> to <code className="text-xs">.env</code>{" "}
                      gives Anu somewhere else to turn. Both are free and neither asks for a card.
                      Read the note beside them in{" "}
                      <code className="text-xs">.env.example</code> first: free usually means the
                      provider may look at what goes through it.
                    </p>
                  )}
                </div>
              ) : (
                <SetupGuide />
              )}
            </Card>
          </section>

          {/*
            What today has cost, under the tutor it is about. Only where a
            provider is configured: "0 of 40 questions" over a tutor that is
            switched off reports a limit nobody can reach as though it were
            one they were approaching.
          */}
          {provider && <UsagePanel ownerId={ownerId} />}
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

          <section>
            <SectionTitle hint={participation === "in" ? "counted" : "left out"}>
              Anonymous statistics
            </SectionTitle>
            <Card>
              <ResearchPanel current={participation} exported={researchExported} />
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
              Only ever shows up on a computer. A phone keyboard already has these letters, on a
              long press or a keyboard switched to Estonian, so there is nothing to show on a phone
              either way.
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

          {/*
            Last, and in this group rather than one of its own, because the
            first thing its copy does is point at the backup four sections up.
            `/privacy` promises somebody can take everything away, and until
            this was rendered the only way to keep that promise was to ask
            whoever runs the deployment.
          */}
          <DangerZone counts={{ cards, reviews }} />
        </Group>
      </Stack>
    </Page>
  );
}
