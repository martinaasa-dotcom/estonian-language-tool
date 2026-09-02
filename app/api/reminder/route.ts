import { createHash } from "node:crypto";

import { requireUserId } from "@/lib/auth/session";
import { dailyGoalFrom, readSettings, SETTING_KEYS } from "@/lib/settings/store";
import { buildReminderIcs, parseReminderTime } from "@/lib/time/reminder";

export const dynamic = "force-dynamic";

/**
 * A daily reminder, as a calendar file.
 *
 * The obvious implementation is a web push notification, and it is the wrong
 * one here: push needs a server that stays awake, VAPID keys, a subscription
 * store, and it still does not work on iOS unless the app has been installed
 * to the home screen. A calendar event needs none of that, fires on the device
 * the learner already trusts to wake them up, and survives this app being
 * offline, redeployed or closed.
 *
 * One recurring event, no attendees, no alarm chain, the thing a person would
 * have made by hand.
 *
 * THE UID IS A DIGEST, NOT THE ACCOUNT ID. A calendar file is the one thing
 * this app hands a learner specifically so they can give it to somebody else:
 * it goes into Google Calendar or iCloud and syncs to every device on the
 * account. The UID has to be stable, so that re-downloading it updates the
 * event rather than making a second one, and it does not have to be the
 * account id to be stable. A digest is both.
 *
 * The file itself is built in `lib/time/reminder.ts`, which is where the
 * argument about timezones is written down. Short version: the hour a learner
 * picks is a reading on *their* clock, this route runs on a server that is
 * almost always in UTC, and putting the two together used to remind an
 * Estonian learner two or three hours after they asked.
 */
export async function GET(request: Request) {
  const ownerId = await requireUserId();
  const url = new URL(request.url);

  const settings = await readSettings(ownerId, [SETTING_KEYS.dailyGoal]);

  const ics = buildReminderIcs({
    uid: `kodukeel-daily-${createHash("sha256").update(ownerId).digest("hex").slice(0, 24)}@kodukeel`,
    at: parseReminderTime(url.searchParams.get("at")),
    goal: dailyGoalFrom(settings[SETTING_KEYS.dailyGoal]),
    url: `${url.origin}/review`,
    now: new Date(),
  });

  return new Response(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'attachment; filename="kodukeel-daily.ics"',
      // One learner's own reminder, for the reason /api/export gives.
      "cache-control": "private, no-store",
      vary: "Cookie",
    },
  });
}
