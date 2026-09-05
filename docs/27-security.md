# Security review and threat model

Written for an engineer on the buying side who has to decide whether this is safe to put in front of
learners, and for a grant reviewer who has to decide whether public money is going somewhere
careful. Every control named here is a file you can open. Where something has not been done, it says
so in the same plain terms as the rest.

The operator of the deployment at kodukeel.ee is **Upthink Solutions OÜ**, registry code
**16683946**, Aiandi tn 8/2-28, 12915 Tallinn, Estonia. Security contact **privacy@upthink.ee**.
There is no separate security address yet, and that mailbox is the one on the privacy page, so it is
the one certain to reach a person. `SECURITY.md` in the repository root is the disclosure policy.

Read alongside it: `docs/24-dpia.md` for the data protection impact assessment,
`docs/25-data-retention.md` for how long anything is kept, `docs/26-subprocessors.md` for who else
touches the data, `docs/28-incident-response.md` for what happens when this fails, and
`docs/29-controls.md` for the procurement control map.

## 1. What the system is

Kodukeel teaches Estonian: a dictionary, a spaced repetition deck, practice rounds, a mock state
examination, and a tutor. It is a Next.js 15 App Router application. It is also software people
install, so there are two shapes of deployment and the difference matters to everything below.

**Hosted.** Supabase Auth is configured, every route is gated, and each learner sees only their own
rows. This is what runs on the public internet.

**Local.** No Supabase keys are set. The app runs as one learner on one machine under a fixed id,
with no sign-in, because demanding an OAuth project before the first flashcard is a wall rather than
security. `lib/auth/mode.ts` decides which, on the absence of configuration alone. A configured
deployment cannot be talked into local mode.

There is a third state and it is answered as neither. One Supabase variable set and the other missing
is a hosted install with a typo in a dashboard, and reading that as local mode would open it to the
internet under one shared id with every visitor treated as a reviewer. `halfConfigured()` in
`lib/auth/mode.ts` detects it and the middleware answers 503 naming the variable that is not set.

## 2. Trust boundaries

```
  Browser (learner's device)
    | HTTPS, HSTS preloaded, CSP set per response
    v
  Next.js on Vercel  ------ server only ------> Anthropic / OpenAI / OpenRouter / Groq / Gemini
    |   middleware.ts                             (whichever keys the deployment holds)
    |   Server Actions, Route Handlers   ------> TartuNLP speech (api.tartunlp.ai)
    |                                    ------> Ekilex, Wiktionary
    v
  Postgres (Supabase)          Supabase Auth          Supabase Storage (audio cache)
```

Five boundaries, and what crosses each:

**Browser to server.** Everything a learner does. The browser holds a Supabase session cookie, an
IndexedDB outbox of review grades taken offline, a service worker cache of pages, and an unfinished
exam paper in `localStorage`. It never holds a provider key, a database URL or a service role key.

**Server to Postgres.** Prisma over the pooler, in the same region as the functions
(`vercel.json`). The connection string is server only. Row ownership is enforced in application
code, not by Postgres row level security: every owner scoped query filters on `ownerId`, and the
owner is resolved by `requireUserId()` rather than taken from the caller.

**Server to Supabase Auth.** Token verification and refresh, under a 2,500ms deadline
(`lib/auth/identity.ts`). Where the project uses asymmetric signing keys this is a local signature
check against a cached key set and reaches the network not at all.

**Server to the model providers.** The one place a learner's typed Estonian leaves the deployment.
It goes out from a Route Handler, never from the browser, and every call is metered before it is made
(`lib/usage/ledger.ts`).

**Server to Ekilex, Wiktionary and TartuNLP.** Reference data and speech. These are read only,
carry nothing about the learner, and are proxied so their keys and their quota stay on the server.
The Content Security Policy names no third party in `connect-src` at all, which is what makes that
structural rather than a habit.

## 3. What is worth taking

Ranked, because a threat model that treats every asset the same has not been thought about.

1. **The review log.** `Review` is append-only and is the one table whose loss cannot be
   reconstructed. It is also a record of how somebody is doing.
2. **Written work.** A mock exam composition, a conversation with the tutor, a scanned page. The
   least reconstructable free text in the schema.
3. **Identity.** Email address and Google subject id, held by Supabase Auth rather than by this app.
4. **The provider keys and the database URL.** A leak here is a bill and a breach at once.
5. **The shared dictionary.** `Lexeme` and `Form` are reference data every learner reads, so
   vandalising one word is vandalising it for everybody.
6. **The AI budget.** Not personal data, and still the thing an unmetered path turns into an
   unbounded invoice.

## 4. Threat model

Each entry is an adversary, what they would try, what stops them, and where that control lives.

### 4.1 Another learner reading somebody's deck

**Attack.** Sign up, then try to read or write rows belonging to a different account, by guessing an
id or by naming one.

**Control.** No `"use server"` export takes an owner id from its caller. Every one resolves the owner
itself through `requireUserId()` in `lib/auth/session.ts`, which throws when the session cannot be
verified. A helper that genuinely needs an owner as a parameter lives under `lib/` and is never an
endpoint. Every owner scoped query, including every `updateMany`, filters on that resolved id. This
is asserted in `scripts/test-invariants.ts` rather than left to review.

**Residual.** Authorisation is in application code. There is no Postgres row level security behind
it as a second layer, so a query written without the filter would not be caught by the database. The
invariant suite is what catches it, and that is a check on the source rather than a runtime guard.

### 4.2 A signed-in learner attacking the shared dictionary

**Attack.** The dictionary is reference data every learner reads. Rewrite a word, forge "retrieved
from Ekilex" on your own text, or push a bad entry through the report queue.

**Control.** Three rules, in `lib/dict/upsert.ts`, and every write path goes through it: only
principal parts may be replaced, a form Ekilex supplied is never touched, and the edit is attributed
in `editedBy`. The suggestion queue in `lib/suggestions/apply.ts` may remove an example sentence and
may never rewrite one, because editing an attested sentence would be this app writing Estonian. No
module under `lib/suggestions/` can reach a model provider at all, asserted, so every Estonian
character arriving that way was typed by a person into a form.

Who may accept a report is a deployment fact, not a role handed out at runtime. `lib/auth/admin.ts`
reads `ADMIN_EMAILS`, exact addresses only and never a domain, and `requireAdminId()` gates the
action. There is no way to grant it from inside the app, deliberately: a privilege a request can
grant is a privilege a forged request can grant. With nobody named, the queue says so rather than
showing an empty list to everybody.

The action is also throttled. `lib/security/actionLimits.ts` caps `sendSuggestion` at 20 a minute per
learner and `editDictionary` at 30.

**Residual.** A named reviewer is trusted. The mitigation is that the list is short enough to read
aloud and every change carries the reviewer's id.

### 4.3 A teacher or an employer over-reaching

**Attack.** A classroom or workplace seat is used to read what a person is actually doing rather than
how they are getting on.

**Control.** `lib/classroom/roster.ts` is the whole boundary and it selects effort, not contents:
reviews this week, streak, words known, last seen, and a rolled up accuracy per case gated on a
minimum number of reviews so one bad card never names anybody. It never returns a deck, a search, an
individual answer or a conversation. The join screen states this before anybody joins.

An employer is a narrower seat rather than the same one renamed. `Classroom.kind` is `CLASS` or
`WORKPLACE`, and `workplaceRoster` never selects the per person weak case at all, reports a band
rather than a percentage, refuses to band anybody below a minimum evidence threshold, and orders by
name so the list is not a league table.

### 4.4 Somebody on a shared or stolen device

**Attack.** A school computer, a laptop at home, a phone handed to a friend. The next person opens
the app and finds the last person's deck cached and ready to serve offline.

**Control.** `lib/offline/forget.ts`. Signing out clears the service worker's page cache, the review
outbox in IndexedDB, any unfinished mock exam paper and any unfinished puzzle, after the outbox has
been given its chance to reach the server. A grade that still cannot land is the one thing the device
must not silently drop, so the rail asks before losing it. Both sign-out paths go through it,
asserted.

Nobody signing out is the other half, and the harder one. The shell mounts `DeviceOwner` carrying a
digest of the account id, and `forgetIfOwnerChanged` wipes everything the previous account left the
moment a different one appears on the same browser. A grade queued by the first account is dropped
rather than replayed, because it would land on the wrong deck.

What it deliberately leaves alone is what is about the device rather than a person: the theme, the
install prompt's memory, and the audio and build caches. A word read aloud is not a secret.

**Residual.** A device that is never signed out of and never used by a second account keeps its
cache. That is the same property that makes review work on a train, and it is the intended one.

### 4.5 A forged cross-site request

**Attack.** A page on another site posts to this one and rides the learner's ambient session cookie.

**Control.** Two layers. The Supabase session cookie is `SameSite=Lax`, which is genuinely most of
the defence and is a default owned by a dependency. `lib/security/sameOrigin.ts` is the layer this
app owns and states for itself: `Sec-Fetch-Site` first, because a browser sets it and page script
cannot, falling back to comparing `Origin`'s host against `Host`.

The placement is the part worth checking. It is **not** inside an `/api/` branch. Every mutation a
learner makes here is a Server Action, which is a POST to a page path, so a gate on route handlers
alone would be watching the quiet door. It runs in `middleware.ts` over every path and every
mutating method, and it runs **before** the auth branch, because a redirect keeps the method and the
body. Two invariants assert both the presence and the ordering.

A request carrying neither header is allowed through on purpose. That is not a browser, so it has no
ambient cookie to forge with, and refusing it would break every server to server caller for nothing.

### 4.6 An attacker with a mailed sign-in link

**Attack.** Login CSRF, which is session fixation wearing a helpful hat. Request a magic link for an
address you control, get a signed-in learner to open it, and they land in your account without
noticing. Everything they write from then on goes into a deck you can read.

**Control.** `app/auth/callback/route.ts`. The `token_hash` branch is deliberately not tied to the
browser that asked, which is the whole reason that email template shape exists, so the tie has to be
made here instead. A link that would change who is signed in never just does it: the session in the
browser is ended and the learner is sent to `/sign-in?switched=1` with a sentence saying what
happened. The `next` parameter is dropped, because it was chosen by whoever wrote the link.

Nobody signed in is the ordinary case and is untouched, so the link works exactly as it should for
the person it was mailed to.

Two related controls sit on the same route. `safeNext` in `lib/auth/access.ts` narrows the `next`
parameter to a rooted same origin path with an allowlist of characters, ruling out
protocol relative URLs and a scheme hiding behind leading slashes, because an absolute URL wins over
the base in `new URL(next, origin)` and that produced an off-site redirect carrying a fresh session.
And the allowlist is checked here as well as in the middleware, so a rejected address never holds a
valid session even briefly.

The PKCE branch checks for the code verifier cookie before attempting the exchange, which separates
"this browser never started this sign-in" from "this link is spent". That is a usability fix and it
also stops a code from another browser being fed in.

### 4.7 A scraper burning the AI budget

**Attack.** Sign up, or find an unauthenticated path, and loop against the tutor, the scanner or the
speech route until the deployment's provider bill is somebody else's problem.

**Control.** `lib/usage/` has no off switch and fails closed. Every path that opens the provider
chain calls `authoriseCall` before the call and settles afterwards, and an invariant finds every
module that opens the chain and fails on one that does not mention the ledger, because prose kept
four routes honest and did not catch the fifth.

Three limits, because they fail differently (`lib/usage/quota.ts`): a burst limit per learner, a
daily call limit per learner, and a **global daily spend cap** which is the actual guarantee about
the bill. The last quarter of the global budget is held back for people who have barely used it that
day, counted on the person rather than on the kind of call.

The mechanism is the part that matters. The call is written into the ledger **at the moment it is
authorised**, at an estimate, inside the same transaction that reads the counters, under a
deployment-wide `pg_advisory_xact_lock`. Reading four aggregates, returning a verdict and writing the
row when the answer finished is check-then-act, and for a streamed two minute route that gap is the
length of the answer: ten tabs all read "under the limit" inside it. What the provider actually
reports arrives afterwards as a `SETTLEMENT` row carrying the difference. A call that never happened
hands its booking back as a `RELEASE` row, or a deployment with a rejected key would ration its
learners over answers none of them received. `UsageEvent` is append-only for the reason `Review` is,
so all three are rows rather than edits.

An unrecognised model prices at the dearest rate in the table. A cap that fails open is not a cap.

In front of that sits `lib/security/rateLimit.ts`, and its own header is honest about what it is: a
per instance in-memory limiter, so a burst spread across cold starts meets an empty map. It keeps an
obvious loop from making a hundred database round trips on its way to being refused, and it caps the
routes the ledger does not price at all. The Postgres ledger is what actually bounds cost, because it
is the same number whichever instance answers.

Buckets are keyed on the **learner**, never on the address. Twenty-five students on one school
network are one IP, and a review session asks for audio on nearly every card.

Server Actions are throttled separately in `lib/security/actionLimits.ts`, because the five Route
Handlers had limits and the forty-odd actions did not. Most actions deliberately have none: grading a
card is a single indexed write and a limit there would be met by learners and by nobody else. What is
listed is the per call expensive work, and the numbers are far above real use and immediately below a
script.

### 4.8 A malicious backup file

**Attack.** A backup is a JSON document a learner hands the server. Write anything you like into it.

**Control.** `restoreBackup` in `app/actions.ts`. The file is parsed and validated with a zod schema
before anything is written. Cards, tasks, calendar events and scans are **always attributed to the
person restoring**, whatever the file says, and a row whose id already belongs to another account is
skipped. Reviews are created if absent and never updated, because the table is append-only. A
`replace` is scoped to that owner's own rows and never touches `Lexeme` or `Form`.

The dictionary is the part that used to be wrong and is worth reading closely. It upserted every
`Lexeme` by id and recreated its forms, taking `lemma`, `provenance`, `editedBy`, `ekilexWordId` and
every `Form` exactly as written, which was any signed-in learner rewriting any word every other
learner reads. It does what the seed does now, `ON CONFLICT DO NOTHING`: a word already in the
dictionary is left alone, and a word that is not is created as the restorer's own with the provenance
and the Ekilex identifiers stripped.

Size is bounded twice, and both limits are set to the same number on purpose because two limits on
one upload that disagree is how the last fault happened. `serverActions.bodySizeLimit` and
`middlewareClientMaxBodySize` in `next.config.ts` are both 16 MB; `/api/restore` declares its own
128 MB ceiling and checks `content-length` before reading. `inspectBackup`, which parses the same
whole file and writes nothing, is throttled too, because it never looked expensive and is a public
endpoint like every other `"use server"` export.

**Residual.** A restore writes rows carrying ids chosen by the file's author. Ownership is checked
before any existing row is overwritten, so nothing is taken over, but an account could create rows
under ids it picked. See section 8.

### 4.9 A credential reaching the browser

**Attack.** A provider key, the database URL or the Supabase service role key ends up in a client
bundle, either by being read from a client component or by being pasted into source.

**Control.** The `secrets` job in `.github/workflows/ci.yml`. It builds the app with a distinctly
marked value in **every** server only variable, one marker per variable so the failure names which
one leaked, and greps `.next/static` for the markers. Then it greps for key shaped literals. Then
`npm run check:secrets` scans every built file including the server chunks for AWS, Google, Groq,
OpenAI and Anthropic key shapes, a Postgres URL carrying a password, a private key block, and a
Supabase JWT whose decoded role claim is `service_role`, which is what tells it apart from the anon
key that is public by design.

Two invariants back it up: nothing may carry a `NEXT_PUBLIC_` prefix except the anon key, and no
client component may read a server only variable. A third reads `PROVIDER_KEY_ENV` and checks each
key is marked in the CI canary, so the next provider added to the chain cannot be missed the way Groq
and Gemini were.

The CSP is the other half: `connect-src` names no third party at all, so a client that tried to call
Ekilex or TartuNLP directly would be refused by the browser as well as by an invariant.

### 4.10 An error message carrying a connection string

**Attack.** Not an attacker so much as a leak. `restoreBackup` and `deleteMyAccount` both end in
"and nothing was changed" followed by whatever the database said. Prisma quotes the datasource in an
initialisation failure, and a restore runs a two minute transaction, which is exactly the window a
connection drops in.

**Control.** `lib/observability/report.ts`. `redact` already knew a DSN is a credential, because the
error log has to be safe to post to a webhook, and it scrubs the same shapes CI greps for.
`safeMessage` is that function plus a length cap, and an invariant fails on any `"use server"` export
reaching for `.message` itself, and on `safeMessage` quietly ceasing to redact. `redact` also drops
the value of any key matching key, token, secret, password, authorization, cookie, email or dsn,
however it arrived.

### 4.11 A spoofed forwarding header

**Attack.** Send a new `X-Forwarded-For` per request and get one rate limit allowance per request,
which is not a limit.

**Control.** `clientIp` in `lib/security/rateLimit.ts` reads a forwarding header only where
`TRUST_PROXY_HEADERS` or `VERCEL` says a proxy is there. Everywhere else every unattributed request
shares one bucket, which is the honest shape of not knowing. `x-vercel-forwarded-for` is read only
where `VERCEL` says the platform that owns it is present, because no other proxy sets it and no other
proxy strips it. The hop matters too: Vercel overwrites the whole header and is read from the left, a
self-hosted proxy appends and is read from the right. Signed-in work never touches any of it.

### 4.12 Framing and clickjacking

**Attack.** Embed the app in another page and collect clicks from somebody with a live Google
session.

**Control.** `X-Frame-Options: DENY` in `lib/security/headers.ts`, and `frame-ancestors 'none'` in
the CSP. `frame-src 'none'` refuses the other direction, which was verified rather than assumed:
Sõnaveeb and Ekilex both send `DENY` at us, which is why nothing here is an iframe.

### 4.13 Reading the deployment-wide aggregates

**Attack.** Guess a URL and pull the retention figures or the whole learner error corpus.

**Control.** `/api/metrics` and `/api/research` each carry their own bearer token, compared with
`timingSafeEqual` after a length check, and **with no token configured the route 404s rather than
401s**, so an unconfigured deployment does not advertise the endpoint. Two tokens rather than one,
because the metrics one is polled by monitoring and the research one is pulled by hand: sharing a
secret would let the monitoring credential pull the corpus.

The research file is gated four ways in `lib/research/corpus.ts` before a figure is published: a
minimum number of learners and of reviews per cell, no one person more than a set share of a cell,
complementary suppression so a lone gap cannot be recovered by subtraction, and rounded counts with
banded head counts. A cell below threshold is absent rather than reported as a small number. Learners
can opt out in Settings, and out means their rows are never read rather than subtracted afterwards.

### 4.14 A half-configured or misdirected deployment

**Attack.** Not an attacker at all, and it is how an install ends up open.

**Control.** `halfConfigured()` and the 503, described in section 1. And `lib/auth/canonical.ts`,
which sends every request on a host other than `NEXT_PUBLIC_SITE_URL` to the same path on the
canonical one with a permanent redirect, before anything else reads it. A Vercel preview and a
loopback address are exempt by rule. That is a sign-in correctness fix and it also means there is
exactly one origin for the verifier cookie, the session cookie and the callback to agree on.

### 4.15 A vulnerable dependency

**Attack.** Something in `node_modules` is exploitable.

**Control.** The `audit` job in CI runs `npm audit` in full as a record, then gates twice: `npm audit
--omit=dev --audit-level=high` is the promise about what is deployed, and `npm audit
--audit-level=high` is the promise about what a contributor runs. Both currently pass. They got there
by clearing the chains with `overrides` in `package.json` and a minor vitest upgrade, rather than by
moving the bar, and the workflow says in writing that the number is not to be lowered.

Two things sat beside that and were missing. Nothing **updated** anything: knowing about an advisory
and having it patched are different states, and on a project with one maintainer they drift apart
quietly. `.github/dependabot.yml` is the fix, weekly and grouped, with security updates arriving on
their own so they are not buried in a batch of type definitions. And nothing asked about the
**licence**. `npm audit` has no opinion on one, and it is the supply chain question nobody thinks to
ask until the answer is already in the tree: this project's code is MIT and its data carries
Wiktionary's CC BY-SA 4.0. `scripts/check-licences.mjs` walks the production tree on every commit
and fails on a strong copyleft code dependency, which would quietly make `LICENSE` wrong.

It is worth saying how that check got there, because the first version of it did not run at all.
`actions/dependency-review-action` was the obvious answer and it failed on every pull request:
dependency review needs the Dependency graph switched on for the repository, and it is not.
A check whose precondition is a setting in somebody's dashboard is a check that does not run, which
is the same fault as an operator identity that lives in four dashboard variables. The script has
nothing to switch on, walks the whole production tree rather than a diff, and a clone can run it.
It was made to fail once, against a planted `AGPL-3.0-or-later` on an installed package, before
being trusted.

## 5. Controls inventory

| Area | Control | Where |
| --- | --- | --- |
| Authentication | Supabase Auth, Google OAuth and mailed links | `lib/supabase/`, `app/auth/callback/route.ts` |
| Authentication | Token verified locally against cached signing keys, no round trip | `lib/auth/identity.ts` |
| Authentication | 2,500ms deadline on every auth call, recorded per transport | `lib/auth/identity.ts` |
| Authentication | Three state identity, so "we could not tell" is not "signed out" | `lib/auth/identity.ts` |
| Authentication | No session cookie is answered as signed out for free | `hasSessionCookie` |
| Authentication | Login CSRF defence on the mailed link | `app/auth/callback/route.ts` |
| Authentication | Sign-in allowlist by exact address or domain, domain taken from the last `@` | `lib/auth/access.ts` |
| Authentication | Allowlist re-checked on every gated request, so revocation is immediate | `middleware.ts` |
| Authorisation | Owner resolved by the server, never taken from the caller | `lib/auth/session.ts` |
| Authorisation | Reviewer status from `ADMIN_EMAILS`, exact addresses, ungrantable at runtime | `lib/auth/admin.ts` |
| Authorisation | Public path allowlist is the only way past the gate | `middleware.ts` |
| Authorisation | Class and workplace rosters expose effort, never contents | `lib/classroom/roster.ts` |
| Transport | HSTS, two years, includeSubDomains, preload | `lib/security/headers.ts` |
| Transport | `upgrade-insecure-requests` in the CSP | `lib/security/headers.ts` |
| Headers | CSP set per response, so it can read which Supabase project to allow | `middleware.ts` |
| Headers | `frame-ancestors 'none'`, `frame-src 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` | `lib/security/headers.ts` |
| Headers | `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, COOP, cross domain policies | `next.config.ts` via `STATIC_SECURITY_HEADERS` |
| Headers | `Permissions-Policy` denying geolocation, allowing camera and microphone to self | `lib/security/headers.ts` |
| Headers | `X-Powered-By` removed | `next.config.ts` |
| CSRF | Same origin gate over every mutating method and every path, before the auth branch | `lib/security/sameOrigin.ts`, `middleware.ts` |
| Input | zod schemas on backups, level checks, goals and lesson results | `app/actions.ts` |
| Input | Every argument coerced at the boundary, because JSON off the wire is not the declared type | `text()` in `app/actions.ts` |
| Input | Redirect targets narrowed to a rooted same origin path | `safeNext` |
| Input | Display names cleaned of control and bidirectional characters, NFC normalised | `cleanDisplayName` |
| Input | Uploaded image decoded in a Route Handler and never stored | `app/api/scan/`, `lib/scan/image.ts` |
| Secrets | Nothing carries `NEXT_PUBLIC_` but the anon key, asserted | `scripts/test-invariants.ts` |
| Secrets | CI builds with a marked value per server variable and greps the client bundle | `.github/workflows/ci.yml` |
| Secrets | Every built file scanned for credential shapes, service role JWT told apart by role claim | `scripts/check-secrets.mjs` |
| Secrets | Keyed services reachable only from the server, asserted and enforced by CSP | `lib/security/headers.ts` |
| Spend | Reserve, settle and release in an append-only ledger under an advisory lock | `lib/usage/ledger.ts` |
| Spend | Burst, per learner daily and global daily spend caps, with no off switch | `lib/usage/quota.ts` |
| Spend | Unknown model priced at the dearest rate | `lib/usage/pricing.ts` |
| Spend | Ledger writes kept alive with `after()` rather than a floating promise | route handlers |
| Rate limiting | Per learner buckets on the expensive routes | `lib/security/rateLimit.ts` |
| Rate limiting | Per learner buckets on the expensive Server Actions | `lib/security/actionLimits.ts` |
| Rate limiting | Untrusted forwarding headers collapse to one shared bucket | `clientIp` |
| Logging | Structured JSON on stderr, optional webhook, no analytics vendor | `lib/observability/report.ts` |
| Logging | Values redacted by key name and by credential shape | `redact` |
| Logging | Error messages to a browser go through the same redaction plus a length cap | `safeMessage` |
| Caching | Every owner scoped route sends `no-store`; downloads and images send `private` and vary on the cookie | route handlers |
| Device | Sign-out clears the page cache, the outbox, unfinished papers and puzzles | `lib/offline/forget.ts` |
| Device | A different account on the same browser wipes what the last one left | `forgetIfOwnerChanged` |
| Data | `Review`, `Assessment` and `UsageEvent` append-only; `Review` has no foreign key to `Card` | `prisma/schema.prisma` |
| Data | Export covers every owner scoped model, checked against the schema rather than a list | `lib/legal/exportCoverage.ts` |
| Data | Erasure has no exemptions, and removes the Supabase Auth identity too | `lib/auth/erase.ts` |
| Data | Anonymity gate on the research export, four rules | `lib/research/corpus.ts` |
| Dependencies | Two blocking `npm audit` gates, production and dev | `.github/workflows/ci.yml` |
| Assurance | 279 invariants asserted in CI | `scripts/test-invariants.ts` |

## 6. What has not been done

Stated without softening, because a buyer who catches an overclaim stops reading the rest.

**No external penetration test.** Nobody outside this project has attacked this application under
contract. Everything above is our own work reviewed by ourselves. *Plan:* commission a scoped web
application test against the hosted deployment. *Trigger:* the first enterprise or public sector
contract that funds it, or any deployment holding data for a school, whichever comes first.

**No third-party code audit.** No independent reviewer has read this source for security. The code is
public, which is not the same thing. *Plan:* a targeted review of the auth, ledger and restore paths
rather than the whole tree, since those are where the interesting faults would be. *Trigger:* the
same as above, or the first report from an outside researcher that turns out to be a real fault,
which would say the sample of one is not enough.

**No certification.** Not ISO/IEC 27001, not SOC 2, not ISKE or its successor. `docs/29-controls.md`
is a self-assessment and says so at the top in bold. *Plan and trigger:* set out in that document,
with the cost.

**No formal risk register or asset inventory as separate documents.** Section 3 above is the closest
thing, and it lives in a design document rather than in a register anybody reviews on a schedule.

**No security awareness training programme, no background checks, no formal onboarding and offboarding
procedure.** There is one company and a very small number of people. Section 2 of
`docs/28-incident-response.md` says who does what instead of inventing a rota.

**No SIEM, no intrusion detection, no alerting beyond an optional error webhook.** Logs are structured
JSON on stderr, which the platform retains. Nothing watches them continuously.

**No multi-factor authentication enforced on learner accounts.** Sign-in is Google OAuth or a mailed
link. Where a learner's Google account has MFA, the sign-in inherits it, and there is nothing in this
app enforcing it. Administrative access to Vercel and Supabase has MFA on those providers' own
accounts.

**No Postgres row level security.** Ownership is enforced in application code and asserted in CI.
Adding RLS as a second layer is on the list and has not been done.

**`'unsafe-inline'` in `script-src`.** Required rather than chosen, and the reason is written out in
`lib/security/headers.ts`: the app shell is prerendered and CDN cached, and Next stamps a nonce only
on markup it renders per request, so a fresh nonce against cached inline Flight scripts means the
page never hydrates. A nonce would also silently disable `'unsafe-inline'` for the theme script.
This is the weakest line in the policy and it is a real residual risk against an injected script. The
rest of the policy is as tight as the app allows.

**Session freshness is traded for speed.** With asymmetric signing keys the access token is verified
locally, so a session revoked elsewhere survives until that token expires, an hour by default. The
sign-in allowlist is not part of that trade: the address is a claim inside the token, so removing
somebody from `ALLOWED_EMAILS` takes effect on their next request.

**The rate limiter is per instance.** Its own header says so. On serverless a burst spread across
cold starts meets an empty map. The routes it alone protects are speech, the share card, the export
and the restore; the routes that cost money are bounded by the Postgres ledger instead.

## 7. How to verify any of this yourself

Nothing here needs credentials except the last two.

```
npm ci
npx prisma generate

npm run typecheck        # strict, plus noUncheckedIndexedAccess
npm run lint
npm test                 # unit suite, hermetic: no database, no network, no clock
npm run test:invariants  # 279 asserted rules, including every security one above
npm run check:secrets    # scans a built tree for credential shapes
npm audit --omit=dev --audit-level=high
npm audit --audit-level=high
```

To reproduce the credential canary CI runs, build with a marked value in each server variable and
grep the client bundle:

```
CI_CANARY=canary-CI_CANARY-must-not-ship \
OPENROUTER_API_KEY=canary-OPENROUTER_API_KEY-must-not-ship \
SUPABASE_SERVICE_ROLE_KEY=canary-SUPABASE_SERVICE_ROLE_KEY-must-not-ship \
npx next build
grep -rEho "canary-[A-Z_]+-must-not-ship" .next/static   # must print nothing
```

To read the controls in the source, in the order this document names them:

```
middleware.ts
lib/security/sameOrigin.ts  lib/security/headers.ts
lib/security/rateLimit.ts   lib/security/actionLimits.ts
lib/auth/identity.ts  lib/auth/access.ts  lib/auth/admin.ts  lib/auth/mode.ts
lib/auth/canonical.ts  lib/auth/erase.ts  lib/auth/session.ts
app/auth/callback/route.ts
lib/usage/ledger.ts  lib/usage/quota.ts
lib/observability/report.ts
lib/offline/forget.ts
.github/workflows/ci.yml
```

Against a running deployment, the headers are readable in one request:

```
curl -sI https://kodukeel.ee/ | grep -iE 'strict-transport|x-frame|x-content-type|referrer|permissions|content-security|x-powered'
```

And the forged request gate:

```
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  -H 'Sec-Fetch-Site: cross-site' https://kodukeel.ee/    # expect 403
```

## 8. Weaknesses this review found

Kept separate from section 6, which is about assurance. These are faults in the code rather than
gaps in the paperwork. Three of the four were fixed in the same pass that found them, and they are
written down here with what was done, because a list of weaknesses that only ever shrinks silently
is a list nobody can check.

**Admin checks bypassed the bounded transport. Fixed.** `isAdmin()` and `requireAdminId()` in
`lib/auth/admin.ts` called `supabase.auth.getUser()` through an ordinary client, so a privilege check
made an unbounded network call where the rest of the auth path has a 2,500ms deadline and verifies
the token locally. It was an availability problem rather than an access one, and it was also two
round trips for a question `requireUserId` had already answered on the same request. Both now read
`currentIdentity` from `lib/auth/session.ts`, the same per-request answer everything else uses, and
an unreachable auth service resolves to "not an admin" rather than hanging.

**Export and restore limits were per instance. Fixed.** `/api/export` allows six an hour, which on a
serverless platform meant six an hour per warm instance. Those two, along with speech and the share
card, are the routes the spend ledger does not price, so the in-memory limiter was the only thing
counting them. `lib/usage/sharedLimit.ts` counts them in a row every instance can see, and the
in-memory limiter stays in front so a caller already over is still refused without a round trip.

**No `Cross-Origin-Resource-Policy`. Fixed.** `X-Frame-Options` stopped a whole page being framed
and nothing stopped a single response being pulled into another origin's document, which is worth
saying about the share card and the export in particular. `same-origin`, in
`lib/security/headers.ts`. `Cross-Origin-Embedder-Policy` was considered and deliberately left off:
`require-corp` would refuse every response from Supabase, TartuNLP and the fonts unless each sent a
header back that is not ours to set, and it buys cross-origin isolation this app has no use for.

**A restore writes rows under ids chosen by the file. Accepted, with the reasoning.** Ownership is
checked before any existing row is overwritten, so no row is taken over, a colliding `Lexeme` is
skipped, and cards, tasks, study events and reviews are all re-attributed to whoever is restoring.
What is not prevented is an account creating rows under ids it picked, which could in principle make
a later legitimate row with the same id be skipped. Every id in the schema is a version 4 UUID, so
guessing one somebody else will be issued is not a practical attack, and the blast radius is one
account's own data either way. The fix would be to mint fresh ids on restore and rewrite the
references, and that would break the property the design rests on: `Review` carries `cardId` as a
plain column with no foreign key precisely so history survives a deck being rebuilt, and re-iding
cards on restore would sever every review from the card it was about. Left as it is on purpose.

**An `Origin` header that was present and unreadable was allowed. Fixed.** Found by
`scripts/test-security.mjs`, which is new and is the reason it exists: `test-invariants.ts` reads the
source and can tell you the middleware mentions `isSameOriginMutation`, and only a request to a
running server can tell you what that function actually answers. `Origin:
http://localhost:3000.evil.example` does not parse, because `3000.evil.example` is not a port, and
`hostname()` returns null for a header it cannot read exactly as it does for one that is not there.
Those fell into the same branch, and the branch for "not there" is allow, on the reasoning that a
caller with no Origin is not a browser and has no ambient cookie to forge with. A caller that sent
the header is something that thinks it is a browser. It is refused now, and no legitimate request
loses: browsers do not send malformed origins, and the one odd value they genuinely do send, the
literal `null` from a sandboxed frame, parses to the hostname `null` and is compared like any other
name, which is what already refused it.

**The same gate compares host names and not whole origins, and that is deliberate.** Scheme and port
are ignored, so `https://kodukeel.ee` and `http://kodukeel.ee:8443` count as the same origin here.
What it costs is an attacker who already controls another port or the plaintext scheme on this exact
hostname, which on a host with HSTS preloaded is not a position anybody reaches from outside. What
it buys is a deployment behind a reverse proxy, which sees `Host: localhost:3000` on a request whose
`Origin` is the public address: comparing whole origins would refuse every mutation on it. Recorded
here rather than left to be rediscovered.

If you find something not on this list, `SECURITY.md` says where to send it.
