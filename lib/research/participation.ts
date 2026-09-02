/**
 * Whether one learner's answers are counted in the anonymous statistics.
 *
 * The export at `/api/research` publishes nothing that rests on fewer than ten
 * people, and what comes out of it is not personal data by the time it exists,
 * so this is not consent and is not asked for at sign-up. A question nobody
 * needs to answer should not be put to somebody on their way in, and a
 * checkbox offered at the door reads as a demand for permission the operator
 * does not need, which makes the honest parts of the same screen harder to
 * believe.
 *
 * It exists anyway. This app is for people whose data is the reason they are
 * careful, and "we aggregated it, so it is fine" is a sentence they have heard
 * before from somebody who was wrong. The cost of honouring it is one `NOT IN`,
 * and the difference between a promise and a setting is that a setting can be
 * checked.
 *
 * IN IS THE DEFAULT AND HAS TO BE. A missing row is everybody who has ever used
 * this installation, and reading absence as a refusal would leave the export
 * empty on every deployment that existed before the setting did, which is a
 * silent failure rather than a cautious one.
 */
export type Participation = "in" | "out";

export const DEFAULT_PARTICIPATION: Participation = "in";

/**
 * The stored value. `1` means out, which is why the key is named for the
 * opt-out rather than for the participation: the row exists only when somebody
 * went and turned it off, and a row that exists means what it says on its own.
 */
export const OPTED_OUT = "1";

export function participationFrom(value: string | null | undefined): Participation {
  return value === OPTED_OUT ? "out" : DEFAULT_PARTICIPATION;
}

/**
 * What to write. Opting back in writes `0` rather than deleting the row, so
 * that a learner who changes their mind twice leaves one row saying what they
 * decided rather than an absence that reads like never having been asked.
 */
export function participationValue(participation: Participation): string {
  return participation === "out" ? OPTED_OUT : "0";
}

/**
 * Whether this installation is set up to produce the export at all.
 *
 * The same shape as `ekilexConfigured()`: the presence of a variable, never its
 * value. Settings says so beside the choice, because "leave my answers out of
 * something that has never happened here" is a different sentence from the one
 * on a deployment that does export, and a learner deciding is owed the
 * difference. The preference is stored either way, since which one a
 * deployment is can change on a Tuesday and somebody's answer has to outlive
 * that.
 */
export function researchExportConfigured(): boolean {
  return Boolean(process.env.RESEARCH_TOKEN);
}
