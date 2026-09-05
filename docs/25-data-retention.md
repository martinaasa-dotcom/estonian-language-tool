# Retention schedule

**Controller.** Upthink Solutions OÜ, registry code 16683946, Aiandi tn 8/2-28, Mustamäe linnaosa,
12915 Tallinn, Harju maakond, Estonia. Contact: privacy@upthink.ee.

**Written 5 September 2026.** Reviewed with `docs/24-dpia.md`, on the same schedule and for the same
triggers.

## What this document is honest about first

**Most of this app keeps data until the learner deletes their account, and there is no automatic
expiry.** That is stated rather than dressed as a policy with a number in it, because a schedule
claiming "36 months" when nothing in the code counts months is worse than no schedule: a reviewer who
checks one figure and finds nothing enforcing it stops believing the rest.

The reason is the product. Spaced repetition works off the whole history of a card, so a review log
truncated at two years makes the scheduler worse at exactly the words a learner has known longest. A
level check is only useful beside the one before it. A mock paper with somebody's own composition in
it is worth going back to years later. Deleting any of that on a timer would be taking away the thing
the person came for, without being asked.

What that costs is met the other way round: erasure is a button rather than a request, it is
immediate, it covers every table with no exclusions, and it reaches the sign-in identity as well.
`/privacy` says all of this in the same terms.

## The schedule

"Trigger" is what actually causes the row to go. "Enforced by" is where in the code, so a reader can
check.

### Data in the database, owner-scoped

| Category | Kept for | Trigger for deletion | Enforced by |
| --- | --- | --- | --- |
| Deck (`Card`) | Until the account is deleted | Erasure, or the learner deleting a card | `deleteMyAccount` in `app/actions.ts` |
| Review log (`Review`) | Until the account is deleted. Append-only, never updated, never trimmed | Erasure only | `deleteMyAccount`. Nothing else in the app deletes a review, and a restore may not either |
| Tasks (`Task`) | Until deleted by the learner, or the account is | Either | `deleteMyAccount`, plus the task's own delete |
| Calendar (`StudyEvent`) | Until deleted by the learner, or the account is | Either | `deleteMyAccount`, plus the event's own delete |
| Tutor conversation (`Message`) | Until the account is deleted | Erasure | `deleteMyAccount` |
| Settings (`Setting`) | Until the account is deleted | Erasure | `deleteMyAccount` |
| Starred words (`StarredWord`) | Until unstarred, or the account is deleted | Either | `toggleStar`, `deleteMyAccount` |
| Badges (`Achievement`) | Until the account is deleted | Erasure | `deleteMyAccount` |
| Level checks (`Assessment`) | Until the account is deleted. Append-only | Erasure | `deleteMyAccount` |
| Mock exam sittings (`ExamAttempt`), including the composition | Until the account is deleted. Append-only | Erasure | `deleteMyAccount` |
| Confirmed word lists off a photograph (`Scan`) | Until the account is deleted | Erasure | `deleteMyAccount` |
| Conversation runs (`SceneRun`) and the words they needed (`SceneGap`) | Until the account is deleted. Append-only | Erasure | `deleteMyAccount` |
| Reports of real conversations (`Encounter`) | Until the account is deleted. Append-only | Erasure | `deleteMyAccount` |
| Reports of something wrong (`Suggestion`) | Until the account is deleted, whatever the review status | Erasure | `deleteMyAccount` |
| Group ownership and membership (`Classroom`, `ClassroomMember`) | Membership until the learner leaves. A group until its owner archives or deletes it, or deletes their account | Leaving, archiving, erasure | `leaveClassroom`, `deleteMyAccount` |
| Spending ledger (`UsageEvent`) | The running year, since the caps it enforces are daily. Append-only within that | The year turning over, and erasure | `deleteMyAccount` for the account's own rows. See the note below |

**A note on the ledger, because it is the one row in this table with a period on it.** `/privacy`
says spending records are kept for the running year. The rows are keyed by UTC day and the quota
reads a day at a time (`lib/usage/quota.ts`), so nothing older than the current day is read by the
app for any purpose. Pruning last year's rows is an operator task rather than something the app does
on a schedule, and this document does not claim a job runs. What the app guarantees is the erasure:
an account's ledger rows go with the account, immediately, like everything else.

### Reference data, owned by nobody

| Category | Kept for | Trigger | Enforced by |
| --- | --- | --- | --- |
| Dictionary (`Lexeme`, `Form`) | Indefinitely. It is the app's content, shared by every learner | None. Not deleted on erasure | Deliberate. Other learners have cards built on these entries |
| Attribution of a hand edit (`Lexeme.editedBy`) | Until the editor deletes their account | Erasure of that account | `deleteMyAccount` clears the attribution, leaving the correction |
| Estonian headword list (`KnownWord`) | Indefinitely. One column, no personal data | None | Reference data, in no backup and no erasure |

### The sign-in identity

| Category | Kept for | Trigger | Enforced by |
| --- | --- | --- | --- |
| Email address, user id, sign-in history, held by Supabase Auth | Until erasure | The learner pressing delete | `eraseAuthIdentity` in `lib/auth/erase.ts` |

Where a deployment holds no service-role key, the identity cannot be removed from the app and the
screen says so plainly rather than reporting a success, pointing at the operator's address. On
kodukeel.ee the key is configured. On any installation without it, the operator deletes the identity
by hand on request.

### Data on the learner's own device

None of this is on a server and none of it is shared. All of it is removed by signing out, through
`forgetThisDevice` in `lib/offline/forget.ts`.

| Category | Kept for | Trigger | Enforced by |
| --- | --- | --- | --- |
| Outbox of grades taken offline | Until each grade reaches the server | Successful replay, or sign-out | `lib/offline/db.ts`, `replayGrades` |
| Last review session's cards | Until replaced by the next session, or sign-out | Sign-out | `lib/offline/db.ts` |
| Unfinished exam paper: answers, part, deadlines. Never a mark, never a question | Until the paper is handed in | Handing in, or sign-out | `app/(app)/exam/[level]/resume.ts` |
| Today's word puzzle guesses | Until the day turns over, or sign-out | Sign-out | localStorage, cleared by `forgetThisDevice` |
| Cached pages, which are somebody's own rendered deck and progress | Until sign-out, or until the service worker's own ceiling evicts them | Sign-out, cache limit | `forgetPages`, `LIMITS` in `public/sw.js` |
| Digest of which account last used this browser | Until sign-out, or a different account signs in | Either | `forgetIfOwnerChanged` |
| Session cookie | The session | Sign-out or expiry | Supabase Auth |
| Theme, install prompt memory, audio and build caches | Not cleared by sign-out | Clearing browser storage | Deliberate. These are facts about the device, the same for whoever signs in next |

Nobody signing out is the other case and is covered: a different account appearing on the same
browser clears what the last one left, and a queued grade from the previous account is dropped rather
than replayed into the wrong deck.

### Logs and derived output

| Category | Kept for | Trigger | Enforced by |
| --- | --- | --- | --- |
| Error log: message, location, user id, never an email | Short-lived by nature, and whatever the hosting provider's window is. This app runs no log store of its own | The provider's retention | `redact` in `lib/observability/report.ts` strips anything shaped like a credential before it is written |
| Error webhook deliveries, where `ERROR_WEBHOOK_URL` is set | Whatever the operator's endpoint keeps | The operator's own policy | Outside this app. Named on `/privacy` by host |
| Retention statistics at `/api/metrics` | Nothing is stored. Computed on request from the review log | Not applicable | `app/api/metrics/route.ts` |
| Research corpus at `/api/research` | Nothing is stored. Computed on request. A file an operator downloads is that operator's to keep | Not applicable to this app | `lib/research/corpus.ts`. The output is anonymous, so no retention obligation attaches to it |

### Backups

There is no separate archive kept by this app, and no backup that outlives a deletion by more than
the hosting provider's own retention window. `/privacy` says this. A learner's own export, which they
download, is theirs to keep or delete and this app holds no copy of it.

## What triggers a deletion, gathered

- **The learner deletes their account.** Settings, Deleting your data. Every owner-scoped table, in
  one transaction, plus the sign-in identity. No exclusions.
- **The learner deletes one thing.** A card, a task, a calendar entry, a star.
- **The learner leaves a group.** The membership row and nothing else. Their deck is untouched.
- **The learner signs out.** Everything on the device, above.
- **A different account signs in on the same browser.** The same clearing, without a sign-out.
- **A group owner archives or deletes a group.** The group, and its memberships with it.
- **The operator prunes the ledger.** The one thing on this page with a period rather than an event,
  and the one thing not automated.

## Where retention is currently open, and stated as such

Three things.

**Most owner-scoped data has no expiry.** It is kept until the learner deletes their account. The
reason is at the top of this page and the mitigation is that deletion is a button, not a letter.

**A dormant account is not deleted.** There is no job that removes an account nobody has signed into
for two years. If one is added, it belongs here with the notice period it gives, and `/privacy` has
to say so before it runs, since deleting somebody's review history without warning is the worst thing
this app could do to a person who was about to come back.

**The ledger year is a policy rather than a cron job.** Above.

## Review

Owned by Upthink Solutions OÜ at privacy@upthink.ee, reviewed annually with `docs/24-dpia.md` and out
of cycle whenever a model is added to the schema, an erasure or export rule changes, or a retention
period is introduced or dropped.
