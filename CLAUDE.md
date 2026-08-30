# Working in this repository

## What this is

An Estonian learning app: dictionary, learning path, spaced-repetition review, practice games and a
grammar tutor. `docs/` holds the plan it was built from; `docs/13-mvp-status.md` says what is built,
what is deliberately not, and the known limitations. Read that first, and §6 of it especially. That
is the current state.

## Read before writing code

1. `docs/09-roadmap.md`: what phase we are in and what "done" means for it.
2. `docs/02-estonian-domain.md`: the linguistic model. Non-obvious and load-bearing.
3. `docs/04-data-model.md`: the schema.
4. `docs/03-architecture.md` §6: the ADRs. Do not silently reverse one.
5. `docs/14-design-system.md`: the visual language. Palette, tokens, motion, and what each
   colour is allowed to mean. Read it before adding a colour, a radius or a shadow.
6. `docs/18-voice.md`: how the app speaks. Warm, kind, concise, and never in a way that reads
   as generated. Read it before writing a sentence anybody will see, which is most changes.

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
`lib/estonian/grammar.ts`, holds no Estonian at all. Every form on the grammar pages is read from
the dictionary by `lib/progress/caseExamples.ts` and rendered with its provenance.

**Estonian is taught in Estonian, and the Latin names are the cross-reference.** Nobody teaching
this language says "the inessive". A course in Tallinn, a school textbook and the state examination
all name a case by its Estonian name and, more often, by the question it answers: `kus?`. The verb
is named by four axes a course keeps apart, `aeg`, `kõneviis`, `tegumood` and `pööre`, of which only
two are tenses the verb inflects for. This app had all of that data and led with none of it. Every
screen headed a case "Inessive" and set `seesütlev` in small italics under it; the flashcard asked
for "tuba → inessive" and put the question in the hint; the reference called `lihtminevik` "the
imperfect", which is a Latin category Estonian does not have; and the placement check offered a
beginner "Inessive, Elative, Allative" as multiple choice. A learner who has only ever met the
English names cannot follow their own teacher, which is the one thing a course-shaped app must not
do to somebody who is also taking a course.

So the Estonian name and the question lead, everywhere, and the English name stays as a labelled
cross-reference for anyone reading an English reference grammar. `lib/estonian/terms.ts` is the one
table of what a point is called, and it is **deliberately partial**: a point is in it only where
there is a term a class actually uses, and `grammarTerm()` returning nothing is the honest answer
for `irony` rather than a cue to invent one. `grammar.ts` still holds no Estonian and its tripwire
is unchanged, which is why the terms live next door rather than in the prose. Two invariants hold
the rest: every case and every part of the verb carries the name a class uses, and a screen that
names a case in Latin names it in Estonian too. The second is anchored on a member access rather
than on the word, because a file declaring `caseEt: string` in an interface and never rendering it
satisfied the first version of it.

Three things are **not** covered by this and should not be "fixed": an English column heading over a
table of Estonian ("Case", "Singular"), the English prose that explains a point, and the topic ids
in URLs. The ids are keys that 83 syllabus entries and any bookmarked link point at, and renaming
them buys a slug and risks the course.

**The built-in dictionary is built, not typed.** `scripts/expand-seed.ts` produces
`prisma/data/expanded.json` from two sources with a strict division of labour: every Estonian
form and every example sentence comes from Ekilex, every English gloss from Wiktionary, and the
script only joins them. No model writes a character of it. It loads through `prisma/expanded.ts`
as a cache warm-up with `ON CONFLICT DO NOTHING`, never an update, so a hand-written entry, a
learner's correction and a live Ekilex fetch all win over it. Regenerating is resumable and
caches every answer, and a source that will not answer is never written down as a miss: that bug
cost four fifths of the dictionary on the first run and looked like a clean result.

**A gloss is the answer side of a flashcard, so a wrong one is drilled rather than displayed.**
`npm run audit:glosses` re-runs the parser over every entry's own Wiktionary page and prints
what disagrees; `--write` applies it. The first systematic pass over A1 to B1 corrected 25 of
2,164, and four of those were a different word rather than a different sense: `lamp` was being
taught as "random", `oktoober` as "hard hat", `ooper` as "opera house", `rida` as "many, much".
One cause under all of them. `{{l|en|lamp}}` renders as the word "lamp", `cleanWikitext` deleted
balanced templates wholesale, and an emptied line sent the picker to the next sense, which on a
page with more than one etymology belongs to another word. Where the template sat mid-line the
gloss survived with a hole in it instead, which is worse: `segama` read "to , to , to" and `vana`
read "an person", and nothing watching this file could tell a hole from a short gloss. Both
shapes are invariants now. **Only an English-tagged link is ever unwrapped**: `{{m|et|kohta}}`
is an Estonian word quoted inside an English note, and unwrapping it by a language-blind rule
would write Estonian into a gloss (ADR-005). That guard has its own invariant, and it took two
attempts: the first quoted an Estonian word with no diacritic in it inside a trailing
parenthetical the parser strips anyway, so deleting the guard left the check passing.

**Which sense a learner needs is not a judgement this pipeline makes.** Demoting the senses
Wiktionary marks `rare`, `obsolete` or `dialectal` was tried and reverted. It corrected `kõrb`,
whose everyday "desert" sits under a later etymology than a `rare` sense, and it broke more than
it fixed: `soldat` is tagged `obsolete` on "soldier" and would have been drilled as "jack",
`vats` is `dialectal` on "belly" and became "rumen", `raisk` is `dated` on "carrion" and landed
on a vulgar usage note. Sense order stays the page's own, and the entries the labels get wrong
are for a person to correct, which the dictionary is editable for. The course's authored glosses
in `prisma/data/harvested.ts` were checked against the same references and none needed
correcting: of the 684 with an independent English gloss, 657 agree outright and all 27 that do
not are a choice between synonyms. Those are authored rather than parsed, so no fault above can
reach them, which is the argument for the division of labour and not for skipping the check.

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
is tagged and needs confirmation before becoming a flashcard answer. An unverified form does not
just sit there being wrong, the SRS drills it in. (ADR-005.)

In the writing grader this is *enforced*, not requested: `lib/tutor/verify.ts` checks every Estonian
word in the model's feedback against the forms it was given and withholds the note otherwise. A live
test showed a model reaching for forms unprompted despite the instruction, which is the whole
argument for checking rather than asking. If you add another path where a model discusses Estonian
the learner will act on, put it behind that check too.

**"Never generate" means never by a model.** A deterministic rule over a form already stored is not
the thing this forbids, and reading it that way would delete the ten regular cases `morph.ts` builds
off a genitive stem, the ADR-009 fallback for a word held as principal parts alone, and the derived
case `matchEstonianForm` vouches for when believing a scanned word. A derivation is wrong the same
way for every word that takes the ending, so it is one bug found once, and the form says on screen
that it was derived. A model is wrong about one word, unpredictably, in output that looks exactly
like the attested forms beside it. ADR-005 amendment 1, because the ADR's own wording said "Ekilex
only" and three later decisions had already been reading it the narrower way.

**Nothing a person reads may sound like a machine wrote it.** Every screen, every error, every
empty state, the README, the policy pages and Anu are one person explaining Estonian to another.
Almost everybody using this is also sitting in a class or working through a textbook, and they read
a teacher carefully and skim marketing, deciding which a screen is inside about a sentence. So a
panel that opens `Unlock the power of spaced repetition` has already been sorted into the second
pile and the useful thing underneath it goes unread.

The standard is **warm, kind, concise, and unmistakably a person**, and each of those is a decision
rather than a mood. Warm is attention, not enthusiasm: `six days in a row` is warmer than `amazing work`
because one of them is about the learner and required us to have been looking. Kind is where
the news is bad, which is most of the copy in this app, and it is never softening a correction into
vagueness, since a learner left unsure whether they were wrong rehearses the error. Concise has no
word count; it is that every sentence does work for the person in front of it, and two sentences
that answer the question are kinder than six that circle it.

`lib/copy/voice.ts` is the one table of what gives a sentence away: the em dash and the en dash,
the stock openers (`It's important to note that`, `Moreover`, `In conclusion`), the inflated
shapes (`not just a rule, but a pattern`, `more than just`, `that's where X comes in`), the
brochure vocabulary (`delve`, `leverage`, `seamless`, `empower`, `embark on`, `your journey`,
`unleash`, `a plethora of`, `whether you're a beginner or`), the praise adjectives, and emoji. Three files used to state this
and no two of them agreed: `humanize.ts` stripped seven openers out of Anu, `prompt.ts` asked the
model for roughly the same thing in its own words, and the sweep over hand-written copy covered
nine brochure words across **six hand-listed files out of four hundred**. So a phrase Anu was
forbidden from using was fine in the panel beside her, and the 73-unit course page, the exam
briefing and every empty state were outside the check entirely. There is one table now,
`readerCopy.test.ts` sweeps the whole of `app/`, `lib/`, `components/`, the README, this file and
`docs/` against it, and `VOICE_RULES` is interpolated into Anu's system prompt so what the model is
asked for is what the sweep enforces. An invariant fails if any of those three stops reading the table, if the sweep
narrows back to a list, or if a rule stops reaching the prompt.

Adding a tell means arguing that the phrase is never right on a screen here. `perfect` is not on
the list, because taisminevik is the perfect tense and a grammar page has to say so; `unlock` is
not, because the exam recordings genuinely unlock. A check that fires on honest copy gets waived,
and a check everybody waives is a check nobody reads. The emoji rule is drawn the same way: the
arrow in "Estonian to English", the return key in a keyboard hint and the tick on the week strip
are typographic glyphs doing a job, and only the pictographic kind is banned.

**`docs/` is not exempt, and was.** The sweep skipped it on the argument that those pages are read
by contributors rather than by learners, which was true and was not a reason: they are still
somebody explaining something to somebody, they are the first thing a new contributor reads, and a
project whose own documentation is written in the voice it forbids on screen has told that person
which of its rules are real. There were 388 dashes behind that argument, and three of them were the
`NO_VALUE` fault wearing a different hat, an empty cell in a paradigm table written as a bare dash
that a mechanical sweep turns into a comma sitting where a form should be. A fenced block and an
inline code span are still skipped, because a document quoting the Prisma schema or the secret
scan's own grep is quoting code, and because backticks are how a page names a banned phrase without
using one. `docs/18-voice.md` is the one exemption and only from the phrase rule, since it has to
show the copy it exists to prevent.

**The table is half the rule.** No regex tells kind from cold, or notices a paragraph that is
twice as long as it needs to be. `docs/18-voice.md` is the other half, with worked before-and-after
examples off real screens, and it is what to read before writing a sentence anybody will see.

**The chat guard is a notice; only the grader has a gate.** `verifyComment` withholds a whole reply
before the learner sees it, which only a non-streaming answer can afford. The main chat streams, so
`flagUnverifiedEstonian` checks Anu's prose against the dictionary after the fact and names what it
could not confirm in a trailing line. It inherits `estonianTokens`, which only reaches a quoted word
or one carrying õäöüšž, so ordinary Estonian in a sentence of prose passes untouched, and that hole
stays open on purpose: the dictionary behind the check clears an English word only when it happens
to be an Estonian lemma too, so a wider net would flag English as unverified Estonian and teach
somebody to ignore the line on the day it is right. What compensates is the UI, not the check. Do
not raise the extractor's recall without changing what sits behind it. ADR-005 amendment 2.

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
of a join. `lib/srs/replay.itest.ts` will fail, which is the point. The same property is what makes
offline sync conflict-free: grades are facts with timestamps, and replaying them in order reproduces
the state exactly, because `grade()` takes `now` as a parameter.

**Never re-add the iframes.** Sõnaveeb and Ekilex send `X-Frame-Options: DENY`; Speakly has no public
API. This was verified, not assumed. See `docs/00-audit-v4.md` §A.

**Review must work offline.** It is the daily path, and it may not depend on any network call.
A grade that cannot reach the server goes into the IndexedDB outbox (`lib/offline/db.ts`) and is
replayed in order by `replayGrades` with the timestamp it was actually answered at, never dropped,
never re-stamped. Replay is idempotent because the client generates each grade's id. Anything added
to the review path must survive `navigator.onLine === false`, and `scripts/smoke-offline.mjs`
checks that in a browser. (ADR-015.)

**AI spending is always metered.** `lib/usage` has no off switch and fails closed, because sign-up
is open by default. Any new path that calls a paid provider goes through `authoriseCall` before the
call and `recordUsage` after it. An unrecognised model prices at the dearest rate in the table. A
cap that fails open is not a cap. This is asserted now rather than asked for: the invariant finds
every module that opens the provider chain and fails on one that does not mention the ledger,
because prose had been enough to keep four routes honest and not enough to catch the fifth path.
That fifth was `lib/tutor/translate.ts`, reachable from the dictionary search box. A word the
local table and Wiktionary both missed fired a real completion with no burst limit, no daily
allowance, no global budget check, and no row written afterwards, so the Settings usage meter
reported nothing spent because from the ledger's view nothing was. The meter lives inside `ask()`
rather than in its two callers, so the next short helper that wants a sentence from a model
inherits it by reaching for the function.

**The ledger writes the call down when it authorises it, not when it finishes.** `authoriseCall`
used to read four aggregates, return a verdict, and leave the row to `recordUsage`, which for a
streamed answer on a two-minute route lands tens of seconds later. That is check-then-act: ten
tabs read the same "under the limit" inside the gap and all ten went ahead, and the global budget,
the one that is supposed to be the hard backstop on the whole deployment's bill, had the widest
window of the three. So a call is booked at an estimate inside the same transaction that reads the
counters, under a deployment-wide advisory transaction lock, and the tokens the provider actually
reports arrive afterwards as a `SETTLEMENT` row carrying the difference, which is negative
whenever the estimate was generous. Two rows rather than an edit, because `UsageEvent` is
append-only for the same reason `Review` is. Spend sums every row; the call counts count `CALL`
only, and getting that backwards would silently halve every allowance in the app. A call that
never happened hands its authorisation back through `releaseReservation`, or a deployment with a
rejected key would ration its learners over calls none of them received. `lib/usage/ledger.itest.ts`
authorises twelve at once, which is the only way to see any of this.

**Every mutation a learner makes is a Server Action, so that is where a throttle belongs.** Five
Route Handlers called `checkRateLimit` and none of the forty-odd actions did, which is the gate on
the quiet door again. `lib/security/actionLimits.ts` is the one table of what the per-call
expensive work is allowed, and the invariant reads that table: an allowance with no action
applying it fails, and so does an action throttling against anything but the owner it resolved.
Most actions must **not** have one. Grading a card is a single indexed write and a limit there
would be met by learners and nobody else.

**A bucket key the caller chooses is worse than no bucket key.** `clientIp` read
`X-Forwarded-For` whatever this app was standing behind. On Vercel that is right, because the
platform overwrites it; self-hosted behind a proxy that passes it through, it is a value the
caller picked, and a caller who picks a new one per request gets an unlimited number of
allowances. So it is read only when `TRUST_PROXY_HEADERS` or `VERCEL` says a proxy is there, and
every unattributed request otherwise shares one bucket, which is the honest shape for not
knowing. Signed-in work never touches any of it.

**Nothing in a `"use server"` file may take an owner id from its caller.** Every export there is a
public endpoint. Resolve the owner with `requireUserId()`; if a helper needs one as a parameter, it
belongs in `lib/`, not in `app/actions.ts`. See `addCardsFor` and `applyGradeBatch` for the shape.

**The shared dictionary is shared; a deck is not.** `Lexeme` and `Form` are reference data every
learner sees, so an edit to one is an edit for everybody. It is attributed (`editedBy`), it may
replace only the principal parts, and it must never touch a retrieved Ekilex paradigm. Anything
scoped to a person (cards, reviews, tasks) is always filtered by `ownerId`, including in an
`updateMany`. `lib/dict/edit.itest.ts` exists because all three of those were once wrong.

**A dead end offers a way out, and the way out is a queue somebody works.** Nothing here may tell
somebody it cannot help them and then stop. A search that found nothing, an answer marked wrong that
was right, a word off their own homework the dictionary would not vouch for, a grammar page that
contradicts their teacher, a screen that threw: every one of those used to end in a sentence and a
back button, and the person who knew what was actually wrong was the one person with nowhere to put
it. `components/SuggestFix.tsx` is mounted beside the failure rather than filed under a contact
page, and it carries the failure with it, because "kohv is wrong" teaches a reviewer nothing and the
same words under `/review` beside "we asked for the partitive and marked kohvi wrong" teach them
everything. The note is optional on purpose: somebody annoyed enough to press it has already given
us the useful half by pressing it there, and a form that will not send without a paragraph collects
nothing from the people worth hearing from.

`lib/suggestions/model.ts` is the one table of what can be reported, and two invariants hold it up.
Every category must be reachable from a screen, asserted against the mounted components rather than
against the files, because a key also appears in the queue's own fallback and matching that would
let a category pass while being unreachable. And the four screens where the dead end is structural
have to still render both halves, the failure and the button beside it, since a file that keeps the
failure and loses the button is the regression worth catching.

**The unit of review is the group, not the report.** Sign-up is open and every failure offers this
button, so the queue's size is decided by how many people meet one fault. A list ordered by time is
one dead link four hundred times over with the report that matters on page nine. `groupKeyFor` is
deliberately blunt about it: over-grouping two similar reports costs a reviewer one extra read,
under-grouping costs them four hundred. One person gets one open report per thing, so the count
beside a group means people rather than clicks, which is the only reading that makes it worth
printing. Accepting acts on the group.

**Accepting is a write into the shared dictionary, so it obeys every rule a hand edit does.** Both
go through `lib/dict/upsert.ts`, which is one function rather than two copies of the answers that
matter: only principal parts may be replaced, a retrieved Ekilex paradigm is never touched, and an
entry Ekilex supplied stays marked as Ekilex's after a correction. `lib/suggestions/apply.ts` may
remove an example sentence and never rewrite one, because editing an attested sentence would be this
app writing Estonian. Every Estonian character that reaches the dictionary this way was typed by a
person into a form, exactly as ADR-005 requires; no module under `lib/suggestions/` can reach a
provider at all, and an invariant says so. It never rewrites anybody's cards: the hand-edit path
rewrites the editor's own and deliberately nobody else's, and a reviewer accepting a stranger's
report has less claim still.

**Who reviews is a deployment fact, like who the controller is.** `lib/auth/admin.ts` reads
`ADMIN_EMAILS`, exact addresses only, never a domain: "this school may sign in" and "this person may
change what everybody reads" are different questions. A hosted deployment that has named nobody has
no reviewers and the queue says so out loud, the way `/privacy` says an operator was not named,
because an empty list looks like an empty queue. Local mode is one learner on one machine who
reviews their own. There is no way to grant this from inside the app, since a privilege a request
can grant is a privilege a forged one can grant. `reviewSuggestion` resolves a reviewer through
`requireAdminId` rather than settling for a signed-in user, and the throttle invariant was widened
for it: what it asserts now is that the id was resolved by a `require...()` in the same file, not
that it is spelled `ownerId`, because naming an admin binding after a regex is naming a variable
after the check that reads it.

**And it does not revalidate its own queue.** Revalidating `/admin/suggestions` inside the action
re-rendered the list, which unmounted the row that had just been acted on along with the sentence
saying what it did: the reviewer clicked "Accept and apply" and the line vanished with no word about
whether a word had been added. Rows must not reshuffle under the cursor between clicks either. The
row reports its own outcome and the list is right again on the next load.

**Progress is derived, never stored.** XP, levels, streaks, quests and every chart are computed from
the append-only review log on each request (`lib/gamification/`, `lib/stats/`, `lib/progress/`).
Do not add a counter column. A stored score is a second source of truth that drifts, and it can be
awarded for something that never happened. The only exceptions are values no log can reconstruct: a
personal best, and which days a streak shield has already covered. (ADR-014.)

**A day is the learner's day, and every screen that counts one is rendered on a server.** The
streak, the daily goal, the quests, the week strip, the heatmap and the two badges about the hour
of the day are all derived server-side, and a server's midnight is the deployment's. `lib/time/day.ts`
had a header saying its days were "the learner's own calendar days" and a body reading
`getFullYear()`, which is the day boundary of whichever process is running: on Vercel, UTC. The
shortcut that file was written to forbid was being taken one layer down from where it forbade it.
A learner in Tallinn who studied on Monday morning, at one in the morning on Tuesday and again on
Wednesday morning kept a three-day streak; those sittings fall in two UTC days with a hole between
them, so the app said 1 and, with a shield banked, spent it bridging a Tuesday they had not missed.
So a day boundary needs a zone, `dayClock(zone)` is how you get one, and anything touching the
database takes one rather than calling the process-bound free functions. The learner's zone is
whatever their browser reports (`components/TimeZoneSync.tsx`), stored under `SETTING_KEYS.timeZone`
and never asked for, because the device already knows. **A naive timestamp needs two `AT TIME ZONE`s**:
Prisma maps `DateTime` to `timestamp without time zone`, and on a naive value one of them
*interprets* rather than converts, which read 22:00 UTC as 22:00 in Tallinn. The single
`AT TIME ZONE 'UTC'` that preceded this was the same mistake wearing a disguise, since its result is
a `timestamptz` that `TO_CHAR` renders in the *session's* zone: right on a UTC session and a day out
on any other.

**Every mode grades through `gradeCard`.** Sprint, Listening and Match are not side games with their
own scores. They write to the same review log, so the scheduler sees what was actually practised.
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

**A suite that exists is a suite CI runs.** The workflow names its suites one line at a time, and
its own comment says why: "a suite added to `npm run test:browser` alone is a suite CI never runs".
It had drifted in the other direction too, with nothing counting, and five suites had nothing
watching them at all, `test-restore.mjs` among them. The source of truth is the filesystem: every
`scripts/*.mjs` that declares a suite is one CI runs, and anything else is named in
`scripts/lib/suites.mjs` with a written reason. Two are, and both are facts about the route rather
than about anybody's schedule.

**A cap on a shared quota is charged to the learner, never to their address.** `/api/tutor`,
`/api/tts`, `/api/share` and `/api/export` all go through `lib/security/rateLimit.ts`. Twenty-five
students on one school network are one IP and a review session asks for audio on nearly every
card, so per-address counting would refuse a whole classroom in its first few seconds. `/api/tts`
also joins an identical request already in flight rather than making a second one: the disk cache
is consulted before the call and written after it, and the gap between those is exactly where a
class starting the same unit together lands. What that limiter is *not* is the first line of
defence for spending: it is per-instance and a burst spread across cold starts meets an empty map
every time, so the thing that actually bounds cost is the Postgres ledger, which is the same
number whichever instance answers.

**A policy page states this deployment, or states that nobody filled it in.** Kodukeel is
software somebody installs, so the controller is whoever runs the copy, and "ask whoever runs
this installation" is honest but not an answer: there is no way to find out who that is.
`lib/legal/operator.ts` reads the identity from `OPERATOR_NAME`, `OPERATOR_ADDRESS`,
`OPERATOR_EMAIL` and an optional registry code, and `/privacy` and `/terms` render it. Never
add a placeholder: an unset deployment says out loud that it is unset, because a page that
quietly says nothing looks finished. Both pages are `force-dynamic` for the same reason, since
a notice baked in at build time describes the build machine's environment, which is nobody's.
The recipients list is generated from the deployment's own configuration (`lib/legal/recipients.ts`)
rather than described in the abstract, so a reader is told which companies and whether they are
in Estonia. Estonia sets the age of consent at 13, not 16. A recipient a deployment can switch on
with one variable is generated like the rest: `ERROR_WEBHOOK_URL` puts an error-reporting endpoint
on the list, named by host and never by path, because a webhook path is a common place to keep a
token and that page is public.

**Two sources, two licences, and the page has to say which is which.** Ekilex was credited in four
places and Wiktionary in none, while Wiktionary supplies the English gloss for most of the
built-in dictionary and is the second layer of every live lookup. Its terms are the stricter of the
two: CC BY 4.0 for the Estonian, **CC BY-SA 4.0** for the English, which is share-alike and
therefore reaches `prisma/data/expanded.json` as a build product of both. Both are credited on
sign-in, in the landing footer and on /terms, and `LICENSE` says the code is MIT and the data is
not.

**Erasure and export are promises, and both were being broken.** "Delete everything" emptied
every table and left the identity in Supabase Auth, where the email address, the Google subject
id and the sign-in history live; `lib/auth/erase.ts` removes it, and where a deployment has no
key that can, the screen says which part is left rather than reporting a success. The export was
five tables and the page said nothing was held back: settings, tutor conversations, level checks,
stars and badges were all missing, and a level check cannot be recomputed from anything. The
invariant reads the owner-scoped models out of the schema rather than a list somebody typed, so a
new table fails until a person decides about it. `UsageEvent` is the one deliberate exclusion and
/privacy names it.

**And then the check's own skip list became the hole.** Three models had been added to the
exemption rather than to the query (mock exam sittings, classes and class memberships), so the
backup stopped at ten tables out of thirteen and the invariant called it complete. A sat paper
carries the composition the learner wrote, which is the single least reconstructable thing in the
schema, and it was in no backup and, worse, survived "delete everything" entirely. Exemptions live
in `lib/legal/exportCoverage.ts` now and each one has to carry a written reason, so appending a
model name is no longer a way to make the check pass. **Erasure has no exemptions at all**, and
that is its own invariant plus a DMMF-driven integration test, because the version written from
the same remembered list agreed with it.

**A source that will not answer is written down as a miss, in the live path too.** The seed
learned this expensively. `enrichFromEkilex` had the same bug with a symptom nobody looks for:
it recorded nothing when Ekilex had nothing, so every render of that word asked again, two round
trips to a free academic service, for ever, against a 2,500ms deadline. `Lexeme.lookupMissAt` is
the marker and is deliberately **not** `fetchedAt`, which `lib/progress/exam.ts` reads as "words
the dictionary knows most about": folding a miss into it would sort the least known words to the
front of a mock paper. It expires after a day, because Ekilex is a living database.

**There is one in-flight map, and it lives in `lib/cache/singleFlight.ts`.** A cache consulted
before a call and written after it has a gap exactly as wide as the call, and a class of
twenty-five starting the same unit lands in it. Speech worked this out first and the dictionary
needed the same thing; a second copy of the pattern is where the `finally` gets dropped and one
bad minute upstream is remembered as a failure until the next deploy. A joiner is not charged for
a request it did not make, which is why `singleFlightTagged` reports which caller it was.

**Every cache the service worker keeps has a ceiling, and the one that does not is the reason
why.** `lib/audio/clipCache.ts` was written because a cache that never evicts is a leak with a hit
rate, and one layer down the worker had the same shape twice over with nothing watching either.
Speech is a WAV per phrase and review plays audio on nearly every card, so a phone kept every clip
it had ever heard; the build-output cache was worse, since `_next/static` names are hashed per build
while the cache name is typed by hand, so every deploy added a set of chunks and nothing removed the
last one's. The cost is not a slow app, it is a lost fallback: a browser evicting an origin's
storage takes all of it, and `/offline` is the entry with nothing behind it. So `/offline` and the
icon live in their own cache which is **never** trimmed, and everything else has a count in `LIMITS`
with a trim after every write. Oldest first rather than least-recently-used, because the Cache API
cannot record a read and re-putting on every hit would make a lookup a write on the busiest path in
the app. `VERSION` is what clears the arrears, and it is the only thing that has ever removed a
stale entry here.

**The service worker warms the page you were on when it took over.** The page cache fills as a
side effect of a navigation the worker intercepts, and the worker never serves the navigation
that installed it: the page is fetched, the worker installs behind it, and `clients.claim()`
takes over a client whose own page was never seen. So the first journey failed and the second
worked. `warmOpenPages` on activate is the fix, and it caches whatever window is open rather
than a list of routes, because the rule is "the page you were last on opens again", not "one
route is special". The shell is warmed one URL at a time and never through `addAll`, which is
atomic: one URL that will not fetch throws away the batch, and `/offline` is in it.

**A unit test states a machine, it does not run on one.** The provider suite cleared three
provider keys and inherited the rest from whoever ran it. CI carries none, so it passed; a machine
with `GROQ_API_KEY` exported failed thirteen of them, and the failures read as chain bugs rather
than as the suite reporting its host. A test whose answer depends on the machine is not a test.
`PROVIDER_KEY_ENV` is the one list and it is **exported by `provider.ts`, not retyped in the test**:
the fault was a list in the test falling behind the chain, so a copy living there is the same fault
waiting to happen. Two sessions fixed this within the hour and the other kept its list in the test;
that copy was deleted rather than left beside this one. If you add a provider, add its key to
`PROVIDER_KEY_ENV`, three lines above the function that reads it.

**A screen shows what earns its place now, and one module decides what that is.** The feedback that
produced `lib/ux/disclosure.ts` was that the app overwhelms somebody just getting started, and the
cause was not any one screen: every screen showed everything the app can do to everybody, from the
first minute. Today led with eleven panels and on day one ten of them were reporting on an empty
review log, so a streak of nought, a goal ring at nought percent and a "word to revisit" from a deck
nobody had read yet all had to be scrolled past to reach the one button that matters. The rule is a
table of three stages keyed on the learner's own history: `arriving` until they have graded a card,
`starting` until roughly three days at the default goal, `settled` after. Nothing is *deleted* by
it. Every panel a stage withholds is still in the rail, in the palette and on its own page, and
`disclosure.test.ts` asserts each stage is a superset of the one before, because a panel that
appears and then vanishes reads as a bug rather than as restraint. The invariant fails on a screen
that stops asking the module, and on anybody outside it comparing a review count against a number
of their own, since a second answer to "has this learner started yet" is how the first one rots.

**Where a screen lives is one table, and nothing lives behind a button marked "More".** The rail
promoted four destinations and hid the other twelve behind a disclosure, which is not fewer links,
it is the same links somewhere a learner has to remember. It also had a bug you only met by using
it: `showRest` was `railOpen || secondaryActive`, so on any page *inside* the hidden group the
button read "Less" and pressing it did nothing at all, because the click flipped the first half and
the second held it open. Fixing the toggle was the small half. `lib/ux/nav.ts` is the one table of
what the app contains and which of four questions each destination answers, the desktop rail draws
every one of them under its heading, and the phone keeps one button only because five cells across
a phone is a different problem from a column with a screen of height in it: what it opens is the
same sections with the same headings. This is not `lib/ux/disclosure.ts` and does not overlap it.
That module decides what a *screen leads with* by how far in the learner is; this one decides where
a thing lives, and the answer is the same in the first minute as in the first year.

A place that lives *inside* another place carries `within` and keeps its row out of the rail
without leaving the table, so the palette still reaches it. Three do: Anu, because her button is in
the corner of every signed-in screen and a row saying "Ask Anu" was a second door onto a room whose
door is always open; the class week, which now leads the Tasks page where its homework already was;
and the scanner, which is a way of getting words *into* the dictionary and sat under "Look it up",
which is not what it does. This is not the "More" button coming back: each is on the screen a
learner is already standing on when they want it, and `within` has to say which, asserted.

The table is read by the rail, the phone sheet, the command palette and the guide, because it was
four lists and they had drifted. The palette offered six practice modes while `/practice` offered
eleven, so the Leech clinic was reachable from one screen and unfindable from the box that promises
to go anywhere; `components/PracticeModes.tsx` held a seventh copy that no screen rendered at all
and has been deleted; `lib/copy/tour.ts` named nine screens a second time with their own icons, and
now carries the prose and joins the rest. `lib/ux/modes.ts` did the same for the practice modes, and
the split is deliberate: what a mode *is* lives there, what it is like *right now* is a database
question and stays in the page. Two invariants hold it, plus `scripts/smoke-new.mjs`, which opens
the app and asks the two questions no source check can: the rail draws its links with nothing to
open first, and a phone reaches every place a desktop does. `icon()` falling back to a sparkle is
why `nav.test.ts` checks every name in both tables resolves. Two modes shipped with the placeholder
before a screenshot caught them.

**Space is what says two things are separate, and it was saying five different things.** Pages
stacked their top-level sections at gap-5, gap-6, gap-7, gap-8 and gap-9 depending on who wrote
them, so moving from Progress to Practice changed how tightly the app breathed for no reason a
reader could name. `Stack` in `components/ui.tsx` is the one rhythm and it is the generous one: 32px
between sections, against 20px inside a card and 8px between rows in a list. Only the outermost
column uses it, because proximity is what says a grid of cards or a list of rows belongs together.
The rail follows the same rule at 28px between its groups, which is the largest space in that
column on purpose: four groups two rows apart read as one list with words in it.

**And a panel drawn three times is three answers.** "Your weakest cases, click to drill" was on
Progress, Practice and My words, each with its own markup, and My words tallied the review log in a
local function of its own instead of calling `caseAccuracy`, so one learner could read two different
numbers for one case and nothing in the app would disagree with either. `components/WeakestCases.tsx`
is the one component and `lib/stats/history.ts` is the one calculation. My words dropped the panel
and the five thousand row query behind it and points at Progress instead, which is what
`test-polish.mjs` drives now: a consolidation that drops the signpost is just a removal.

**Where a walkthrough is short, the reason is that the questions were spread, not that they were
dropped.** First run was eight screens and is four. Every answer it used to collect it still
collects: what to call you, where you are, why, how far, by when, how often, the daily goal and the
first units. What went is four screens that each carried one question, a screen of feature tour that
is `/guide` word for word, and a plan panel whose six cited facts and essay on where the hours come
from now live on `/assess` behind `compact`. The order is still the argument: the limits are stated
before anything is asked for, the level is measured before the plan is built on it, and the plan is
seen before a single word is chosen. `test-assess.mjs` drives all four screens and would fail if the
deck step ever moved above the plan.

**Local mode is a deployment shape, not a switch.** With no Supabase keys the app runs as a single
local learner; with them, every route is gated. It keys off the absence of configuration only. Never add a flag that can disable auth on a deployment that has it. (ADR-013.)

## Conventions

- TypeScript `strict` plus `noUncheckedIndexedAccess`. No `any` without a comment justifying it.
- `lib/assessment/`, `lib/estonian/`, `lib/gamification/`, `lib/stats/`, `lib/collections/`,
  `lib/time/`, `lib/offline/`, `lib/security/`, `lib/scan/`, `lib/ux/` and `lib/copy/` stay free of
  React, Next.js and Prisma: pure functions, unit tested. Anything that
  needs the database lives in `lib/progress/` or a route.
- Data that drives UI but holds no JSX (badges, path units, quests) carries a lucide icon *name*;
  `components/icons.tsx` is the only place that turns one into a component.
- Settings go through `lib/settings/store.ts`. No new string keys scattered through pages. The five
  goal keys (`goalReason`, `goalTarget`, `goalDeadline`, `goalDays`, `goalNote`) are declared there
  and nowhere else, and an invariant checks it.
- Server actions for mutations; Route Handlers for streaming and third-party proxying.
- Every new view implements all four states from `docs/08-ux-ia-a11y.md` §4 (empty, loading, error,
  offline). A view without an empty state is not finished. **Loading is the one a route group can
  lose wholesale**, because it is a file rather than a branch: `app/(app)/` had one and the
  chromeless group and the two policy pages had none, so the landing page, sign-in, first run,
  /privacy and /terms each showed a blank screen. An invariant checks per group, which is the
  granularity Next resolves a `loading.tsx` at.
- **A screen names itself, in the tab and to a reader.** Thirty-four of forty-five routes set no
  title, so every one of them was called "Kodukeel. Estonian that finally sticks" and two tabs side
  by side were indistinguishable. A page states its own name and `title.template` in
  `app/layout.tsx` adds the app's. And a practice round carries an `h1` even where there is no room
  to draw one: each mode renders three or four screens from one component, the empty and finished
  ones each had a heading and the round did not, so an accessibility run that met an empty deck saw
  one and passed. That is why it is asserted from the source rather than from whichever branch a
  fixture rendered, and why the browser suite now walks every route rather than the fifteen a branch
  happened to add.
- Unit tests stay hermetic: no database, no network, no clock you do not control. Anything needing
  Postgres is an `*.itest.ts` under `npm run test:db`. The unit suite gates every commit and must
  stay fast enough that nobody is tempted to skip it.
- **A cache of object URLs that never revokes one is a leak with a hit rate.** `Speak` and
  `PairsSession` each held a `Map` of blob URLs and neither released anything: `Speak`'s was
  module-level and so outlived every navigation, `PairsSession`'s went unreachable when the round
  ended and was still held by the browser. Review plays audio on nearly every card, so a phone
  left in the app kept a WAV per word for the session. The presence of a cache is what made this
  look solved, which is why `lib/audio/clipCache.ts` is bounded and least-recently-used rather
  than merely revoking: an unbounded cache that revokes on eviction never evicts. One module
  rather than a copy per caller, on the argument `lib/cache/singleFlight.ts` makes about itself,
  and the invariant fails on any component that mints an object URL without revoking it. That is
  how `ShareProgress` turned up, holding a shared card for the life of its tab.
- **"Pick one of these" is one component, and a chip is not a control.**
  `components/Choice.tsx` is it: `ChoiceGroup` plus `ChoiceChip` or `ChoiceCard`. There was no
  primitive for this and every screen that asked invented its own, two of the three wrongly. The
  worst was a bare `<button>` wrapped round a `<Chip>`, which is the app's *label* primitive: no
  border, no shadow, no hover, so first run, the screen that decides a learner's year, read as a
  legend rather than as a form. Chosen was `--raised` swapped for `--accent-soft`, two percent of
  lightness apart on the dark theme, which is the palette's own rule about hue being broken on the
  one screen where the distinction *is* the answer. And a set of mutually exclusive options wore
  `aria-pressed`, so it announced as that many unrelated switches and cost that many tab stops
  rather than as one radio group saying "3 of 8". Its chosen states live in `globals.css`
  and not in a `style` prop, for the reason in the next rule: a control that paints its resting
  background inline can never define a hover, which is what made this unfixable in place.
- **A hover makes a control more present, never less.** `.choice-btn` for a box, `.tap-tint` for a
  bare row or icon button. Twenty-odd controls carried `transition-opacity hover:opacity-80` as
  their whole hover state, and dimming is exactly how every disabled control here is drawn, so the
  strongest signal a mouse got on those screens was the control appearing to switch off. A link
  may still fade, and a `<button>` drawn as underlined text is a link wearing the right element,
  which is the one exemption the invariant reads.
  Two sessions found this the same day from opposite ends, main on the multiple-choice answers and
  this branch on the settings and first-run questions, and both worked out the same cause: an
  inline style beats a class `:hover`, so a control that paints its resting background inline can
  never define one. Main's answer is the one kept, because a `--choice-bg` custom property is how a
  caller passes a tone *through* a hover, where an inset ring is only how you avoid needing to.
  The second copy was deleted rather than left beside it.
- **A control the 44px floor makes bigger centres its own content.** The floor under a coarse
  pointer is a `min-width` and a `min-height`, and an inline box lays its content out from the top
  left, so on a button holding nothing but an icon all of the slack lands on one side: measured at
  390px, the cross on the phone's More sheet sat six pixels left of the middle of the circle around
  it, and so did every other icon-only control that had not thought to say `flex` for itself. One
  rule in `app/globals.css` centres them, written inside `:where()` and keyed on `[aria-label]` plus
  a lone `svg` child, so it carries no specificity and reaches only the controls whose whole content
  is the icon. A control that lays its own icon out keeps doing exactly what it says. The invariant
  asserts the pairing rather than the rule, because a floor that inflates a box with nothing
  centring what is inside it is the state that produced this.
- **Two speeds are one control, not the same icon twice.** Normal and slow were two identical
  speaker buttons side by side on the dictionary entry, the speaking round and the listening part of
  the mock exam, which reads as a rendering fault rather than as a choice, and the only way to find
  out what the second one did was to press it. `SpeakPair` in `components/Speak.tsx` is one pill with
  a divider whose slow half says "Slow" in words, since a `title` attribute is a hover and this app
  is measured on a phone. It goes away as a pair: both halves ask the same service for the same
  sentence, so a failure is a fact about the service and not about a speed.
- **A colour may not be the only thing carrying a distinction, and a tooltip is not text.**
  Dictation's `diacritics` and `typo` share a hue on purpose, because the palette has one colour
  for "nearly" and inventing a sixth to carry a distinction is what the design system forbids. So
  the two were told apart by a `title` attribute, which is a hover tooltip, in an app measured at
  360px whose README leads with "works on a phone". And telling them apart is the entire
  pedagogical claim of that exercise. `wordNote` in `lib/estonian/dictation.ts` says which in
  words, reusing `droppedDiacritics` rather than rewriting the loop that knows which letters
  exist.
- **No em dash or en dash in anything a person reads**, anywhere in `app/`, `lib/`, `components/`
  or the README. A dash used as a clause break is the loudest single tell that a sentence was
  generated, and every screen here is one person explaining Estonian to another.
  `lib/copy/readerCopy.test.ts` walks the whole tree and fails on one, alongside every other tell
  in `lib/copy/voice.ts`; its `ALLOWED` list is now the table itself, the one file that has to name
  what it bans, and a test fails if an entry there stops containing one, so it cannot become a
  parking space. Replacing a dash between two independent clauses with a comma
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
- **A date is written the way the reader writes dates, and only their browser knows how that is.**
  `lib/time/clock.ts` pins the hour and deliberately leaves date order and month names to the reader,
  which is true of a client component and was false of the two places this app formatted a date on
  the server: `undefined` as a locale means the deployment's, so on a machine set to en-US Today's
  greeting line read "Sunday, August 30" to somebody in Tartu who writes "pühapäev, 30. august".
  `components/LocalDate.tsx` renders what the server wrote and lets the browser replace it on mount.
  A separate rule from the day boundary above, because the fix is different: a zone can be stored and
  handed to the server, and a locale is a list of preferences only the browser has.
- **24-hour clock everywhere** (`lib/time/clock.ts`), never am/pm. Estonia writes the time that
  way and so does every country whose language this app teaches, and a reading that changes shape
  with the browser's locale is one a teacher and a student cannot compare. `hourCycle: "h23"`
  rather than `hour12: false`, which renders midnight as "24:00" in en-US.
- Style through the tokens in `app/globals.css`, never with a raw hex. The five hues carry fixed
  meanings (`docs/14-design-system.md` §1). Mint is "recalled", peach is "missed", and neither is
  free for decoration. **A hue has a fill and an ink and they are not interchangeable**: `--accent`
  is what a button is painted, `--accent-deep` is what a word is written in, and text set in the
  fill measured 3.87 on the week header and 4.05 in the leech clinic against a bar of 4.5. Contrast
  is measured in a browser rather than reasoned about from the token list, and **in both themes**,
  because light and dark are two palettes rather than one with a filter over it: the first batch of
  failures was entirely in dark mode and the second entirely in light. What a colour is worth
  depends on what it is sitting on, which a palette cannot tell you.
- **`opacity` never goes on a box that holds words.** It multiplies through everything inside, so a
  fade meaning "not yet" fades the sentence explaining why. A locked unit on the course page ended
  up saying "you can still open it" at 2.63:1, on every locked row of a 73-unit course; the badge
  shelf and the grammar reference had the same shape. A state that means "not yet" has a border, an
  icon and a sentence to say so with. Where a fade genuinely helps, it goes on the icon.
- **And the sweep is axe, not a hand-rolled one.** `scripts/a11y-check.mjs` spent its life saying it
  was "not a substitute for axe", which was true and was also why five real failures sat unseen. The
  contrast pass it replaced scoped to `main`, so the navigation rail on every signed-in screen was
  outside it, and it read a colour's own alpha but not an `opacity` inherited from a parent. axe
  found both in one run, plus an `<ol>` on the landing page whose `<li>`s sat behind a wrapper `div`,
  so the list announced itself as empty. What stays hand-written is only what axe has no opinion
  about: exactly one `main` and one `h1` per screen, and a title that is not the landing page's.
- Signed-in routes live in `app/(app)/`; pages that own the whole screen (the landing
  page, sign-in, first-run setup) live in `app/(chromeless)/`. A new public page has
  to be added to the allowlist in `middleware.ts` as well.
- Every interactive element is keyboard-reachable with a visible focus ring, and under a coarse
  pointer every one of them clears 44px.
- **Text and icons stay inside the boxes they were drawn into, and that is four declarations rather
  than a habit.** Every other rule here about the shape of a page is about the page, and none of
  them can see this fault: it happens inside a card that is itself exactly the right size, so the
  document never scrolls sideways and every check that measures the document reads a clean pass
  while a word sits on the ground behind the card. `overflow-wrap: anywhere` is inherited from the
  body, and `anywhere` rather than `break-word` is the whole point: both break a word that has
  already overflowed, but only `anywhere` counts towards min-content, which is what a flex or grid
  item's automatic minimum is, so with `break-word` one long word is a floor under the row and the
  row leaves the card having broken nothing. `svg.lucide { flex: none }` stands in for `shrink-0`
  on several hundred icons, which was on about a fifth of them: an icon with no `flex` of its own
  both shrinks and grows, measured at 0x15 in a deck row and 28x16 in the rail. A replaced element
  is capped at its box, because nothing about wrapping reaches one: Settings' backup picker is an
  `<input type="file">` laid out at 336px inside a 278px card. And **a table is the one exemption**,
  because a paradigm is read by comparing forms down a column and a form broken across two lines
  has to be reassembled first. It buys that with a scroller of its own, which every table in the
  app sits in and an invariant checks, since the worksheet's did not and was 103px over a phone.
  `scripts/test-containment.mjs` measures the rectangles, on **every route the app has** at two
  widths plus the landing page with its disclosures open and a paper actually being sat. Four
  questions each time: cut off by something that clips, drawn over a border somebody painted,
  drawn on top of something else, or resized away from the size it declared. Then the same four
  again with every run of text swapped for one **of the same length** with no space or hyphen in
  it. Same length is the discipline: a stress test that hands every element a forty-character word
  is unfalsifiable, since a ring whose middle says "42%" fails it and no markup would pass, while
  same length asks the question Estonian actually poses. With the four declarations removed it
  failed 183 of its 470 checks.
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
- **The Estonian letter bar is a desktop thing, and a choice.** `õ ä ö ü š ž` are not on a UK or US
  keyboard, so a row of click-to-insert buttons under every Estonian field is the only thing making
  half these exercises answerable. It was drawn for everybody, everywhere, always, and it should
  have been neither. A phone keyboard already carries those letters, on a long press or a keyboard
  switched to Estonian, so the row buys a phone nothing and spends the one thing a phone has none
  of; and a learner typing on an Estonian keyboard has them as keys, so it is clutter under every
  field in the app. Neither is detectable: a browser will not say what is printed on the keys, and
  a learner who never reaches for õ looks exactly like one who cannot. So it is asked, once, on the
  first screen of first run, and changed afterwards from Settings or from the row itself, which
  carries its own way out because the moment somebody notices they do not need it is the moment
  they are looking at it. `lib/ux/letterBar.ts` holds the letters and the answer, `app/globals.css`
  holds the one definition of "a desktop" (a width **and** a real pointer, since `min-width` alone
  hands the row to a tablet with nothing attached to it), and the signed-in shell publishes the
  learner's answer as `data-letters` in the render rather than from an effect, because an attribute
  written after hydration shows the row for a frame to everybody who asked for it to be gone.
  **On is the default and stays the default**: everybody who signed up before the question existed
  is never asked, and reading a missing answer as "off" would take away the only way they have of
  writing õ. `scripts/test-mobile.mjs` measures all of it in a browser, which is the only place the
  pointer half of the rule is real.

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
strips dashes used as clause breaks and stock openers, reading both from `lib/copy/voice.ts` rather
than keeping a list of its own. It streams, holding text back only where a
rule could still change it, so it costs the learner nothing they would notice. Only the phrases
carrying no information are rewritten: there is no mechanical translation from `seamless` back into
whatever was meant, so a brochure word is asked against in the prompt and swept in hand-written
copy rather than replaced mid-sentence with something Anu did not say. `FIX:` and `VOCAB:`
lines pass through byte for byte: rewriting punctuation inside a corrected sentence would be the
app editing Estonian, which is the rule the whole project is built on. The first version of the
stream got that wrong in the way only a test finds, rewriting a corrected sentence one chunk
boundary at a time once the first half of its line had already been shown, so the line's character
is now decided when it opens and carried until it ends.

**A class shows effort, never contents.** `lib/classroom/roster.ts` is the whole boundary: reviews
this week, streak, words known, last-seen, the group's weakest cases in aggregate, and, amending
ADR-019, each student's own weakest case as a rolled-up percentage over their own reviews, gated on
`MIN_STUDENT_CASE_REVIEWS` so one bad card never names anybody. That is still never an individual's
deck, searches or answer history: a student's raw mistakes stay theirs alone, only the roll-up moves.
The join screen states this before anyone joins, and `weakestCase` may only ever be a `{grammCase,
accuracy, total}` roll-up, never a specific answer, a search, or a card.

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
themselves. Two of those tasks stand in for a **marking criterion rather than a task** and used to
claim otherwise: the real writing part is two pieces of writing, `teate koostamine` and then a story
or a personal letter, and grammatical accuracy is what an examiner marks inside them. This app may
not mark Estonian prose, so it asks the accuracy directly and now says "not a task the real paper
sets" against both, which is the difference between a defensible substitution and a candidate who
rehearsed the wrong half of the part.

**The conditions are the paper too, and four of them were missing.** A recording plays twice and no
more, counted on the question rather than on the button so the dictation's slow play cannot hand out
four; a listening task opens with a pause to read the questions; a part **closes** when its clock
goes, inside one `fieldset` rather than a flag threaded through eleven question shapes, because the
screen used to say the paper would be taken away and then let you carry on writing; and the spoken
part follows a break, since running it off the back of ninety minutes of writing tests stamina
rather than speaking. The clock announces at five minutes and at one, and does **not** sit in a live
region, which had it reading a number a second at a screen reader for fifty minutes.

**An unfinished paper is kept on the device**, because "nothing is saved until you hand in" was an
honest description of losing three hours of B2 to a reload. `app/(app)/exam/[level]/resume.ts` holds
answers and deadlines and never a mark or a question, the deadlines are absolute so shutting the tab
does not stop the clock, and /privacy accounts for it. What the two written tasks are marked on is
shown live from `lib/exam/written.ts`, which is the marker's own function: a chip that ticked a word
off by a rule of its own would promise a mark the server was not going to give. It is a module
rather than an export of `score.ts` because the sitting screen may not import the marker at all. **What the dictionary cannot fill is reported, not dropped**: a task states its
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
`overflow-wrap`, `svg.lucide`,
`x-model-provider`, `isSameOriginMutation`, `checkRateLimit`, `markPaper`,
`rawAvailable`, `absentParts`, `standsFor`, `stageOf`, `SuggestFix`, `groupKeyFor`,
`requireAdminId`, `upsertLexemeWithForms`, `PLACES`, `QUICK_MODES`, `tourBySection`,
`VOICE_RULES`, `findTells`. Most of them now
have an invariant behind them; that list is what to check when adding one.

## Commands

```
npm run setup            # install + create db + seed (first run)
npm run dev              # dev server
npm run typecheck        # tsc --noEmit
npm run test             # unit tests (Vitest), hermetic: no database, no network
npm run test:db          # integration tests, needs Postgres in DATABASE_URL
npm run test:invariants  # the rules in this file, asserted
npm run audit:glosses    # re-check every built gloss against Wiktionary (--write applies)
npm run check:secrets    # fails if a credential reached the client bundle
npm run db:seed          # reload the built-in dictionary
npm run harvest          # re-ask Ekilex for the syllabus vocabulary (cached, needs EKILEX_API_KEY)
npm run demo             # two months of sample history, for looking at the charts
npm run test:e2e         # every browser suite, needs the server running
npm run test:browser     # the newer browser suites: routes, modes, offline, scanning, suggestions, a11y

npm run test:browser     # the newer browser suites: routes, modes, exam, offline, a11y
npm run test:mobile      # the phone, measured; needs the server running
npm run test:containment # text and icons inside their boxes, measured; needs the server running
```

With no Supabase keys the app runs as a single local learner (ADR-013), which is what makes the
browser suites possible without driving a Google sign-in from Playwright.

**Reloading a deployed dictionary is a button, and it is the one workflow that reads a secret.**
`.github/workflows/seed-production.yml` runs `npm run db:seed` against the deployment, by hand,
after somebody types a word into the confirmation box. `ci.yml` says of itself that nothing in it
maps a repository secret into a job, so a workflow file cannot become a way to read one; this file
is the exception and keeps what it can of that, being `workflow_dispatch` only and mapping the
connection string into the three steps that need a database and no others. It exists because a
deployment seeded before the harvest and the built expansion keeps saying it has 360 words for as
long as nobody reseeds it, and the person who can see that number is rarely the person with a
checkout and the production password. It never pushes the schema: the deployment's own build does
that, and a workflow that can reshape the production database is a bigger thing than one that can
reload the dictionary inside it.

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

`scripts/test-containment.mjs` is the one that looks inside a card rather than at the page. It
walks every text-bearing element, every icon and everything that arrives with a width of its own,
on **every route the app has** at 360 and 1280, plus the landing page with its disclosures open
and a paper actually being sat, and asks four things: whether anything is cut off by an ancestor
that clips, whether anything is drawn outside a border somebody painted, whether anything is drawn
on top of anything else, and whether any icon is drawn at other than the size it declared. A
scroller ends the first question rather than answering it, and so does a `truncate`, because both
are a way out that somebody chose. Then it asks all four again with the text swapped for text of
the same length that cannot break, which is how it caught the streak circles 2px over the card on
a 360px phone and the backup picker 58px over its own.

Every route rather than a chosen spread, because the first version of the list was twelve screens
picked for carrying text from somewhere other than a designer, and the third fault it found was on
a printable worksheet nobody would have thought to check. A route costs about two seconds and a
route left out is a screen where the whole rule is unenforced. The count of things on a page is
part of each pass for the same reason: a route that rendered its 404 has a heading and a button
and passes everything on the strength of having nothing to look at, which is exactly what
`/grammar/topic/rektsioon` did for one run before the count said so.

The fourth question is asked by hit-testing the letters, not by comparing rectangles, and that was
arrived at the hard way. Sibling rectangles report a wrapped inline as one box spanning every line
it touches, and an inline whose font changes mid-run (any Estonian prompt with an arrow in it) as
overlapping fragments; excluding inline elements clears both and leaves the check blind, since the
painted text here is nearly all inline. What it excludes now is what a reader cannot see anyway or
what is layered on purpose: text past an ellipsis, an absolutely positioned ornament, and anything
under the fixed bar or the paper's own sticky header. It was made to fail once, by covering a deck
row in the browser.

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

`scripts/test-suggestions.mjs` drives the loop that starts at a dead end and ends in the shared
dictionary: a report sent from a failed search, accepted in the review queue, and read back on the
entry, then a correction to that entry sent and accepted the same way. Every part of it is in a
different process, so nothing smaller than this can say the loop closes.

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

**And it now runs in CI, which is the only reason any of that is worth writing down.** It did not,
and it was red on main for an unknown length of time with a real fault behind it. The page cache is
filled as a side effect of the worker serving a navigation, and a worker does not serve the
navigation that installs it: a first visit fetched the page, the worker installed behind it, and
`clients.claim()` took over a client whose own page had never been seen. Offline and reload at that
point and there was nothing to match, so somebody who opened the app for the first time on the way
to the bus stop got "this screen needs a connection" for the whole journey and a working app on the
way home. `warmOpenPages` caches the pages already open at the moment the worker takes over. Every
open window rather than a hardcoded `/review`, because the promise is "the page you were last on
opens again" rather than "one route is special".

CI runs typecheck, lint, the unit suite, the invariants, integration tests against a real
Postgres, the production build, the credential scan, the phone and the offline smoke test. It is the enforcement behind
the rules above: do not add a rule without one.
