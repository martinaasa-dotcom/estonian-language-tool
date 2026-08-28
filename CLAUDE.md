# Working in this repository

## What this is

An Estonian learning app — dictionary, learning path, spaced-repetition review, practice games and a
grammar tutor. `docs/` holds the plan it was built from; `docs/13-mvp-status.md` says what is built,
what is deliberately not, and the known limitations. Read that first, and §6 of it especially — that
is the current state.

## Read before writing code

1. `docs/09-roadmap.md` — what phase we are in and what "done" means for it.
2. `docs/02-estonian-domain.md` — the linguistic model. Non-obvious and load-bearing.
3. `docs/04-data-model.md` — the schema.
4. `docs/03-architecture.md` §6 — the ADRs. Do not silently reverse one.

## Rules that are not negotiable

**Never ship a credential to the client.** The Anthropic and Ekilex keys live only in server-side
Route Handlers and server actions. Nothing gets a `NEXT_PUBLIC_` prefix unless it is genuinely
public. CI greps the build output for key patterns.

**Never generate Estonian morphology.** Inflected forms come from Ekilex, never from the model. This
is not theoretical: `gpt-4o-mini` invented "Ma söön aitamat" when asked for an example. The AI may
explain grammar and suggest an English translation; it may never supply an Estonian form. AI output
is tagged and needs confirmation before becoming a flashcard answer — an unverified form does not
just sit there being wrong, the SRS drills it in. (ADR-005.)

**Never store derived case forms.** Only principal parts are persisted (five per lexeme). The ten
regular cases
are computed from the genitive stem at render time. Storing them creates a second source of truth
that goes stale.

**`Review` is append-only.** No updates, no deletes. It is the one table whose loss is unrecoverable
and it is the input to FSRS parameter optimisation.

**Never re-add the iframes.** Sõnaveeb and Ekilex send `X-Frame-Options: DENY`; Speakly has no public
API. This was verified, not assumed. See `docs/00-audit-v4.md` §A.

**Review must work offline.** It is the daily path. A grade that cannot reach the server goes into
`lib/offline/queue.ts` and is replayed later with the timestamp it was actually answered at — never
dropped, never re-stamped. (ADR-015.)

**Progress is derived, never stored.** XP, levels, streaks, quests and every chart are computed from
the append-only review log on each request (`lib/gamification/`, `lib/stats/`, `lib/progress/`).
Do not add a counter column. A stored score is a second source of truth that drifts, and it can be
awarded for something that never happened. The only exceptions are values no log can reconstruct: a
personal best, and which days a streak shield has already covered. (ADR-014.)

**Every mode grades through `gradeCard`.** Sprint, Listening and Match are not side games with their
own scores — they write to the same review log, so the scheduler sees what was actually practised.
An abandoned round writes nothing. (ADR-016.)

**Local mode is a deployment shape, not a switch.** With no Supabase keys the app runs as a single
local learner; with them, every route is gated. It keys off the absence of configuration only —
never add a flag that can disable auth on a deployment that has it. (ADR-013.)

## Conventions

- TypeScript `strict` plus `noUncheckedIndexedAccess`. No `any` without a comment justifying it.
- `lib/estonian/`, `lib/gamification/`, `lib/stats/`, `lib/collections/`, `lib/time/` and
  `lib/offline/` stay free of React, Next.js and Prisma — pure functions, unit tested. Anything that
  needs the database lives in `lib/progress/` or a route.
- Data that drives UI but holds no JSX (badges, path units, quests) carries a lucide icon *name*;
  `components/icons.tsx` is the only place that turns one into a component.
- Settings go through `lib/settings/store.ts`. No new string keys scattered through pages.
- Server actions for mutations; Route Handlers for streaming and third-party proxying.
- Every new view implements all four states from `docs/08-ux-ia-a11y.md` §4 (empty, loading, error,
  offline). A view without an empty state is not finished.
- Every interactive element is keyboard-reachable with a visible focus ring.
- Estonian text inputs get the diacritic bar.

## Model configuration

**Provider-agnostic** — `lib/tutor/provider.ts` uses whichever key is in `.env`: OpenRouter
(default, free model), Anthropic, or OpenAI. Do not re-pin a single provider. The Anthropic path
keeps a `cache_control` breakpoint on the static Estonian system prompt. This supersedes the
original ADR-004; see `docs/13-mvp-status.md` §2.

## Commands

```
npm run setup        # install + create db + seed (first run)
npm run dev          # dev server
npm run test         # unit tests (Vitest) — DB-backed tests skip themselves without a database
npm run typecheck    # tsc --noEmit
npm run db:seed      # reload the built-in dictionary
npm run demo         # two months of sample history, for looking at the charts
npm run test:e2e     # every browser suite — needs the server running
```

`scripts/test-modes.mjs` covers the path, the practice modes, typed answers, undo, the command
palette and — the one worth keeping green — reviewing with the network switched off.
