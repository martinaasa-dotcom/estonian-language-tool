import Link from "next/link";
import { adminsConfigured, isAdmin } from "@/lib/auth/admin";
import { supabaseConfigured } from "@/lib/auth/mode";
import { readQueue, QUEUE_PAGE_SIZE } from "@/lib/suggestions/queue";
import {
  CATEGORY_GROUPS, SUGGESTION_CATEGORIES, categoriesInGroup, isCategory, isStatus,
  type SuggestionCategory, type SuggestionStatus,
} from "@/lib/suggestions/model";
import { Card, Chip, Empty, Page } from "@/components/ui";
import { QueueRows } from "./QueueRows";

export const dynamic = "force-dynamic";

/**
 * The review queue.
 *
 * Built for the volume rather than for a demo: one line per thing reported,
 * ordered by how many people reported it, filtered by what a reviewer would do
 * about it. `lib/suggestions/queue.ts` explains why the group and not the row
 * is the unit here.
 *
 * Who may see it is `lib/auth/admin.ts`'s question and not this page's. A
 * deployment that has named nobody says so in as many words, the same way an
 * unconfigured /privacy does: a review queue that quietly shows an empty list
 * to everybody looks like a queue with nothing in it.
 */
export default async function SuggestionsQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; category?: string; page?: string }>;
}) {
  if (!(await isAdmin())) {
    return (
      <Page title="Suggested fixes" lead="The review queue for whoever runs this installation.">
        <Empty
          title="Not this account"
          body={
            adminsConfigured()
              ? "Suggestions are reviewed by whoever runs this copy of Kodukeel. Your own are on the page below, with what happened to each."
              : "Nobody has been named as a reviewer on this deployment. Whoever runs it sets ADMIN_EMAILS to the addresses that may review suggestions. Until then, reports are collected and nothing is lost."
          }
          action={<Link href="/suggestions" className="text-sm underline" style={{ color: "var(--accent-deep)" }}>Your own suggestions</Link>}
        />
      </Page>
    );
  }

  const params = await searchParams;
  const status: SuggestionStatus = params.status && isStatus(params.status) ? params.status : "OPEN";
  const category: SuggestionCategory | null =
    params.category && isCategory(params.category) ? params.category : null;
  const page = Math.max(0, Number.parseInt(params.page ?? "0", 10) || 0);

  const queue = await readQueue({ status, category, page });
  const openTotal = queue.totals.OPEN;

  const href = (next: { status?: SuggestionStatus; category?: SuggestionCategory | null; page?: number }) => {
    const q = new URLSearchParams();
    const s = next.status ?? status;
    const c = next.category === undefined ? category : next.category;
    if (s !== "OPEN") q.set("status", s);
    if (c) q.set("category", c);
    if (next.page) q.set("page", String(next.page));
    const query = q.toString();
    return query ? `/admin/suggestions?${query}` : "/admin/suggestions";
  };

  return (
    <Page
      title="Suggested fixes"
      eyebrow="Review queue"
      lead={
        `${openTotal} open report${openTotal === 1 ? "" : "s"}, grouped so that one problem is one decision. ` +
        `Accepting a dictionary correction writes it straight into the entry everybody reads.`
      }
    >
      {!supabaseConfigured() && (
        <p className="mb-6 rounded-[var(--r)] px-4 py-3 text-sm" style={{ background: "var(--butter-soft)", color: "var(--butter-ink)" }}>
          This copy runs with no sign-in configured, so it is one learner on one machine and that
          learner reviews their own queue.
        </p>
      )}

      <div className="mb-5 flex flex-wrap gap-2">
        {(["OPEN", "ACCEPTED", "DECLINED"] as const).map((s) => (
          <Link
            key={s}
            href={href({ status: s, page: 0 })}
            className="press rounded-full px-4 py-2 text-sm font-semibold transition-ui"
            style={{
              background: s === status ? "var(--accent-soft)" : "var(--surface)",
              color: s === status ? "var(--accent-deep)" : "var(--ink-2)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            {s === "OPEN" ? "Open" : s === "ACCEPTED" ? "Accepted" : "Declined"}
            <span className="tnum ml-2" style={{ color: "var(--ink-3)" }}>{queue.totals[s]}</span>
          </Link>
        ))}
      </div>

      <div className="mb-6 flex flex-col gap-3">
        {CATEGORY_GROUPS.map((group) => (
          <div key={group} className="flex flex-wrap items-center gap-2">
            <span className="label-xs w-20 shrink-0" style={{ color: "var(--ink-3)" }}>{group}</span>
            {categoriesInGroup(group).map((c) => (
              <Link key={c} href={href({ category: category === c ? null : c, page: 0 })}>
                <span
                  className="label-xs inline-flex items-center gap-2 rounded-full px-3 py-1.5"
                  style={{
                    background: category === c ? "var(--accent-soft)" : "var(--raised)",
                    color: category === c ? "var(--accent-deep)" : "var(--ink-2)",
                  }}
                >
                  {SUGGESTION_CATEGORIES[c].label}
                  <span className="tnum">{queue.openByCategory[c]}</span>
                </span>
              </Link>
            ))}
          </div>
        ))}
      </div>

      {/*
        Always mounted, empty state and all. The alternative is
        `rows.length ? <QueueRows/> : <Empty/>`, and that swap is what wiped
        the reviewer's own confirmation: acting on the last open report drops
        the row count to zero, the branch flips, and the component holding
        what just happened is unmounted by the page around it. So the empty
        state lives inside the list, which is the only place that knows the
        difference between "nothing to show" and "nothing left because you
        have just dealt with it".
      */}
      <QueueRows rows={queue.rows} status={status} />

      {queue.groups > QUEUE_PAGE_SIZE && (
        <Card className="mt-6 flex items-center justify-between gap-3">
          <span className="text-sm" style={{ color: "var(--ink-2)" }}>
            Page {page + 1} of {Math.ceil(queue.groups / QUEUE_PAGE_SIZE)}
            <span className="ml-2" style={{ color: "var(--ink-3)" }}>
              <Chip>{queue.groups} groups</Chip>
            </span>
          </span>
          <span className="flex gap-2">
            {page > 0 && (
              <Link href={href({ page: page - 1 })} className="text-sm underline" style={{ color: "var(--accent-deep)" }}>
                Previous
              </Link>
            )}
            {(page + 1) * QUEUE_PAGE_SIZE < queue.groups && (
              <Link href={href({ page: page + 1 })} className="text-sm underline" style={{ color: "var(--accent-deep)" }}>
                Next
              </Link>
            )}
          </span>
        </Card>
      )}
    </Page>
  );
}
