# Control map for procurement

**Kodukeel is not certified against ISO/IEC 27001 or SOC 2. Neither standard has been audited here,
no auditor has been engaged, no Statement of Applicability has been filed, and there is no
certificate and no report to send you. What follows is a self-assessment written by the people who
wrote the code.**

Treat it as one thing only: a map from the control themes a procurement questionnaire asks about to
the specific file or process in this repository that does something about them, so your engineer can
open each one and judge it. Every line is checkable. Where the honest answer is "no", it says no,
and where a control is a provider's rather than ours it says whose.

If you need a certificate, we do not have one. Section 5 says what one would cost and what would make
us go and get it. Saying that at the top is deliberate: a buyer who catches an overclaim on page four
stops trusting page one, and rightly.

Operator: **Upthink Solutions OÜ**, registry code **16683946**, Tallinn, Estonia. Security contact:
**privacy@upthink.ee**. Read `docs/27-security.md` for the threat model and the residual risks it is
honest about, `docs/28-incident-response.md` for what happens when something goes wrong,
`docs/24-dpia.md` for the data protection impact assessment, `docs/25-data-retention.md` for the
retention schedule, and `docs/26-subprocessors.md` for the recipient list.

## 1. How to read the status column

| Status | Means |
| --- | --- |
| **Implemented** | It exists, it is in the named file, and CI asserts it or you can run it yourself. |
| **Partial** | Something real is there and it does not cover the whole control. The gap is stated. |
| **Inherited** | It is Vercel's, Supabase's or Google's rather than ours. We configure it and we do not operate it. |
| **Not applicable** | The control assumes an organisation larger than this one, or assets this project does not have. |
| **Not done** | No. |

There is one company and a very small number of people. Several ISO controls assume an HR function,
a facilities function, and a supplier management process with contracts and reviews. Marking those
"not applicable" is a statement about size rather than a claim to have solved them, and the
difference matters when you are deciding what to buy.

## 2. ISO/IEC 27001:2022 Annex A

The 2022 revision groups 93 controls into four themes. This maps the themes and the controls a buyer
of a small SaaS actually asks about, rather than reproducing the list.

### 5. Organisational controls

| Control | What this project does | Where | Status |
| --- | --- | --- | --- |
| 5.1 Policies for information security | This document, `docs/27-security.md`, `docs/28-incident-response.md` and `SECURITY.md`. Written down and in version control. There is no separate signed corporate ISMS policy set. | `docs/`, `SECURITY.md` | Partial |
| 5.2 Roles and responsibilities | Stated in the incident plan, honestly: one lead, whoever has production access, one external voice. No rota, no on-call. | `docs/28-incident-response.md` section 2 | Partial |
| 5.7 Threat intelligence | `npm audit` in CI as a blocking gate plus GitHub advisories. No commercial feed and no active monitoring. | `.github/workflows/ci.yml` | Partial |
| 5.8 Information security in project management | Security rules are asserted in CI rather than reviewed by hand. A rule with no assertion is treated as a comment. 279 invariants run on every push. | `scripts/test-invariants.ts` | Implemented |
| 5.9 Inventory of assets | Ranked asset list, in a design document rather than a maintained register. | `docs/27-security.md` section 3 | Partial |
| 5.10 Acceptable use | Terms of service on the deployment. | `/terms` | Implemented |
| 5.12 Classification of information | Four categories with different handling: the review log, free text a learner wrote, identity, and reference data. Handling differs in code. | `docs/27-security.md` section 3 | Partial |
| 5.14 Information transfer | Everything to the browser over HTTPS with HSTS preloaded. Third parties reachable only from the server. | `lib/security/headers.ts` | Implemented |
| 5.15 Access control | Owner resolved server side and never taken from a caller. Reviewer status from an environment variable, exact addresses only, ungrantable at runtime. | `lib/auth/session.ts`, `lib/auth/admin.ts` | Implemented |
| 5.16 Identity management | Supabase Auth, Google OAuth and mailed links. Sign-in allowlist optional by address or domain. | `lib/auth/access.ts` | Implemented |
| 5.17 Authentication information | No password store here. Credentials in environment variables, never in the repository, with CI proving none reaches the client. | `.github/workflows/ci.yml`, `scripts/check-secrets.mjs` | Implemented |
| 5.18 Access rights | Provisioned by the sign-in allowlist and by `ADMIN_EMAILS`. Removal takes effect on the next request, because the address is a claim inside the token. There is no periodic access review. | `middleware.ts` | Partial |
| 5.19 to 5.22 Supplier relationships | Suppliers are Vercel, Supabase, Google, and the model providers, each on standard terms. Recipients are generated from the deployment's own configuration and named on the privacy page rather than described in the abstract. No supplier security assessment process. | `lib/legal/recipients.ts` | Partial |
| 5.23 Cloud services security | Region pinned so functions and database are together. Environment split between the two providers deliberately. No formal cloud security baseline document. | `vercel.json`, README deploy section | Partial |
| 5.24 to 5.28 Incident management | Full plan with severity levels, roles, runbooks per incident type, and the Article 33 and 34 clocks. Evidence preservation before rollback is stated. | `docs/28-incident-response.md` | Implemented |
| 5.29 Continuity during disruption | Documented and partly untested. The learner's own backup and restore is exercised on every CI run. A full production restore from a provider backup has not been tested. | `docs/28-incident-response.md` section 9 | Partial |
| 5.30 ICT readiness for continuity | Same. The recovery time objective is written as untested rather than invented. | `docs/28-incident-response.md` section 9 | Partial |
| 5.31 to 5.34 Legal, IP, records, privacy | Controller identified in configuration and rendered on the policy pages, refusing to invent an answer when unset. Supervisory authority named. Export covers every owner scoped model, checked against the schema rather than a list. Erasure has no exemptions and removes the auth identity too. Data licences credited: Ekilex CC BY, Wiktionary CC BY-SA, the frequency corpus CC BY-SA. | `lib/legal/operator.ts`, `lib/legal/exportCoverage.ts`, `lib/auth/erase.ts`, `LICENSE` | Implemented |
| 5.35 Independent review | None. Nobody outside this project has reviewed the code or tested the deployment for security. | | Not done |
| 5.36 Compliance with policies | CI is the enforcement. Typecheck, lint, unit suite, invariants, credential scan, two audit gates, browser suites. | `.github/workflows/ci.yml` | Implemented |
| 5.37 Documented operating procedures | The README covers deployment and configuration; the incident plan covers the runbooks. | `README.md`, `docs/28-incident-response.md` | Implemented |

### 6. People controls

| Control | What this project does | Where | Status |
| --- | --- | --- | --- |
| 6.1 Screening | No background checks. One company, a very small number of people. | | Not done |
| 6.2 Terms of employment | Standard Estonian employment terms. No security specific annex. | | Partial |
| 6.3 Awareness and training | No formal programme. The security rules are in `CLAUDE.md` and enforced in CI, which is how a contributor learns them, and that is a different thing from training. | `CLAUDE.md` | Not done |
| 6.4 Disciplinary process | Estonian employment law. Nothing specific to information security. | | Not applicable |
| 6.5 Responsibilities after employment | No formal offboarding checklist. Access is two provider accounts and a GitHub organisation. | | Not done |
| 6.6 Confidentiality agreements | In place with the company. | | Implemented |
| 6.7 Remote working | Everyone works remotely; devices are personal machines with full disk encryption. No managed device fleet and no MDM. | | Partial |
| 6.8 Reporting security events | An address anybody can reach, with published response times and a safe harbour statement. | `SECURITY.md` | Implemented |

### 7. Physical controls

| Control | What this project does | Where | Status |
| --- | --- | --- | --- |
| 7.1 to 7.14 (perimeters, entry, equipment, media, disposal) | There is no office holding data and no server we own. Compute and storage are Vercel and Supabase, whose data centres carry their own certifications. Our physical footprint is laptops. | | Inherited and Not applicable |
| 7.7 Clear desk and clear screen | Devices lock and encrypt. No policy document. | | Partial |
| 7.9 Security of assets off-premises | Full disk encryption on the machines that hold credentials. No MDM enforcing it. | | Partial |

### 8. Technological controls

This is the theme where the work actually is, so it is the longest.

| Control | What this project does | Where | Status |
| --- | --- | --- | --- |
| 8.1 User endpoint devices | Nothing enforced. Learners use their own browsers, which is the point of a web app. What the app does about a shared device is under 8.12. | | Not applicable |
| 8.2 Privileged access rights | Reviewer status is an environment variable of exact addresses and cannot be granted by any request, because a privilege a request can grant is one a forged request can grant. Provider consoles are behind those providers' own MFA. | `lib/auth/admin.ts` | Implemented |
| 8.3 Information access restriction | Every owner scoped query filters on an owner the server resolved. Class and workplace rosters expose effort and never contents. | `lib/auth/session.ts`, `lib/classroom/roster.ts` | Implemented |
| 8.4 Access to source code | Public repository, protected default branch, CI required. | GitHub | Implemented |
| 8.5 Secure authentication | Token verified against cached signing keys, under a 2,500ms deadline, with three states so an unreachable auth service is not read as a sign-out. Login CSRF defence on the mailed link. | `lib/auth/identity.ts`, `app/auth/callback/route.ts` | Implemented |
| 8.6 Capacity management | Three spend limits with no off switch, per learner rate limits on routes and actions, and a published cost model. | `lib/usage/quota.ts`, `lib/security/actionLimits.ts`, `/funding` | Implemented |
| 8.7 Protection against malware | No file execution and no user uploads that are stored. A scanned photograph is decoded in a Route Handler and dropped; `Scan` has no column an image could go in, asserted. | `app/api/scan/` | Implemented |
| 8.8 Management of technical vulnerabilities | Two blocking `npm audit` gates, production and dev, cleared by fixing chains rather than by lowering the bar. No external scanning. | `.github/workflows/ci.yml` | Partial |
| 8.9 Configuration management | Security headers in one module read by both the static config and the middleware. A half-configured deployment answers 503 naming the missing variable rather than falling back to open. | `lib/security/headers.ts`, `lib/auth/mode.ts` | Implemented |
| 8.10 Information deletion | Erasure empties every owner scoped table and removes the Supabase Auth identity. Where no key can reach the identity, the screen says which part is left rather than reporting success. Erasure has no exemptions, asserted plus a schema-driven integration test. | `lib/auth/erase.ts`, `app/actions.ts` | Implemented |
| 8.11 Data masking | Log values redacted by key name and by credential shape. Error messages to a browser go through the same redaction with a length cap, asserted on every `"use server"` export. | `lib/observability/report.ts` | Implemented |
| 8.12 Data leakage prevention | CI builds with a marked value in every server variable and greps the client bundle, naming which variable leaked. Every built file scanned for credential shapes, with a service role JWT told apart from the public anon key by its decoded role claim. Sign-out clears the page cache, the outbox and unfinished papers; a different account on the same browser wipes what the last one left. | `.github/workflows/ci.yml`, `scripts/check-secrets.mjs`, `lib/offline/forget.ts` | Implemented |
| 8.13 Information backup | Provider backups for Postgres, inherited and untested by us. A learner's own export and restore, tested on every CI run. The dictionary is a build artefact and reseeds from the repository. | `docs/28-incident-response.md` section 9 | Partial |
| 8.14 Redundancy | Vercel and Supabase defaults. Nothing multi-region and nothing failing over. | | Inherited |
| 8.15 Logging | Structured JSON on stderr, retained by the platform, optionally forwarded to a webhook. Deliberately no analytics vendor, because the privacy page promises no third-party trackers. | `lib/observability/report.ts` | Partial |
| 8.16 Monitoring activities | Nothing watches the logs continuously. No SIEM and no intrusion detection. Detection is described honestly in the incident plan. | `docs/28-incident-response.md` section 3 | Not done |
| 8.17 Clock synchronisation | Platform time, UTC. Day boundaries are computed in the learner's own zone rather than the server's, which is a correctness rule with its own module. | `lib/time/day.ts` | Implemented |
| 8.18 Use of privileged utility programs | The one workflow that maps a repository secret is the manual dictionary reseed, `workflow_dispatch` only, behind a typed confirmation, and it never pushes the schema. The deck audit workflow is written to the same rules and reports before it will delete anything. | `.github/workflows/seed-production.yml`, `audit-decks.yml` | Implemented |
| 8.19 Software on operational systems | Deployment is a git push to the default branch through CI. Nothing installed by hand. | | Implemented |
| 8.20 to 8.22 Network security and segregation | The application has one network boundary and no internal network of its own. Third parties reachable only from the server, enforced by the CSP naming no third party in `connect-src` and by an invariant. | `lib/security/headers.ts` | Implemented |
| 8.23 Web filtering | Not applicable to a hosted web app with no outbound user-controlled fetching. The scan and news paths fetch from fixed hosts. | | Not applicable |
| 8.24 Use of cryptography | TLS everywhere, HSTS preloaded. Bearer tokens compared with `timingSafeEqual` after a length check. No cryptography implemented here beyond that; sessions and password handling are Supabase's. | `app/api/metrics/route.ts`, `lib/security/headers.ts` | Partial |
| 8.25 Secure development lifecycle | TypeScript strict with `noUncheckedIndexedAccess`, lint in the build rather than only in CI, a hermetic unit suite gating every commit, 279 invariants, and browser suites covering every route. | `next.config.ts`, `.github/workflows/ci.yml` | Implemented |
| 8.26 Application security requirements | Written down and asserted rather than described: never ship a credential to the client, every mutation through the forged request gate, no owner id from a caller, AI spending always metered, append-only tables. | `CLAUDE.md`, `scripts/test-invariants.ts` | Implemented |
| 8.27 Secure system architecture | Trust boundaries documented, keyed services server only, defence in depth on CSRF, spend metered under a lock rather than by check-then-act. | `docs/27-security.md` section 2 | Implemented |
| 8.28 Secure coding | Enforced by the invariant suite and the type system rather than by a style guide. A required field is used as the enforcement where a rule can be made unrepresentable. | `scripts/test-invariants.ts` | Implemented |
| 8.29 Security testing | Automated: invariants, credential scan, dependency gates, browser suites including offline, restore, sign-in and accessibility. **No penetration test.** | `.github/workflows/ci.yml` | Partial |
| 8.30 Outsourced development | None. | | Not applicable |
| 8.31 Separation of environments | Preview deployments are disabled for agent branches so the deployment cap is spent on production. Browser suites build into their own output directory. Local mode is keyed on absent configuration and a configured deployment cannot be talked into it. | `vercel.json`, `next.config.ts`, `lib/auth/mode.ts` | Implemented |
| 8.32 Change management | Pull requests, CI required, protected default branch. No formal change advisory board, which would be one person approving their own work. | GitHub | Partial |
| 8.33 Test information | Test fixtures are generated, never copied from production. The end-to-end suite and the demo fixture refuse to run against anything but a local database and say so rather than proceeding. | `scripts/demo-data.ts` | Implemented |
| 8.34 Protection during audit testing | Not applicable. No audit has been run. | | Not applicable |

## 3. SOC 2 Trust Services Criteria

At the level a buyer's questionnaire asks about. The same warning applies: **no SOC 2 examination has
been performed, there is no Type I and no Type II report, and no service auditor has been engaged.**

### Security (the common criteria)

| Criterion | What this project does | Status |
| --- | --- | --- |
| CC1 Control environment | One company, roles stated honestly in the incident plan. No board, no independent oversight function, no formal management assertion. | Partial |
| CC2 Communication and information | Policies in version control and public. Security contact published with response times. Privacy notice names the controller and the recipients, generated from configuration rather than described. | Implemented |
| CC3 Risk assessment | Threat model with ranked assets, adversaries, controls and residual risk. Not a periodic formal risk assessment with a register and review dates. | Partial |
| CC4 Monitoring of controls | CI runs the control assertions on every push, which is continuous in the sense that matters for code. Nothing monitors the running deployment. | Partial |
| CC5 Control activities | Controls implemented in code and asserted, rather than described in a manual. | Implemented |
| CC6 Logical and physical access | Authentication, authorisation, credential handling, device forgetting on sign-out, and privileged access that cannot be granted at runtime. Physical is inherited from Vercel and Supabase. | Implemented for logical, Inherited for physical |
| CC7 System operations | Detection described honestly, incident response with runbooks per incident type, and a review step that asks why nothing caught it. Detection itself is weak: no continuous monitoring. | Partial |
| CC8 Change management | CI-gated pull requests to a protected branch. No separate approval body. | Partial |
| CC9 Risk mitigation | Spend caps that fail closed, rate limits, append-only tables that cannot be edited away, and a restore path that cannot rewrite the shared dictionary. Vendor risk is not formally assessed. | Partial |

### Availability

Backups inherited from Supabase and **not tested by us**; no redundancy beyond provider defaults; no
uptime SLA offered. Recovery objectives are written as untested in `docs/28-incident-response.md`
rather than stated as targets we have met. **Partial, and this is the weakest of the five.**

### Confidentiality

Owner scoping asserted in CI, credentials never in the client, log and error message redaction, the
research export gated four ways before a figure is published, and rosters that expose effort rather
than contents. **Implemented**, with the residual risks in section 6 and 8 of `docs/27-security.md`.

### Processing integrity

`Review`, `Assessment` and `UsageEvent` are append-only. `Review` deliberately has no foreign key to
`Card`, so deleting a card or restoring a backup cannot cascade history away, and grades replay in
order to reproduce state exactly. Marking is a string comparison against the dictionary before any
model is called, so a model can never decide whether an answer was right. The exam paper is rebuilt
server side to mark it, and the client never sends a mark. **Implemented.**

### Privacy

Data minimisation is structural rather than promised: no analytics vendor, no advertising
identifiers, a scanned photograph never stored, and a news feed request that carries nothing of the
learner's. Export covers every owner scoped model, checked against the schema. Erasure has no
exemptions and reaches the auth identity. The research export is opt-out in Settings and out means
the rows are never read. **Implemented**, and `/privacy` is the document a data subject reads.

## 4. What a buyer should conclude

The engineering controls are strong and checkable, and the organisational ones are what a company of
this size has. That combination is worth stating plainly rather than averaging into a score.

Strong, and you can verify each in one command: credential handling, owner scoping, CSRF, spend
metering, append-only data, redaction, secure development lifecycle.

Weak, and we are not going to dress it up: continuous monitoring, tested disaster recovery,
independent assurance of any kind, and every people control that assumes an HR function.

If your procurement requires a certificate today, we do not meet it. If it allows a documented
self-assessment plus the right to test, section 5 is the conversation.

## 5. Certification: cost, and what would trigger it

Rough figures for an Estonian company of this size, from public pricing rather than from quotes we
hold. Treat them as the order of magnitude rather than as a budget.

| Standard | First year, indicative | Then |
| --- | --- | --- |
| ISO/IEC 27001:2022 | 15,000 to 35,000 euro: gap analysis, building the ISMS, internal audit, then a Stage 1 and Stage 2 certification audit | Surveillance audits annually, recertification every three years |
| SOC 2 Type I | 10,000 to 20,000 euro for the readiness work and the examination | Superseded by Type II |
| SOC 2 Type II | 20,000 to 40,000 euro, plus an observation window of three to twelve months | Annual |
| Penetration test alone | 4,000 to 12,000 euro for a scoped web application test | Annually, or after a significant change |

Against that, `/funding` publishes what this app costs to run, and the floor is about three hundred
dollars a month before a single learner arrives. A certification is therefore several years of
running costs, which is why it has not happened rather than an oversight nobody noticed.

**What would trigger each, in the order we would actually do them.**

*A penetration test* is first and is the cheapest thing that changes the honest answer in section 6
of `docs/27-security.md`. Trigger: the first contract that funds it, or any deployment holding data
for a school. That one is not negotiable against price for long.

*A tested disaster recovery run* costs nothing but a day and closes the largest gap in section 9 of
the incident plan. Trigger: it should have happened already. It is the next thing on this list that
does not need a budget.

*ISO/IEC 27001* is the one Estonian and European public bodies ask for. Trigger: a public sector
tender that requires it, or a grant that funds the certification as part of the work. We would go for
this before SOC 2, because the buyers who ask us for one ask for this one.

*SOC 2 Type II* is what a North American enterprise buyer asks for. Trigger: a customer in that
market whose contract value covers the observation window and the examination.

We would rather tell you the number and the trigger than imply a roadmap. If a certificate is a
condition of your purchase and the purchase would fund it, that is a conversation worth having, and
privacy@upthink.ee is where to start it.
