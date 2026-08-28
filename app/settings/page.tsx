import { prisma } from "@/lib/db";
import { resolveProvider } from "@/lib/tutor/provider";
import { Card, Chip, Page, SectionTitle } from "@/components/ui";
import { ImportPanel } from "./ImportPanel";
import { RestorePanel } from "./RestorePanel";
import { SetupGuide } from "./SetupGuide";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const provider = resolveProvider();
  const [words, cards, reviews] = await Promise.all([
    prisma.lexeme.count(),
    prisma.card.count(),
    prisma.review.count(),
  ]);

  return (
    <Page title="Settings" lead="Everything is stored on this computer. Nothing is uploaded anywhere.">
      <div className="flex flex-col gap-8">
        <section>
          <SectionTitle>Your data</SectionTitle>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-[14px]" style={{ color: "var(--ink-2)" }}>
                <span className="tnum" style={{ color: "var(--ink)" }}>{words}</span> words ·{" "}
                <span className="tnum" style={{ color: "var(--ink)" }}>{cards}</span> cards ·{" "}
                <span className="tnum" style={{ color: "var(--ink)" }}>{reviews}</span> reviews
              </p>
              <a
                href="/api/export"
                className="inline-flex items-center gap-2 rounded-md border px-3.5 py-2 text-[14px] font-medium"
                style={{ borderColor: "var(--rule)", color: "var(--ink)", background: "var(--surface)" }}
              >
                Download a backup
              </a>
            </div>
            <p className="mt-3 text-[13px]" style={{ color: "var(--ink-3)" }}>
              Your review history is the one thing here that can&rsquo;t be recreated. Downloading a
              copy now and then is worth the ten seconds.
            </p>
            <div className="mt-5 border-t pt-5" style={{ borderColor: "var(--rule-soft)" }}>
              <RestorePanel currentReviews={reviews} />
            </div>
          </Card>
        </section>

        <section>
          <SectionTitle>Import words</SectionTitle>
          <ImportPanel />
        </section>

        <section>
          <SectionTitle
            hint={provider ? undefined : "Anu is off until you add a key"}
          >
            AI tutor
          </SectionTitle>
          <Card>
            {provider ? (
              <div className="flex flex-wrap items-center gap-3">
                <Chip tone="good">Connected</Chip>
                <span className="text-[14px]" style={{ color: "var(--ink-2)" }}>
                  {provider.label} · <code className="text-[13px]">{provider.model}</code>
                </span>
              </div>
            ) : (
              <SetupGuide />
            )}
          </Card>
        </section>

        <section>
          <SectionTitle>Dictionary</SectionTitle>
          <Card>
            <p className="text-[14px]" style={{ color: "var(--ink-2)" }}>
              The built-in dictionary has {words} words with checked principal parts, covering A1 up
              into C1. Search an inflected form you met in class — <span lang="et">toas</span>,{" "}
              <span lang="et">lugesin</span> — and it will find the word and tell you which form you
              typed. Audio comes from the University of Tartu&rsquo;s Estonian speech service and
              needs no key.
            </p>
            <p className="mt-3 text-[13px]" style={{ color: "var(--ink-3)" }}>
              A free Ekilex API key from the Institute of the Estonian Language would extend search to
              the full Estonian lexicon. It is not needed for anything you can do today.
            </p>
          </Card>
        </section>
      </div>
    </Page>
  );
}
