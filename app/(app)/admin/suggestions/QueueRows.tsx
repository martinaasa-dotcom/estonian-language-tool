"use client";

import { useState, useTransition } from "react";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { Check, ChevronDown, ChevronRight, TriangleAlert, X } from "lucide-react";
import { reviewSuggestion } from "@/app/actions";
import { Button } from "@/components/Button";
import { Card, Chip, Empty } from "@/components/ui";
import { formatDateTime } from "@/lib/time/clock";
import { SUGGESTION_CATEGORIES, summarisePatch } from "@/lib/suggestions/model";
import type { SuggestionStatus } from "@/lib/suggestions/model";
import type { QueueRow } from "@/lib/suggestions/queue";

/**
 * One decision per line, and the decision is the whole line.
 *
 * "Very simple to accept and push through" is the requirement, and the shape
 * that meets it is: what the entry says now, what somebody proposes it should
 * say, how many people agree, and two buttons. Everything else is behind a
 * toggle, because a queue whose rows are all open is a queue nobody reaches
 * the bottom of.
 *
 * Accepting acts on the whole group by default. `reviewSuggestion` is the
 * gate on who may do that, and it resolves the reviewer itself rather than
 * taking an id from here, since a server action is a public endpoint whatever
 * the page around it looks like.
 *
 * A proposal that cannot be written is never offered as one. `blocked` is
 * filled in by the queue reader from the live dictionary, so a report about a
 * gloss somebody else has already corrected says exactly that, and the button
 * that would rewrite it is not there to press.
 */
export function QueueRows({ rows, status }: { rows: QueueRow[]; status: SuggestionStatus }) {
  /*
    WHAT THIS REVIEWER HAS JUST DONE, HELD HERE RATHER THAN IN THE ROW.

    Any server action re-renders the tree the page is on, whatever it
    revalidates, and the row that was just accepted is no longer in the
    server's answer: it unmounts, taking the sentence saying what it did with
    it. The reviewer clicks "Accept and apply" and the line vanishes with no
    word about whether a word was added, which is exactly the feedback that
    makes it safe to click quickly.

    So the outcome lives one level up, keyed by id, and a confirmation is
    rendered for an id the server has since dropped. It survives the refresh
    because it never depended on the refresh not happening: the first version
    did, and passed its browser check on timing alone.
  */
  const [done, setDone] = useState<{ id: string; message: string }[]>([]);
  const settled = new Map(done.map((d) => [d.id, d.message]));
  const stillListed = new Set(rows.map((r) => r.id));

  if (rows.length === 0 && done.length === 0) {
    return (
      <Empty
        mood="happy"
        title={status === "OPEN" ? "Nothing waiting" : "Nothing here"}
        body={status === "OPEN" ? "Every report has been acted on." : "No report has this outcome yet."}
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {done
        .filter((d) => !stillListed.has(d.id))
        .map((d) => <Settled key={d.id} message={d.message} />)
        .reverse()}
      {rows.map((row) => {
        const message = settled.get(row.id);
        return message
          ? <Settled key={row.id} message={message} />
          : <Row key={row.id} row={row} onDone={(m) => setDone((d) => [...d, { id: row.id, message: m }])} />;
      })}
    </ul>
  );
}

/** A decision, after it was made. The only thing left of a row that is gone. */
function Settled({ message }: { message: string }) {
  return (
    <Card as="li" tone="mint">
      <p className="flex items-start gap-2 text-sm" style={{ color: "var(--mint-ink)" }}>
        <Check size={15} aria-hidden className="mt-0.5 shrink-0" />
        <span>{message}</span>
      </p>
    </Card>
  );
}

function Row({ row, onDone }: { row: QueueRow; onDone: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const summary = row.patch ? summarisePatch(row.patch) : null;
  const canApply = summary !== null && row.blocked === null && row.status === "OPEN";

  const act = (decision: "ACCEPT" | "DECLINE", apply: boolean) => {
    setError(null);
    start(async () => {
      const result = await reviewSuggestion({ id: row.id, decision, apply, note });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const many = result.resolved === 1 ? "1 report" : `${result.resolved} reports`;
      onDone(
        [
          decision === "ACCEPT" ? `Accepted, ${many} closed.` : `Declined, ${many} closed.`,
          result.applied,
        ].filter(Boolean).join(" "),
      );
    });
  };

  return (
    <Card as="li" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip tone="accent">{SUGGESTION_CATEGORIES[row.category].label}</Chip>
            {row.reports > 1 && (
              <Chip tone="hard">{row.reports} people</Chip>
            )}
            {row.lemma && (
              <span lang="et" className="text-lg font-bold" style={{ color: "var(--ink)" }}>
                {row.lemma}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-xs" style={{ color: "var(--ink-3)" }}>
            {row.context ?? "somewhere in the app"} · {formatDateTime(new Date(row.createdAt))}
          </p>
        </div>

        {row.status === "OPEN" ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" disabled={pending} onClick={() => act("DECLINE", false)}>
              <X size={15} aria-hidden /> Decline
            </Button>
            <Button variant="secondary" disabled={pending} onClick={() => act("ACCEPT", false)}>
              {canApply ? "Accept without applying" : "Accept"}
            </Button>
            {canApply && (
              <Button variant="primary" disabled={pending} onClick={() => act("ACCEPT", true)}>
                <Check size={15} aria-hidden /> Accept and apply
              </Button>
            )}
          </div>
        ) : (
          <Chip tone={row.status === "ACCEPTED" ? "good" : "neutral"}>
            {row.status === "ACCEPTED" ? "accepted" : "declined"}
          </Chip>
        )}
      </div>

      {summary && (
        <div className="rounded-[var(--r)] px-4 py-3" style={{ background: "var(--raised)" }}>
          <p className="label-xs" style={{ color: "var(--ink-3)" }}>{summary.action}</p>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-base">
            <span className="label-xs" style={{ color: "var(--ink-3)" }}>{summary.field}</span>
            {row.before && (
              <span className="line-through" style={{ color: "var(--ink-3)" }}>{row.before}</span>
            )}
            <span className="font-semibold" style={{ color: "var(--ink)" }}>{summary.after}</span>
          </div>
        </div>
      )}

      {row.blocked && (
        <p className="flex items-start gap-2 rounded-[var(--r)] px-4 py-3 text-sm" style={{ background: "var(--butter-soft)", color: "var(--butter-ink)" }}>
          <TriangleAlert size={15} aria-hidden className="mt-0.5 shrink-0" />
          <span>{row.blocked}</span>
        </p>
      )}

      {row.trigger && (
        <p className="text-sm" style={{ color: "var(--ink-2)" }}>
          <span className="label-xs mr-2" style={{ color: "var(--ink-3)" }}>The app had said</span>
          {row.trigger}
        </p>
      )}

      {row.note && (
        <p className="text-sm" style={{ color: "var(--ink)" }}>{row.note}</p>
      )}

      {error && (
        <p className="rounded-[var(--r)] px-4 py-3 text-sm" style={{ background: "var(--again-soft)", color: "var(--again-ink)" }}>
          {error}
        </p>
      )}

      {(row.alsoSaid.length > 0 || row.status === "OPEN" || row.decision) && (
        <div>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="label-xs flex items-center gap-1"
            style={{ color: "var(--ink-3)" }}
          >
            {open ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />}
            {row.alsoSaid.length > 0 ? `${row.alsoSaid.length} more said something` : "More"}
          </button>

          {open && (
            <div className="mt-3 flex flex-col gap-3">
              {row.alsoSaid.map((said, i) => (
                <p key={i} className="rounded-[var(--r)] px-3 py-2 text-sm" style={{ background: "var(--raised)", color: "var(--ink-2)" }}>
                  {said}
                </p>
              ))}

              {row.lexemeId && row.lemma && (
                <Link
                  href={`/dictionary?q=${encodeURIComponent(row.lemma)}`}
                  className="text-sm underline"
                  style={{ color: "var(--accent-deep)" }}
                >
                  Open the entry
                </Link>
              )}

              {row.decision && (
                <p className="text-sm" style={{ color: "var(--ink-2)" }}>
                  <span className="label-xs mr-2" style={{ color: "var(--ink-3)" }}>Reviewer said</span>
                  {row.decision}
                </p>
              )}

              {row.status === "OPEN" && (
                <div>
                  <label htmlFor={`note-${row.id}`} className="label-xs mb-2 block" style={{ color: "var(--ink-3)" }}>
                    A note on this decision, optional
                  </label>
                  <input
                    id={`note-${row.id}`}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="w-full rounded-[var(--r)] border px-3 py-2.5 text-sm"
                    style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
