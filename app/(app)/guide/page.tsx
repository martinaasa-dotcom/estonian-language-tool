import Link from "next/link";
import { Check, X } from "lucide-react";
import { CAN, CANNOT, TOUR, WHAT_IT_IS } from "@/lib/copy/tour";
import { ButtonLink } from "@/components/Button";
import { Card, Page, SectionTitle } from "@/components/ui";
import { icon } from "@/components/icons";

export const metadata = {
  title: "What this app is",
  description:
    "Every screen in Kodukeel, what it is for, and the honest list of what this app cannot do for you.",
};

/**
 * The walkthrough, kept.
 *
 * The same content the first-run wizard shows, at a URL that can be reopened
 * when it matters: a fortnight in, when somebody wonders what the Practice tab
 * was for, or the first time the AI declines to supply an Estonian form and
 * they want to know whether that is a bug.
 *
 * The "cannot" list is above the fold on purpose. An app that states its limits
 * where they can be found is one whose claims can be trusted.
 */
export default function GuidePage() {
  return (
    <Page
      title="What this app is"
      lead={WHAT_IT_IS}
      actions={<ButtonLink href="/assess" variant="primary">Check your level</ButtonLink>}
    >
      <div className="flex flex-col gap-8">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card tone="accent">
            <SectionTitle>What it does</SectionTitle>
            <ul className="flex flex-col gap-3">
              {CAN.map((claim) => {
                const Icon = icon(claim.icon);
                return (
                  <li key={claim.text} className="flex gap-3">
                    <span className="mt-0.5 shrink-0" style={{ color: "var(--accent-deep)" }}>
                      <Check size={16} aria-hidden />
                    </span>
                    <span className="flex-1 text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
                      <Icon size={14} className="mr-1.5 inline" aria-hidden />
                      {claim.text}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card tone="butter">
            <SectionTitle>What it does not</SectionTitle>
            <ul className="flex flex-col gap-3">
              {CANNOT.map((claim) => {
                const Icon = icon(claim.icon);
                return (
                  <li key={claim.text} className="flex gap-3">
                    <span className="mt-0.5 shrink-0" style={{ color: "var(--butter-ink)" }}>
                      <X size={16} aria-hidden />
                    </span>
                    <span className="flex-1 text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
                      <Icon size={14} className="mr-1.5 inline" aria-hidden />
                      {claim.text}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>

        <div>
          <SectionTitle hint="every screen, and when to open it">The app, room by room</SectionTitle>
          <ul className="grid gap-3 md:grid-cols-2">
            {TOUR.map((stop) => {
              const Icon = icon(stop.icon);
              return (
                <li key={stop.href}>
                  <Card className="h-full" hover>
                    <Link href={stop.href} className="block">
                      <span className="flex items-center gap-3">
                        <span
                          className="flex h-9 w-9 items-center justify-center rounded-full"
                          style={{ background: "var(--raised)", color: "var(--ink-2)" }}
                        >
                          <Icon size={17} aria-hidden />
                        </span>
                        <span className="est text-lg font-bold" style={{ color: "var(--ink)" }}>{stop.title}</span>
                      </span>
                      <span className="mt-3 block text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
                        {stop.what}
                      </span>
                      <span className="mt-2 block text-sm" style={{ color: "var(--ink-3)" }}>{stop.when}</span>
                    </Link>
                  </Card>
                </li>
              );
            })}
          </ul>
        </div>

        <Card>
          <SectionTitle>The rule the whole thing is built on</SectionTitle>
          <p className="max-w-[70ch] text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
            No Estonian in this app is written by this app. Forms come from Ekilex or from hand
            checked principal parts, the eleven regular cases are computed from the genitive stem at
            the moment they are shown, and example sentences are ones lexicographers recorded. The AI
            explains and translates into English, and is checked against the dictionary before any
            Estonian it writes reaches you. This is not caution for its own sake: a model asked for an
            Estonian example once produced a sentence that is not Estonian, and a wrong form does not
            sit there being wrong, the scheduler drills it into you.
          </p>
        </Card>
      </div>
    </Page>
  );
}
