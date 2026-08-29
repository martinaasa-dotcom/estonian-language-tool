# Working in this repository

## What this is

A personal Estonian learning dashboard — a working MVP. `docs/` holds the plan it was built from;
`docs/13-mvp-status.md` says what is built, what is deliberately not, and the known limitations.
Read that first.

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

In the writing grader this is *enforced*, not requested: `lib/tutor/verify.ts` checks every Estonian
word in the model's feedback against the forms it was given and withholds the note otherwise. A live
test showed a model reaching for forms unprompted despite the instruction, which is the whole
argument for checking rather than asking. If you add another path where a model discusses Estonian
the learner will act on, put it behind that check too.

**Never let the correctness of a form be decided by a model.** The writing exercise checks the
required form by string comparison against the dictionary *before* any call, so a hallucination
cannot mark a right answer wrong and a missing key does not break the exercise. Keep that ordering.

**Never store derived case forms.** Only principal parts are persisted (five per lexeme). The ten
regular cases
are computed from the genitive stem at render time. Storing them creates a second source of truth
that goes stale.

**`Review` is append-only.** No updates, no deletes. It is the one table whose loss is unrecoverable
and it is the input to FSRS parameter optimisation.

This is now a property rather than a hope: `Review` has *no foreign key* to `Card`. It carries its
own `ownerId` and `lexemeId` and keeps `cardId` as a plain column, so deleting a card or restoring a
backup over a deck cannot cascade the history away. Do not re-add the relation for the convenience
of a join — `lib/srs/replay.itest.ts` will fail, which is the point. The same property is what makes
offline sync conflict-free: grades are facts with timestamps, and replaying them in order reproduces
the state exactly, because `grade()` takes `now` as a parameter.

**Never re-add the iframes.** Sõnaveeb and Ekilex send `X-Frame-Options: DENY`; Speakly has no public
API. This was verified, not assumed. See `docs/00-audit-v4.md` §A.

**Review must work offline.** It is the daily path. It may not depend on any network call. This is
built: a service worker, a stashed session, and an IndexedDB outbox that replays through
`replayGrades`. Anything added to the review path must survive `navigator.onLine === false`.

**AI spending is always metered.** `lib/usage` has no off switch and fails closed, because sign-up is
open by default. Any new path that calls a paid provider goes through `authoriseCall` before the
call and `recordUsage` after it. An unrecognised model prices at the dearest rate in the table — a
cap that fails open is not a cap.

**Nothing in a `"use server"` file may take an owner id from its caller.** Every export there is a
public endpoint. Resolve the owner with `requireUserId()`; if a helper needs one as a parameter,
it belongs in `lib/`, not in `app/actions.ts`. See `addCardsFor` and `applyGradeBatch` for the shape.

## Conventions

- TypeScript `strict` plus `noUncheckedIndexedAccess`. No `any` without a comment justifying it.
- `lib/estonian/` stays free of React, Next.js and Prisma — pure functions, 100% unit tested.
- Server actions for mutations; Route Handlers for streaming and third-party proxying.
- Every new view implements all four states from `docs/08-ux-ia-a11y.md` §4 (empty, loading, error,
  offline). A view without an empty state is not finished.
- Unit tests stay hermetic: no database, no network, no clock you do not control. Anything needing
  Postgres is an `*.itest.ts` under `npm run test:db`. The unit suite gates every commit and must
  stay fast enough that nobody is tempted to skip it.
- Every interactive element is keyboard-reachable with a visible focus ring.
- Estonian text inputs get the diacritic bar.

## Model configuration

**Provider-agnostic** — `lib/tutor/provider.ts` uses whichever key is in `.env`: OpenRouter
(default, free model), Anthropic, or OpenAI. Do not re-pin a single provider. The Anthropic path
keeps a `cache_control` breakpoint on the static Estonian system prompt. This supersedes the
original ADR-004; see `docs/13-mvp-status.md` §2.

## Commands

```
npm run setup          # install + create db + seed (first run)
npm run dev            # dev server
npm run typecheck      # tsc --noEmit
npm run test           # unit tests (Vitest) — hermetic, no database
npm run test:db        # integration tests — needs Postgres in DATABASE_URL
npm run check:secrets  # fails if a credential reached the client bundle
npm run db:seed        # reload the built-in dictionary
```

Browser tests need a stand-in session, which only works outside a production build:

```
E2E_TEST_USER_ID=me npm run dev     # then, in another shell:
node scripts/smoke-new.mjs          # every route renders, no console errors
node scripts/smoke-interact.mjs     # each mode does what it claims
```

CI runs typecheck, unit tests, integration tests against a real Postgres, the production build and
the credential scan. It is the enforcement behind the rules above — do not add a rule without one.
