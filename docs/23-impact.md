# The impact summary

A grant application asks four questions. How many people use this, how much study has happened,
do they come back, and what is the thing actually measured by. This app could answer all four from
data it already keeps, and produced none of it in a shape anybody could paste into a form.

`npm run report:impact` is that shape. The same figures are in the `impact` block of
`/api/metrics` for anybody who would rather have JSON.

## 1. Where the figures come from

Nothing is collected to produce them. There is no analytics vendor here, no third party tracker
and no identifier beyond the one that signs somebody in, which is what `/privacy` says and what
this had to stay inside. Every figure is a derivation over rows the app keeps in order to work,
which is the rule ADR-014 draws about progress generally: the streak, the charts and the readiness
rungs are all computed from the append-only review log on each request, and so is this.

| figure | read from | why that row exists anyway |
| --- | --- | --- |
| learners reached | `Review`, distinct owners | the scheduler needs the history |
| active learners | `Review`, over the last 30 days | the same rows |
| answers | `Review` | the same rows |
| study time | `Review.durationMs` and the timestamps | the card duration is written by every graded round |
| words learned | `Card.state`, the scheduler's own opinion of known | FSRS keeps the state to schedule the card |
| conversations outside the app | `Encounter` | the learner wrote it down themselves (ADR-027) |
| coming back | `Review`, by weekly cohort | `lib/stats/retention.ts`, which predates this |

Two of those need a word about how they are counted.

**Study time is sittings, not time on a card.** `lib/stats/pace.ts` reads a sitting as the run of
answers with no gap longer than ten minutes, from the first card to the last plus the first card's
own thinking time. Reading the correction on a card you missed, opening the grammar page it links
to and coming back is inside the sitting. Lunch is not. Summing the card durations alone calls a
forty minute evening twelve minutes, and that is the figure a funder would otherwise be handed.
The report does the same arithmetic in Postgres so it never reads a row per review.

**A day that was answered is not a day that held a conversation.** Today asks whether any Estonian
was spoken to anybody yesterday and takes "not yesterday" for an answer. `isConversation` is the
one place that difference is decided, and both the app and this report read it, so a fortnight of
honest noes is a fortnight of reports and no conversations.

## 2. What the floors do

The disclosure rules are `lib/research/corpus.ts`, unchanged and not restated. `lib/research/impact.ts`
imports the gate rather than deriving thresholds of its own, so one sentence is true of this report
and of the research export together: every published figure rests on at least 10 different people
and at least 50 records, and no one person supplied more than half of it.

A figure under any of those is **absent**, and the report says which rule stopped it. It is never
reported as a small number and never as zero. That matters most on the figure a funder finds most
interesting: a deployment with eight learners who between them held four conversations would
otherwise publish a table in which one of those people is most of the evidence.

The dominance rule is checked twice, and the second check is the one a head count cannot make.
`gate` weighs each person's share of the *records* a figure rests on. Study hours are then weighed
again on their own, because somebody who answered a fifth of the deployment's cards over a winter
can be four fifths of its hours while the answer counts underneath look spread.

Head counts are published as a band ("50-99 people") and never as a number, so two runs of the
report cannot be differenced to work out who arrived in between. Counts are rounded to the nearest
ten. A proportion resting on 4,830 answers and one resting on 4,834 are the same finding.

**Nobody at all is a different answer from too few to say.** A deployment where nothing has been
answered yet says so in a sentence and prints no figures. A row of zeros in an application reads
as a measurement of something.

## 3. The opt-out

Settings has a row letting anybody keep their own rows out of research. The rule, written down for
the research export and kept here, is that opting out means the rows are never read rather than
subtracted afterwards, so the exclusion is spliced into each query in `lib/progress/impact.ts`
separately, including the retention scan.

The rest of `/api/metrics` does not honour it, and that difference is deliberate. Those figures are
an operator looking at their own deployment from behind a token. These are figures meant to leave
the building.

## 4. Running it

```
npm run report:impact
```

It needs `DATABASE_URL` and nothing else: no token, no key, no network. It reads, and writes
nothing anywhere. Six grouped queries, each returning a row per learner rather than a row per
review, so it is proportional to how many people there are.

The same block is in `/api/metrics`, which needs `METRICS_TOKEN` set and 404s when it is not.

## 5. Quoting it honestly

Four things to hold to.

**Quote the date.** The log grows, so a later run gives a larger number and no run reproduces an
earlier one. Every line of the report carries what it was measured over, and the header carries the
day. Carry both into the application.

**A missing figure means too little data, never none.** If the report withholds conversations, the
honest sentence is that there is not yet enough to publish, and not that nobody had one.

**Self-reported is self-reported.** The conversation figure is what learners told the app about
their own week. It is the number this project says it is measured by and it is the softest number
in the report, so say where it came from. The research export labels the same column the same way
(`docs/19-research-export.md`).

**Do not turn a band into a number.** "50-99 people" is as precise as the head count gets, on
purpose. Writing "about 75" puts a figure in an application that this app declined to produce.

What the report will not tell you, because the app does not know it: whether anybody passed a state
examination, whether their Estonian improved outside what the log can see, or how many of the
people counted are the same people a partner organization already counts. Those are questions for
whoever is applying, and inventing an answer here would make the rest of the file worth less.
