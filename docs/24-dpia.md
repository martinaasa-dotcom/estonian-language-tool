# Data protection impact assessment

**Controller.** Upthink Solutions OÜ, registry code 16683946, VAT number EE102590654, at Aiandi tn
8/2-28, Mustamäe linnaosa, 12915 Tallinn, Harju maakond, Estonia. Data protection contact:
privacy@upthink.ee.

**Processing assessed.** Kodukeel, a web application for learning Estonian, as deployed at
kodukeel.ee. The identity above is what `lib/legal/operator.ts` resolves for that host, and the
privacy notice at `/privacy` renders it at request time, so this document and the running app name
the same controller or neither does.

**Assessment date.** 5 September 2026. **Version 1.**

**Why this exists.** Article 35 requires an assessment where processing is likely to result in a
high risk. On the face of it this deployment is under that line: no special category data, no
systematic monitoring of a public area, no automated decision with a legal effect. It is written
anyway, for two reasons. Estonian residency and citizenship depend on a language examination, so
some of the people using this are in a position where the stakes are real, and school and workplace
groups mean an account can be visible to somebody with authority over the account holder. And a
reviewer, a funder or a procurement office asking about data protection deserves a document rather
than an invitation to read source comments. The conclusion at §6 says plainly that the threshold in
Article 35(1) is not met on our reading, and what was assessed anyway.

**How to check it.** Every claim below names the file it rests on. If a claim and the code disagree,
the code is right and this document is out of date. Say so at privacy@upthink.ee.

---

## 1. A systematic description of the processing

### 1.1 What the app does

A learner signs in, builds a deck of Estonian words, and answers questions about them. A scheduler
decides when each word comes back, using the record of how they answered it before. Around that sit
a dictionary, a grammar reference, practice rounds, a mock state examination, a conversation
practice mode, an optional AI tutor, and optional class or workplace groups.

### 1.2 Whose data, and where it comes from

| Source | What arrives |
| --- | --- |
| The data subject, directly | Everything they type: answers, tasks, calendar entries, tutor messages, exam compositions, reports of things that are wrong, the display name they choose for a class |
| The data subject, by using the app | Every grade and its timestamp, how long an answer took, which cards exist in their deck, level check results, mock exam results |
| Supabase Auth, on sign-in | Email address and an opaque user id. The password is never seen by this app, and no Google scope beyond identity is requested |
| The device | Time zone, reported by the browser and stored so a day boundary is the learner's own (`components/TimeZoneSync.tsx`) |

Nobody else supplies data about a learner. There is no data broker, no enrichment, no import from a
third party.

### 1.3 Purposes and lawful basis

Article 6 basis, per purpose. There is no consent basis anywhere in the app except where noted,
which is deliberate: consent that a person cannot meaningfully refuse without losing the service is
not consent, and the service really does need most of this.

| Purpose | What it needs | Article 6 basis | Why that one |
| --- | --- | --- | --- |
| Show a learner their own deck rather than somebody else's | Email address, user id | 6(1)(b), contract | Without an identity there is no account |
| Schedule reviews | The append-only review log: grade, moment, duration, which facet was asked | 6(1)(b), contract | The scheduler is the product. An app that forgets how well you know each word is not the app anybody signed up for |
| Keep tasks, calendar entries, starred words, settings | What the learner typed | 6(1)(b), contract | Each is a feature the learner asked for by using it |
| Keep level checks and mock exam papers | The sitting, the marked paper, the composition | 6(1)(b), contract | A measurement that cannot be recomputed from the review log, and the reason for sitting one is to compare it with the next |
| Answer a tutor question, read a photographed page | The message or image, sent to the configured AI provider | 6(1)(b), contract | The learner pressed the button that sends it. Both features are avoidable and using neither means nothing of theirs leaves |
| Cap AI spending | `UsageEvent`: model, token counts, estimated cost, day | 6(1)(f), legitimate interest | Sign-up is open and the tutor runs on a paid key. A cap that does not count is not a cap. Balanced in §3.3 |
| Log errors | Message, location, user id, never the email | 6(1)(f), legitimate interest | An app nobody can debug stays broken. Redacted by `redact` in `lib/observability/report.ts` before it is written |
| Review a report of something wrong | The category, the screen, what the app said, the proposal, anything written | 6(1)(f), legitimate interest, and 6(1)(b) for the reply | A shared dictionary nobody can correct goes wrong quietly. The learner initiated the report |
| Show a teacher or an employer how a group is doing | The narrow roster described in §3.5 | 6(1)(f), legitimate interest of the school or employer, who is a separate controller for that group | The learner joins with a code after reading what it shares (`app/(app)/class`) |
| Retention statistics | Counts derived from the review log | 6(1)(f), legitimate interest | Totals only, cohorts under five reported as a size with no percentage (`app/api/metrics/route.ts`) |
| Research corpus | Counts derived from the review log | 6(1)(f) up to the point the output exists, and nothing after it | The published file is not personal data. §3.4 and `docs/19-research-export.md` |

The research corpus is the one purpose with an opt out that is a switch rather than a letter:
**Settings, Anonymous statistics**, stored as `researchOptOut` in `lib/settings/store.ts`. Out means
the rows are never read, asserted separately on both queries, rather than subtracted after the fact.

### 1.4 Special categories, Article 9

**None are processed, and two places had to be designed so that stays true.**

The conversation practice mode (`lib/scenes/`) sets scenes including a health centre. A learner
typing about their own symptoms there would be health data. So the role card is fiction: the persona,
the complaint and any document number are drawn from the scene, the learner plays a part, and the
schema comment on `SceneRun` says as much. No scene asks for a real personal identification code.

The mock exam composition is free text the learner writes on a prompt the paper sets. A person can
put anything in free text. The prompts are ordinary examination prompts about everyday topics, and
the report box on `SuggestFix` warns in as many words that another person reads it and asks the
learner not to put anything private in it.

Nothing in the app asks for health, religion, political opinion, trade union membership, sex life,
sexual orientation, biometrics or genetics. There is no criminal offence data under Article 10.

### 1.5 Automated decision-making, Article 22

None. The app estimates a CEFR level from answers and predicts a chance of passing a mock paper.
Neither produces a legal or similarly significant effect: no qualification, admission, employment
decision or examination result depends on either, and both are marked as study advice with the
weight of the evidence printed beside the figure (`lib/exam/readiness.ts`, `EVIDENCE_LABEL`). The
marking itself is a string comparison against forms the dictionary holds, never a model's judgment,
and `lib/exam/score.ts` opens no socket. `/privacy` states this under its own heading.

---

## 2. The data inventory

Model by model from `prisma/schema.prisma`. "Export" means the file `/api/export` produces.
"Erasure" means `deleteMyAccount`, which has no exclusions at all.

### 2.1 Reference data, owned by nobody

| Model | Personal data | Retention | Export | Erasure |
| --- | --- | --- | --- | --- |
| `Lexeme` | The dictionary. Shared by everybody. `editedBy` holds a user id where somebody corrected an entry by hand | Indefinite. It is the app's content | The subset the learner's own rows point at, so a restore works | Not deleted. Attribution in `editedBy` is cleared, so a correction stops being attributed |
| `Form` | None. Inflected forms of dictionary words | Indefinite | With their lexeme | Not deleted |
| `KnownWord` | None. 154,995 Estonian headwords, one column | Indefinite | No | No |

Keeping the dictionary through an erasure is a decision rather than an oversight: other learners
have cards built on those entries, and there is nothing personal in an Estonian word once the
attribution is gone.

### 2.2 Owner-scoped data

Every model here carries `ownerId` and every query that reads it filters on the owner, including
updates. All of them are in the export except `UsageEvent`, and all of them including `UsageEvent`
are deleted on erasure.

| Model | What it holds about a person | Retention | Export | Erasure |
| --- | --- | --- | --- | --- |
| `Card` | Their deck: which words, which question shapes, the scheduler's state | Until the account is deleted | Yes | Yes |
| `Review` | Append-only. Every answer: grade, moment, how long, which facet was asked, which form they reached for instead | Until the account is deleted. The one table whose loss is unrecoverable | Yes | Yes |
| `Task` | A to-do they wrote, with a due date | Until deleted by them, or with the account | Yes | Yes |
| `StudyEvent` | Their own calendar: class times, study slots, exam dates | Until deleted by them, or with the account | Yes | Yes |
| `Message` | What they typed to the tutor and what came back | Until the account is deleted | Yes | Yes |
| `Setting` | Preferences, including the goal, the time zone and the research opt out | Until the account is deleted | Yes | Yes |
| `StarredWord` | Which dictionary words they kept | Until unstarred, or with the account | Yes | Yes |
| `Achievement` | Badges earned. No screen draws them now; rows somebody earned are theirs either way | Until the account is deleted | Yes | Yes |
| `Assessment` | A level check: the levels measured, how many questions, their own speaking rating | Until the account is deleted. Not recomputable from any log | Yes | Yes |
| `ExamAttempt` | A sat mock paper whole, including **the composition they wrote**, in their own words | Until the account is deleted | Yes | Yes |
| `Scan` | The word list a person confirmed off a photograph. **Never the photograph** | Until the account is deleted | Yes | Yes |
| `SceneRun` | A finished conversation: persona, role card, every turn. Fiction about a card, not facts about the learner | Until the account is deleted | Yes | Yes |
| `SceneGap` | Words a conversation needed and they did not have | Until the account is deleted | Yes | Yes |
| `Encounter` | One of three words about whether they spoke Estonian to anybody yesterday, and the errand if there was one. Not where, not to whom, not what was said | Until the account is deleted | Yes | Yes |
| `Suggestion` | A report of something wrong: category, screen, what the app said, their proposal, their note, and a reviewer's decision | Until the account is deleted | Yes | Yes |
| `Classroom` | A class or workplace group they run: name, join code | Until archived or deleted, or with the owner's account | Yes | Yes |
| `ClassroomMember` | Which group they joined, when, and the display name they chose for it | Until they leave, or with the account | Yes | Yes |
| `UsageEvent` | Append-only spending ledger: which model, token counts, estimated cost, the day | The running year. See §2.3 | **No** | Yes |

### 2.3 The one export exclusion, and why

`UsageEvent` is excluded, the reason is written down in `lib/legal/exportCoverage.ts`, and
`/privacy` names it as the one thing an export does not carry.

It is this deployment's accounting rather than the learner's work: which model was asked, roughly
how much text went in and out, and what it cost. Article 20 portability covers data the subject
provided; a cost estimate this app computed about its own spending is not that, and nothing in it
would be useful in another installation. Article 15 access is a different question, and the answer
there is that a learner who asks for it in writing gets it. It is deleted with the account like
everything else.

The mechanism matters as much as the exclusion. The check behind the export coverage reads the
owner-scoped models out of the schema, so a table added next year fails until somebody decides
about it. That check once had a hole exactly the shape of its own skip list: three models had been
appended to it rather than to the query, and mock exam sittings, with the learner's own composition
in them, were in no backup while the check reported the backup complete. An exclusion now has to
carry a written reason long enough to be an argument, and there is exactly one.

**Erasure has no exclusions at all.** That is a separate invariant plus an integration test driven
against a real database, because the version written from a remembered list agreed with the list
rather than with the schema.

### 2.4 Data outside the database

| Where | What | Retention |
| --- | --- | --- |
| Supabase Auth | Email address, an opaque user id, sign-in history | Until erasure. Removed by `eraseAuthIdentity` in `lib/auth/erase.ts`, or reported as unremoved if this deployment holds no service key |
| The browser, IndexedDB | The outbox of grades taken while the network was down, and the last review session's cards (`lib/offline/db.ts`) | Until sent, or until sign-out |
| The browser, localStorage | An unfinished exam paper: answers, which part, when each clock runs out. Never a mark and never a question (`app/(app)/exam/[level]/resume.ts`). Today's word puzzle guesses. A short digest of which account last used this browser | Until the paper is handed in, or until sign-out |
| The browser, Cache API | Pages the service worker cached, which are somebody's own rendered deck and progress | Until sign-out |
| The browser, cookie | One session cookie | Session lifetime |
| Error log | Message, location, user id, redacted of anything shaped like a credential | Short-lived, and the hosting provider's own window |

Signing out removes the first four through `forgetThisDevice` in `lib/offline/forget.ts`. What it
leaves is what is about the device rather than a person: the theme, the install prompt's memory, and
the audio and build caches.

There is no cookie banner, and that is a claim about the code rather than a preference. The session
cookie is strictly necessary and each browser store above exists to make the service work offline or
survive a reload, which is the exemption in the Estonian Electronic Communications Act. There is no
analytics script, no advertising identifier and no third-party tracker anywhere in the app. Vercel
Analytics was mounted once and was removed, because `/privacy` said there were no trackers and the
generated recipients list did not name it: two of those three could have been edited to make the
third true, and this is not a project where that is the fix.

---

## 3. Necessity and proportionality

### 3.1 The decisions that reduced what is held

Each of these is in the code and each cost something to make.

**The photograph is never stored.** Scanning a page decodes the image in a route handler, sends it
once to the configured model, and drops it. `Scan` has no column an image could go in, an invariant
fails if one appears, and a second invariant fails if the scan route writes to the database at all.
A picture of somebody's homework has their name at the top of it. What survives is the word list a
person looked at and ticked (ADR-021).

**The transcript is fiction.** §1.4.

**The report on a conversation held outside the app is three words.** `Encounter` records
understood, switched or did not manage it. Not where, not who, not what was said.

**Speech is never scored and never uploaded.** Speaking practice compares a recording against a
native rendering in the browser and the learner judges it. Nothing recorded leaves the device, and
no audio is stored anywhere (ADR-018). The reason is measured rather than asserted: a recogniser was
benchmarked at a 14.6 percent word error rate on clean native audio, with errors landing exactly
where an Estonian learner is weakest, so a transcript would report correct pronunciation as an error
four times in five. `scripts/measure-asr.mjs` is the measurement.

**Progress is derived, never stored.** The streak, the goal and every chart are computed from the
review log on each request. There is no counter column to be wrong, to drift, or to survive a
deletion (ADR-014). The stated exceptions are values no log can reconstruct: a personal best, which
days a streak shield has covered, a level check, and a sat paper.

**The tutor is told about the learner by the server, in three facts.** The chat used to post a level
typed into the client. `lib/progress/tutorContext.ts` now reads the level, the weakest case and the
unit in progress from the learner's own log, and the route reads no level from the request at all.
The tutor is not told the learner's name, email or history.

**The class roster is a query rather than a filtered view.** §3.5.

### 3.2 No analytics vendor

The app sends nothing to an analytics company. Retention is answered from the deployment's own
database at `/api/metrics`, worked out from the review log that already exists, and only totals
leave that route: no name, no address, no word anybody looked up, and a cohort under five people is
reported as a size with no percentage.

### 3.3 The spending ledger, balanced

`UsageEvent` is the only purpose here resting on legitimate interest that the learner cannot switch
off. The interest is keeping an open-signup free service solvent. The data is a model name, two
token counts, an estimate in millionths of a dollar and a date. It reveals that a person used the
tutor and roughly how much they wrote, which is a low intrusion, and it is bounded: the alternative
to counting is either closing sign-up or an unbounded bill, and there is no version of a cap that
works without a count. The learner can read their own meter in Settings. The ledger is excluded from
the export for the reason in §2.3 and deleted with the account.

### 3.4 The research corpus

`/api/research` publishes counts derived from the review log: accuracy per grammatical case, per
stem change, per part of speech, per level, per word. `lib/research/corpus.ts` implements four rules
of statistical disclosure control and `docs/19-research-export.md` is the fuller account.

- **Threshold.** A cell is published only above `MIN_LEARNERS` (10) distinct people and
  `MIN_REVIEWS` (50) answers. Below either it is absent from the file rather than reported as a
  small number.
- **Dominance.** No one person may be more than `MAX_LEARNER_SHARE` (half) of a cell. Ten people is
  not ten people when one of them is nine tenths of the data.
- **Complementary suppression.** A group hiding exactly one cell hides a second, because a lone gap
  comes back by subtraction, and no table publishes a total of its own.
- **Deliberate imprecision.** Counts are rounded to `COUNT_ROUNDING` (10) and head counts are given
  as bands, which is the only defence against differencing two vintages of the file.

There is no user id in the output, no email, no date anybody studied, no word anybody searched for
and no individual answer. By the time the file exists it is anonymous information under Recital 26,
so the GDPR does not apply to it. The route 404s with no `RESEARCH_TOKEN` set, and the token is its
own rather than shared with the metrics endpoint. The residual risk is assessed at R6.

### 3.5 What a group owner sees

`lib/classroom/roster.ts` and `lib/classroom/cohort.ts`. The boundary is enforced by which query
runs, not by which fields a view happens to render, so there is no setting that widens it.

A **teacher** sees, per pupil: the display name that pupil chose, reviews this week, streak, words
known, when they were last here, and the one grammatical case that pupil personally is weakest at as
a rolled-up percentage, withheld below `MIN_STUDENT_CASE_REVIEWS` (5) answers at that case. Plus the
class aggregate. The per-pupil case is a deliberate widening of an earlier line, on the argument that
a teacher already seeing a name and a word count is not better protected by having the one
actionable fact withheld: the aggregate told a teacher that the class struggles with the partitive
and nothing about who to help.

An **employer** sees less, and the difference is which function is called. `workplaceRoster` never
selects a case column at all, so an employer sees a name, whether the person has been reviewing and
when they last did, and one of four bands for the examination the group works toward. A band rather
than a percentage, because a percentage about a named employee looks exact, cannot be argued with by
the person it describes, and decides nothing a band would not. No band at all below
`MIN_EVIDENCE_TO_BAND`. The list is ordered by name rather than by band, because ordering colleagues
by how much homework they did is a league table their employer is reading.

Neither ever sees a deck, a search, a specific answer or a tutor conversation. Leaving a group
removes the membership row and nothing else.

### 3.6 Children

Estonia sets the age at which a person can agree to a service like this for themselves at 13, in the
Personal Data Protection Act, rather than the 16 the GDPR defaults to. `/privacy` says so and says
what happens below it: a parent has to agree, the app is not aimed at younger children, and an
account believed to belong to a child under 13 without a parent's agreement is deleted on request to
the address on that page.

A school running this for a class is the controller of its pupils' data and answers for that
agreement. What the class feature shows is narrow by construction (§3.5), which is the mitigation
that matters here: a pupil's exposure to their teacher is bounded by the query rather than by the
school's configuration.

There is no age gate at sign-up. That is a real gap and it is stated rather than dressed up: an age
gate a child can answer by typing a different year is a checkbox, and the mitigation this deployment
relies on is the narrowness of what is collected plus deletion on request. It is on the list at §6.

---

## 4. Risks to data subjects

Fifteen risks. Likelihood and severity are before mitigation, and each names the code that carries
the mitigation. Residual is after.

### R1. One learner reads another learner's deck or history

**Likelihood before: medium. Severity: medium.** A deck and a review log say what somebody is bad at
and how often they study, which is not neutral when the reader is a classmate.

**Mitigation.** Every page, action and route resolves the owner itself with `requireUserId()`.
Nothing in a `"use server"` file may take an owner id from its caller, because every export there is
a public endpoint, and that is asserted rather than described: a helper needing an owner as a
parameter lives in `lib/`. Every owner-scoped query filters on the owner including in an
`updateMany`, and `lib/dict/edit.itest.ts` exists because three of those were once wrong. Owner-scoped
responses carry `private, no-store` and vary on the cookie, because the framework's silence is not a
cache policy: the share card was stamped `public, immutable, max-age=31536000` and was measured
being served from the browser's own cache after a sign-out had cleared everything else.

**Residual: low.**

### R2. A teacher sees more of a pupil than the pupil agreed to

**Likelihood before: medium. Severity: medium.** A pupil cannot easily refuse their teacher.

**Mitigation.** §3.5. The join screen states what is shared before anyone joins. The roster is three
queries returning a fixed shape rather than a view over a wider read, and `weakestCase` may only
ever be a rolled-up percentage. Leaving removes the membership row and nothing else.

**Residual: low.** The residual is the per-pupil weak case, which is a judgment made in the open and
recorded above rather than a gap.

### R3. An employer sees a named employee's difficulty

**Likelihood before: medium. Severity: high.** This is the sharpest power imbalance in the app. A
sponsored employee has an interest in appearing to be doing well, and a percentage beside their name
follows them into a review they never see.

**Mitigation.** `workplaceRoster` does not select the case column, so there is nothing to render.
The readiness figure is a band and never a percentage, withheld entirely below
`MIN_EVIDENCE_TO_BAND`, and the cohort's evidence is its weakest member's so one long-standing
colleague cannot vouch for a group who joined last week. Ordered by name. `Classroom.kind` decides
which function runs.

**Residual: low.** The employer still learns whether somebody has been reviewing, which is the
minimum a sponsor can be told for the arrangement to exist at all, and the learner sees the same
statement on the join screen.

### R4. The AI provider reads what a learner wrote

**Likelihood before: high, in the sense that it is what the feature does. Severity: medium.** Tutor
messages are the learner's own writing, and a photographed page can carry a name.

**Mitigation.** Both features are optional and avoidable, and `/privacy` says using neither means
nothing of theirs leaves. `lib/legal/recipients.ts` names the actual provider this deployment is
configured with, generated from its own configuration rather than described in the abstract, so the
notice cannot be accurate on the day it was written and wrong the day after. The photograph is
dropped rather than stored (§3.1), so the provider's copy is the only one that ever existed and
nothing here retains it. Keys never reach the client: the secret scan builds with a marked string in
every server-only variable and greps the client bundle for it, and that check was verified failing
as well as passing. `/privacy` states the real limit rather than a comfortable one: what a provider
does with what we send is governed by their own terms, and some free tiers are free because the
provider keeps the right to look.

**Residual: medium.** It cannot be lower while the feature exists. The honest mitigation is that it
is optional and that the notice names who is on the other end.

### R5. Personal data crosses out of the EEA

**Likelihood before: high where an AI provider is configured. Severity: medium.**

**Mitigation and the state of it.** `PROVIDER_HOME` in `lib/legal/recipients.ts` records where each
provider is established, and every AI provider in the table is outside the EEA. Wikimedia, reached
for an English gloss on a single word with no account attached, is in the United States. Ekilex and
TartuNLP are in Estonia. Supabase's region is chosen when a project is created and is not readable
from the app, so it is recorded as unknown rather than guessed, and the page says to ask the
operator. `transfersOutsideEea` drives a paragraph on `/privacy` that appears only when the transfer
is real, naming which features do it.

The transfer rests on the standard contractual clauses each provider publishes, and `/privacy` says
that and says protection there is not identical to protection here. **This document does not claim
that a transfer impact assessment per provider has been carried out. It has not.** That is on the
list at §6.

**Residual: medium.**

### R6. Somebody is re-identified from the research export

**Likelihood before: low. Severity: high if it happened.**

**Mitigation.** The four rules in §3.4, implemented in `lib/research/corpus.ts` rather than
described, with the thresholds identical in every table so one sentence is true of the whole file.
The route does not exist without a token. The opt out is asserted separately on both queries. The
review log is grouped in Postgres and no individual review is materialised in the process.

**Residual: low.** The stated residual is that this app cannot stop an operator publishing two
vintages of the same table and differencing them, which is why the rounding exists and why
`docs/19-research-export.md` says not to promise a recurring feed.

### R7. A mailed sign-in link lands somebody in an attacker's account

**Likelihood before: low. Severity: high.** The `token_hash` branch of `/auth/callback` is
deliberately not tied to the browser that asked, which is what makes the emailed link work at all
and is also login CSRF: an attacker requests a link for an address they control and gets a signed-in
learner to open it, and everything that learner writes afterwards goes into a stranger's account.

**Mitigation.** A link that would change the signed-in account ends the session that is there and
sends the learner to `/sign-in?switched=1` with a sentence saying what happened. `next` is dropped,
because it was chosen by whoever wrote the link. Nobody signed in is the ordinary case and is
untouched, so the link works exactly as it did for the person it was mailed to. `app/auth/callback/route.ts`.

**Residual: low.**

### R8. A shared device hands one person's data to the next

**Likelihood before: high. Severity: medium.** A school computer, a shared laptop and a phone handed
to a friend are the ordinary case.

**Mitigation.** Signing out used to clear one cookie. `forgetThisDevice` in `lib/offline/forget.ts`
now removes the IndexedDB stores, the pages the service worker cached, any unfinished exam paper and
any puzzle, after the outbox has been given its chance to drain, and both sign-out paths go through
it, asserted. A grade that still cannot land is the one thing the device cannot keep and must not
silently drop, so the rail asks before losing it. Nobody signing out is the other case, and the
shell mounts `DeviceOwner` with a digest of the account id: a different account appearing on the same
browser clears what the last one left, and a queued grade from the first account is dropped rather
than replayed into the wrong deck.

**Residual: low.**

### R9. A backup restore is used to rewrite the shared dictionary

**Likelihood before: medium. Severity: medium.** A backup file is a document somebody hands the
server, and `restoreBackup` used to upsert every `Lexeme` in it by id and recreate its forms, taking
the lemma, the provenance, the editor and the forms exactly as written. Any signed-in learner could
rewrite a word every other learner reads, forge "retrieved from Ekilex" on their own text, and
delete the attested forms underneath.

**Mitigation.** The restore now does what the seed does, `ON CONFLICT DO NOTHING`, and what it
creates is marked as the restorer's own. `addExample` was the same door one plank narrower and now
has a cap, a throttle and attribution, with an attested sentence outranking a typed one. A restore
never deletes a review, which is why `Review` has no foreign key to `Card`.

**Residual: low.**

### R10. A photograph of somebody's homework is retained

**Likelihood before: medium if nothing were done. Severity: medium.** A page photograph carries a
name, and often a classmate's name too.

**Mitigation.** §3.1. Decoded in a route handler, sent once, dropped. No column, and two invariants:
one fails if an image column appears on `Scan`, one fails if the scan route writes to the database at
all.

**Residual: low.** What remains is the provider's own copy, which is R4.

### R11. A database credential reaches a learner's screen

**Likelihood before: medium. Severity: high.** `restoreBackup` and `deleteMyAccount` both end in
"and nothing was changed" followed by whatever the database said. Prisma quotes the datasource in an
initialisation failure and a restore runs a long transaction, which is exactly the window a
connection drops in, so that sentence could carry the deployment's host, user and password.

**Mitigation.** `safeMessage` is the redaction the error log already used plus a length cap, and an
invariant fails on any `"use server"` export reaching for `.message` itself and on `safeMessage`
quietly ceasing to redact. The error page shows a digest rather than the message, and the same digest
sits beside the full error in the server log.

**Residual: low.**

### R12. The error reporting endpoint carries data to somewhere nobody named

**Likelihood before: medium where one is configured. Severity: low to medium.** An error report is
redacted of anything shaped like a credential and never carries an email address, and it does carry
the opaque user id, which with a timestamp is personal data by any reading of Article 4.

**Mitigation.** `ERROR_WEBHOOK_URL` puts the endpoint on the generated recipients list, named by
host and never by path, because a webhook path is a common place to keep a token and that page is
public. Its EEA status is recorded as unknown, since nothing in the app can tell where the operator
pointed it, and the page says to ask.

**Residual: low, and dependent on the operator's own choice of endpoint.**

### R13. Free text in a report reaches a reviewer

**Likelihood before: medium. Severity: low to medium.** Every dead end in the app offers a button,
and a person can type anything into a box.

**Mitigation.** The note is optional, because somebody annoyed enough to press the button beside the
failure has already given the useful half by pressing it there. The box says in as many words that
another person reads it and asks the learner not to put anything private in it. Who reviews is
`ADMIN_EMAILS`, exact addresses only and never a domain, resolved through `requireAdminId` rather
than settling for a signed-in user, and there is no way to grant it from inside the app because a
privilege a request can grant is a privilege a forged one can grant. Reports are in the export, on
the learner's own Suggestions page, and deleted with the account.

**Residual: low.**

### R14. Erasure leaves the sign-in identity behind

**Likelihood before: high before the fix. Severity: medium.** Emptying every table this app owns left
the email address, the Google subject id and the sign-in history in Supabase Auth with no route to
remove them and nothing on the page admitting it.

**Mitigation.** `eraseAuthIdentity` in `lib/auth/erase.ts` removes it, using the service-role key.
Where that key is not configured the identity genuinely cannot be removed from here, and the button
says so plainly and points at the operator's address rather than reporting a success. A deletion that
quietly leaves something behind is worse than one that reports what it could not reach, because only
the second can be followed up. The rows are deleted either way: a failure to reach the identity store
must not roll back an erasure that already succeeded.

**Residual: low on this deployment, where the key is configured. On an installation without it, the
residual is that the operator must delete the identity by hand on request, which the screen says.**

### R15. A half-configured deployment opens itself to the internet

**Likelihood before: low. Severity: high.** Local mode keys on the absence of the Supabase keys
(ADR-013). One of the two present is not an absence, it is a hosted install with a typo in a
dashboard, and read as local mode it would serve the whole installation to every visitor under one
shared id with administrator rights, behind a sign-in screen reading as "set up later".

**Mitigation.** `halfConfigured()` is a third state and the middleware answers 503 naming the
variable that is missing.

**Residual: low.**

### Risks recorded and not separately mitigated

Two things are named here rather than assessed as controlled, because saying so is the point of the
document.

**No age verification at sign-up.** §3.6.

**No per-provider transfer impact assessment.** R5.

---

## 5. What supports the assessment

None of the following is a certification, an external audit or a penetration test. This project has
had none of those, and a reviewer should read the list as engineering evidence rather than
assurance.

- The privacy notice at `/privacy` renders from the schema and from the deployment's own
  configuration at request time. The recipients list is generated (`lib/legal/recipients.ts`), which
  is why it cannot silently disagree with what the app actually talks to.
- Export coverage is checked against the schema rather than a list, and an exclusion has to carry a
  written reason (`lib/legal/exportCoverage.ts`).
- Erasure coverage is checked against the schema with no exclusions permitted, plus an integration
  test driven against a real database.
- The credential scan builds the app with a marked string in every server-only variable and greps
  the client bundle for it. It was verified failing as well as passing, because a check nobody has
  seen fail is a check of unknown state.
- The rules this document cites as properties of the code are asserted in
  `scripts/test-invariants.ts`, which CI runs.
- `docs/19-research-export.md` is what an operator reads before sending a research file to anybody.

---

## 6. Residual risk and conclusion

**On the Article 35 threshold.** Our reading is that this processing is not likely to result in a
high risk to the rights and freedoms of natural persons, and so Article 35(1) does not require an
assessment. It involves no special category data, no criminal offence data, no systematic monitoring
of a publicly accessible area, no automated decision with a legal or similarly significant effect,
no matching or combining of datasets from different sources, and no innovative use of technology
applied to vulnerable people at scale. It does process data about children where a school deploys
it, and it does create a relationship where an employer sees something about an employee, which is
why the assessment was written rather than skipped.

**Residual risk after the mitigations above: low, with two exceptions.**

The first is R4 and R5 taken together. What a learner types to the tutor is read by a company
outside the EEA, under standard contractual clauses and that company's own terms. This cannot be
reduced further while the feature exists in this shape. It is reduced in practice by the feature
being optional, by the notice naming the actual provider, and by the fact that a deployment
configured with no provider at all is a fully working app.

The second is the two items recorded at the end of §4: there is no age verification at sign-up, and
no per-provider transfer impact assessment has been carried out. Both are stated rather than
mitigated.

**A data protection officer is not required, and this deployment has not appointed one.** Article 37
requires one of a public authority, of a controller whose core activities consist of regular and
systematic monitoring of data subjects on a large scale, or of one whose core activities are
large-scale processing of special categories. Upthink Solutions OÜ is a private company, the core
activity here is teaching Estonian rather than monitoring anybody, the processing is not at the scale
Article 37 contemplates, and no special categories are involved (§1.4). The privacy contact,
privacy@upthink.ee, reaches a person, which `/privacy` says in the same paragraph where it says there
is no officer.

**Prior consultation under Article 36 is not required,** because no high residual risk remains that
mitigation has failed to address.

---

## 7. Review

**Owner.** Upthink Solutions OÜ, at privacy@upthink.ee. There is no separate data protection officer
(§6), so the operator owns this document.

**Reviewed annually. Next review due 5 September 2027.**

**And out of cycle, whenever any of these changes.** Each one would make a claim above false.

- A new owner-scoped model in `prisma/schema.prisma`, or a change to what an existing one holds.
- A change to `NOT_EXPORTED` in `lib/legal/exportCoverage.ts`, or to what erasure covers.
- A new recipient in `lib/legal/recipients.ts`, or a configured provider changing.
- A change to any threshold in `lib/research/corpus.ts`, or to what the corpus publishes.
- A widening of what a class or workplace owner sees (`lib/classroom/`).
- Any new feature that sends a learner's own text or an image to a third party.
- A change to what the app stores in the browser, or to what a sign-out clears.
- An age gate, or a transfer impact assessment, either of which would close an item at §6.

`docs/25-data-retention.md` is the retention schedule this assessment refers to, and
`docs/26-subprocessors.md` is the recipient register.
