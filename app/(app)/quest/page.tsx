import { requireUserId } from "@/lib/auth/session";
import { questFor } from "@/lib/progress/quest";
import { grammarTerm } from "@/lib/estonian/terms";
import { caseByKey } from "@/lib/estonian/cases";
import { QuestSession } from "./QuestSession";
import { readSetting, SETTING_KEYS } from "@/lib/settings/store";
import { roundPaceFrom, secondsFor } from "@/lib/ux/roundClock";

export const metadata = { title: "Daily quest" };

export const dynamic = "force-dynamic";

/**
 * TWO MINUTES ON WHATEVER IS GOING WRONG.
 *
 * The one round that is not about the schedule. Review asks what is due and
 * Flash cards asks what is not yet solid; this asks the narrower question a
 * learner wants answered on a day they have five minutes: where do I stand on
 * the things I keep getting wrong.
 *
 * It is aimed at cases rather than at words, which is the design decision worth
 * naming. A deck's failures cluster by grammar: nobody fails `tuba` and `kool`
 * for unrelated reasons, they fail the seesütlev on both. See
 * `lib/progress/quest.ts` for how the pool is drawn.
 *
 * Grades through `gradeCard` like every other mode (ADR-016), so a round played
 * for the timer still moves the schedule and the log records what happened.
 */
/** The round as it was written. A learner can stretch it in Settings. */
const BASE_DURATION_S = 120;

export default async function QuestPage() {
  const ownerId = await requireUserId();
  const quest = await questFor(ownerId);
  /*
    How long the clock runs, resolved here and handed down as a number of
    seconds: the session is a client component and has no settings to read.
    Two minutes is the base and the learner's pace stretches it, up to ten
    times, which is what WCAG 2.2.1 asks of an adjustable limit. See
    lib/ux/roundClock.ts.
  */
  const seconds = secondsFor(
    BASE_DURATION_S, roundPaceFrom(await readSetting(ownerId, SETTING_KEYS.roundPace)),
  );

  /*
    The cases named in Estonian first, which is the rule everywhere in this app:
    a class in Tallinn says `seesütlev` and `kus?`, and a learner who has only
    met "inessive" cannot follow their own teacher. `grammarTerm` is the one
    table of what a point is called and returns nothing where there is no term a
    class uses, which is the honest answer rather than a cue to invent one.
  */
  const aimed = quest.weakCases.map((c) => {
    const spec = caseByKey(c.grammCase);
    const term = grammarTerm(c.grammCase);
    return {
      key: c.grammCase,
      accuracy: c.accuracy,
      et: term?.et ?? spec?.et ?? c.grammCase,
      question: spec?.question ?? null,
    };
  });

  return <QuestSession cards={quest.cards} aimed={aimed} seconds={seconds} />;
}
