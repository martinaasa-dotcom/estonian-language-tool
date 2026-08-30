"use client";

import { useMemo, useState, useTransition } from "react";
import { EyeOff, Trash2 } from "lucide-react";
import { deleteCard, setCardSuspended } from "@/app/actions";
import { Chip } from "@/components/ui";

export interface CardRow {
  id: string;
  cardType: string;
  front: string;
  back: string;
  lemma: string | null;
  cefr: string | null;
  state: number;
  stateLabel: string;
  due: string;
  lapses: number;
  suspended: boolean;
}

const FILTERS = ["All", "Due", "New", "Struggling", "Suspended"] as const;

export function WordsTable({ rows }: { rows: CardRow[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const now = Date.now();
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !`${r.front} ${r.back}`.toLowerCase().includes(q)) return false;
      switch (filter) {
        case "Due": return !r.suspended && new Date(r.due).getTime() <= now;
        case "New": return r.state === 0;
        case "Struggling": return r.lapses > 0;
        case "Suspended": return r.suspended;
        default: return true;
      }
    });
  }, [rows, filter, query]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className="press rounded-full border px-3.5 py-1.5 text-xs transition-ui"
            style={{
              borderColor: filter === f ? "transparent" : "var(--rule)",
              background: filter === f ? "var(--accent-deep)" : "var(--surface)",
              color: filter === f ? "var(--accent-ink)" : "var(--ink-2)",
              fontWeight: filter === f ? 700 : 500,
              boxShadow: filter === f ? "var(--shadow-accent)" : "none",
            }}
          >
            {f}
          </button>
        ))}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter…"
          aria-label="Filter cards"
          className="ml-auto rounded-full border px-4 py-2 text-sm outline-none"
          style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
        />
      </div>

      {visible.length === 0 ? (
        <p
          className="rounded-[var(--r-lg)] border border-dashed px-4 py-10 text-center text-sm"
          style={{ borderColor: "var(--rule)", color: "var(--ink-3)" }}
        >
          No cards match that. Try another filter.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {visible.map((r) => <Row key={r.id} row={r} />)}
        </ul>
      )}
    </div>
  );
}

function Row({ row }: { row: CardRow }) {
  const [pending, start] = useTransition();
  const [gone, setGone] = useState(false);
  const [suspended, setSuspended] = useState(row.suspended);
  if (gone) return null;

  const dueDate = new Date(row.due);
  const isDue = dueDate.getTime() <= Date.now();

  return (
    <li
      className="flex items-center gap-3 rounded-[var(--r)] border px-4 py-3 transition-colors hover:border-[var(--accent-soft)]"
      style={{
        borderColor: "var(--rule)",
        background: "var(--surface)",
        boxShadow: "var(--shadow-sm)",
        opacity: pending ? 0.5 : suspended ? 0.55 : 1,
      }}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-base" style={{ color: "var(--ink)" }}>
          <span lang="et" className="est">{row.front}</span>
          <span style={{ color: "var(--ink-3)" }}> → {row.back}</span>
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-2xs" style={{ color: "var(--ink-3)" }}>
          <span>{row.cardType.toLowerCase().replace("_", " ")}</span>
          <span>{row.stateLabel}</span>
          <span>{isDue ? "due now" : `due ${dueDate.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`}</span>
          {row.lapses > 0 && <span style={{ color: "var(--again-ink)" }}>{row.lapses} lapse{row.lapses === 1 ? "" : "s"}</span>}
        </div>
      </div>

      {row.cefr && <Chip>{row.cefr}</Chip>}

      <button
        type="button"
        onClick={() => start(async () => { await setCardSuspended(row.id, !suspended); setSuspended(!suspended); })}
        aria-label={suspended ? `Resume "${row.front}"` : `Suspend "${row.front}"`}
        className="tap-tint rounded-md p-1.5"
        style={{ color: suspended ? "var(--accent-deep)" : "var(--ink-3)" }}
      >
        <EyeOff size={15} aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => start(async () => { await deleteCard(row.id); setGone(true); })}
        aria-label={`Delete card "${row.front}"`}
        className="tap-tint rounded-md p-1.5"
        style={{ color: "var(--ink-3)" }}
      >
        <Trash2 size={15} aria-hidden />
      </button>
    </li>
  );
}
