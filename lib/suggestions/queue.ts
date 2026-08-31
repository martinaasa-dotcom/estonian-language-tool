import { prisma } from "@/lib/db";
import { parseExamples } from "@/lib/dict/examples";
import { oneEntryPerLemma } from "@/lib/dict/search";
import {
  CATEGORY_KEYS, parsePatch,
  type Patch, type SuggestionCategory, type SuggestionStatus,
} from "./model";

/**
 * Reading the queue, in the shape a person can actually work through.
 *
 * THE VOLUME IS THE DESIGN PROBLEM. Every dead end in the app offers to send
 * one of these and sign-up is open, so the queue's size is decided by how many
 * people meet the same fault, not by how many faults there are. A list of rows
 * ordered by time would be one dead link repeated four hundred times, and the
 * one report that matters would be on page nine.
 *
 * So the unit here is a *group*: one line per thing being reported, carrying
 * how many people reported it and a few of their words. Acting on the line
 * acts on the group. Ordering is by report count within the group's own
 * category, because "forty-one people" is the strongest signal in the queue
 * and the only one that scales.
 *
 * The other half is the `before` side. An admin cannot judge "should be
 * kohvik" without knowing what the entry says now, and asking them to open the
 * dictionary in another tab for every row is how a review queue stops being
 * used. It is one batched read per page rather than one per row.
 */

export interface QueueRow {
  /** The most recent report in the group. Acting resolves the whole group. */
  id: string;
  groupKey: string;
  category: SuggestionCategory;
  status: SuggestionStatus;
  lemma: string | null;
  lexemeId: string | null;
  context: string | null;
  trigger: string | null;
  note: string;
  createdAt: Date;
  /** How many reports share this key, at this status. */
  reports: number;
  /** A few other people's notes from the same group, newest first. */
  alsoSaid: string[];
  /** The proposal, when the category carries one and it parsed. */
  patch: Patch | null;
  /** What the dictionary says now, for the half of the queue that changes it. */
  before: string | null;
  /** Set when the proposal cannot be applied as it stands, and why. */
  blocked: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  decision: string | null;
}

export interface QueuePage {
  rows: QueueRow[];
  /** Groups at this status and category, for the pager. */
  groups: number;
  /** Open reports per category, for the tabs. Always at OPEN, whatever is shown. */
  openByCategory: Record<SuggestionCategory, number>;
  /** Every report ever sent, by status. */
  totals: Record<SuggestionStatus, number>;
}

export const QUEUE_PAGE_SIZE = 25;

/** Notes from the rest of a group, capped: the point is a sense of the whole. */
const OTHER_VOICES = 3;

export async function readQueue(options: {
  status: SuggestionStatus;
  category: SuggestionCategory | null;
  page: number;
}): Promise<QueuePage> {
  const { status, category } = options;
  const where = { status, ...(category ? { category } : {}) };

  const [grouped, categoryCounts, statusCounts] = await Promise.all([
    prisma.suggestion.groupBy({
      by: ["groupKey"],
      where,
      _count: { _all: true },
      _max: { createdAt: true },
      orderBy: [{ _count: { groupKey: "desc" } }, { _max: { createdAt: "desc" } }],
      take: QUEUE_PAGE_SIZE,
      skip: Math.max(0, options.page) * QUEUE_PAGE_SIZE,
    }),
    prisma.suggestion.groupBy({
      by: ["category"],
      where: { status: "OPEN" },
      _count: { _all: true },
    }),
    prisma.suggestion.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const keys = grouped.map((g) => g.groupKey);

  /*
    Every row in the groups on this page, newest first. One query rather than
    one per group: a page of twenty-five groups is twenty-five round trips
    otherwise, and the cap on rows read is what stops a group of four hundred
    dragging four hundred notes into memory to show three of them.
  */
  const rows = keys.length
    ? await prisma.suggestion.findMany({
        where: { ...where, groupKey: { in: keys } },
        orderBy: { createdAt: "desc" },
        take: keys.length * (OTHER_VOICES + 1),
      })
    : [];

  const newestByKey = new Map<string, (typeof rows)[number]>();
  const others = new Map<string, string[]>();
  for (const row of rows) {
    if (!newestByKey.has(row.groupKey)) {
      newestByKey.set(row.groupKey, row);
      continue;
    }
    const list = others.get(row.groupKey) ?? [];
    if (list.length < OTHER_VOICES && row.note.trim()) list.push(row.note.trim());
    others.set(row.groupKey, list);
  }

  const leads = keys.map((key) => newestByKey.get(key)).filter((row) => row !== undefined);
  const patches = new Map<string, Patch | null>();
  for (const row of leads) patches.set(row.id, parsePatch(row.patch));

  const before = await currentValues(leads.map((row) => ({
    id: row.id,
    lexemeId: row.lexemeId,
    lemma: row.lemma,
    patch: patches.get(row.id) ?? null,
  })));

  const counts = new Map(grouped.map((g) => [g.groupKey, g._count._all]));

  return {
    rows: leads.map((row) => {
      const patch = patches.get(row.id) ?? null;
      const state = before.get(row.id) ?? { before: null, blocked: null };
      return {
        id: row.id,
        groupKey: row.groupKey,
        category: (CATEGORY_KEYS as string[]).includes(row.category)
          ? (row.category as SuggestionCategory)
          : "OTHER",
        status: row.status as SuggestionStatus,
        lemma: row.lemma,
        lexemeId: row.lexemeId,
        context: row.context,
        trigger: row.trigger,
        note: row.note,
        createdAt: row.createdAt,
        reports: counts.get(row.groupKey) ?? 1,
        alsoSaid: others.get(row.groupKey) ?? [],
        patch,
        before: state.before,
        blocked: state.blocked,
        reviewedBy: row.reviewedBy,
        reviewedAt: row.reviewedAt,
        decision: row.decision,
      } satisfies QueueRow;
    }),
    groups: await countGroups(where),
    openByCategory: Object.fromEntries(
      CATEGORY_KEYS.map((key) => [
        key,
        categoryCounts.find((c) => c.category === key)?._count._all ?? 0,
      ]),
    ) as Record<SuggestionCategory, number>,
    totals: {
      OPEN: statusCounts.find((s) => s.status === "OPEN")?._count._all ?? 0,
      ACCEPTED: statusCounts.find((s) => s.status === "ACCEPTED")?._count._all ?? 0,
      DECLINED: statusCounts.find((s) => s.status === "DECLINED")?._count._all ?? 0,
    },
  };
}

/**
 * How many distinct groups match, for the pager.
 *
 * One number, counted where the rows are. This used to be a `findMany` with
 * `distinct: ["groupKey"]` and `take: 5000` under a comment saying a `groupBy`
 * would be the expensive way round, and it had that backwards: Prisma applies
 * `distinct` in the client, so it emits no `DISTINCT` and, because a `LIMIT`
 * would cut rows before the deduplication, **no `LIMIT` either**. The SQL was
 * `SELECT id, groupKey FROM Suggestion WHERE status = $1 ORDER BY id`, which
 * is every matching row and an id column Prisma adds for its own use, sorted,
 * over the wire, deduplicated in JavaScript. The `groupBy` it was written to
 * avoid reads one row per group. The `take` that made it look bounded was not
 * in the query at all.
 *
 * Sign-up is open and every failure in the app offers the button that writes
 * one of these rows, so the volume the comment was worried about is real. It
 * is just that the fix pointed the wrong way.
 */
async function countGroups(where: { status: string; category?: string }): Promise<number> {
  const [row] = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(DISTINCT "groupKey") AS count
    FROM "Suggestion"
    WHERE "status" = ${where.status}
      AND (${where.category ?? null}::text IS NULL OR "category" = ${where.category ?? null})
  `;
  return Number(row?.count ?? 0);
}

/**
 * What the dictionary says now, against what each patch proposes.
 *
 * Batched by kind: one read for the entries a patch names, one for the lemmas
 * a "missing word" report claims are missing. The second is what catches the
 * commonest false report in the whole queue, which is a word that is in the
 * dictionary under a spelling the learner did not try.
 */
async function currentValues(
  items: { id: string; lexemeId: string | null; lemma: string | null; patch: Patch | null }[],
): Promise<Map<string, { before: string | null; blocked: string | null }>> {
  const out = new Map<string, { before: string | null; blocked: string | null }>();

  const ids = new Set<string>();
  const lemmas = new Set<string>();
  for (const item of items) {
    const id = item.patch && "lexemeId" in item.patch ? item.patch.lexemeId : item.lexemeId;
    if (id) ids.add(id);
    if (item.patch?.kind === "CREATE_WORD") lemmas.add(item.patch.lemma);
    else if (!id && item.lemma) lemmas.add(item.lemma);
  }

  const [entries, byLemma] = await Promise.all([
    ids.size
      ? prisma.lexeme.findMany({
          where: { id: { in: [...ids] } },
          select: {
            id: true, lemma: true, translation: true, examples: true,
            forms: { where: { isPrincipal: true }, select: { formType: true, value: true } },
          },
        })
      : Promise.resolve([]),
    lemmas.size
      ? prisma.lexeme.findMany({
          where: { lemma: { in: [...lemmas] } },
          select: {
            id: true, lemma: true, pos: true, translation: true,
            // For `oneEntryPerLemma` below: a reviewer told "this word is
            // already here" should be shown the entry the app itself leads
            // with, not whichever row the plan returned first.
            provenance: true, forms: { select: { formType: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const entryById = new Map(entries.map((e) => [e.id, e]));

  for (const item of items) {
    const patch = item.patch;

    if (!patch) {
      out.set(item.id, { before: null, blocked: null });
      continue;
    }

    if (patch.kind === "CREATE_WORD") {
      const clash = oneEntryPerLemma(
        byLemma.filter((e) => e.lemma.toLowerCase() === patch.lemma.toLowerCase()),
        [patch.lemma],
      )[0] ?? byLemma.find((e) => e.lemma.toLowerCase() === patch.lemma.toLowerCase());
      out.set(item.id, {
        before: clash ? `${clash.lemma} · ${clash.pos.toLowerCase()} · ${clash.translation}` : null,
        blocked: clash && clash.pos === patch.pos
          ? "The dictionary already has this word. Accepting will overwrite what it says."
          : null,
      });
      continue;
    }

    const entry = entryById.get(patch.lexemeId);
    if (!entry) {
      out.set(item.id, { before: null, blocked: "That entry is no longer in the dictionary." });
      continue;
    }

    if (patch.kind === "SET_TRANSLATION") {
      out.set(item.id, {
        before: entry.translation,
        blocked: entry.translation.trim() === patch.translation.trim()
          ? "The entry already says this. Somebody has fixed it since."
          : null,
      });
      continue;
    }

    if (patch.kind === "SET_FORM") {
      const current = entry.forms.find((f) => f.formType === patch.formType)?.value ?? null;
      out.set(item.id, {
        before: current,
        blocked: current?.trim() === patch.value.trim()
          ? "The entry already carries this form. Somebody has fixed it since."
          : null,
      });
      continue;
    }

    const present = parseExamples(entry.examples)
      .some((e) => e.et.trim() === patch.sentence.trim());
    out.set(item.id, {
      before: present ? patch.sentence : null,
      blocked: present ? null : "That sentence is no longer on the entry.",
    });
  }

  return out;
}
