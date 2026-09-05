# Incident response

What happens when something has already gone wrong. Written to be usable at two in the morning by
whoever is holding it, which is why the runbooks are commands rather than principles.

This is a small operation. The plan says who actually does what rather than describing a rota that
does not exist. A plan that assumes people we do not have is a plan nobody follows on the night.

Operator: **Upthink Solutions OÜ**, registry code **16683946**, Aiandi tn 8/2-28, 12915 Tallinn,
Estonia. Security and privacy contact: **privacy@upthink.ee**.

Read alongside it: `docs/27-security.md` for the threat model and the controls,
`docs/24-dpia.md` for the impact assessment, `docs/25-data-retention.md` for what is kept and for
how long, and `docs/26-subprocessors.md` for who else holds any of it.

## 1. Severity

Set the severity in the first ten minutes and write it down. It decides the clock, and it can be
raised later without embarrassment.

| Level | Means | Examples from this app |
| --- | --- | --- |
| **S1** | Personal data is exposed or lost, or the deployment is compromised | A query missing its `ownerId` filter serving one learner another's deck. The Supabase service role key found in a public place. Someone signed in as somebody else through a mailed link. `Review` rows deleted with no recoverable copy. |
| **S2** | A control that protects data has failed, with no confirmed exposure yet | The forged request gate stops running. `safeMessage` stops redacting and a Prisma error quotes the connection string to a learner. The sign-in allowlist stops being checked. A dependency advisory with a working exploit path into this app. |
| **S3** | Availability, or money, without a data fault | Supabase Auth is down and nobody can sign in. The AI ledger is bypassed and the daily budget is spent by lunchtime. The database is unreachable. |
| **S4** | A fault worth fixing that harms nobody now | A missing security header. A vandalised dictionary entry. A rate limit that is too generous. A finding from a scanner with no path behind it. |

Two rules about setting it. **Uncertainty rounds up**: if you cannot yet tell whether personal data
was reached, it is S1 until you can. And **a control failing is S2 even when nothing has been
exploited**, because the whole point of a control is that you do not find out afterwards.

## 2. Who does what

There are not enough of us for named roles, so these are jobs that one or two people wear at once.

**Incident lead.** Whoever notices, until somebody more senior takes it. The lead decides severity,
keeps the timeline, and is the single person who decides when it is over. If two people are involved,
say aloud which of you is the lead. Nobody investigating is also the one writing to the authority.

**Technical work.** Whoever has the production access. In practice that is one or two people with the
Vercel and Supabase accounts.

**Data protection decisions.** The Article 33 and 34 calls in section 4 are the operator's, made by
Upthink Solutions OÜ. If the incident is at a school or a company running its own installation, they
are the controller and those calls are theirs; we support them and we do not make the notification on
their behalf.

**Talking to people outside.** One person, through privacy@upthink.ee. Not a second channel and not a
personal account. Everything sent out is written down in the timeline.

Nobody is on call. There is no 24/7 rota and pretending otherwise would be the first false claim in
this document. Detection is described honestly in section 3, and the response starts when a person
reads the mail.

## 3. Detect

What actually reaches a person, in the order it is likely to:

- **An email to privacy@upthink.ee.** A learner, a teacher, or an outside researcher following
  `SECURITY.md`. This is the most likely detection for anything a person can see.
- **A report through the in-app queue.** Every dead end in the app carries a report button, and the
  queue at `/admin/suggestions` is read by whoever is named in `ADMIN_EMAILS`. It is meant for
  dictionary corrections and it is where a learner describes a wrong screen.
- **The error log.** Structured JSON on stderr, retained by the platform, and forwarded to
  `ERROR_WEBHOOK_URL` if the deployment sets one. Nothing watches it continuously.
- **CI going red on main.** The invariants, the credential scan and the two audit gates.
- **`/api/metrics`**, if the deployment polls it, which reports whether people are coming back
  rather than whether anything is wrong.
- **A provider bill or a rate limit notice** from Vercel, Supabase, or a model provider.
- **GitHub Dependabot and `npm audit`** in CI, for dependency advisories.

Say so plainly: there is no intrusion detection and no alerting on the security signals. Section 6 of
`docs/27-security.md` lists that among what has not been done.

## 4. Triage

Within the first hour, answer four questions in writing. They are the same four the notification in
section 5 needs, so answering them now is not overhead.

1. **What happened**, in one sentence a non-engineer understands.
2. **What data is involved**, by category. Review history, written work, email addresses, exam
   compositions, tutor conversations, class membership. Say "we do not know yet" where that is true.
3. **How many people**, and whether they can be identified individually.
4. **What the likely consequence is** for those people.

Start the timeline file at the same moment. Every entry is a timestamp in UTC, what was observed or
done, and by whom. It is the only artefact that makes the review in section 8 worth anything, and it
is what a supervisory authority asks for.

**The 72 hour clock starts when you become aware**, not when you finish investigating. Note the
moment of awareness in the timeline explicitly, because it is the fact everything after it is
measured against.

## 5. The GDPR clock

This section applies where personal data is involved. Everything on the asset list in
`docs/27-security.md` section 3 except the provider keys and the dictionary is personal data.

### Article 33: telling the supervisory authority

**Without undue delay and, where feasible, not later than 72 hours after becoming aware**, unless
the breach is unlikely to result in a risk to the rights and freedoms of the people affected. If it
is later than 72 hours, the notification has to carry the reasons for the delay.

The authority for a deployment operated from Estonia:

**Andmekaitse Inspektsioon (Estonian Data Protection Inspectorate)**
Tatari 39, 10134 Tallinn, Estonia
info@aki.ee
+372 627 4135
https://www.aki.ee/en

Those details are held in code, in `SUPERVISORY_AUTHORITY` in `lib/legal/operator.ts`, and rendered
on `/privacy`, so the page a learner reads and this document cannot drift apart.

A notification must describe, per Article 33(3):

- the nature of the breach, including where possible the categories and approximate number of people
  affected and the categories and approximate number of records;
- the name and contact details of the data protection contact point, which is privacy@upthink.ee;
- the likely consequences of the breach;
- the measures taken or proposed to address it, including where appropriate measures to mitigate its
  possible adverse effects.

If you do not have all of it at 72 hours, **notify anyway with what you have** and say the rest will
follow. Article 33(4) allows information to be provided in phases. A late complete notification is
worse than a prompt partial one.

Keep a record of every breach whether or not it was notified, with the facts, the effects and the
remedial action. Article 33(5) requires that record to exist for the authority to verify compliance.
The timeline file is that record.

### Article 34: telling the people affected

**Without undue delay**, where the breach is likely to result in a **high** risk to their rights and
freedoms. Not required if the data was rendered unintelligible to anyone unauthorised, if subsequent
measures make the high risk no longer likely, or if it would involve disproportionate effort, in
which case a public communication takes its place.

For this app, the shapes that clear the high risk bar are learner identities exposed together with
their study data, and anything free text a learner wrote: exam compositions, tutor conversations,
scanned homework. A count of somebody's flashcards on its own is unlikely to.

The communication has to be in **clear and plain language** and carry the nature of the breach, the
contact point, the likely consequences, and the measures taken. It is written the way the rest of
this app is written: one person telling another what happened, no softening, no reassurance we
cannot back. `docs/18-voice.md` is the standard for that sentence as much as for any screen.

### If the deployment is somebody else's

Kodukeel is software people install. When a school or a company runs its own copy, they are the
controller and the notification is theirs to make. Our job is to give them what they need to make it,
promptly, and to say clearly that the decision is not ours. `/privacy` already carries this
distinction.

## 6. Contain, eradicate, recover

**Contain** before you understand. It is always allowed to make the app less useful for an hour.

- Take the deployment offline or to a maintenance page if data is actively being served wrongly.
- Rotate the credential if one is implicated. Section 7 says which key opens what.
- Disable a route rather than the whole app where the fault is one endpoint.
- Preserve evidence before you clean up: copy the logs, note the deployment SHA, snapshot the
  database if it is relevant. A rollback that erases the evidence turns a fixable incident into an
  unexplainable one.

**Eradicate.** Fix the cause, not the symptom, and add the check that would have caught it. This
repository's convention is that a rule with no assertion behind it is a comment: if the fault was a
control that drifted, the fix includes an entry in `scripts/test-invariants.ts` that fails on the
old code. Make it fail once before you trust it.

**Recover.** Deploy, verify, and watch. Verification means the specific thing that was wrong, tested
by hand, plus a green CI run. Say out loud when you consider the incident closed, and only the lead
says it.

## 7. Runbooks

### 7.1 A leaked credential

Which key opens what, so you know how bad it is before you know anything else.

| Variable | What it opens | Rotate where |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Everything in the Supabase project, bypassing row level security. Reads and writes every learner's rows and deletes auth identities. **Always S1.** | Supabase dashboard, API settings |
| `DATABASE_URL` / `DIRECT_URL` | The whole database, read and write. **Always S1.** | Supabase dashboard, database password |
| `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY` | Somebody else's spend on our account. No learner data, since prompts go out and nothing comes back that is stored. S3 unless the key is shared with something that does hold data. | The provider's own console |
| `EKILEX_API_KEY` | Read access to a free academic dictionary service. Costs the Institute of the Estonian Language politeness rather than money. S4. | ekilex.ee |
| `METRICS_TOKEN` | Deployment-wide retention aggregates. No individual data. S3. | Redeploy with a new value |
| `RESEARCH_TOKEN` | The anonymised learner error corpus. Gated four ways before publication, so still no individual data, and it is a whole dataset. S2. | Redeploy with a new value |
| `ERROR_WEBHOOK_URL` | Wherever errors are posted. The path itself is often the credential. S3. | Regenerate at the receiving end |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Nothing on its own. It is public by design and authenticates who is signed in. **Not an incident.** | Not applicable |

Steps:

1. Rotate first, understand second. Every one of these can be rotated in minutes.
2. Redeploy so the running functions pick up the new value.
3. Read the provider's usage log for the window the old key was exposed. For a database or service
   role key that means the Supabase logs; for a model key, the provider's console.
4. Find how it got out. If it reached the client bundle, CI should have caught it, so also work out
   why the `secrets` job did not: `npm run check:secrets` against a build, and check whether the
   variable is in the canary list in `.github/workflows/ci.yml`.
5. If a database or service role key was live and used, this is S1 and section 5 applies.

### 7.2 The AI spend ledger running away

Symptom: the provider bill or the daily spend is far above the `AI_DAILY_USD_GLOBAL` cap, or learners
are being refused when they should not be.

1. Read the ledger. It is the record and it is append-only.

   ```sql
   SELECT "day", "kind", "entry", count(*), sum("costMicros")
   FROM "UsageEvent" WHERE "day" >= current_date - 3
   GROUP BY 1,2,3 ORDER BY 1 DESC, 5 DESC;
   ```

2. Find the owner. `SELECT "ownerId", count(*), sum("costMicros") FROM "UsageEvent" WHERE "day" =
   current_date GROUP BY 1 ORDER BY 3 DESC LIMIT 20;`
3. Two shapes of fault, told apart by the rows. Many `CALL` rows with no matching `SETTLEMENT` means
   a route is booking and not settling, so the reservations are standing and the estimate is what is
   being charged. `CALL` rows with no reservation at all, written by `recordUsage` without one, means
   a path reached a provider without going through `authoriseCall`, which is the fault the invariant
   in `scripts/test-invariants.ts` exists to prevent.
4. Contain by lowering `AI_DAILY_USD_GLOBAL` and redeploying. It has no off switch and it fails
   closed, so lowering it to near zero stops the spending without stopping the app: everything except
   the tutor, the grader, the scanner and speech works with no model at all.
5. If a key is the cause rather than a route, rotate it under 7.1.
6. Eradicate with an invariant, not a comment.

### 7.3 Restoring the database

Read section 9 first. The honest recovery numbers are there.

1. Stop writes. Put the deployment into maintenance, or take the functions down.
2. Restore in the Supabase dashboard to the chosen point.
3. Run the schema push and the seed guard, in this order, because the dictionary is reference data
   and the seed is idempotent:

   ```
   npx prisma db push
   npm run db:seed:ensure
   ```

4. Verify before letting anybody in. `Review` is the table that matters, so count it and check the
   latest timestamp against what you expect to have lost.
5. Tell the learners what window of work is gone, in the same language section 5 asks for. Silence
   about lost review history is worse than the loss.

A learner's own backup is the other path. `Settings → Download a backup` writes a JSON file and the
same panel restores it. Merge is the default and cannot delete anything, so restoring twice is
harmless; `replace` is behind a typed confirmation and still never deletes a review.

### 7.4 The dictionary vandalised

Through the suggestion queue, through a hand edit, or through a restore.

1. Find what changed. Every write to `Lexeme` carries `editedBy`, so:

   ```sql
   SELECT "id","lemma","pos","provenance","editedBy","updatedAt"
   FROM "Lexeme" WHERE "editedBy" IS NOT NULL ORDER BY "updatedAt" DESC LIMIT 100;
   ```

2. Work out the door. `provenance = 'USER'` with `editedBy` set to a learner who is not in
   `ADMIN_EMAILS` means a restore created it, since a restore marks what it creates as the restorer's
   own. `provenance = 'EKILEX'` with a recent `updatedAt` means the hand edit or the suggestion queue,
   both of which go through `lib/dict/upsert.ts` and may only have touched principal parts.
3. The seed is the ground truth for anything the built dictionary carries. `npm run db:seed` reloads
   it, and it writes with `ON CONFLICT DO NOTHING`, so it will not undo an edit on its own: delete the
   corrupted rows first, then reseed.
4. Check what the bad entry taught. A wrong form gets drilled, which is why this matters more here
   than a wrong row usually would. `npm run audit:decks` names case cards in learners' decks whose
   answer is a form Estonian does not use, and `--write` removes them. Run it in report mode first.
5. If a reviewer account was the door, remove the address from `ADMIN_EMAILS` and redeploy. It cannot
   be granted or revoked from inside the app by design.
6. This is usually S4. It becomes S2 if the queue or the restore path turns out to be writing things
   the rules in section 4.2 of `docs/27-security.md` say it cannot.

### 7.5 An auth provider outage

Supabase Auth is unreachable, or Google Sign-In is failing.

1. Confirm which. `curl -sI https://<project-ref>.supabase.co/auth/v1/health` and the providers'
   status pages.
2. Understand what the app already does, because it is designed for this. Every auth call carries a
   2,500ms deadline (`AUTH_TIMEOUT_MS`), and `readIdentity` returns `unreachable` rather than `out`,
   which the middleware **passes through**. That is deliberate: reading a timeout as a sign-out would
   take a learner's own deck away over a bad minute at somebody else's server. It cannot leak
   anything, because `requireUserId()` throws when the session cannot be verified, so pages resolve to
   an error rather than to somebody else's data.
3. So the observed behaviour is: signed-in learners with a valid token keep working while the token
   lasts, and new sign-ins fail. Say that on a status note rather than letting people guess.
4. If sign-ins are failing but the service is up, check the configuration fault first, because it is
   far more likely than an outage. The Site URL and Redirect URLs in the Supabase dashboard have to
   name the address people actually use, and `NEXT_PUBLIC_SITE_URL` has to match. `lib/auth/canonical.ts`
   and the `?bounced=1` branch in `app/auth/callback/route.ts` exist because this went wrong once.
5. Do not work around it by disabling the gate. There is no flag that does, and adding one would be
   the worst possible outcome of an outage.

### 7.6 A dependency vulnerability

1. Read it. `npm audit` in full, then `npm audit --omit=dev` to see whether it ships.
2. Decide whether the path is reachable from this app. A dev server advisory in the vitest chain does
   not ship; a parser advisory in something the restore path uses does.
3. Fix by clearing the chain. `overrides` in `package.json` has resolved both of the chains this
   repository has had, without a major upgrade. **Do not lower the audit level in CI.** The workflow
   says so in writing and the reason is that a blocking check people learn to click past is not a
   check.
4. If it genuinely cannot be cleared, write the reason in `.github/workflows/ci.yml` beside the gate,
   naming why the path is unreachable. That is the only acceptable exception and it is reviewable.
5. Redeploy and confirm both gates pass.

## 8. Review

Within a week of closing, and written down. Four questions:

1. What was the fault, in the code or in the configuration?
2. Why did nothing catch it? This is the one that matters. Every other question has an obvious
   answer by the time you are writing.
3. What check now exists that would have caught it, and has it been made to fail once against the old
   code? An assertion nobody has watched fail is an assertion nobody knows the state of.
4. What did the response itself get wrong? Detection time, containment, who was told and when.

No blame on a person. The faults this repository has actually had were all faults of a rule stated in
prose with nothing enforcing it, and the fix each time was to move the rule into something that runs.

## 9. Backup and recovery, honestly

What is true today rather than what would look better.

**Postgres.** Backups are Supabase's, on whatever plan the deployment is on. Their daily backup
retention and point-in-time recovery are plan-dependent features and this project inherits them
rather than operating its own. **We have not tested a full production restore from a Supabase backup.**
That is the single largest gap in this section and it is the one worth closing first.

- *Recovery point objective, as it stands:* whatever the Supabase plan provides. On a daily backup
  plan that is up to 24 hours of review history.
- *Recovery time objective, as it stands:* untested. The steps in 7.3 are minutes of work plus
  however long Supabase takes to restore, and nobody has measured the second part on a real database.

**The learner's own backup.** Tested, and it is the one recovery path that is exercised on every CI
run. `scripts/test-restore.mjs` empties every table and restores from an export, and it runs in the
browser job. It covers one learner's own data, not the deployment.

**The dictionary.** Not backed up and does not need to be. It is a build artefact of this repository:
`prisma/data/expanded.json` is in git, `npm run db:seed` loads it, and `.github/workflows/seed-production.yml`
reloads it against a deployment by hand after somebody types a confirmation. Recovery is a workflow
run. That workflow is the one place in CI that maps a repository secret into a job, deliberately, and
it never pushes the schema.

**The audio cache.** Content addressed in Supabase Storage. Losing it costs requests to a free
academic service, not data. No backup needed.

**Application state.** All of it is in Postgres or in the repository. There is no separate file store
holding anything that matters, and the photograph a learner scans is decoded in a Route Handler and
never stored at all.

**What to fix, in order.** Test a restore from a Supabase backup end to end and write the measured
RTO here. Then state the plan's retention explicitly rather than saying "whatever the plan provides".
Then decide whether an independent copy of `Review` is worth its own operational cost, given that it
is the one table whose loss is unrecoverable and that a learner can already take their own.

## 10. Reaching a person

**privacy@upthink.ee** is the address for a security report, a data subject request and an incident.
There is no separate security mailbox and this document does not pretend there is one. Response
times are in `SECURITY.md` and they are the ones we can keep.

Post reaches Upthink Solutions OÜ, Aiandi tn 8/2-28, Mustamäe linnaosa, 12915 Tallinn, Harju
maakond, Estonia.

A learner who is not satisfied with how we handled something may complain to the Estonian Data
Protection Inspectorate, whose details are in section 5 and on `/privacy`. Somebody established
elsewhere in the Union may complain to their own authority instead.
