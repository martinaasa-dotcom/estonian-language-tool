# Working in this repository

## What this is

A personal Estonian learning dashboard. Currently **planning only — no application code exists yet**.
`docs/` holds the complete specification and implementation plan; `docs/09-roadmap.md` is the build
order. Start at Phase 0.

## Read before writing code

1. `docs/09-roadmap.md` — what phase we are in and what "done" means for it.
2. `docs/02-estonian-domain.md` — the linguistic model. Non-obvious and load-bearing.
3. `docs/04-data-model.md` — the schema.
4. `docs/03-architecture.md` §6 — the ADRs. Do not silently reverse one.

## Rules that are not negotiable

**Never ship a credential to the client.** The Anthropic and Ekilex keys live only in server-side
Route Handlers and server actions. Nothing gets a `NEXT_PUBLIC_` prefix unless it is genuinely
public. CI greps the build output for key patterns.

**Never generate Estonian morphology.** Authoritative inflected forms come from Ekilex. AI output is
tagged `provenance: AI` and requires explicit user confirmation before it can become a flashcard
answer. An unverified form does not just sit there being wrong — the SRS drills it in. (ADR-005.)

**Never store derived case forms.** Only principal parts are persisted (five per lexeme). The ten
regular cases
are computed from the genitive stem at render time. Storing them creates a second source of truth
that goes stale.

**`Review` is append-only.** No updates, no deletes. It is the one table whose loss is unrecoverable
and it is the input to FSRS parameter optimisation.

**Never re-add the iframes.** Sõnaveeb and Ekilex send `X-Frame-Options: DENY`; Speakly has no public
API. This was verified, not assumed. See `docs/00-audit-v4.md` §A.

**Review must work offline.** It is the daily path. It may not depend on any network call.

## Conventions

- TypeScript `strict` plus `noUncheckedIndexedAccess`. No `any` without a comment justifying it.
- `lib/estonian/` stays free of React, Next.js and Prisma — pure functions, 100% unit tested.
- Server actions for mutations; Route Handlers for streaming and third-party proxying.
- Every new view implements all four states from `docs/08-ux-ia-a11y.md` §4 (empty, loading, error,
  offline). A view without an empty state is not finished.
- Every interactive element is keyboard-reachable with a visible focus ring.
- Estonian text inputs get the diacritic bar.

## Model configuration

`claude-opus-5`, `thinking: { type: "adaptive" }`, streaming, with a `cache_control` breakpoint on
the static system prompt and volatile learner context placed **after** it. Details and the cost model
in `docs/06-anu-tutor.md`.

## Commands

Not yet scaffolded — Phase 0 creates these. Intended surface:

```
npm run dev          # dev server
npm run test         # unit + contract (Vitest)
npm run test:live    # hits real external APIs — NOT in CI
npm run test:e2e     # Playwright
npm run typecheck    # tsc --noEmit
npm run db:migrate   # prisma migrate dev
```
