import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentLearner, requireUserId } from "@/lib/auth/session";
import { PATH } from "@/lib/collections/syllabus";
import { readSettings, SETTING_KEYS } from "@/lib/settings/store";
import { paperFor } from "@/lib/progress/assessment";
import { WelcomeWizard, type WizardUnit } from "./WelcomeWizard";

export const metadata = { title: "Getting set up" };

export const dynamic = "force-dynamic";

/**
 * First run.
 *
 * Anyone who has already been through it — or who has a deck and a review
 * history from before this screen existed — is sent straight to Today. An
 * onboarding wizard that reappears for an established learner is worse than no
 * wizard at all.
 */
export default async function WelcomePage() {
  const ownerId = await requireUserId();
  const [settings, cards, learner] = await Promise.all([
    readSettings(ownerId, [SETTING_KEYS.onboardedAt, SETTING_KEYS.displayName]),
    prisma.card.count({ where: { ownerId } }),
    currentLearner(),
  ]);

  if (settings[SETTING_KEYS.onboardedAt] || cards > 0) redirect("/");

  // Only offer units the dictionary can actually fill.
  const lemmas = [...new Set(PATH.flatMap((u) => u.lemmas))];
  const present = await prisma.lexeme.findMany({
    where: { lemma: { in: lemmas } },
    select: { lemma: true },
  });
  const available = new Set(present.map((l) => l.lemma));

  const units: WizardUnit[] = PATH.map((u) => ({
    id: u.id,
    title: u.title,
    subtitle: u.subtitle,
    icon: u.icon,
    cefr: u.cefr,
    blurb: u.blurb,
    words: u.lemmas.filter((l) => available.has(l)).length,
  })).filter((u) => u.words > 0);

  const suggestedName =
    settings[SETTING_KEYS.displayName] ?? (learner.name === "you" ? "" : learner.name);

  /*
    The level check, built here rather than behind a click.

    It is a handful of queries and it is the one screen in the app where the
    learner has nothing else to wait for, so paying for it up front buys an
    instant start on the step that matters most. A learner who estimates
    instead has cost the deployment five reads of the dictionary once, ever.
  */
  const paper = await paperFor(ownerId, Date.now() % 1_000_000);

  return <WelcomeWizard units={units} suggestedName={suggestedName} paper={paper} />;
}
