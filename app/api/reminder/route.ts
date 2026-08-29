import { requireUserId } from "@/lib/auth/session";
import { dailyGoalFrom, readSettings, SETTING_KEYS } from "@/lib/settings/store";

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
 * One recurring event, no attendees, no alarm chain — the thing a person would
 * have made by hand.
 */
export async function GET(request: Request) {
  const ownerId = await requireUserId();
  const url = new URL(request.url);
  const [hour, minute] = parseTime(url.searchParams.get("at"));

  const settings = await readSettings(ownerId, [SETTING_KEYS.dailyGoal]);
  const goal = dailyGoalFrom(settings[SETTING_KEYS.dailyGoal]);

  // Starts today, so the first reminder is either later today or tomorrow —
  // never a fortnight away because of a clever alignment rule.
  const start = new Date();
  start.setHours(hour, minute, 0, 0);

  const stamp = (d: Date) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T` +
    `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Kodukeel//Estonian study//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:kodukeel-daily-${ownerId}@kodukeel`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(new Date(start.getTime() + 10 * 60_000))}`,
    "RRULE:FREQ=DAILY",
    "SUMMARY:Eesti keel, review",
    `DESCRIPTION:${escapeText(`${goal} cards keeps the streak. Ten minutes.`)}`,
    `URL:${url.origin}/review`,
    "BEGIN:VALARM",
    "TRIGGER:-PT0M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Eesti keel, review",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  return new Response(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'attachment; filename="kodukeel-daily.ics"',
    },
  });
}

function parseTime(value: string | null): [number, number] {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value ?? "");
  const hour = Math.min(23, Math.max(0, Number(match?.[1] ?? 18)));
  const minute = Math.min(59, Math.max(0, Number(match?.[2] ?? 0)));
  return [hour, minute];
}

const pad = (n: number) => String(n).padStart(2, "0");

/** iCalendar escaping: commas, semicolons and backslashes are structural. */
function escapeText(text: string): string {
  return text.replace(/([\\,;])/g, "\\$1").replace(/\n/g, "\\n");
}
