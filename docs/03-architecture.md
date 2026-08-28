# Architecture

## 1. Stack

| Layer | Choice | Note |
|---|---|---|
| Framework | Next.js 15 (App Router), React 19 | v4.0 said "14+"; 15 is current and App Router is unchanged |
| Language | TypeScript, `strict: true` | plus `noUncheckedIndexedAccess` |
| Styling | Tailwind CSS v4 | |
| Components | shadcn/ui | copied into the repo, not a dependency |
| Icons | lucide-react | as specified in v4.0 |
| ORM | Prisma | |
| Database | SQLite (dev + v1), Postgres-portable schema | ADR-002 |
| AI | `@anthropic-ai/sdk`, `claude-opus-5` | v4.0's `claude-3-5-sonnet` is stale (audit C2) |
| SRS | `ts-fsrs` (MIT, 5.4.1) | replaces hand-rolled SM-2 (audit D6) |
| Calendar | `ical.js` (2.2.1) | RFC 5545 parsing |
| State | TanStack Query + server actions | no global store; the DB is the state |
| Tests | Vitest, Playwright | `10-testing-quality.md` |

## 2. The one non-negotiable rule

**No third-party credential ever reaches the browser.**

The Anthropic key and the Ekilex key live only in server-side Route Handlers and server actions.
Nothing is prefixed `NEXT_PUBLIC_` except genuinely public configuration. This is enforced, not
just documented: CI greps the production build output for key patterns and fails the build on a hit
(`10-testing-quality.md` §5).

v4.0 does not mention this. The default naive implementation — calling Anthropic from a client
component — publishes the key to anyone who opens devtools. That is audit finding C1.

```
Browser  ──►  Next.js Route Handler / Server Action  ──►  Anthropic API
                        │                                 Ekilex API   (key)
                        │                                 TartuNLP TTS (no key)
                        └──►  Prisma  ──►  SQLite
```

## 3. Directory layout

```
app/
  (dashboard)/
    page.tsx                 # Today — the default route
    tasks/ calendar/ dictionary/ tutor/ flashcards/ imports/ progress/
  api/
    tutor/route.ts           # POST, streams from Claude
    dictionary/search/route.ts
    dictionary/word/[id]/route.ts
    tts/route.ts             # proxy + cache for TartuNLP
    calendar/sync/route.ts
components/
  ui/                        # shadcn primitives
  dictionary/ flashcards/ tutor/ tasks/ shared/
lib/
  estonian/                  # THE DOMAIN CORE
    cases.ts                 # 14 cases, suffixes, Estonian names
    principal-parts.ts       # noun/verb principal-part models
    gradation.ts             # gradation classification + explanation
    derive.ts                # genitive stem → derived case table
    government.ts            # verb case government
  ekilex/  client.ts mapper.ts cache.ts
  tts/     client.ts cache.ts
  srs/     scheduler.ts cards.ts
  anu/     prompt.ts client.ts tools.ts budget.ts
  db.ts
prisma/schema.prisma
docs/
```

`lib/estonian/` is deliberately framework-free and dependency-free: pure functions over plain data,
100% unit-tested. It is the part of this codebase that is genuinely hard to get right, so it is
isolated from React, Next.js and the database and can be tested without any of them.

## 4. Data flow: a dictionary search

1. Client calls `/api/dictionary/search?q=tuba`.
2. Handler checks the local `Lexeme` cache. Fresh → return, no network.
3. Miss → Ekilex `/api/word/search` with the server-held key.
4. `mapper.ts` normalises Ekilex paradigm data into our principal-parts model.
5. Result persisted with `provenance: EKILEX` and a fetch timestamp.
6. Client renders stored forms + `derive.ts` output for the ten derived cases, visually distinguished.

Cache-first is not only a latency optimisation: it is how the dictionary keeps working offline, and
how we stay a polite consumer of a free academic API (audit C11).

## 5. Failure posture

Every integration has a defined degraded mode. Nothing renders a blank tab.

| Dependency | Down / missing | Behaviour |
|---|---|---|
| Ekilex | key not yet issued, 5xx, rate limit | Serve cache; banner "showing cached results"; search still works over local data; card creation still works with manual entry |
| TartuNLP TTS | 5xx / timeout | Serve cached audio; else fall back to Web Speech; else hide the play button (never a dead button) |
| Anthropic | 429 / 5xx / budget cap | Typed error surfaced in chat with a retry; rest of the app unaffected |
| iCal feed | unreachable / malformed | Per-feed error row; other feeds and all local events unaffected |
| Network entirely | — | Today, Tasks, Flashcards and cached Dictionary all function; review scheduling is local |

Flashcard review must work fully offline. It is the daily-use path and it depends on nothing but the
local database.

## 6. Architecture decision records

**ADR-001 — Native dictionary UI instead of an iframe.**
*Context:* v4.0 Feature 3 embeds Sõnaveeb. *Finding:* `X-Frame-Options: DENY`, verified — the frame
cannot render. *Decision:* consume the Ekilex REST API server-side and build our own UI.
*Consequences:* more work; we own the layout; **structured data instead of pixels**, which is what
makes `+ Add to Deck`, offline cache and the derived case table possible at all. The blocker turned
out to be a favour.

**ADR-002 — SQLite + Prisma for v1; schema kept Postgres-portable.**
*Context:* v4.0 said "Supabase (PostgreSQL) **or** SQLite via Prisma" and never chose (audit C4).
*Decision:* SQLite. One user, one machine, no network dependency for the daily path, no auth, no
monthly bill, and the review loop works on a train. *Portability:* no SQLite-specific column types,
no raw SQL; UUID string ids; timestamps in UTC. Moving to Postgres/Supabase later is a datasource
swap plus a data migration, spec'd in Phase 5. *Rejected:* Supabase now — it buys sync and auth,
neither of which a single-user local tool needs yet, at the cost of network dependency on the path
that must never fail.

**ADR-003 — FSRS instead of SM-2/Leitner.**
*Context:* v4.0 says "Leitner / SM-2", two different algorithms, undecided (audit D6). *Decision:*
FSRS via `ts-fsrs`. *Rationale:* fewer reviews for the same retention, a tunable target retention,
actively maintained, MIT. *Consequences:* store FSRS state per card (stability, difficulty, state,
lapses) rather than an SM-2 ease factor; a review log enables later parameter optimisation.

**ADR-004 — Provider-agnostic tutor (SUPERSEDED the original `claude-opus-5` pin — see `13-mvp-status.md` §2).**
*Context:* v4.0 pins `claude-3-5-sonnet`, which is not a current model identifier (audit C2).
*Decision:* `claude-opus-5`; `thinking: { type: "adaptive" }`; stream every response; a
`cache_control` breakpoint on the static Estonian system prompt. *Consequences:* grammar explanations
are worth the top model — a wrong case explanation is actively harmful to a learner — and caching
means the multi-thousand-token grammar prompt is paid for once per session rather than per turn.
Details and cost model in `06-anu-tutor.md`.

**ADR-005 — Retrieve morphology, never generate it.**
*Context:* an LLM will happily produce a plausible, wrong partitive plural. *Decision:* authoritative
forms come from Ekilex only; AI output is tagged `provenance: AI` and requires explicit confirmation
before entering a card's answer field. *Consequences:* the dictionary is bounded by Ekilex coverage;
that is the correct trade — an unverified form in a flashcard gets *memorised wrong*, which is worse
than a gap.

**ADR-006 — Generic importer instead of a Speakly integration.**
*Context:* Speakly has no public API and no verifiable export (audit A3). *Decision:* one
paste-and-parse importer handling TSV/CSV/JSON/dash-separated lines, with Ekilex enrichment.
*Consequences:* works with Speakly, Quizlet, a class handout or a photo transcription; depends on no
third party's continued goodwill; no terms-of-service exposure.

**ADR-009 — Store retrieved paradigms; derive only what we cannot retrieve.**
*Context:* the original plan stored five principal parts and derived the rest, to avoid a second
source of truth. With an Ekilex key we can retrieve the entire paradigm authoritatively — 30–37
forms including irregular plurals and the parallel forms Estonian genuinely has (`raamatutes` /
`raamatuis`), which derivation cannot produce. *Decision:* store the full retrieved paradigm and
render it directly; derive only for words held as principal parts alone (user-added, or seeded and
not yet enriched). *Consequences:* `Form` gains `isPrincipal`, `morphCode` and `orderIndex`, and its
uniqueness key includes the value so parallel forms coexist. The no-stale-duplication rule is intact:
retrieved data is the authority, not a copy of a computation.

**ADR-010 — English comes from a layered resolver, not one source.**
*Context:* Ekilex is authoritative for Estonian but carries no English on a reader key; its `ing`
dataset is not public. *Decision:* resolve a translation in order — a translation the learner has
already accepted, then Wiktionary, then the AI tutor, then an honest blank inviting her to type one.
Each layer records where it came from. *Consequences:* coverage is near-complete without any layer
pretending to an authority it does not have, and the learner can always overwrite.

**ADR-007 — Today is the default route, not Tasks.**
*Context:* v4.0 specifies a sidebar of six tabs and no landing view (audit D2). *Problem:* a tab bar
makes the user decide what to study before they have done anything, which is the single most likely
way a daily-use tool stops being used (risk R10). *Decision:* a Today view is the default route: due
cards, due tasks, next class, one button to start. *Consequences:* Today depends on Tasks (Phase 1)
and Flashcards (Phase 3), so it ships incrementally rather than all at once — acceptable, because a
partial Today still answers the question better than a tab bar does.

**ADR-011 — Hosted on Vercel + Supabase (SUPERSEDES ADR-002's "local only" for v1).**
*Context:* ADR-002 chose SQLite explicitly to avoid a network dependency on the review path and to
avoid a monthly bill, for a single user on a single machine. That premise changed: the app is now
meant to be reachable as a real website, not just run locally. *Decision:* deploy to Vercel; move the
datasource from SQLite to Postgres (Supabase), per ADR-002's own portability guarantee (no
SQLite-specific types, UUID string ids, timestamps in UTC) — this was a datasource swap, not a
data-model change. *Both* connection URLs point at Supabase's shared poolers, never at the direct
`db.<project-ref>.supabase.co` host: that host resolves to IPv6 only, and Vercel's build and
runtime have no IPv6 route to it, so it fails every deploy with `P1001: Can't reach database
server`. This was verified against a real deploy, not assumed. `DATABASE_URL` is the transaction
pooler (6543, `?pgbouncer=true`, required or Prisma's prepared statements break); `DIRECT_URL` is
the *session* pooler (5432), which is a full Postgres session and so can run the schema changes
the transaction pooler cannot. *Consequences:* "Review must work offline" (`03-architecture.md` §5) stopped being
literally true — a hosted app needs a network path to its database. ADR-015 restores it by queuing
grades on the device and replaying them, rather than by pretending the network is there; ADR-013
keeps a no-account local install working for anyone running it on their own machine. The TTS disk cache (`app/api/tts/route.ts`) now writes to `/tmp` when `VERCEL` is set, since
Vercel's filesystem is read-only outside it; this makes it a per-instance cache rather than the
permanent one ADR intended locally — acceptable, since TartuNLP is still hit far less than once per
request. *Rejected:* keeping SQLite on a host with a persistent volume (Fly.io/Railway) — Vercel was
the account already in hand.

**ADR-012 — Supabase Auth (Google) for multi-user; dictionary stays shared, decks are per-user.**
*Context:* ADR-011 made the app reachable as a real website; the next question was whether "shared
wider" means several trusted people behind one login, or independent learners with their own
progress. *Decision:* independent learners. Sign-in is Supabase Auth with the Google provider
(`@supabase/ssr`), gated by `middleware.ts` on every route except `/sign-in` and `/auth/callback`.
Ownership splits along the same line ADR-009's data model already drew: `Lexeme`/`Form` are the
dictionary — shared reference data, exactly like a printed dictionary is shared — while `Card`,
`Task`, `Message` and the new `StarredWord` join table carry an `ownerId` (a Supabase `auth.users`
id) and are filtered by it in every query. Prisma connects with full privileges and bypasses
Postgres RLS, so this scoping is enforced in application code (`lib/auth/session.ts`'s
`requireUserId()`), not in the database — consistent with this codebase's existing
Prisma-everywhere convention, at the cost of needing every query site to remember the filter.
*Consequences:* `toggleStar` moved off a `Lexeme.starred` boolean (which had no owner) onto
`StarredWord`; `restoreBackup`'s `replace` mode now deletes only the restoring user's own cards,
reviews and tasks, never the shared dictionary; `importWords` reuses an existing shared lexeme
instead of skipping it, since "already exists" no longer means "already yours". *Rejected:*
Auth.js/NextAuth — Supabase Auth pairs with the Postgres project already in hand and needs no
separate provider setup beyond Google's own OAuth client.

**ADR-008 — Five noun and five verb principal parts, not three cases and two infinitives.**
*Context:* v4.0 stores nominative/genitive/partitive and the ma-/da-infinitives (audit B2, B4).
*Problem:* partitive plural and the short illative cannot be derived, and the present 1sg is in the
weak grade and unguessable from the infinitive — a three-form model silently teaches an incomplete
paradigm. *Decision:* store five principal parts per part of speech; `ILL_SG_SHORT` is nullable
because it genuinely does not exist for every noun. *Consequences:* the Ekilex mapper must find ten
`FormType`s rather than five, which is what the Phase 0 spike verifies before any UI is built on the
assumption.

**ADR-013 — Sign-in is optional: no Supabase keys means single-learner local mode.**
*Context:* ADR-012 gated every route behind Google sign-in, which is right for a hosted class but is
a wall in front of the first flashcard for anyone who clones the repo — a student on their own
laptop, or a teacher trying it before a lesson. *Decision:* `lib/auth/mode.ts` decides from the
environment alone. With `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` present,
nothing changes: the middleware gates every route and `requireUserId()` reads the session. With
both absent, the middleware steps aside and every row is owned by one fixed local id. *Consequences:*
`npm run setup && npm run dev` is a complete installation again, and the browser tests can drive the
whole app without an OAuth round trip. The fallback is keyed on the *absence* of configuration, so a
deployment that has the keys can never be talked into the open mode — it is a deployment shape, not
an auth bypass. *Rejected:* a `DISABLE_AUTH` flag — a flag can be set on a hosted deployment by
mistake, and a mistake there is everyone's data.

**ADR-014 — Progress is derived from the review log, never stored.**
*Context:* XP, levels, daily quests and every chart on `/progress` are the kind of thing normally
kept in counter columns. *Problem:* a counter is a second source of truth for something the append
-only `Review` table already knows, and the two drift — a failed write, a restored backup, a replayed
offline batch, and the number on screen no longer describes anything that happened. *Decision:* XP is
a pure function of the rating tally (`lib/gamification/xp.ts`); quests, streaks, heatmaps, forecasts
and case accuracy are all recomputed per request from `Review` rows and card state
(`lib/progress/summary.ts`, `lib/stats/history.ts`). Nothing about progress is written anywhere.
*Consequences:* progress applies retroactively to reviews done before the feature existed, survives a
restore for free, and cannot be awarded for something that did not happen; the cost is a handful of
aggregate queries per page, which is why Today and the achievement check share one snapshot rather
than each loading their own. The only progress-shaped values that *are* stored are the ones no log
can reconstruct: a personal best, and the streak-shield days already spent.

**ADR-015 — Offline grades queue in the page, not in the service worker.**
*Context:* "Review must work offline" is a standing rule, and ADR-011 quietly broke it by putting the
database behind the network. *Decision:* the service worker (`public/sw.js`) only keeps the app
*openable* — cache-first for hashed build output, network-first for navigations with an offline
fallback, and it never touches a non-GET request. Grades are queued by the page instead
(`lib/offline/queue.ts`): one synchronous localStorage write per answer, stamped with the moment it
was answered, replayed through the ordinary `gradeCard` path when the connection returns.
*Consequences:* an offline evening lands in the log with its real timestamps, so the streak, heatmap
and daily goal describe the day that actually happened; a tab closed mid-session loses nothing; and
the parts that are genuinely hard — auth, ordering, a card deleted on another device — stay in server
code that can be read and tested. *Rejected:* Background Sync in the worker (replaying an
authenticated Server Action from a worker means reimplementing the session, for a browser API Safari
still does not have) and IndexedDB (asynchronous writes can be lost by a closing tab; the payload is
tiny).

**ADR-016 — Games write to the same review log as review does.**
*Context:* Case Sprint, Listening and Match are there to make practice enjoyable, which invites the
usual arrangement where a game keeps its own score and touches nothing real. *Problem:* a mode whose
results evaporate is a mode nobody plays twice, and worse, it splits "what I studied" from "what the
scheduler knows". *Decision:* every mode grades through `gradeCard`, so FSRS sees the same evidence
from a match round as from a review. Match rates a pair found first time as Good and one that took a
wrong guess as Hard — recognising a word among seven others under time pressure is genuine recall,
and pretending otherwise would be as dishonest as pretending it is a full production test.
*Consequences:* games count towards the daily goal and the quests, which is the point; an abandoned
round writes nothing, because nothing was answered.
