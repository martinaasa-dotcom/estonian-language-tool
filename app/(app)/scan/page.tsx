import Link from "next/link";
import { Camera, ChevronRight, Layers } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { resolveProvider } from "@/lib/tutor/provider";
import { MAX_ITEMS } from "@/lib/scan/extract";
import { parseItems, summarise } from "@/lib/scan/items";
import { Card, Empty, Note, Page, SectionTitle, Stack } from "@/components/ui";
import { ScanCapture } from "./ScanCapture";

export const dynamic = "force-dynamic";

export const metadata = { title: "Scan a page" };

/** How many past pages to list. A folder, not an archive. */
const RECENT = 24;

/**
 * Turning paper into something you can actually study.
 *
 * Half of a language course lives on paper: a handout, a textbook page, a list
 * copied off a whiteboard. Typing it back in is the step where a learner gives
 * up, so this takes the photograph they were going to take anyway and matches
 * what is on it against the dictionary the app already has.
 *
 * WHAT COMES BACK IS A SET, not a pile of text. A page becomes a named group of
 * words that can be drilled on its own, and its words are references to the
 * shared dictionary in exactly the way a learning-path unit's are, so a
 * correction to a word lands on every page it appears on and a page can never
 * drift out of step with the dictionary.
 */
export default async function ScanPage() {
  const ownerId = await requireUserId();
  const scans = await prisma.scan.findMany({
    where: { ownerId },
    orderBy: { createdAt: "desc" },
    take: RECENT,
    select: { id: true, title: true, items: true, createdAt: true },
  });

  const configured = resolveProvider() !== null;

  return (
    <Page
      eyebrow="From paper"
      title="Scan a page"
      lead="Photograph a word list or your homework, and study what is on it."
    >
      <Stack>
        {!configured && (
          <Note tone="hard">
            Reading a photo needs an AI key, and this deployment has none configured. Everything
            else still works, and Settings has the two minute version of how to add one. A word
            list can also be pasted in there by hand.
          </Note>
        )}

        {configured && <ScanCapture />}

        <section>
          <SectionTitle hint={scans.length > 0 ? `${scans.length} saved` : undefined}>
            Your pages
          </SectionTitle>

          {scans.length === 0 ? (
            <Empty
              title="No pages yet"
              body={
                "Take a picture of a vocabulary list and it will appear here, as a set you can " +
                "drill on its own."
              }
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {scans.map((scan) => {
                const summary = summarise(parseItems(scan.items, MAX_ITEMS));
                return (
                  <li key={scan.id}>
                    <Card as="div" hover className="p-0">
                      <Link
                        href={`/scan/${scan.id}`}
                        className="flex min-h-16 items-center gap-4 px-5 py-4"
                      >
                        <span
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                          style={{ background: "var(--sky-soft)", color: "var(--sky-ink)" }}
                        >
                          <Camera size={17} aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-md font-semibold" style={{ color: "var(--ink)" }}>
                            {scan.title}
                          </span>
                          <span className="flex items-center gap-1.5 text-sm" style={{ color: "var(--ink-3)" }}>
                            <Layers size={13} aria-hidden />
                            {summary.total} word{summary.total === 1 ? "" : "s"}
                            {summary.unknown > 0 && <> · {summary.unknown} unverified</>}
                          </span>
                        </span>
                        <ChevronRight size={16} aria-hidden style={{ color: "var(--ink-3)" }} />
                      </Link>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </Stack>
    </Page>
  );
}
