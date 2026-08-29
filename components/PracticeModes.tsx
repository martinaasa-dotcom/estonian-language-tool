import Link from "next/link";
import { Ear, Headphones, PenLine, Scale, ScissorsLineDashed, Stethoscope, Zap } from "lucide-react";
import { Card, SectionTitle } from "@/components/ui";

/**
 * The practice modes, in one place.
 *
 * They used to be two buttons tucked under the badge count, which was fine for
 * two and stops being fine at seven. Each is a different *kind* of retrieval,
 * and the description says which — a learner choosing between them is choosing
 * what skill to work, not which button is prettiest.
 */
export interface PracticeMode {
  href: string;
  label: string;
  blurb: string;
  icon: typeof Zap;
  /** Rendered but muted, with the reason, when the mode has nothing to offer. */
  unavailable?: string | undefined;
}

export const PRACTICE_MODES: readonly Omit<PracticeMode, "unavailable">[] = [
  {
    href: "/review/write",
    label: "Writing",
    blurb: "Write your own sentence using a word in a named case. Marked against the dictionary.",
    icon: PenLine,
  },
  {
    href: "/review/government",
    label: "Verb government",
    blurb: "Which case a verb demands. The error English speakers never stop making.",
    icon: Scale,
  },
  {
    href: "/review/pairs",
    label: "Minimal pairs",
    blurb: "Hear the length distinctions Estonian spelling does not record.",
    icon: Ear,
  },
  {
    href: "/review/cloze",
    label: "From your reading",
    blurb: "Paste real Estonian and drill the forms in it.",
    icon: ScissorsLineDashed,
  },
  {
    href: "/review/sprint",
    label: "Case Sprint",
    blurb: "Sixty seconds, as many case forms as you can manage.",
    icon: Zap,
  },
  {
    href: "/review/listening",
    label: "Listening",
    blurb: "Hear a word, type what it means. No text on the front.",
    icon: Headphones,
  },
  {
    href: "/review/clinic",
    label: "Leech clinic",
    blurb: "The handful of cards you keep failing, taken apart properly.",
    icon: Stethoscope,
  },
];

export function PracticeModes({ unavailable = {} }: {
  /** href → why it is not usable right now. */
  unavailable?: Record<string, string>;
}) {
  return (
    <section>
      <SectionTitle hint="different kinds of recall">Practice</SectionTitle>
      <Card>
        <ul className="flex flex-col gap-1">
          {PRACTICE_MODES.map(({ href, label, blurb, icon: Icon }) => {
            const why = unavailable[href];
            const body = (
              <>
                <Icon
                  size={17}
                  aria-hidden
                  className="mt-0.5 shrink-0"
                  style={{ color: why ? "var(--ink-3)" : "var(--accent)" }}
                />
                <span className="min-w-0">
                  <span className="block text-[14.5px] font-medium" style={{ color: why ? "var(--ink-3)" : "var(--ink)" }}>
                    {label}
                  </span>
                  <span className="block text-[13px]" style={{ color: "var(--ink-3)" }}>
                    {why ?? blurb}
                  </span>
                </span>
              </>
            );

            return (
              <li key={href}>
                {why ? (
                  <div className="flex items-start gap-3 rounded-md px-2.5 py-2 opacity-70">{body}</div>
                ) : (
                  <Link
                    href={href}
                    className="flex items-start gap-3 rounded-md px-2.5 py-2 transition-colors hover:bg-[var(--raised)]"
                  >
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}
