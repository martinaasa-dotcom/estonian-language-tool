import { Chip } from "@/components/ui";
import { RUNG_LABEL, type Rung } from "@/lib/readiness/rungs";

/**
 * One hue per rung, and each hue keeps the meaning the design system gives it
 * (docs/14-design-system.md §1): mint is known, so it is the rung you could
 * lead; butter is nearly, so it is following without answering; peach is
 * missed, so it is being lost. Take part wears the accent, which is the app's
 * own colour and not a verdict, because it is the rung in the middle and the
 * one most people are on. Not started wears sky, which is "new".
 */
export const RUNG_CHIP: Record<Rung, "good" | "accent" | "hard" | "again" | "sky"> = {
  lead: "good",
  takePart: "accent",
  follow: "hard",
  lost: "again",
  unmet: "sky",
};

export const RUNG_TILE: Record<Rung, "mint" | "accent" | "butter" | "peach" | "sky"> = {
  lead: "mint",
  takePart: "accent",
  follow: "butter",
  lost: "peach",
  unmet: "sky",
};

/** The ink for text about a rung, on a plain surface. */
export const RUNG_INK: Record<Rung, string> = {
  lead: "var(--mint-ink)",
  takePart: "var(--accent-deep)",
  follow: "var(--butter-ink)",
  lost: "var(--peach-ink)",
  unmet: "var(--sky-ink)",
};

export function RungChip({ rung }: { rung: Rung }) {
  return <Chip tone={RUNG_CHIP[rung]}>{RUNG_LABEL[rung]}</Chip>;
}
