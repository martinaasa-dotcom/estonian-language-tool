import Link from "next/link";
import { modeAt } from "@/lib/ux/modes";
import { icon } from "@/components/icons";

/**
 * The drill that belongs on the page you are already standing on.
 *
 * Four practice modes are drills for a named weakness, which is what
 * `lib/ux/modes.ts` has always called them, and all four used to sit on a menu
 * under a heading saying exactly that. A menu is the wrong shape for them: it
 * offers five answers to a question the learner has not asked, and it is the
 * one place they have no reason to be looking when the question does occur to
 * them. So each is now on the screen that names the thing it drills, and that
 * screen is the one place it is obviously worth pressing: the leech clinic
 * under the panel listing the cards you keep failing, the verb government drill
 * under the page explaining rektsioon, writing under the case it asks you to
 * write in, and pasting your own Estonian beside the scanner.
 *
 * The title, the blurb, the icon and the hue all come from `modeAt`, so a mode
 * renamed in one table is renamed on every page that offers it. That is the
 * same argument `lib/ux/nav.ts` makes about itself, and it is why this is one
 * component rather than four hand-drawn cards.
 */
export function DrillLink({ href }: { href: string }) {
  const mode = modeAt(href);
  // Rather than throwing on a page whose drill has been retired. The invariant
  // suite is what catches a stale href; a learner should not meet it.
  if (!mode) return null;

  const Icon = icon(mode.icon);

  return (
    <Link
      href={mode.href}
      className="lift flex items-start gap-4 rounded-[var(--r-lg)] border p-5"
      style={{ borderColor: "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow-sm)" }}
    >
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
        style={{ background: `var(--${mode.tone})`, color: "var(--surface)" }}
      >
        <Icon size={19} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="est block text-lg font-bold" style={{ color: "var(--ink)" }}>{mode.title}</span>
        <span className="block text-xs" style={{ color: "var(--ink-3)" }}>{mode.subtitle}</span>
        <span className="mt-1.5 block text-sm" style={{ color: "var(--ink-2)" }}>{mode.blurb}</span>
      </span>
    </Link>
  );
}
