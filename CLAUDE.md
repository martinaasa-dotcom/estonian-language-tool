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
5. `docs/14-design-system.md` — the visual language: palette, tokens, motion, and what each colour
   is allowed to mean. Read it before adding a colour, a radius or a shadow.

## Rules that are not negotiable

**Never ship a credential to the client.** The Anthropic and Ekilex keys live only in server-side
Route Handlers and server actions. Nothing gets a `NEXT_PUBLIC_` prefix unless it is genuinely
public. CI greps the build output for key patterns, and that is true now rather than aspirational:
the `secrets` job in `.github/workflows/ci.yml` builds with a marked string in every server-only
variable and greps `.next/static` for it, so a leak names which variable leaked. It was verified
both ways, clean on the bundle as it stands and failing when a value was deliberately given a
public prefix and read from a client component, because a check nobody has made fail once is a
check nobody knows the state of.

**Never write Estonian.** Not morphology, not example sentences. Forms come from Ekilex or the
seeded principal parts; example sentences come from Ekilex `usages` and are only ever *hidden* or
*reordered* to make an exercise (`lib/estonian/cloze.ts`). The model may translate into English and
explain grammar; anything Estonian it produces in chat is boxed and tagged, and never stored as a
form. (ADR-005, ADR-017.) The one module that writes *about* Estonian at length,
`lib/estonian/grammar.ts`, holds no Estonian at all — every form on the grammar pages is read from
the dictionary by `lib/progress/caseExamples.ts` and rendered with its provenance.

**The built-in dictionary is built, not typed.** `scripts/expand-seed.ts` produces
`prisma/data/expanded.json` from two sources with a strict division of labour: every Estonian
form and every example sentence comes from Ekilex, every English gloss from Wiktionary, and the
script only joins them. No model writes a character of it. It loads through `prisma/expanded.ts`
as a cache warm-up with `ON CONFLICT DO NOTHING`, never an update, so a hand-written entry, a
learner's correction and a live Ekilex fetch all win over it. Regenerating is resumable and
caches every answer, and a source that will not answer is never written down as a miss: that bug
cost four fifths of the dictionary on the first run and looked like a clean result.

**The syllabus names words; Ekilex decides whether they exist.** `lib/collections/syllabus/` is
the course, and a lemma in a unit is a *request*, not a fact. `scripts/harvest-ekilex.ts` asks
Ekilex for each one and keeps only what comes back with a paradigm matching the part of speech
asked for; anything else is dropped and reported. So a misspelled or imagined word cannot reach
the dictionary, it can only fail to arrive, loudly. That is what let the vocabulary grow from 360
to 1,248 words without a single generated form. The English gloss is the only authored column
in the whole pipeline, and English is the one language this project may write.
`lib/collections/syllabus/syllabus.test.ts` fails if a unit names a word the harvest did not
bring back, which is what makes this mechanical rather than aspirational. Re-run the harvest with
`npm run harvest`; responses are cached, so it costs Ekilex nothing.


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

**A photograph is read by a model; whether it is believed is decided by the dictionary.** Scanning a
page (`/scan`) is the one path where a model unavoidably looks at Estonian, and it does not get an
exception. `lib/scan/extract.ts` transcribes and is pure: no database, no network, and every string
it returns is a *candidate*. `matchEstonianForm` in `lib/dict/search.ts` decides, and accepts only
an exact lemma, a diacritic-folded lemma, a stored form, or a regular case built on a genitive stem
(`VOUCHED_SCORE`); a prefix match is right for a search box and wrong here, because it hands
somebody a card for a word that is not on their paper. A vouched word brings its own principal parts,
so nothing the model wrote survives into the card. An unvouched word is shown as exactly that,
editable beside the paper, and reaches the deck only once a person has ticked it, which is the same
standard the paste importer meets. Do not loosen the match to rescue more words. (ADR-021, asserted
in `scripts/test-invariants.ts`.)

**The photograph itself is never stored.** It is decoded in a Route Handler, sent once and dropped,
exactly as the cloze exercise treats a pasted passage. `Scan` holds the confirmed word list and has
no column an image could go in; the invariant suite fails if one appears, and if the scan route ever
writes to the database at all. A picture of somebody's homework has their name at the top of it.

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

**Review must work offline.** It is the daily path, and it may not depend on any network call.
A grade that cannot reach the server goes into the IndexedDB outbox (`lib/offline/db.ts`) and is
replayed in order by `replayGrades` with the timestamp it was actually answered at — never dropped,
never re-stamped. Replay is idempotent because the client generates each grade's id. Anything added
to the review path must survive `navigator.onLine === false`, and `scripts/smoke-offline.mjs`
checks that in a browser. (ADR-015.)

**AI spending is always metered.** `lib/usage` has no off switch and fails closed, because sign-up
is open by default. Any new path that calls a paid provider goes through `authoriseCall` before the
call and `recordUsage` after it. An unrecognised model prices at the dearest rate in the table — a
cap that fails open is not a cap.

**Nothing in a `"use server"` file may take an owner id from its caller.** Every export there is a
public endpoint. Resolve the owner with `requireUserId()`; if a helper needs one as a parameter, it
belongs in `lib/`, not in `app/actions.ts`. See `addCardsFor` and `applyGradeBatch` for the shape.

**The shared dictionary is shared; a deck is not.** `Lexeme` and `Form` are reference data every
learner sees, so an edit to one is an edit for everybody — it is attributed (`editedBy`), it may
replace only the principal parts, and it must never touch a retrieved Ekilex paradigm. Anything
scoped to a person — cards, reviews, tasks — is always filtered by `ownerId`, including in an
`updateMany`. `lib/dict/edit.itest.ts` exists because all three of those were once wrong.

**Progress is derived, never stored.** XP, levels, streaks, quests and every chart are computed from
the append-only review log on each request (`lib/gamification/`, `lib/stats/`, `lib/progress/`).
Do not add a counter column. A stored score is a second source of truth that drifts, and it can be
awarded for something that never happened. The only exceptions are values no log can reconstruct: a
personal best, and which days a streak shield has already covered. (ADR-014.)

**Every mode grades through `gradeCard`.** Sprint, Listening and Match are not side games with their
own scores — they write to the same review log, so the scheduler sees what was actually practised.
An abandoned round writes nothing. (ADR-016.)

**Every mutation goes through the forged-request gate, and it is not an `/api/` rule.** Every
mutation a learner makes here is a Server Action, which is a POST to a *page* path, so a gate
inside an `isApi` branch would be watching the quiet door. `lib/security/sameOrigin.ts` reads
`Sec-Fetch-Site` first (a browser sets it and page script cannot), falls back to comparing
`Origin`'s host against `Host`, and **allows a request carrying neither**: that is not a browser,
so it has no ambient cookie to forge with, and refusing it would break every server-to-server
caller for nothing. It runs before the auth branch in `middleware.ts`, because a redirect keeps
the method and the body. The Content Security Policy is set there too, on every response
including the refusals; the static headers are in `next.config.ts` so they cover the files the
matcher skips. `Permissions-Policy` keeps `microphone=(self)` on purpose: speaking practice
records, and denying it would switch that off with no error anybody could act on.

**A cap on a shared quota is charged to the learner, never to their address.** `/api/tutor`,
`/api/tts`, `/api/share` and `/api/export` all go through `lib/security/rateLimit.ts`. Twenty-five
students on one school network are one IP and a review session asks for audio on nearly every
card, so per-address counting would refuse a whole classroom in its first few seconds. `/api/tts`
also joins an identical request already in flight rather than making a second one: the disk cache
is consulted before the call and written after it, and the gap between those is exactly where a
class starting the same unit together lands.

**Local mode is a deployment shape, not a switch.** With no Supabase keys the app runs as a single
local learner; with them, every route is gated. It keys off the absence of configuration only —
never add a flag that can disable auth on a deployment that has it. (ADR-013.)

## Conventions

- TypeScript `strict` plus `noUncheckedIndexedAccess`. No `any` without a comment justifying it.
- `lib/assessment/`, `lib/estonian/`, `lib/gamification/`, `lib/stats/`, `lib/collections/`,
  `lib/time/`, `lib/offline/`, `lib/security/`, `lib/scan/` and `lib/copy/` stay free of React,
  Next.js and Prisma — pure functions, unit tested. Anything that
  needs the database lives in `lib/progress/` or a route.
- Data that drives UI but holds no JSX (badges, path units, quests) carries a lucide icon *name*;
  `components/icons.tsx` is the only place that turns one into a component.
- Settings go through `lib/settings/store.ts`. No new string keys scattered through pages. The five
  goal keys (`goalReason`, `goalTarget`, `goalDeadline`, `goalDays`, `goalNote`) are declared there
  and nowhere else, and an invariant checks it.
- Server actions for mutations; Route Handlers for streaming and third-party proxying.
- Every new view implements all four states from `docs/08-ux-ia-a11y.md` §4 (empty, loading, error,
  offline). A view without an empty state is not finished.
- Unit tests stay hermetic: no database, no network, no clock you do not control. Anything needing
  Postgres is an `*.itest.ts` under `npm run test:db`. The unit suite gates every commit and must
  stay fast enough that nobody is tempted to skip it.
- **No em dash or en dash in anything a person reads**, anywhere in `app/`, `lib/`, `components/`
  or the README. A dash used as a clause break is the loudest single tell that a sentence was
  generated, and every screen here is one person explaining Estonian to another.
  `lib/copy/readerCopy.test.ts` walks the whole tree and fails on one; its `ALLOWED` list is three
  files where the character is data, and a test fails if an entry there stops containing one, so
  it cannot become a parking space. Replacing a dash between two independent clauses with a comma
  makes a splice and reads worse than the dash did: use a full stop. A separator in a label takes
  the middot the app already uses.
- **Some code reads a dash rather than writing one, and a sweep cannot tell those apart.** The word
  list separator in `ImportPanel` and the punctuation class in `lib/estonian/dictation.ts` were
  both rewritten once, silently: a pasted list stopped splitting and a stray dash in an Ekilex
  sentence became a word the learner had to type. Both are named constants written with escapes,
  and `readerCopy.test.ts` asserts they still read all three characters.
- **An empty cell says `NO_VALUE`, which is "n/a"** (`lib/copy/values.ts`). It was an em dash,
  which is now the one banned character; a bare hyphen is worse, since in a paradigm table it
  reads as a one-character form and beside a percentage as a minus sign whose digits failed to
  load. `lookup.ts` still recognises all three spellings a stored translation may carry, because
  the dictionary is seeded data that outlives a deploy.
- **24-hour clock everywhere** (`lib/time/clock.ts`), never am/pm. Estonia writes the time that
  way and so does every country whose language this app teaches, and a reading that changes shape
  with the browser's locale is one a teacher and a student cannot compare. `hourCycle: "h23"`
  rather than `hour12: false`, which renders midnight as "24:00" in en-US.
- Style through the tokens in `app/globals.css`, never with a raw hex. The five hues carry fixed
  meanings (`docs/14-design-system.md` §1) — mint is "recalled", peach is "missed", and neither is
  free for decoration.
- Signed-in routes live in `app/(app)/`; pages that own the whole screen — the landing
  page, sign-in, first-run setup — live in `app/(chromeless)/`. A new public page has
  to be added to the allowlist in `middleware.ts` as well.
- Every interactive element is keyboard-reachable with a visible focus ring, and under a coarse
  pointer every one of them clears 44px.
- **The root element declares no overflow.** Setting either axis on `html` makes it a scroll
  container, and every library that positions a floating element works in document coordinates
  instead of viewport ones when it is: a menu hung off the sticky rail or the fixed phone bar is
  then drawn one scroll offset from where it belongs, which on a scrolled phone means open,
  focused and off the top of the screen. Sideways is still clipped, on `body`.
- **Nothing may be `position: fixed` over moving content and carry a `backdrop-filter`.** That
  pairing re-filters its backdrop every frame of every scroll; Upside Lab measured it at 42
  repainted frames in one pass down a phone screen, the worst a third of a screen behind where the
  page was. The phone bar is a solid fill for this reason, and the pull-to-refresh ring carries no
  filter.
- **Nothing pinned to the bottom of the window types its own offset.** `lib/layout/dockClearance.ts`
  measures the phone bar and publishes `data-dock` and `--dock-clearance` on `<html>`, and only
  while it is drawn; `.bottom-notice` and `.dock-pad` read those. A `:has()` selector would answer
  yes for a `md:hidden` bar in the DOM drawing nothing, which is how three notices ended up
  floating most of an inch up an empty landing page.
- **`overscroll-behavior-y: none` is load-bearing and it took the browser's pull to refresh with
  it.** There is no setting that keeps one and not the other, and installed to a home screen this
  app has no address bar and so no reload button anywhere in it. `components/PullToRefresh.tsx` is
  the gesture put back under our own control. It settles on the router's own request landing,
  observed through resource timing, **not** on `useTransition`'s pending flag: measured here that
  goes true and never comes back, which would have turned the ring for its full eight second
  ceiling on every pull.
- Estonian text inputs get the diacritic bar.

## Model configuration

**Provider-agnostic, and it is a chain rather than a choice.** `resolveProviders()` returns every
key in `.env` in order, free first: OpenRouter (default), Anthropic, then OpenAI. Do not re-pin a
single provider. `openWithFallback` walks past a provider that is throttled or having a bad
minute, and never past a rejected key or a model that does not exist, since every provider would
answer those the same way and trying them all turns one clear message into a slower one. A
provider is only ever walked past **before it has said anything**: once text is reaching the
learner a failure stays a failure, because a second answer appended to half of a first one is two
teachers talking over each other. `withRetry` is patient only on the last link of the chain, which
is where waiting is the only option; on every link before it, moving on costs one request and
sitting through 4.5 seconds of backoff against a provider that has already said no costs 4.5
seconds. The Anthropic path keeps a `cache_control` breakpoint on the static Estonian system
prompt. This supersedes the original ADR-004; see `docs/13-mvp-status.md` §2.

**Reading a picture uses whichever model the deployment already configured.** Not a better one
chosen behind the operator's back: turning the camera on must not move a free-model deployment onto
a paid one, and the free chain that is now the default is text-only. `OPENROUTER_VISION_MODEL`,
`ANTHROPIC_VISION_MODEL` and `OPENAI_VISION_MODEL` are how that choice is made, and they affect
scanning and nothing else. The chain is deduplicated by model first: OpenRouter contributes a link
per free model, so an override would otherwise ask one model the same question three times and read
the third refusal as having exhausted the chain. The image path
falls back more readily than the chat path does, and deliberately: `openWithFallback` refuses to
walk past a 400 because every provider would refuse a malformed request the same way, but whether a
model can see is a fact about that one model, so `completeWithImage` walks past everything except a
rejected key.

**Which model answered is a fact about the answer, so it travels with it.** Never the head of the
chain: a screen naming the wrong model is worse than one naming none. The handshake finishes
before the response head is written, which is what lets `x-model-provider` and `x-model-id` be
headers at all; the chat reads them back and the line under the conversation says "Will ask" until
a reply has arrived and "Answered by" after. A trailer was tried and is not an option, because no
browser exposes one.

**Anu's English is cleaned on its way past, and her Estonian never is.** `lib/tutor/humanize.ts`
strips dashes used as clause breaks and stock openers. It streams, holding text back only where a
rule could still change it, so it costs the learner nothing they would notice. `FIX:` and `VOCAB:`
lines pass through byte for byte: rewriting punctuation inside a corrected sentence would be the
app editing Estonian, which is the rule the whole project is built on. The first version of the
stream got that wrong in the way only a test finds, rewriting a corrected sentence one chunk
boundary at a time once the first half of its line had already been shown, so the line's character
is now decided when it opens and carried until it ends.

**A class shows effort, never contents.** `lib/classroom/roster.ts` is the whole boundary: reviews
this week, streak, words known, last-seen, and the group's weakest cases in aggregate. Never an
individual's deck, searches or answer history. Do not widen it. (ADR-019.)

**Never score pronunciation.** Not because none is reachable, which stopped being true, but
because the reachable one is not good enough and that was measured rather than assumed.
`scripts/measure-asr.mjs` runs `whisper-large-v3` over sentences the dictionary already carries,
spoken by a native synthetic voice: clean audio, no accent, no noise, which is easier than any
learner's recording. It comes back at a 14.6% word error rate, and its mistakes land on consonant
length (`Poiss` as `Pois`), voicing (`abikaasaga` as `abigaasaga`) and word boundaries, which is
precisely where an Estonian learner is weakest. Showing that transcript would report correct
pronunciation as an error four times in five. Re-run the script before re-opening the question. It compares recognisers on byte-identical
audio and refuses to report a rate when the service refused too much of the sample, which it
learned by once reporting 2% over three surviving sentences and reading as a breakthrough.
Speaking practice compares a recording with a native rendering and lets the learner judge. (ADR-018.)
The level check has a speaking section for the same reason it has the other three, and it obeys the
same rule: it collects the learner's own rating, reports it as theirs, and contributes **nothing**
to the level. `SCORED_SKILLS` in `lib/assessment/score.ts` names the three that count, and
`scripts/test-invariants.ts` fails if speaking ever joins them.

**A level is never decided by a model, and never built out of Estonian we wrote.** The placement
check at `/assess` is assembled from `Lexeme`, `Form` and recorded `usages`; every question says
which of those its Estonian came from. Marking is a stored index, a recorded sentence, or a string
comparison against a form the dictionary vouches for, in that order, and no provider is reachable
from `lib/assessment/`. A learner meeting this app for the first time cannot tell when the machine
is the one that is confused, so the machine is never the judge. The overall level follows the
**weakest** measured skill, because a CEFR level is a claim about everything you can do at it.
(ADR-020.)

**`Assessment` is append-only, like `Review`.** A sitting is written once when it ends; a later
check is another row, and there is no update path. The one deletion path is the same one `Review`
has, somebody erasing their own account, because the promise on `/privacy` outranks the append-only
rule. It is also the third exception to "progress is derived", after a personal best and a shield
date: a measurement of answers that were never cards cannot be recomputed from the review log.

**A mock exam is assembled, marked mechanically, and says where it stops imitating.** The state
examines at A2, B1, B2 and C1, and `docs/16-exam.md` cites every figure the app repeats about it.
Three separations hold the feature up and all three have an invariant behind them.

The **paper is assembled, never written**: `lib/exam/paper.ts` hides, shuffles and surrounds
sentences Ekilex recorded, the same latitude `cloze.ts` takes, and nothing more. It is deterministic
in (level, seed, pool), which is what lets a reload mid-paper return the same questions and lets the
server rebuild the paper to mark it.

The **marking is mechanical**: every mark in `lib/exam/score.ts` is a comparison against a form the
dictionary vouches for, so that module imports no provider and opens no socket. Anu reads a
composition back afterwards, on request, and her note carries no marks and is withheld whole if it
quotes a form the learner did not write. A model deciding whether somebody is ready to book a real
examination is the exact judgement it is least qualified to make.

The **imitation declares itself**. Each task names the official task it stands in for and the
briefing prints it; the A1 and C2 papers are labelled "not examined" wherever they appear, because
the state sets neither; and the spoken part says on every screen that the learner is marking
themselves. **What the dictionary cannot fill is reported, not dropped**: a task states its
shortfall, a part is marked out of what was actually set, and a part nothing could be set for is
left out of the total rather than scored zero. Scoring it zero would fail a candidate for a gap in
the dictionary and would trip the one clause that is supposed to mean "you did not attempt this".

The client never sends a mark, only a level, a seed and the answers. A result anybody can type is
not a measurement. (ADR-022.)

**A confidence figure carries the evidence behind it.** `lib/exam/readiness.ts` predicts a score per
part and then a chance of clearing sixty percent, as a logistic whose spread widens as the evidence
thins, under a ceiling set by how many reviews are behind the claim: 60 under 150 reviews, 85 under
800, 97 above. A learner with ninety reviews may not be told the app is ninety percent sure of
anything. The tier is printed beside the number, and a paper actually sat outranks the model for its
own level. **The placement check of ADR-020 is the only source that reaches listening and speaking**:
a `Review` row carries no note of which mode wrote it, so a dictation and a flip of the same card
are one row in the log, and without a sat check the hub can only say it has nothing on two of the
four parts. Its per-skill levels are blended in at two thirds, never substituted, because it is ten
minutes long and says so. Its speaking figure is the learner's own rating and is never read as a
level (ADR-018).

## More than one session works this repository at a time

**Read what landed before you merge, not just the conflict status.** On
2026-08-29 three sessions were open at once. Two of them fixed the same bug in
the same two files twenty minutes apart: the demo fixture produced no card with
enough lapses to flag, so the sticking-points panel was empty and the checks
behind it never ran. Both fixes were correct. A clean three-way merge is
exactly what you get when two people build the same thing in different lines,
and that is the case that hurts, because nothing fails and you end up with two
of everything.

When somebody else's work overlaps yours, one of them has to go. Keep the one
that is safer or more precise and **delete the other outright** rather than
leaving both: their fixture entry reaches four lapses in twelve reviews and
says in one entry what two of mine said, and their assertion requires the
sentence to name a count where mine only asked that a word appear somewhere.

It happened a third time the same day, on `lib/tutor/provider.ts`, and that
one is worth reading because the rule as written did not fit it. Two sessions
fixed the same two faults within the hour: a 402 pasting raw OpenRouter JSON
at the learner, and the catch-all under it doing the same for every other
status. Theirs was better in two ways, `reportError` with the provider, model
and status as structured context where mine was a `console.error`, and a 402
thrown as a 402 rather than laundered into a 502 to make it walkable, so
theirs was kept and mine deleted. But "keep one and delete the other" is only
the whole answer when both are the same shape. Mine also carried a clause
theirs had no reason to: a 404 is walkable between models of one provider,
which matters only because this branch made the default a chain of free
models, and a free model is retired without notice. That clause survives on
top of their version. Read what each side is for, not just which is better.

**Then audit what taking their side reverted.** Resolving thirty-nine
conflicts in their favour silently undid four things on this branch, and only
two announced themselves: the typechecker caught the tutor naming the
configured provider instead of the one that answered, and lint caught a script
importing the portable launcher and then calling the sandbox path anyway. The
other two were silent, because a re-run copy sweep turned an em dash meaning
"no value" into a bare comma in a paradigm cell, and `readerCopy.test.ts`
passes on that happily: a comma is not a dash. Grep the markers the branch owns
after any merge that touched its files. `NO_VALUE`, `formatHour`,
`DASH_SEPARATED`, `launchChromium`, `baseUrl`, `scroll-host`, `bottom-notice`,
`useDockClearance`, `PULL_REFRESH_EVENT`, `ProseStream`, `openWithFallback`,
`x-model-provider`, `isSameOriginMutation`, `checkRateLimit`, `markPaper`,
`rawAvailable`, `absentParts`, `standsFor`. Most of them now
have an invariant behind them; that list is what to check when adding one.

## Commands

```
npm run setup            # install + create db + seed (first run)
npm run dev              # dev server
npm run typecheck        # tsc --noEmit
npm run test             # unit tests (Vitest), hermetic: no database, no network
npm run test:db          # integration tests, needs Postgres in DATABASE_URL
npm run test:invariants  # the rules in this file, asserted
npm run check:secrets    # fails if a credential reached the client bundle
npm run db:seed          # reload the built-in dictionary
npm run harvest          # re-ask Ekilex for the syllabus vocabulary (cached, needs EKILEX_API_KEY)
npm run demo             # two months of sample history, for looking at the charts
npm run test:e2e         # every browser suite, needs the server running
npm run test:browser     # the newer browser suites: routes, modes, offline, scanning, a11y

npm run test:browser     # the newer browser suites: routes, modes, exam, offline, a11y
npm run test:mobile      # the phone, measured; needs the server running
```

With no Supabase keys the app runs as a single local learner (ADR-013), which is what makes the
browser suites possible without driving a Google sign-in from Playwright.

**A suite that ran nothing looks exactly like one that passed, so every suite
counts.** `scripts/lib/checks.mjs` gives each one a `check` that tallies what
it reached and a `done` that refuses to pass below a declared floor. Two
faults made that necessary and both are in this repository's history:
`test-design.mjs` hardcoded a port, so anywhere else it threw on its first
navigation, before check one, and printed no FAIL line at all; and
`test-teaching.mjs` gates five checks on the sticking-points panel having
rows, so when the fixture produced none the gate failed honestly and the five
behind it were skipped in silence, one reported failure covering six unlooked
things. The floor is **the count CI reaches**, not the minimum across every
state a database could be in: a floor low enough never to complain is a floor
low enough to miss what it was built for, which was measured by deleting a
block and watching a floor of 30 wave 34 checks through. Against a thin local
database a suite now says so, which is worth hearing. Raise a floor when you
add checks; never lower one to make a run pass.

**A floor is only honest while the count is a property of the code rather than
of the machine.** It was not. `test-teaching.mjs` was measured on a box whose
environment carried `EKILEX_API_KEY` and `OPENROUTER_API_KEY`, so dictation
built a real round and Anu had a text box, and its floor of 38 counted both.
CI has neither key, ran the same correct code, came in at 34, and the floor
read that as a block having stopped running. Lowering it was not available:
the number that lets CI through is the same number that lets a deleted block
through, which is the fault the floor exists for. `absent(n, why)` is the
third outcome beside pass and fail: it lowers the target by exactly n, prints
the reason and the arithmetic, and leaves a block that stops running still
tripping the floor, because nothing waived it. Waiving more than half a suite
fails outright whatever the reasons say. It replaced a `console.log` with the
word SKIP in it, which said the same thing to a person and nothing at all to
the tally, and an invariant now fails on that shape and on a waiver with no
number behind it.

Both of the checks that failed there were **real gaps that only a keyless
deployment reaches**, which is the default one. The dictionary's case table
linked to the grammar reference from the retrieved Ekilex paradigm and not
from the derived table, so without a key that table was a dead end; and Anu's
no-key empty state dropped the question a review card had just handed her, so
the key was the price of even seeing what you were about to ask. Neither was
reachable on a machine with the keys set, which is the argument for running a
suite in the state a stranger installs into.

`scripts/test-mobile.mjs` is the phone measured rather than eyeballed, at 360, 390, 430, 768 and
1280: no horizontal overflow, nothing fixed carrying a filter, the bar's clearance published on
phones and gone above the breakpoint, every target clear of 44px, and the pull gesture driven for
real. `scripts/test-invariants.ts` asserts the rules above, and CI runs it, which is the only
reason it will stay green: Upside Lab kept one that nothing ran and it drifted to twenty-three
failures before anybody counted. Assert the rule, not today's markup.

`scripts/test-assess.mjs` sits a whole level check in a browser, question by question, and checks
the things a unit test cannot see: that every question says where its Estonian came from, that the
listening section abandons itself rather than dead-ending when the speech service is unavailable,
that the result names how few questions it came from and refuses to call itself a certificate, and
that first run reaches the plan before it asks anybody to pick a single word.

`scripts/test-scan.mjs` is the paper path driven end to end, with the model the only thing stubbed:
the picture leaving the device, the confirmation list, a ticked word becoming a card, and the review
session then asking about it. It needs a provider key to be *present* on the server (any string will
do, since the route it would authenticate is intercepted), because with none configured the scan
page correctly offers no camera.

`scripts/test-exam.mjs` sits a whole paper end to end at two levels: the briefing's disclosures, the
per-part clock, one question of every shape, handing in, and the result's per-part breakdown and
answer list. It also checks the hub's confidence figures carry an evidence tier, because a
percentage whose basis is not stated is the one thing this feature must not ship.

`scripts/test-modes.mjs` covers the path, the practice modes, typed answers, undo and the command
palette. `scripts/test-teaching.mjs` covers the half that teaches rather than tests: the grammar
reference (including that every form on it says where it came from), dictation, the printable
worksheet and its answer key, the retention reading, and the shortcut sheet.
`scripts/smoke-offline.mjs` is the one worth keeping green above all: it pulls the plug, grades,
reloads with the network still down, and checks the queue drains when it comes back. It was green
for a while without grading anything. Its driver filtered the multiple-choice options on
`/^[1-4]\S/`, and an option reads "1", a newline, then the word, so the pattern could not match:
the function fell through, returned false into a discarded value, and the outbox read 0 at every
step. Two of the three checks around it are satisfied by 0, and the third is satisfied by the
offline banner, which is up whether or not anything was graded. It answers with the key the card
itself advertises now, and asserts a card was answered before asserting anything about the queue,
because every check after that one reads as an app fault when the answer is no.

CI runs typecheck, lint, the unit suite, the invariants, integration tests against a real
Postgres, the production build, the credential scan and the phone. It is the enforcement behind
the rules above: do not add a rule without one.
