# Architecture

## 1. Stack

| Layer | Choice | Note |
|---|---|---|
| Framework | Next.js 15 (App Router), React 19 | v4.0 said "14+"; 15 is current and App Router is unchanged |
| Language | TypeScript, `strict: true` | plus `noUncheckedIndexedAccess` |
| Styling | Tailwind CSS v4 | |
| Icons | lucide-react | as specified in v4.0 |
| ORM | Prisma | |
| Database | Postgres, hosted on Supabase | ADR-002 chose SQLite; ADR-011 swapped it, which the schema was written to allow |
| Components | `components/ui.tsx` | this app's own primitives, not a component library |
| AI | no SDK: one HTTP client over a chain of providers | `lib/tutor/provider.ts`, OpenRouter then Anthropic then OpenAI, per `13-mvp-status.md` §2 |
| SRS | `ts-fsrs` (MIT, 5.4.1) | replaces hand-rolled SM-2 (audit D6) |
| State | Server Components and Server Actions | no client store and no query library; the database is the state |
| Tests | Vitest, Playwright | `10-testing-quality.md` |

## 2. The one non-negotiable rule

**No third-party credential ever reaches the browser.**

The Anthropic key and the Ekilex key live only in server-side Route Handlers and server actions.
Nothing is prefixed `NEXT_PUBLIC_` except genuinely public configuration. This is enforced, not
just documented: CI greps the production build output for key patterns and fails the build on a hit
(`10-testing-quality.md` §5).

v4.0 does not mention this. The default naive implementation (calling Anthropic from a client
component) publishes the key to anyone who opens devtools. That is audit finding C1.

```
Browser  ──►  Next.js Route Handler / Server Action  ──►  Anthropic API
                        │                                 Ekilex API   (key)
                        │                                 TartuNLP TTS (no key)
                        └──►  Prisma  ──►  Postgres
```

## 3. Directory layout

```
app/
  (app)/                     # everything behind sign-in
    page.tsx                 # Today, the default route
    review/ practice/ learn/ dictionary/ grammar/ progress/ words/
    exam/ assess/ scan/ class/ settings/ tutor/ suggestions/ admin/
  (chromeless)/              # pages that own the whole screen
    welcome/ sign-in/ start/
  api/                       # streaming and third-party proxying only
    tutor/ tts/ scan/ write/ exam/ export/ restore/ share/ metrics/ reminder/
  actions.ts                 # every mutation, as Server Actions
components/                  # ui.tsx holds the primitives
lib/
  estonian/                  # THE DOMAIN CORE, framework-free
    cases.ts                 # the 14 cases, their suffixes and Estonian names
    derive.ts                # genitive stem to the ten regular cases
    conjugate.ts             # the stored first person to the rest of the present
    gapForms.ts              # every spelling of a word a sentence could hide
    cloze.ts government.ts answer.ts dictation.ts terms.ts
  collections/syllabus/      # the 79-unit course: a request, never a copy
  srs/  scheduler.ts cards.ts grade.ts deck.ts queue.ts replay.ts
  dict/ ekilex/ tutor/ exam/ assessment/ progress/ stats/ gamification/
  usage/ security/ offline/ audio/ news/ scan/ suggestions/ legal/ ux/
  db.ts
prisma/schema.prisma
scripts/                     # the suites, the audits and the seed builders
docs/
```

`lib/estonian/` is deliberately framework-free and dependency-free: pure functions over plain data,
unit-tested. It is the part of this codebase that is genuinely hard to get right, so it is isolated
from React, Next.js and the database and can be tested without any of them. So are
`lib/assessment/`, `lib/gamification/`, `lib/stats/`, `lib/collections/`, `lib/time/`,
`lib/offline/`, `lib/security/`, `lib/scan/`, `lib/questions/`, `lib/ux/`, `lib/random/` and
`lib/copy/`, and an invariant fails on a React, Next.js or Prisma import inside any of them: the
unit suite gates every commit on being hermetic, and one `import { prisma }` there puts a database
behind a function four hundred tests call.

## 4. Data flow: a dictionary search

1. Client calls `/api/dictionary/search?q=tuba`.
2. Handler checks the local `Lexeme` cache. Fresh → return, no network.
3. Miss → Ekilex `/api/word/search` with the server-held key.
4. `mapper.ts` normalises Ekilex form data into our principal-parts model.
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
| Network entirely | n/a | Today, Tasks, Flashcards and cached Dictionary all function; review scheduling is local |

Flashcard review must work fully offline. It is the daily-use path and it depends on nothing but the
local database.

## 6. Architecture decision records

**ADR-001: Native dictionary UI instead of an iframe.**
*Context:* v4.0 Feature 3 embeds Sõnaveeb. *Finding:* `X-Frame-Options: DENY`, verified, and the frame
cannot render. *Decision:* consume the Ekilex REST API server-side and build our own UI.
*Consequences:* more work; we own the layout; **structured data instead of pixels**, which is what
makes `+ Add to Deck`, offline cache and the derived case table possible at all. The blocker turned
out to be a favour.

**ADR-002: SQLite + Prisma for v1; schema kept Postgres-portable.**
*Context:* v4.0 said "Supabase (PostgreSQL) **or** SQLite via Prisma" and never chose (audit C4).
*Decision:* SQLite. One user, one machine, no network dependency for the daily path, no auth, no
monthly bill, and the review loop works on a train. *Portability:* no SQLite-specific column types,
no raw SQL; UUID string ids; timestamps in UTC. Moving to Postgres/Supabase later is a datasource
swap plus a data migration, spec'd in Phase 5. *Rejected:* Supabase now, which buys sync and auth,
neither of which a single-user local tool needs yet, at the cost of network dependency on the path
that must never fail.

**ADR-003: FSRS instead of SM-2/Leitner.**
*Context:* v4.0 says "Leitner / SM-2", two different algorithms, undecided (audit D6). *Decision:*
FSRS via `ts-fsrs`. *Rationale:* fewer reviews for the same retention, a tunable target retention,
actively maintained, MIT. *Consequences:* store FSRS state per card (stability, difficulty, state,
lapses) rather than an SM-2 ease factor; a review log enables later parameter optimisation.

**ADR-004: Provider-agnostic tutor (SUPERSEDED the original `claude-opus-5` pin, see `13-mvp-status.md` §2).**
*Context:* v4.0 pins `claude-3-5-sonnet`, which is not a current model identifier (audit C2).
*Decision:* `claude-opus-5`; `thinking: { type: "adaptive" }`; stream every response; a
`cache_control` breakpoint on the static Estonian system prompt. *Consequences:* grammar explanations
are worth the top model (a wrong case explanation is actively harmful to a learner) and caching
means the multi-thousand-token grammar prompt is paid for once per session rather than per turn.
Details and cost model in `06-anu-tutor.md`.

**ADR-005: Retrieve morphology, never generate it. (AMENDED, three times, below.)**
*Context:* an LLM will happily produce a plausible, wrong partitive plural. *Decision:* authoritative
forms come from Ekilex only; AI output is tagged `provenance: AI` and requires explicit confirmation
before entering a card's answer field. *Consequences:* the dictionary is bounded by Ekilex coverage;
that is the correct trade. An unverified form in a flashcard gets *memorised wrong*, which is worse
than a gap.

*Amendment 1: what "generate" means, and who is allowed to do it.* The decision clause says forms
come from Ekilex only, and the code has never done exactly that. `lib/estonian/morph.ts` builds the
ten regular cases from a stored genitive stem and the app renders them; ADR-009 makes that the
explicit fallback for a word held as principal parts alone; and `matchEstonianForm` vouches for a
derived case at `VOUCHED_SCORE` when deciding whether to believe a word read off a photograph
(ADR-021). Three later decisions rest on a permission this one does not grant in writing. So the
operative rule is narrower than "never generate" and sharper than "Ekilex only": **no model may
originate an Estonian form; a deterministic rule over a form already stored may.** The difference is
who can be wrong and how. A derivation is wrong the same way for every word that takes that ending,
which is one bug a person finds once and fixes for all of them, and the form carries its provenance
so the learner is told it was derived rather than attested. A model is wrong once, unpredictably,
about a single word, in output indistinguishable from the forms around it. Both readings of the
original wording are available to somebody arriving at this file cold, and both are damaging: read
literally, "Ekilex only" forbids the derivation the seeded dictionary depends on and a session
dutifully rips it out; read loosely, "generate" becomes a word somebody argues a model does not
really do when it writes a partitive. `CLAUDE.md` has stated the rule more precisely than this ADR
for some time, which is the wrong way round.

*Amendment 2: the chat guard is a notice, not a gate, and it is the weaker of the two.* `verifyComment`
is a gate. It runs over a finished grader reply and withholds it whole, so a form the model reached
for is never shown at all (`/api/write`, `/api/exam/write`). The main chat cannot have that, because
it streams on purpose and most of a reply is on screen before it ends: `flagUnverifiedEstonian`
checks Anu's prose against the dictionary the way ADR-021 checks a scanned word, and prints what it
could not confirm in a line underneath. That is weaker in two ways worth stating rather than
implying. It is after the fact, so a wrong form has already been read. And it inherits
`estonianTokens`, which only reaches a word that is quoted or carries õäöüšž, so ordinary Estonian
written straight into a sentence of prose passes untouched. Widening it is not the obvious fix: the
dictionary behind it clears an English word only when that word happens also to be an Estonian
lemma, so a wider net would flag English as unverified Estonian and teach the learner to ignore the
line on the day it is right. The chat is therefore the path where ADR-005 is enforced least and read
most, and the compensating control is the UI rather than the check: every claim Anu makes about a
form is boxed and tagged, and a word only becomes a card through a confirmation step. If that trade
is ever revisited, the thing to change is the reply's shape, not the extractor's threshold.

*Amendment 3: the verb has one derivable part, and it is derived under amendment 1's licence.* The
present indicative, the negative after `ei`, the present conditional and the singular imperative are
regular endings on the stored first person for every verb in the language but `olema`, whose third
person is `on`, and `minema`, whose imperative is `mine`. `lib/estonian/conjugate.ts` is the one
module that joins those endings to a stem, asserted, and it declines both exceptions rather than
guessing at them. The rule was not reasoned about but measured: `npm run audit:verbs` derives every
slot for every verb in the shipped dictionary and compares it with every form Ekilex records for the
same word, 797 verbs and thirteen slots each, with no disagreement. What is *not* derived, and may
not be, is the simple past: `lugesin` goes to `luges` but `tahtsin` to `tahtis` and `võtsin` to
`võttis`, with the grade changing on the way, so its third person stays attested-only. An attested
form always answers ahead of the rule, every derived form says so on screen, and the moment an entry
is enriched from Ekilex the rule steps aside. The same principle as the ten regular cases on the
genitive: one bug for the whole language rather than one word wrong unpredictably.

**ADR-006: Generic importer instead of a Speakly integration.**
*Context:* Speakly has no public API and no verifiable export (audit A3). *Decision:* one
paste-and-parse importer handling TSV/CSV/JSON/dash-separated lines, with Ekilex enrichment.
*Consequences:* works with Speakly, Quizlet, a class handout or a photo transcription; depends on no
third party's continued goodwill; no terms-of-service exposure.

**ADR-009: Store the forms we retrieve; derive only what we cannot retrieve.**
*Context:* the original plan stored five principal parts and derived the rest, to avoid a second
source of truth. With an Ekilex key we can retrieve every form authoritatively, 30-37
forms including irregular plurals and the parallel forms Estonian genuinely has (`raamatutes` /
`raamatuis`), which derivation cannot produce. *Decision:* store every retrieved form and
render it directly; derive only for words held as principal parts alone (user-added, or seeded and
not yet enriched). *Consequences:* `Form` gains `isPrincipal`, `morphCode` and `orderIndex`, and its
uniqueness key includes the value so parallel forms coexist. The no-stale-duplication rule is intact:
retrieved data is the authority, not a copy of a computation.

**ADR-010: English comes from a layered resolver, not one source.**
*Context:* Ekilex is authoritative for Estonian but carries no English on a reader key; its `ing`
dataset is not public. *Decision:* resolve a translation in order: a translation the learner has
already accepted, then Wiktionary, then the AI tutor, then an honest blank inviting her to type one.
Each layer records where it came from. *Consequences:* coverage is near-complete without any layer
pretending to an authority it does not have, and the learner can always overwrite.

**ADR-007: Today is the default route, not Tasks.**
*Context:* v4.0 specifies a sidebar of six tabs and no landing view (audit D2). *Problem:* a tab bar
makes the user decide what to study before they have done anything, which is the single most likely
way a daily-use tool stops being used (risk R10). *Decision:* a Today view is the default route: due
cards, due tasks, next class, one button to start. *Consequences:* Today depends on Tasks (Phase 1)
and Flashcards (Phase 3), so it ships incrementally rather than all at once, which is acceptable, because a
partial Today still answers the question better than a tab bar does.

**ADR-011: Hosted on Vercel + Supabase (SUPERSEDES ADR-002's "local only" for v1).**
*Context:* ADR-002 chose SQLite explicitly to avoid a network dependency on the review path and to
avoid a monthly bill, for a single user on a single machine. That premise changed: the app is now
meant to be reachable as a real website, not just run locally. *Decision:* deploy to Vercel; move the
datasource from SQLite to Postgres (Supabase), per ADR-002's own portability guarantee (no
SQLite-specific types, UUID string ids, timestamps in UTC). This was a datasource swap, not a
data-model change. *Both* connection URLs point at Supabase's shared poolers, never at the direct
`db.<project-ref>.supabase.co` host: that host resolves to IPv6 only, and Vercel's build and
runtime have no IPv6 route to it, so it fails every deploy with `P1001: Can't reach database
server`. This was verified against a real deploy, not assumed. `DATABASE_URL` is the transaction
pooler (6543, `?pgbouncer=true`, required or Prisma's prepared statements break); `DIRECT_URL` is
the *session* pooler (5432), which is a full Postgres session and so can run the schema changes
the transaction pooler cannot. *Consequences:* "Review must work offline" (`03-architecture.md` §5) stopped being
literally true. A hosted app needs a network path to its database. ADR-015 restores it by queuing
grades on the device and replaying them, rather than by pretending the network is there; ADR-013
keeps a no-account local install working for anyone running it on their own machine. The TTS disk cache (`app/api/tts/route.ts`) now writes to `/tmp` when `VERCEL` is set, since
Vercel's filesystem is read-only outside it; this makes it a per-instance cache rather than the
permanent one ADR intended locally, which is acceptable since TartuNLP is still hit far less than once per
request. *Rejected:* keeping SQLite on a host with a persistent volume (Fly.io/Railway). Vercel was
the account already in hand.

**ADR-012: Supabase Auth (Google) for multi-user; dictionary stays shared, decks are per-user.**
*Context:* ADR-011 made the app reachable as a real website; the next question was whether "shared
wider" means several trusted people behind one login, or independent learners with their own
progress. *Decision:* independent learners. Sign-in is Supabase Auth with the Google provider
(`@supabase/ssr`), gated by `middleware.ts` on every route except `/sign-in` and `/auth/callback`.
Ownership splits along the same line ADR-009's data model already drew: `Lexeme`/`Form` are the
dictionary (shared reference data, exactly like a printed dictionary is shared) while `Card`,
`Task`, `Message` and the new `StarredWord` join table carry an `ownerId` (a Supabase `auth.users`
id) and are filtered by it in every query. Prisma connects with full privileges and bypasses
Postgres RLS, so this scoping is enforced in application code (`lib/auth/session.ts`'s
`requireUserId()`), not in the database, consistent with this codebase's existing
Prisma-everywhere convention, at the cost of needing every query site to remember the filter.
*Consequences:* `toggleStar` moved off a `Lexeme.starred` boolean (which had no owner) onto
`StarredWord`; `restoreBackup`'s `replace` mode now deletes only the restoring user's own cards,
reviews and tasks, never the shared dictionary; `importWords` reuses an existing shared lexeme
instead of skipping it, since "already exists" no longer means "already yours". *Rejected:*
Auth.js/NextAuth. Supabase Auth pairs with the Postgres project already in hand and needs no
separate provider setup beyond Google's own OAuth client.

**ADR-012 amendment 1: the session is verified, not asked about, and never without a deadline.**
*Context:* the ADR said the middleware gates every route and `requireUserId()` reads the session,
and left how open. Both reached for `getUser()`, which hands the access token to Supabase and asks
whether it is still good. That is one network call each, and there were three of them on a signed-in
page load: the middleware's gate, `requireUserId()` and `currentLearner()`, each waiting on the
last, none able to reuse another's answer. Measured against a project in eu-west-1, a gated request
cost 138 to 187ms before the page had done anything, and a public page that never reads an identity
paid the same. *Problem:* nothing capped the wait. When the auth service stopped answering, the
middleware sat on the request until the platform gave up at twenty-five seconds and served
`MIDDLEWARE_INVOCATION_TIMEOUT`, which tells a learner nothing and tells them it slowly.
*Decision:* three questions, cheapest first, in `lib/auth/identity.ts`. A public page that renders
the same either way is answered without a client, which is the landing page, both policy pages, the
offline fallback and the OAuth callback, and /sign-in is the one exception because it sends somebody
already signed in home. A request with no `sb-<ref>-auth-token` cookie is signed out, definitively,
with no call at all. What is left goes to `getClaims()`, which verifies the token's signature against
the project's public keys, cached in the process, so the answer is arrived at rather than requested.
Every remaining call is made through a transport carrying a 2,500ms deadline, the same one the
dictionary gives Ekilex. *Consequences:* the same request costs 7 to 9ms, and a page render is one
resolution shared by `requireUserId()` and `currentLearner()` instead of two. A session revoked
elsewhere now survives until its access token expires rather than until the next request, which is
the trade `getClaims()` makes and is bounded by the project's token lifetime; the allowlist is not
part of it, since the address is a claim inside the token and `isAllowedEmail` still runs on every
gated request. `Identity` has three states rather than two: a deadline that passes is `unreachable`,
which is let through rather than redirected, because reading it as a sign-out would take a learner's
deck away over a bad minute at somebody else's server, and because `requireUserId()` is the check
that actually decides. *Rejected:* passing the verified identity from the middleware to the page in a
request header. It would have taken the page's remaining resolution to zero, and a header a client
can also send is a header that has to be stripped on every path that reaches a handler, including
the ones the middleware now skips.

**ADR-008: Five noun and five verb principal parts, not three cases and two infinitives.**
*Context:* v4.0 stores nominative/genitive/partitive and the ma-/da-infinitives (audit B2, B4).
*Problem:* partitive plural and the short illative cannot be derived, and the present 1sg is in the
weak grade and unguessable from the infinitive. A three-form model silently teaches an incomplete
set of forms. *Decision:* store five principal parts per part of speech; `ILL_SG_SHORT` is nullable
because it genuinely does not exist for every noun. *Consequences:* the Ekilex mapper must find ten
`FormType`s rather than five, which is what the Phase 0 spike verifies before any UI is built on the
assumption.

**ADR-013: Sign-in is optional: no Supabase keys means single-learner local mode.**
*Context:* ADR-012 gated every route behind Google sign-in, which is right for a hosted class but is
a wall in front of the first flashcard for anyone who clones the repo: a student on their own
laptop, or a teacher trying it before a lesson. *Decision:* `lib/auth/mode.ts` decides from the
environment alone. With `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` present,
nothing changes: the middleware gates every route and `requireUserId()` reads the session. With
both absent, the middleware steps aside and every row is owned by one fixed local id. *Consequences:*
`npm run setup && npm run dev` is a complete installation again, and the browser tests can drive the
whole app without an OAuth round trip. The fallback is keyed on the *absence* of configuration, so a
deployment that has the keys can never be talked into the open mode. It is a deployment shape, not
an auth bypass. *Rejected:* a `DISABLE_AUTH` flag. A flag can be set on a hosted deployment by
mistake, and a mistake there is everyone's data.

**ADR-014: Progress is derived from the review log, never stored.**
*Context:* XP, levels, daily quests and every chart on `/progress` are the kind of thing normally
kept in counter columns. *Problem:* a counter is a second source of truth for something the append
-only `Review` table already knows, and the two drift: a failed write, a restored backup, a replayed
offline batch, and the number on screen no longer describes anything that happened. *Decision:* XP is
a pure function of the rating tally (`lib/gamification/xp.ts`); quests, streaks, heatmaps, forecasts
and case accuracy are all recomputed per request from `Review` rows and card state
(`lib/progress/summary.ts`, `lib/stats/history.ts`). Nothing about progress is written anywhere.
*Consequences:* progress applies retroactively to reviews done before the feature existed, survives a
restore for free, and cannot be awarded for something that did not happen; the cost is a handful of
aggregate queries per page, which is why Today and the achievement check share one snapshot rather
than each loading their own. The only progress-shaped values that *are* stored are the ones no log
can reconstruct: a personal best, and the streak-shield days already spent.

**ADR-015: Offline grades queue in the page, not in the service worker.**
*Context:* "Review must work offline" is a standing rule, and ADR-011 quietly broke it by putting the
database behind the network. *Decision:* the service worker (`public/sw.js`) only keeps the app
*openable*: cache-first for hashed build output, network-first for navigations with an offline
fallback, and it never touches a non-GET request. Grades are queued by the page instead: one write
per answer, stamped with the moment it was answered, replayed through the ordinary `gradeCard` path
when the connection returns.
*Consequences:* an offline evening lands in the log with its real timestamps, so the streak, heatmap
and daily goal describe the day that actually happened; a tab closed mid-session loses nothing; and
the parts that are genuinely hard (auth, ordering, a card deleted on another device) stay in server
code that can be read and tested. *Amendment 1: the queue is IndexedDB, not localStorage.* The decision above said "one synchronous
localStorage write per answer", and the queue that shipped is `lib/offline/db.ts` with
`lib/offline/outbox.ts` over it: a durable store rather than a five-megabyte string bag that a
browser clears under pressure. It also has to be closable, which localStorage never was, because
signing out on a shared machine has to leave nothing behind and a held connection keeps a delete
waiting until the tab dies. Nothing else in the decision changed: one entry per answer, its own
timestamp, replayed in order.

*Rejected:* Background Sync in the worker (replaying an
authenticated Server Action from a worker means reimplementing the session, for a browser API Safari
still does not have) and IndexedDB (asynchronous writes can be lost by a closing tab; the payload is
tiny).

**ADR-016: Games write to the same review log as review does.**
*Context:* Case Sprint, Listening and Match are there to make practice enjoyable, which invites the
usual arrangement where a game keeps its own score and touches nothing real. *Problem:* a mode whose
results evaporate is a mode nobody plays twice, and worse, it splits "what I studied" from "what the
scheduler knows". *Decision:* every mode grades through `gradeCard`, so FSRS sees the same evidence
from a match round as from a review. Match rates a pair found first time as Good and one that took a
wrong guess as Hard. Recognising a word among seven others under time pressure is genuine recall,
and pretending otherwise would be as dishonest as pretending it is a full production test.
*Consequences:* games count towards the daily goal and the quests, which is the point; an abandoned
round writes nothing, because nothing was answered.

**ADR-017: Example sentences come from Ekilex usages; exercises rearrange them, never write them.**
*Context:* `13-mvp-status.md` §4 shelved cloze and sentence work because "the dictionary does not
carry example sentences for every word", and generating them was never an option (ADR-005).
*Discovery:* Ekilex's `/word/details` response carries `usages`, attested sentences recorded by
lexicographers against each meaning ("Jõin tassi kohvi.", "Kitsed olid ojal joomas."), flagged
`public` for what may be shown. *Decision:* store them on `Lexeme.examples` (the JSON column the
schema already had), and build every sentence exercise by *hiding* or *reordering* that text:
`lib/estonian/cloze.ts` blanks a form we already hold out of a sentence, and the sentence builder
shuffles its words. English translations are fetched per sentence from the tutor, which is
translation *into* English and therefore inside what ADR-005 permits; they are stored tagged `AI`.
*Consequences:* the app can finally teach a word in context (the single biggest gap a vocabulary
tool has) while every Estonian character on screen is still either attested or the learner's own.
Words already in a deck get their gap-fill cards backfilled when their entry is next opened
(`lib/srs/backfill.ts`), because the sentences arrive after the cards do. *Rejected:* writing a
corpus of our own example sentences, and asking the model for them. Both reintroduce exactly the
failure ADR-005 exists to prevent, one of them with a straight face.

**ADR-018: Speaking practice compares; it does not score.**
*Context:* Speakly and Duolingo both grade pronunciation, and it is the obvious next mode.
*Problem:* scoring needs speech recognition for Estonian. TartuNLP publish the text-to-speech
service this app already uses and nothing comparable in the other direction; the browser's own
`SpeechRecognition` has no dependable `et-EE`. A score invented on top of that would be believed.
*Decision:* `/review/speaking` is shadowing: say it, then play a native rendering and your own
recording back to back and judge for yourself. The audio is a blob URL that never leaves the
browser. The card is graded by the learner on the same 1-4 scale as any flip, because the prompt is
a meaning and the answer is Estonian, which is a production test whatever the microphone does.
*Consequences:* the app has a speaking mode without a lie in it. If a verified Estonian recogniser
appears, this is where it plugs in. *Rejected:* comparing waveforms or durations locally, which
measures the wrong thing and dresses it as a score.

*Re-tested 2026-08-29, and the decision survived on measurement rather than on the old assumption.*
The availability half of the problem statement above is now out of date: TartuNLP do publish a
speech-to-text service, and Groq serve `whisper-large-v3` on a free key, which takes Estonian audio
happily. So the question stopped being "is there a recogniser" and became "is it good enough to
tell somebody their own pronunciation was wrong", and `scripts/measure-asr.mjs` answers it.

The method is deliberately generous. Every utterance is a sentence the dictionary already carries
from Ekilex, spoken by the University of Tartu's own Estonian voice: clean, native, correctly
stressed, no accent and no background noise. A learner's recording is harder than this in every
respect.

**Result: a 14.6% word error rate, with 5 of 25 sentences transcribed exactly.** Four sentences in
five came back with at least one word wrong, on audio a native voice produced perfectly. Worse than
the rate is where the errors fall: `Poiss` heard as `Pois` and `majja` as `maija`, which is
consonant length, the single thing `/review/pairs` exists to teach; `abikaasaga` as `abigaasaga`
and `räägin` as `rääkin`, which is voicing; `Nõukogude aeg` as `Nõukogu taeg`, which is a word
boundary. The recogniser is weakest exactly where the learner is, and a learner cannot tell the
machine's mistake from their own.

So showing a transcript beside the target would report perfect pronunciation as a mistake most of
the time, and would do it most often on the distinctions the app exists to teach. That is worse
than no feature: it teaches a learner to distrust themselves when they were right. The decision is
unchanged and the mode stays comparison-only.

**This is now re-checkable rather than re-arguable.** Run `node scripts/measure-asr.mjs` against a
newer model when one appears. The bar it prints is a 5% word error rate, which is the point at
which a transcript could be shown with its caveat stated; anything above that stays out of the
learner's way. Nothing about this decision needs to be taken on trust again.

*A general multimodal model is the open question, and it is open rather than answered.* Gemini
takes audio directly and is a different architecture reaching the same task from the other side,
so `--backend gemini` exists to measure it on byte-identical audio. On the handful of sentences
that got through before the free tier's quota stopped the run, it transcribed `Poiss ronis üle
aia.` exactly, which is one of the sentences Whisper turned into `Pois`. That is interesting and
it is not a result: the sample was too small to be one. **No number for Gemini is recorded here on
purpose.** The quota is twenty requests a minute and tighter in practice, which is also a finding
in itself, since a recogniser that cannot be called more than that is not one a class of learners
could share. Finish the measurement on a paid key, or when the quota resets, before believing
anything about it.

*The script refuses to flatter a recogniser, because the first version did.* A run whose sentences
were mostly refused reported a 2.0% word error rate over the three that survived and read as a
fifteenfold improvement. It now names how many sentences were actually measured and exits without
a verdict below two thirds of them, on the same reasoning as the browser suites' counting harness:
a measurement that silently shrinks its own sample is worse than no measurement.

**ADR-019: A class is a view over what learners already own.**
*Context:* the app is used in real Estonian courses, where the teacher's actual question is "who is
keeping up" and the students' is "where is this week's homework". *Decision:* `Classroom` +
`ClassroomMember` hold a name, a join code and a membership, and nothing else. Every figure a teacher
sees is computed from the learner's own rows at request time (`lib/classroom/roster.ts`); no cards,
reviews or tasks are copied into a class, and leaving deletes one membership row and nothing more.
Assigning a unit writes a `Task` into each member's own list rather than inventing a parallel
assignments system. *What a teacher may see is deliberately bounded:* reviews this week, streak,
words known, how long since the last review, and the cases the class is weakest at **in aggregate**.
Never an individual's searches, deck contents or answer-by-answer mistakes. *Consequences:* the
privacy promise is enforceable by reading one file, joining is the only consent needed and it is
revocable, and the feature adds no new failure mode to the daily loop: with no class, nothing about
the app changes. *Rejected:* a teacher-owned deck pushed to students (it makes the teacher the owner
of everyone's scheduling, which is exactly what FSRS must not have) and per-student answer logs (a
study tool that becomes surveillance stops being used honestly).

*Amended, 2026-08:* what a teacher may see now also includes each student's own weakest case, as a
rolled-up percentage over that student's own reviews (`RosterEntry.weakestCase`), gated on a minimum
review count so one bad card cannot name anybody. This is **not** the per-student answer log rejected
above: it carries a case and a percentage, never a specific answer, a search, or a card, and it is
still computed at request time rather than stored. The argument that moved: the class-wide aggregate
told a teacher *that* the class struggles with the partitive and nothing about *who* to sit with
during it, which is the harder problem in a room of twenty-five, and a teacher who already sees a
name, a streak and a word count is not meaningfully better protected by withholding the one
actionable fact alongside them. The join screen states this before joining, and leaving still deletes
one membership row and nothing more.

**ADR-020: The placement check is assembled from the dictionary, marked without a model, and
reports a level it refuses to certify.**
*Context:* onboarding asked a stranger to self-rate as A1 to B2 and used the answer to pick their
first units. That is the one question a beginner is least able to answer, and every downstream
number, including the timeline this pass added, inherits the guess. *Decision:* a check that
measures four skills, at `/assess` and inside first run, built out of `Lexeme`, `Form` and the
recorded `usages` the dictionary already holds. Reading is asked as meanings, as a gap in a
recorded sentence with four forms of one word to choose between, and, where a translated sentence
exists, comprehension; listening is a word and then a whole sentence with nothing written down,
plus dictation; writing is the same gap, typed; speaking is shadowing.

**Amendment 1 (2026-08-31): no question names a case.** The first version asked which case an
ending marked, which form a case called for, and which case a verb governed, and it was wrong on
three counts. Nobody is examined that way: the state examination's published reading tasks are
`valikvastustega ülesanne`, `valikvastustega lünkülesanne` and `sobitamine`, and the placement
tests Estonian language schools set are almost entirely the middle one, a sentence with a hole in
it and three or four forms of one word under it. The government question was worded as a fact the
dictionary could not support, asking what case a verb "demands of its object" about 45 entries
that are nouns or adjectives and about verbs like `kõlbama` that take no object at all. And 18 of
those questions offered a second genuinely correct case as a wrong answer, because a word's
government string names every case it governs while the distractors were drawn from all of them:
`segama` governs the partitive and the comitative, and a learner who knew the comitative was
marked wrong for it. So the questions are gaps now, in sentences a lexicographer recorded, which
`lib/estonian/cloze.ts` already hid words out of for the mock exam. A case is named in the
explanation *after* an answer, where it is a cross-reference for somebody also taking a course,
and `scripts/test-invariants.ts` fails on one in a question. *The paper is eighty questions and every number in it was measured*:
six reading and six writing at each of the five bands, three listening and one spoken. It was
nineteen at two per band per skill, and two four-option questions cannot decide a band, because one
lucky guess moves it from half to full and one slip moves it back. Learners at each true level were
simulated against papers built from the shipped dictionary: the old paper placed 43% of them
correctly and put 57% *below* where they were, and this one places 97, 98, 93, 85, 80 and 72
percent from pre-A1 to C1. Three things came out of that sweep. Two thirds has to be a score
somebody can reach, so a band size is a multiple of three and 4 per band measured *worse* than 3.
Writing is the noisiest of the three skills, because its answers are typed and nothing puts a floor
under a band the way four options do, so at a fixed eighty items spending them there beat spending
them on listening or on reading. And the overall level is drawn from three skills, so noise in
any one of them lands on the result, which is why raising reading alone took it only to 52%. Questions climb the bands in order and a skill asks at most one band above
the first band it was not passed at, and nothing above one that came in under half, so a beginner
answers a dozen questions and somebody at C1 answers all sixty, which is the paper each of them
needed. *The level is the highest band passed consecutively from the bottom*, which is the rule
those tests score on and was not the rule here: the old one climbed past any band between half and
two thirds, so A1 at 100%, A2 at 55% and B1 at 70% reported B1 over a band the same screen printed
as failed. *Three rules make the result trustworthy.* **No Estonian is written for it**: every
form is retrieved, stored or derived from the genitive stem by the app's own derivation, and every
question says which (ADR-005, ADR-017). **No model marks anything**: a choice against a stored
index, a dictation against the recorded sentence, a written sentence against a form the dictionary
vouches for, which is the same ordering `/review/write` already uses. **Speaking is never scored**
(ADR-018): it collects the learner's own rating, reports it as theirs, and is excluded from the
level entirely, which `scripts/test-invariants.ts` asserts. *The level itself is the average of the
measured skills, floored* (amendment 2); the strongest is reported beside it so the flattering half
is not lost. *Consequences:* the result is
`Assessment`, the second table after `Review` that is written once and never edited, and the third
exception to "progress is derived" (ADR-014) after a personal best and a shield date, because a
measurement of answers that were never cards cannot be recomputed from the review log. The questions
are drawn from words the learner does **not** have in their deck wherever there are enough of them,
so the check measures their Estonian rather than their revision. **Amendment 2 (2026-09-02): the overall level is the average of the measured skills, not the
weakest.** The original rule read the floor, on the reasoning that a CEFR level is a claim about
everything a person can do at it. That is a good argument about a certificate and this screen says
twice that it is not one. What the rule did in practice was report a sitting of B2 reading, A1
listening and B2 writing as **below A1**, which is three bands under any honest reading of that
learner, on the one screen whose whole job is telling somebody where they stand. A minimum takes
the noise by construction, and one skill can miss for reasons that are not the learner's level:
listening abandons itself when the speech service will not answer, and writing is the noisiest
skill in the paper by measurement, because its answers are typed and nothing puts a floor under a
band the way four options do. So `overallFrom` takes the mean of the scored skills over
`rank` and floors it. The floor is the cautious half of the old rule, kept, and it is what the old
rule was reaching for. Where the average lands at least half a band short of the next one, the
result names it: *a confident A2, and nearly B1*, which is the true sentence about a sitting that
fell between two bands and is deliberately rare, because a caveat printed on every result stops
being read. The strongest skill is still reported beside the level. *Consequence:* `overall` is a
**derivation** from the per skill columns rather than a measurement of its own, so
`readOverall` in `lib/progress/assessment.ts` recomputes it for stored rows and the history list
does not show two rules side by side. The per skill columns are the measurement and are never
touched, which is what keeps `Assessment` append-only in the sense that matters.

*Rejected:* marking with a model
(a hallucination that marks a right answer wrong on somebody's first day destroys the only trust
this app has), a single number rather than a profile (it hides which skill is behind, which is the
one actionable thing here), and scoring the recording (see ADR-018; the absence of an honest
recogniser did not change because a test wanted one).

*Amendment 1 (a wrong answer is chosen, not shuffled).* The three rules above make a mark
trustworthy and say nothing about whether the question was worth marking. The wrong answers were
taken from the whole dictionary in shuffle order, so a beginner asked what `must` means chose
between "black", "plastic bag", "narcomania, drug addiction, substance abuse" and "user
experience", and 99% of the meaning questions over sixty pools carried at least one option that
could be crossed out on part of speech, on a band two or more away, or on the number of senses in
the line. A level built on questions answered by elimination is wrong about somebody's Estonian on
the day they are deciding where to start. `lib/questions/distractors.ts` ranks each candidate on
what a learner cannot eliminate it by: for a gloss the course unit that teaches the word, the part
of speech, the band and the shape of the line; for a form how much of the stem it shares; for a
sentence the words it shares with the answer. It ranks
rather than filters, so the set of questions that can be asked is unchanged and only the choice
among the survivors moves, and the test of what counts as the same answer got stricter as the
options got closer, never looser: a shared content word for a gloss, containment for a sentence,
and no sentence offered against another recorded under the same headword.

**ADR-021: A photograph is read by a model; whether it is *believed* is decided by the dictionary.**
*Context:* half of an Estonian course is on paper (a handout, a textbook page, a list copied off a
whiteboard) and typing it back in is the step where a learner stops. Reading it needs optical
character recognition, and the only recogniser available here is a model, which is the one thing
ADR-005 says may never supply an Estonian form. *Decision:* separate the two claims. The model
transcribes and nothing more (`lib/scan/extract.ts`, pure, no database, no network); every string it
returns is then resolved against the dictionary by `matchEstonianForm`, which accepts only an exact
lemma, a diacritic-folded lemma, a stored form or a regular case built on a genitive stem, and
rejects everything below that. A word the dictionary vouches for becomes cards from its own
principal parts and its retrieved forms, so nothing the model wrote survives into the card. A word it does not
recognise is shown as exactly that, editable beside the paper, and reaches the deck only once a
person has ticked it, the same standard the paste importer has always met, since there too a human
vouched for the list. *The picture is never stored:* it is decoded in a Route Handler, sent once, and
dropped, exactly as the cloze exercise treats a pasted passage. A photograph of homework has a name
at the top of it. *Consequences:* a homework page full of inflected forms resolves to headwords and
says which case each was (`toas` → the inessive of `tuba`), which is the feature rather than a
side effect; a page becomes a named set that drills through the ordinary review session rather than
a private quiz (ADR-016); and the failure mode of a bad photograph is a short list, never a wrong
flashcard. *Rejected:* trusting the transcription because reading is not writing (a misread and an
invention are indistinguishable by the time either reaches the scheduler), a fuzzy match to rescue
more words (a prefix match hands somebody a card for a word that is not on their paper), and keeping
the image to re-read later (it buys a retry and costs the one promise worth making about somebody's
homework).


**ADR-022: The mock examination is assembled from the dictionary, marked mechanically, and says
where it stops imitating.**
*Context:* the reason most people learn Estonian in the first place is a paper: A2, B1, B2 or C1,
sat at the Education and Youth Board, sixty percent to pass, and a zero in any one of the four parts
fails the whole thing however the other three went. An app that teaches Estonian and cannot tell
somebody which of those they could pass today is answering a smaller question than the one being
asked. *Problem:* a mock exam is the single most tempting place in this codebase to break ADR-005. A
model would produce four reading passages and thirty questions in a second, and roughly one form in
every ten would be invented, and it would be invented inside the one artefact a learner will treat
as a measurement rather than as practice. *Decision:* three separations, and each one is asserted.
**The paper is assembled, never written**: `lib/exam/paper.ts` only hides, shuffles and surrounds
sentences Ekilex recorded, exactly as `lib/estonian/cloze.ts` already does for a single exercise, and
what the dictionary cannot fill is reported as a shortfall rather than quietly dropped, with each
part marked out of what was actually set. **The marking is mechanical**: every mark in
`lib/exam/score.ts` comes from a comparison with a form the dictionary vouches for, so that module
imports no provider and makes no request; Anu reads a composition back afterwards, on request, and
her note carries no marks and is withheld whole if it quotes a form nobody can vouch for. **The
imitation declares itself**: the frame is real and cited (parts, minutes, points, the pass rule),
the questions are the app's, each task names the official task it stands in for, and the spoken part
says on every screen that the learner is marking themselves because ADR-018 still holds. The sitting
grades through `applyGradeBatch` like every other mode (ADR-016), and `ExamAttempt` is the second
exception to "progress is derived" (ADR-014) for the same reason as a personal best: a sitting under
a clock, in four parts, with the answers withheld, is not reconstructible from the review log.
*Consequences:* a paper is only as long as the dictionary can make it, which is visible rather than
hidden, and a keyless deployment gets a shorter honest paper instead of a full invented one. The
confidence figure beside each level carries an evidence tier and a ceiling, so a learner with ninety
reviews cannot be told the app is ninety percent sure of anything. *Rejected:* generating passages
and questions with a model (ADR-005, and the failure would be invisible precisely where it matters
most); scoring an unset part as zero (it fails a candidate for a gap in the dictionary, and trips the
one clause that is supposed to mean "you did not attempt this"); and letting the client send its own
marks (a result anybody can type is not a measurement).

*Amendment 1 (the wrong answers are ranked, and checked against the right one).* The rules above
make a mark trustworthy and say nothing about whether the question was worth marking, which is the
same gap ADR-020 amendment 1 closed in the placement check. Four of this paper's tasks offered the
first three options a shuffle handed back: 90% of the meaning questions carried one that could be
crossed out on part of speech, band or the shape of the line, and a spoken word was hidden among
three drawn at random from the deck rather than among three spelled anything like it. Worse, the
meaning task had no test of what counts as the same answer at all, so a deck holding `auto` and
`masin` could offer "car, automobile" against "car, machine" and mark a candidate wrong for
choosing the other. All four now rank through `lib/questions/distractors.ts`, the module the
placement check reads, and the meaning task checks each option against the answer first. The gap
task keeps the rule it already had, that a form of the word being asked about outranks a form of
any other word, since the ending is what it is testing; the module supplies the order of the
strangers it falls back on. The counts of questions asked are unchanged, because this ranks the
candidates rather than filtering them.

**ADR-023: A grammar point is named the way a class names it, and the Latin name is the
cross-reference.**
*Context:* the reference layer, the dictionary, the flashcards, the placement check and the mock
exam all name cases and verb forms, and every one of them held the Estonian name and the question
word already: `cases.ts` has carried `et` and `question` since the domain model was written, and
`morph.ts` has carried `olevik` and `lihtminevik` for as long as there has been a table of forms.
*Problem:* all of them led with the English or Latin name and demoted the Estonian one to small
italics, a hint or a bracket. Estonian is not taught that way anywhere. A course, a school textbook
and the state examination name a case by its Estonian name and, more often, by the question it
answers, and they name the verb by `aeg`, `kõneviis`, `tegumood` and `pööre`, four axes kept apart,
of which only two are tenses the verb inflects for. So the app was teaching a private vocabulary: a
learner drilled on "tuba → inessive" and told their weakest case was "the comitative" had been given
words their own teacher will not say, and the reference called `lihtminevik` "the imperfect", which
is a Latin category Estonian does not have. The placement check was the sharpest version, offering
somebody in their first week "Inessive, Elative, Allative" as multiple choice. *Decision:* flip the
hierarchy everywhere rather than delete a name. The Estonian term and the question lead; the English
name stays, labelled as what it is, because a learner reading an English reference grammar needs it
and this app is written in English. `lib/estonian/terms.ts` is the one table of what a point is
called, keyed by the topic ids `grammar.ts` already uses and falling back to `cases.ts` for the
fourteen cases, so a heading does not have to know whether it is looking at a case or a mood. It is
deliberately partial: a point is in it only where a class actually has a term, and `irony` correctly
has none. `grammar.ts` keeps its "no Estonian at all" tripwire, which is the reason the terms live
in a neighbouring module rather than in the prose; `terms.ts` has the mirror-image tripwire, holding
every entry to the shape of a term rather than of a form. *Consequences:* three hand-typed English
label tables in `search.ts`, `actions.ts` and the minimal-pairs page collapse into one derived
`formName()` in `morph.ts`, so `toas` now resolves as "seesütlev (inessive) of tuba" in every one of
them at once. Cards already in a deck keep the front they were generated with, since `Card.front` is
stored; only new ones are asked the new way, which is the same latitude every other prompt change
has had. Anu is told to name a point Estonian-first as well, and that instruction sits beside the
one that was already there asking her to use both. *Rejected:* removing the Latin names, which would
strand anyone using an English grammar or a Wiktionary page and buys nothing; renaming the topic ids
to Estonian, which reads better in a URL and would rewrite 83 syllabus entries and break every
bookmark for a slug; and inventing an Estonian term where a course does not have one, which is the
same failure as inventing a form, one level up.


**ADR-024: The dictionary's suggestion row is chosen for the moment, and the dictionary decides
which words it is allowed to choose.**
*Context:* the empty state of `/dictionary` offers a dozen words to look up, and it is the answer to
"what is this for", asked by somebody who has typed nothing. It read `ORDER BY lemma ASC` with a
twelve-row window inside the first forty, so for the whole life of the app that answer was
`aasialane`, `aastatuhat`, `aatomipomm` and `aberratsioon`. The skip moved by one row a day and
never left the letter A, which is why nobody noticed it was not moving. Three of those four carry no
CEFR level at all: they arrived in the tail of the Wiktionary expansion rather than out of the
course, and nobody learning Estonian has needed the word for an aberration. *Decision:* three
sources, one per render, in a rotating order, with two filters that every source obeys.
`lib/news/` reads the front page of the national broadcaster and produces candidate words;
`lib/collections/topical.ts` maps the day of the year to units of the course; and a random draw over
the graded dictionary is the backstop that is always available, so the row is never empty. The order
is rolled per render rather than fixed, because a fixed order means the sources behind the leader
are only ever seen when the leader fails, and a seasonal row nobody sees in a year is a feature that
rots. A source has to fill most of the row on its own or it is passed over: a row labelled "In the
news today" whose last four words came from a random draw would be a caption that is true of two
thirds of what is under it. Every row says which of the three it is, because words that change
without saying why read as noise. *The news source is ADR-021 again, on a second path where Estonian
this app did not write arrives from outside.* A headline proposes; `matchEstonianForm` decides, at
the same confidence floor a photographed page has to clear; and what is offered is the dictionary's
own headword, never the spelling the headline used, so `ettepaneku` becomes `ettepanek` with a whole
case table behind it. Nothing of the learner's goes out with the request, which is why the feed is not
a recipient on `/privacy`: it asks for a front page and would ask for the same one if nobody were
signed in. It is cached for an hour, single-flighted, given 1.5 seconds, and every failure is
silent, because two sources sit behind it. A feed that will not answer is written down as a miss for
ten minutes, which is the rule the seed and `enrichFromEkilex` both learned the expensive way.
*The two filters are why `aberratsioon` cannot come back.* A suggested word carries a CEFR level,
which is not a guess about difficulty but the record that the course or the graded seed vouched for
it; and it is a noun, a verb or an adjective, which are the entries with a case table behind them, and
a case table is what the chip opens. *Consequences:* the seasonal table names unit ids and never
lemmas, so no Estonian is authored for it and a misspelling cannot ship (ADR-005); a word is offered
inside the band around the level the learner placed at, so a beginner is not sent to a C1 headword;
and the row changes when somebody comes back to it, which is the whole of what makes it worth a
second look. *Rejected:* a plain `ORDER BY random()` with no filters, which fixes the alphabet and
keeps `aberratsioon`; asking a model for topical words, which is ADR-005 with extra steps; topping a
thin source up from the random draw, which buys four chips and spends the caption; and putting the
feed on the recipients list, which would make a page about personal data harder to read by naming a
service that receives none of it.
