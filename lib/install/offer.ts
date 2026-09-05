/**
 * When to offer "add to home screen", and how often.
 *
 * Once. That is the whole answer, and it is a rule rather than a default: an
 * install banner that comes back is an advert, and an advert inside something
 * you are trying to study in is worse than no banner at all. So this module
 * holds three facts and refuses on any of them: it has been offered, it has
 * been waved away, or the app is already installed.
 *
 * The second rule is that the offer waits. A banner on somebody's first minute
 * is asking them to keep a thing they have not decided they want yet, so the
 * count of distinct days the app has been opened on is what unlocks it. Three
 * days in, they came back twice on purpose, and the offer is a favor rather
 * than an interruption.
 *
 * After that, the reminder lives in Settings, where it is available on the day
 * somebody wants it and silent on every other day.
 *
 * Pure on purpose: the days come in as strings and the decision comes out as a
 * boolean, so the rule is unit tested rather than eyeballed on a phone.
 */

/** Distinct days of use before the one banner is allowed to appear. */
export const OFFER_ON_DAY = 3;

export interface InstallMemory {
  /** Distinct days the app has been opened on, as YYYY-MM-DD. Capped: only the count matters. */
  readonly days: readonly string[];
  /** The banner has been shown once. It is never shown again, ignored or not. */
  readonly offered: boolean;
  /** Waved away, or installed. Terminal either way. */
  readonly dismissed: boolean;
}

export const NEW_MEMORY: InstallMemory = { days: [], offered: false, dismissed: false };

/** Adds today, if today is new. Never grows past the number of days it takes to decide. */
export function rememberDay(memory: InstallMemory, today: string): InstallMemory {
  if (memory.days.includes(today)) return memory;
  const days = [...memory.days, today].slice(-OFFER_ON_DAY);
  return { ...memory, days };
}

/**
 * Whether the banner may appear right now.
 *
 * `canInstall` is the platform's answer, not ours: a captured
 * `beforeinstallprompt` on Chrome and Edge, or an iPhone running Safari, where
 * there is no such event and the Share menu has to be described instead.
 */
export function shouldOffer(
  memory: InstallMemory,
  { standalone, canInstall }: { standalone: boolean; canInstall: boolean },
): boolean {
  if (standalone || !canInstall) return false;
  if (memory.offered || memory.dismissed) return false;
  return memory.days.length >= OFFER_ON_DAY;
}

/** Marks the banner as spent. Called when it is drawn, not when it is answered. */
export function markOffered(memory: InstallMemory): InstallMemory {
  return { ...memory, offered: true };
}

export function markDismissed(memory: InstallMemory): InstallMemory {
  return { ...memory, offered: true, dismissed: true };
}

/**
 * Reads what was stored, tolerating anything.
 *
 * `legacyDismissed` is the older `kodukeel:install-dismissed` flag, which is
 * still on the devices of everybody who pressed the X before this file existed.
 * Losing it would mean asking those people again, which is the one thing this
 * module is for.
 */
export function readMemory(raw: string | null, legacyDismissed = false): InstallMemory {
  const base = legacyDismissed ? markDismissed(NEW_MEMORY) : NEW_MEMORY;
  if (!raw) return base;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return base;
    const bag = parsed as Record<string, unknown>;
    const days = Array.isArray(bag.days) ? bag.days.filter((d): d is string => typeof d === "string") : [];
    return {
      days: days.slice(-OFFER_ON_DAY),
      offered: bag.offered === true || base.offered,
      dismissed: bag.dismissed === true || base.dismissed,
    };
  } catch {
    return base;
  }
}

export function writeMemory(memory: InstallMemory): string {
  return JSON.stringify({ days: memory.days, offered: memory.offered, dismissed: memory.dismissed });
}

/*
  The local calendar day, which is the only clock this decision needs — and it
  is `lib/time/day.ts`'s, not a second copy of it.

  A retyped copy sat here, character for character the same as the one next
  door, on the reasoning that this module wants nothing else from that one.
  Two of anything is how they drift: when the day module learned that a server
  has no business reading its own midnight, this copy learned nothing, and the
  two answers to "which day is it" would have parted company on the first
  change either one made.

  The process's own zone is the right answer here and needs no clock passed in,
  because this only ever runs in a browser: it decides whether somebody has
  opened the app on enough separate days to be offered the install prompt, from
  a note this module is handed by its caller.
*/
export { dayKey } from "@/lib/time/day";
