import { dayClock, type DayClock } from "@/lib/time/day";
import { readSetting, SETTING_KEYS } from "@/lib/settings/store";

/**
 * The day boundaries to use when rendering for `ownerId`.
 *
 * Every figure on Today that is a fact about a *day* — the streak, the daily
 * goal, the quests, the week strip, the heatmap — is computed on the server,
 * and the server's midnight is the deployment's, not the learner's. The zone
 * their browser reported is the only thing that closes that gap, so this is
 * the one place that reads it and the modules below take a clock rather than
 * a timestamp and a hope.
 *
 * With nothing stored the clock falls back to the process, which is exactly
 * how the app behaved before: a fresh account is no worse off than it was,
 * and one page load later the browser has said where it is.
 */
export async function learnerDayClock(ownerId: string): Promise<DayClock> {
  return dayClock(await readSetting(ownerId, SETTING_KEYS.timeZone));
}
