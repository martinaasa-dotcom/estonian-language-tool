# The case for funding Kodukeel

Material a real application would be adapted from. Every figure here names the file or the command
that produced it, so a reviewer can check any of them without asking us. Where a number would help
and this repository cannot source it, the text says so instead of supplying one.

**Applicant.** Upthink Solutions OÜ, registry code 16683946, Aiandi tn 8/2-28, 12915 Tallinn,
Estonia. Contact privacy@upthink.ee. The same identity is in `docs/24-dpia.md` and
`docs/29-controls.md`, and `lib/legal/operator.ts` resolves it for the deployment at kodukeel.ee,
so the running app and this document name the same company or neither does.

**The thing being funded.** Kodukeel, a web application for learning Estonian. Free to use, MIT
licensed, running at kodukeel.ee. No users yet.

---

## 1. The problem

Estonian is the mother tongue of 67 percent of Estonia's population, and 84 percent speak it
counting those who learned it as a second language. Both figures are Statistics Estonia's own, from
the 2021 census, published on 14 March 2023 at
`https://stat.ee/en/news/243-mother-tongues-spoken-estonia`. Against a population of roughly 1.3
million that is something under a million native speakers in the country, and a little over a
million counting the diaspora. Use the census percentages in an application rather than the round
number: they are primary, they are dated, and they are the pair a reviewer can check in a minute.

The size matters because it decides the economics. A language learning company chooses which
languages to build for by the size of the paying market, and a market of a million people, most of
whom already have the language, is not one. What that produces in practice is what an Estonian
learner finds today: a few small courses, one or two apps with an Estonian tree assembled the same
way as the other forty, a state course with a waiting list, and a language whose actual difficulty
is nowhere in any of them. Estonian has fourteen cases, a consonant alternation that is not fully
written down (`docs/02-estonian-domain.md` §1 and `docs/13-mvp-status.md` §5.2), and verb government
an English speaker cannot reason out. A generic app cannot afford the linguistics, so it teaches
vocabulary and calls it a language.

Two published figures put a number on that difficulty, and they are better evidence than a headcount
because they are about what happens to learners rather than about how many there are.

The Foreign Service Institute puts Estonian in **Category IV**, the second hardest of its four
bands, at 44 weeks or about 1,100 class hours to professional working proficiency for an English
speaker, alongside Finnish and Hungarian. The Institute teaches full time with small classes and
prepared materials, which is the most favourable conditions anybody learns a language in, and 1,100
hours is what that buys. The plan at `/assess` is built on that figure and adds an Estonian
surcharge on top of it, weighted to the step where the cases and the gradation have to start working
on their own.

And people do fail. The Education and Youth Board's own 2020 overview gives pass rates falling from
**72.9 percent at A2 to 62.4 at B1, 51.1 at B2 and 38.4 at C1**. B1 is the level a citizenship
application asks for, so on the Board's own numbers about two in five candidates at that level do
not clear it. That is the gap this project is aimed at: not people who have never met the language,
but people already sitting in a course who cannot yet do the thing the examination asks.

The second half of the problem is what happens after the vocabulary. Almost everybody learning
Estonian in Estonia freezes at a counter long after they can pass a vocabulary test
(`docs/22-real-life.md` §1). The receptionist says one sentence too fast and switches to English
the moment the learner hesitates. That is the moment residency, work and belonging turn on, and no
app on the market is built for it, because an app built for it would be one people leave.

There is one more thing the market will not do, and it is the one a funder is placed to care
about. The Institute of the Estonian Language publishes Ekilex, the University of Tartu publishes
neural speech synthesis, and both are given away. A commercial product built on them takes the gift
and sells it back. This one is free, credits both on the landing page and at `/terms`, and its
`/funding` page argues for supporting the institutions rather than only using them.

## 2. What has been built

The app is complete enough to hand to a stranger. `docs/13-mvp-status.md` is the running record of
what is in it and what is deliberately not, section by section, with the limitations stated in the
same passes that added the features.

Countable, and checkable:

| | Figure | Where it comes from |
| --- | --- | --- |
| Dictionary | 6,110 entries, 39,421 stored forms | `SEED_SET_SIZE` in `lib/collections/seedSize.ts`, recounted by `seedSize.test.ts` from the three sources the seed reads |
| Built expansion | 5,363 entries | `prisma/data/expanded.json`, built by `scripts/expand-seed.ts` from Ekilex and Wiktionary |
| Course vocabulary | 1,437 words, harvested 2026-09-02 | `prisma/data/harvested.ts`, generated by `npm run harvest` |
| Recorded sentences behind the course | 4,969 usages, all written by lexicographers | the same file |
| Meanings in Russian and Ukrainian | 1,433 and 1,231 of those words | the same file, from Ekilex's own equivalents |
| Course | 82 units across A1 to C1 (23, 14, 15, 16, 14) | `lib/collections/syllabus/`, counted from `SYLLABUS` |
| Claims the course makes | one "you can do this" claim per unit, all 82 read off the review log on three rungs | `docs/22-readiness.md`, `lib/readiness/` |
| Verb rules checked against the Institute | 797 verbs, thirteen slots each, no disagreement | `npm run audit:verbs` |
| Case rules checked the same way | 5,143 nominals, about 113,000 forms | `npm run audit:cases` |

On top of that: FSRS scheduling with an append-only review log, a mock of the state examination at
every level the state sets plus a clearly labelled A1 paper it does not, an eighty question
placement check, printable worksheets, offline review that queues grades on the device and replays
them with the time they were answered, seven conversation scenes, and a daily errand that asks
whether the learner spoke Estonian to anybody yesterday.

**Commands a reviewer can run.** `npm run setup` then `npm run dev` gives a working app with the
dictionary loaded and no keys of any kind. `npm run test:invariants` asserts the rules the project
says it keeps. `npm run audit:questions` builds every card, paper and clue the shipped dictionary
can make and checks none of them prints its own answer. `npm run audit:sense` asks whether each
question makes sense for the word it is about. `npm run test:db`, `npm run test:mobile` and
`npm run test:containment` are the integration, phone and layout suites. CI runs all of them.

**Measured rather than asserted.** Three examples, because a claim that something was measured is
worth less than the measurement. Speech recognition was tested and turned down: 14.6 percent word
error rate on clean native synthetic audio, 5 of 25 sentences exact, with the errors landing on
consonant length and voicing, which is where a learner is weakest (`docs/03-architecture.md`,
`npm run measure:asr`). The placement check was sized by simulation: at nineteen questions it
placed 43 percent of simulated learners correctly and put 57 percent below where they were, and at
eighty it places between 72 and 98 percent depending on the level (`npm run measure:placement`,
README). The gate on a composed conversational line withheld 60 to 70 percent of lines when the
scenes were first written, 54 percent after the encounter verbs were added to the course, and 43.5
percent once the scenes declared the units those verbs live in (`npm run eval:scene`,
`docs/22-real-life.md` §3).

## 3. Why this rather than a commercial app

**No model writes Estonian, and that is enforced rather than promised.** ADR-005 is the founding
rule of the codebase: inflected forms come from Ekilex, example sentences come from Ekilex's
recorded usages, and a model may translate into English and explain grammar but may never supply an
Estonian form. This is not caution about a hypothetical. `gpt-4o-mini` invented "Ma söön aitamat",
which is not Estonian, when asked for an example (`docs/13-mvp-status.md` §5.0). A wrong form in a
learning app is worse than a missing one, because the scheduler then drills it.

The rule is held up by code rather than by a prompt. The writing grader checks every Estonian word
in the model's feedback against the forms it was given and withholds the note otherwise
(`lib/tutor/verify.ts`). A photographed page is transcribed by a model and then decided by the
dictionary, at a stated confidence floor, with anything unvouched shown as unvouched
(`matchEstonianForm`, ADR-021). A news headline, a native speaker's contributed sentence and a
conversational line composed inside a scene's closed word list all pass the same gate. Nothing a
learner is taught comes from a model, which is why the whole course, the dictionary, the exercises
and the examinations keep working with every AI key removed.

**The sources are public institutions, and the licences are stated.** Every Estonian form and
sentence comes from Ekilex, the Institute of the Estonian Language's lexicographic database. The
English glosses come from Wiktionary, CC BY-SA 4.0, which reaches the built dictionary as a work
made from it. Speech is the University of Tartu's TartuNLP. The frequency list is
`hermitdave/FrequencyWords`, CC BY-SA 4.0, chosen over a better University of Tartu list because
that one is non-commercial and a non-commercial clause is the one licence a project cannot walk
itself back out of. All are credited on sign-in, in the landing footer, on `/terms` and in
`LICENSE`. The code is MIT.

**What follows from that is worth more to a funder than the app.** Because nothing is invented, the
dictionary can be rebuilt from scratch by somebody who has neither this database nor this
deployment (`scripts/expand-seed.ts`). Because the code is MIT and there is no proprietary service
in the middle, any institution can run its own copy, including the ones whose data it was built
from. Those two claims are in `CONTINUITY` in `lib/funding/sustainability.ts`, each with the file a
reader checks it against, and an invariant holds each of them to something real.

## 4. What the money would buy

Taken from the "What money would change" section of `/funding` (`app/funding/page.tsx`), which was
written for the running app rather than for this document.

**The daily cap on the tutor could go up.** Every model call is booked against a shared daily
budget that cannot be switched off, because sign-up is open (`lib/usage/quota.ts`). It is the one
line that could run away, and it is a knob with a stop on it rather than an open cheque. At ten
thousand learners the cap is already what holds that line down (`modelCapBinds` is true from ten
thousand in `billFor`).

**A school could keep its history.** Everything on the progress screens is worked out from the
review log on each request rather than stored (ADR-014), so the log is never thrown away and the
database only grows. That is the right design and it is why the database instance ladder is the
steepest line on the cost page.

**The corrections could be worked.** Building the dictionary from Ekilex and Wiktionary keeps
invented Estonian out of it and does not make every entry right. Learners already report the wrong
ones through `components/SuggestFix.tsx`, and the queue at `/admin/suggestions` needs somebody to
work it. The gloss audit has already corrected 25 entries in the A1 to B1 band and 61 part of
speech labels (`npm run audit:glosses`, `npm run audit:pos`); the rest is human work.

**Something could go back to the institutions this is built on.** Ekilex, Wiktionary and TartuNLP
ask for nothing and there is no suggestion they should start. At a size worth funding, the decent
thing is to support the work rather than only use it: a contribution, corrected entries sent back,
or paying for the compute somebody else is currently absorbing.

Two things a grant would also buy that the page does not list, and they should be costed in an
application rather than assumed. A native speaker reviewing the drafted conversational lines, which
is `docs/20-contributed-sentences.md` and the `reviewed` flag in `lib/scenes/bank.ts`. And a first
pilot with a class or a workplace, which `docs/30-pilots.md` scopes and prices at nothing to run.

## 5. What happens when the money stops

This is the question a grant is scored on, and `lib/funding/sustainability.ts` answers it with
arithmetic rather than with intent. The ladder below is the same bill as the cost page with things
switched off, in the order somebody would actually switch them off, priced at the page's default
shape of 100 learners studying five times a week (`DEFAULT_SHAPE`, `retrenchment`).

| Stage | A month | What goes |
| --- | --- | --- |
| Funded | $322.65 | nothing |
| Unstaffed | $114.25 | the tooling that writes the software. The app does not stop when the developer does |
| Quiet | $68.25 | error reporting, the news feed, and the mail that sends a sign-in link. Google sign-in still works |
| Lights on | $45.00 | the domain and the model. A server and a database, at whatever address the host gives it |

The shape of that answer is unusual and is the reason it is worth reading. Most of what this app is
made of was given rather than bought: the dictionary, the speech and the glosses. The scheduler,
the examinations, the games, the grammar and the whole course run on a server and a database. So
the floor is low and the fall is gradual, and the honest claim is not that the project becomes
profitable but that it becomes cheap enough to keep alive with nobody paid.

Below even that, six continuity claims, each checkable in a named file (`CONTINUITY`): the licence,
the absence of lock-in, the rebuildable dictionary, every learner's right to take their whole record
out in one file (`app/api/export/route.ts`), pages that keep opening with no network at all, and the
fact that nothing taught comes from a model.

**The cost model itself.** Measured on this repository on 2 September 2026, with the command beside
each figure in `MEASURED` (`lib/funding/facts.ts`). The dictionary is 20 MB in Postgres with its
indexes, for 6,110 entries and 39,421 forms, read with `pg_total_relation_size` after a seed. One
review row is 300 bytes and one card is 352, divided out of the tables after 80,000 synthetic rows
written by `scripts/load-fixture.ts`. A year of one learner at the default daily goal is about 1.3
MB. One spoken phrase as stored is 51 KB. Loading the whole dictionary into an empty deployment
takes 3.4 seconds. Vendor prices carry the page they came off and the day it was read, and the
euro to dollar rate is the European Central Bank's own reference rate with its date.

Run over the scale ladder, the monthly bill is $301.07 at one learner, $322.65 at a hundred, $946.94
at ten thousand and $2,640.89 at a hundred thousand, which is $3.23 per learner per month falling to
2.6 cents. At a hundred thousand learners the value of what is given to this app, priced at Amazon
Polly's published neural rate purely to show its size, is $2,880 a month and exceeds every billed
line put together. No free vendor tier is modelled anywhere, because a free plan pauses when nobody
is on it and forbids commercial use, and modelling one made the page cheerful and wrong.

## 6. How success would be measured

`docs/23-impact.md` is the full account and `npm run report:impact` is the command. It needs
`DATABASE_URL` and nothing else: no token, no key, no network, and it writes nothing.

**The headline number is conversations people report having in Estonian outside the app.** Today
asks each morning whether the learner spoke any Estonian to anybody yesterday, and the answer is
one press: yes and they understood, they switched to English, not yesterday. That is an `Encounter`
row, append-only, and Progress leads with it ahead of every chart (ADR-027,
`lib/collections/errands.ts`, `lib/progress/outThere.ts`). The question is about the learner's own
day rather than about the app's errand, which is what lets an hour with an Estonian mother-in-law
count. And a day that was answered is not a day that held a conversation: `isConversation` is the
one place that difference is decided, so a fortnight of honest noes reads back as a fortnight of
reports and no conversations.

Alongside it: learners reached, active learners, answers, study time, words the scheduler considers
known, and weekly retention cohorts. Every one is a derivation over rows the app keeps in order to
work. Nothing is collected to produce them, no question is put to anybody, and there is no
analytics vendor and no third party tracker in the app at all.

**The floors.** `lib/research/impact.ts` imports the gate from `lib/research/corpus.ts` rather than
deriving thresholds of its own, so one sentence is true of both the impact report and the research
export: every published figure rests on at least 10 different people (`MIN_LEARNERS`) and at least
50 records (`MIN_REVIEWS`), and no one person supplied more than half of it (`MAX_LEARNER_SHARE`).
A figure under any of those is absent, and the report says which rule stopped it. It is never
reported as a small number and never as zero. Head counts are published as a band, never a number,
so two runs cannot be differenced. Counts are rounded to the nearest ten. A deployment where
nothing has been answered yet says so in a sentence and prints no figures, because a row of zeros
in an application reads as a measurement of something.

**The other output is the research export**, and for a ministry or a university it may be the more
interesting one. Nine tables from the same review log: which grammatical case learners fail, on
which kind of stem, at which level, on which word (`docs/19-research-export.md`). The crosstab of
case against consonant gradation is the one no general purpose flashcard tool can draw, because the
useful finding is not that a case is hard but that it is hard on a stem that changes under it. Same
four disclosure rules, the same file, including complementary suppression so a group that hides one
cell hides a second.

**For a pilot**, `docs/22-real-life.md` §6 lists what to ask for at the end of a term: conversations
reported per learner per week and the share where the other person switched to English, at the
start and at the end; per unit, the share of learners who got every required beat of its situation
done at least once; which objective a class most often missed; and the gate rejection rate on the
deployment's own model. None of that is a certificate and none of it should be read as one.

**What the report will not tell you**, and this is in `docs/23-impact.md` rather than left out:
whether anybody passed a state examination, whether their Estonian improved beyond what the log
sees, or how many of the people counted are already counted by a partner organisation.

## 7. The risks, and what is already done about each

**There are no users yet.** This is the largest risk and nothing in the repository softens it.
Everything above is an app, a set of measurements and a governance position, and none of it is
evidence that people will use it. What exists instead of evidence is that the measurement machinery
is built and honest before the first learner arrives, so a first cohort produces a number rather
than an anecdote, and that the floors mean a small deployment publishes nothing rather than
publishing something flattering. `docs/30-pilots.md` says at the top that there is no reference
customer and no case study to send.

**One maintainer.** A single person project stops when that person does. Three things reduce what
that costs: the code is MIT so nobody needs permission to continue it, the dictionary is built by a
script rather than typed so it can be rebuilt without this deployment, and the Unstaffed row of the
ladder above is a real state in which the app keeps working at $114.25 a month with nobody working
on it. What it does not fix is that corrections stop being worked and the sources drift.
`.github/workflows/drift.yml` re-checks the glosses weekly against Wiktionary, which catches one
kind of drift and not the others.

**Dependence on Ekilex and TartuNLP goodwill.** Both are given, neither is contracted, and the app
would be a different and much worse app without either. Three things about it. The dictionary is
seeded rather than fetched per request, so 6,110 entries and their sentences keep working if Ekilex
becomes unreachable, and a live lookup that fails is written down as a miss rather than retried for
ever (`enrichFromEkilex`, `Lexeme.lookupMissAt`). Speech is cached on the server and on the
learner's phone. And the whole app runs with no Ekilex key at all, which is the default state a
stranger installs into and the state most of the browser suites run in. What remains genuinely at
risk is the live lexicon beyond the seed, and the honest mitigation is the one in section 4: help
pay for the compute.

**No external security or accessibility audit.** `docs/27-security.md` is a threat model and control
review written by the people who wrote the code, with a section for the weaknesses it found.
`docs/29-controls.md` maps procurement control themes to files and marks the honest answer "not
done" where it is. Accessibility is swept mechanically by axe on every route in CI, plus checks axe
has no opinion about, and contrast is measured in a browser in both themes rather than reasoned
about from the token list. None of that is an audit. An external review of either is a line an
application should carry.

**Model dependence for the two features that need one.** Anu's Estonian is only as good as the model
behind her, measured at 6/6, 5/6 and 5/6 on six grammar questions with known answers for three
models (`npm run eval:anu`, `docs/13-mvp-status.md` §5.0). The mitigation is structural rather than
a better prompt: she may never supply an inflected form, everything she suggests is tagged for
verification, and the app teaches the whole course with her switched off.

**Estonian speech recognition.** Not usable, measured, and the app says so on the first screen of
first run rather than in a footnote. Speaking is rehearsed and never scored (ADR-018), and the
placement check keeps speaking out of the level entirely (`SCORED_SKILLS`). Re-run
`npm run measure:asr` before reopening the question.

## 8. What is deliberately not claimed

- **No SOC 2 report and no ISO 27001 certificate.** Neither standard has been audited here, no
  auditor has been engaged, no Statement of Applicability has been filed. `docs/29-controls.md`
  says this in bold in its first paragraph, and §5 of it says what a certificate would cost.
- **No external penetration test.**
- **No reference customer and no case study.**
- **No users.** No user count is given anywhere in this document, because there is none to give.
- **No claim that anybody passed an examination because of this.** The app cannot know it, and
  `docs/23-impact.md` names it as one of the three things the report will not tell you.
- **No pilot result.** The classroom features are built and have not been run by a class. They
  should not be cited as a result until one has (`docs/22-real-life.md` §4).
- **No pronunciation score, no AI marking, and no Estonian written by this project.** Three
  refusals rather than gaps, each with a measurement or an ADR behind it.

## 9. What still needs filling in before submission

Written down so it is not forgotten between this document and a form.

Three of the four things this list used to hold have been sourced and moved into the text above.
What is left is what genuinely cannot be settled from a desk, and one number that can be settled
only by asking for it.

- **How many people sit the state examination in a year**, which is still open and is worth being
  careful about. The Education and Youth Board publishes an annual overview, and its 2020 one says
  the desired level was reached 2,647 times. That is **passes, not sittings**, so it is a floor
  rather than the figure, and 2020 is the year the Board itself says was depressed by postponed
  examinations. An application should ask the Board for a recent year's registrations rather than
  quote a pass count from a pandemic year as though it were attendance.
- **Whatever the funder asks about co-financing**, which is a decision for the applicant rather
  than a fact in this repository.

And one caution about a figure that is now in the text. The pass rates in section 1 are the Board's
2020 rates. They are quoted because the shape of them, falling steadily from A2 to C1, is the point
being made and is not a pandemic artefact. If an application leans on the exact percentages rather
than the shape, get the current year's from the Board first.

## 10. The outside sources this document uses

Everything else here is checkable against this repository, which is the point of it. These four are
not, so they are listed with what was taken from each and when it was read. A reviewer who wants to
disagree with a number should be able to reach the number.

| Claim | Source | Read |
| --- | --- | --- |
| 67 percent of Estonia's population has Estonian as a mother tongue, 84 percent speak it | Statistics Estonia, 2021 census, `https://stat.ee/en/news/243-mother-tongues-spoken-estonia`, published 14 March 2023 | 5 September 2026 |
| Estonian is FSI Category IV, 44 weeks or about 1,100 class hours | Foreign Service Institute language difficulty rankings, US Department of State, `https://www.state.gov/foreign-language-training` | 5 September 2026 |
| Pass rates 72.9 / 62.4 / 51.1 / 38.4 percent at A2 / B1 / B2 / C1, and 2,647 passes | Education and Youth Board annual overview for 2020, `https://harno.ee/uudised/eesti-keele-tasemeeksamite-ning-kodakondsuseksamite-aastaulevaade` | 5 September 2026 |
| Estonia sets the age of digital consent at 13 | Recorded in this repository at `lib/legal/operator.ts` and on `/privacy`, and worth citing to the Estonian Personal Data Protection Act in an application | 5 September 2026 |

Two of those want a fresher figure before anything is submitted. The examination pass rates are from
a year the Board itself describes as disrupted, and the FSI page has moved between State Department
sites more than once, so quote the ranking rather than a URL if the link will be read months later.

