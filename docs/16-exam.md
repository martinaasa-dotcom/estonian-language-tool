# The mock state examination

What the real examination is, what this app's imitation of it does and does not reproduce, and where
every number in `lib/exam/spec.ts` came from.

## 1. The real thing

Estonia examines proficiency in Estonian at **four levels: A2, B1, B2 and C1**. They are run by the
Education and Youth Board (Haridus- ja Noorteamet, formerly Innove). There is **no A1 examination**
and **no C2 examination**; the Board's own note on the latter is that a command of Estonian as a
foreign language that far past C1 cannot be required of anybody for a job, so no paper is set for it.

Every level has the same four parts, in the same order, and the written half is sat first with the
spoken part following after a short break.

| Level | Kirjutamine | Kuulamine | Lugemine | Rääkimine | Points |
|---|---|---|---|---|---|
| A2 | 30 min | 30 min | 50 min | 15 min | 80, twenty per part |
| B1 | 30 min | 30 to 35 min | 50 min | 15 min | 100, twenty five per part |
| B2 | 80 min | 35 min | 70 min | 20 min | 100, twenty five per part |
| C1 | 90 min | 45 min | 60 min | 20 min | 100, twenty five per part |

Raw marks are weighted so that each part contributes its published share. The B1 reading test, for
instance, carries 33 raw marks across four tasks (9, 6, 10 and 8 items) and those 33 are weighted to
25 points.

**The writing part is two pieces of writing.** The B1 specification names them: the first task is
`teate koostamine`, a short message doing a job (explaining, describing, proposing something,
passing on your own details), and the second is `loovkirjutamine` or `isikliku kirja koostamine`,
where the candidate writes *either* a story on a given topic *or* a personal letter. There is no
grammar exercise on it. Accuracy is a criterion an examiner applies to those two texts.

**Each listening text is heard twice**, with a pause before each task so the questions can be read
first. The A2, B1 and C1 specifications all set this; the C1 paper sets one of its tasks to a single
listen.

**There is a break between the halves.** The Board's own description of the day is the written parts
first, two to three hours of them depending on the level, then a short break, then the spoken part.
It does not publish a number of minutes for it.

**A pass is sixty percent of the total, and no part may score zero.** Both halves matter: full marks
on three parts and nothing on the fourth is a fail. Below **forty five percent** a candidate waits
six months before sitting again.

The result carries a verbal assessment as well as a percentage:

| Score | Assessment |
|---|---|
| 91 to 100 | very good |
| 76 to 90 | good |
| 60 to 75 | satisfactory |
| 50 to 59 | poor |
| 0 to 49 | not up to the level |

The task types are published too, and the ones this app can imitate are named where it imitates them:
`valikvastustega ülesanne` (multiple choice, two to four options), `lünkülesanne` (a gapped text),
`sobitamine` (matching), `teate koostamine` and `loovkirjutamine` (the two writing tasks), and a
spoken part of an introductory conversation plus two tasks with an idea card. The listening
specification says in as many words that spelling and grammar mistakes which do not stop the answer
being understood are not counted against it, which is why the dictation task here accepts a missed
diacritic.

### Sources

- [Estonian language proficiency, Haridus- ja Noorteamet](https://harno.ee/en/examinations-tests-and-studies/examinations-tests-and-certificates/estonian-language-proficiency)
- [Eesti keele B1-taseme eksami eristuskiri (PDF)](http://arhmus.tlu.ee/tlibrary/f/text/90/B1_eristuskiri__eesti_keele_tasemeeksam_2017_112590.pdf)
- [Eesti keele A2-taseme eksami eristuskiri (PDF)](http://arhmus.tlu.ee/tlibrary/f/text/53/A2_eristuskiri_2017-1_eesti_keele_tasemeeksam_112553.pdf)
- [Eesti keele C1-taseme eksami eristuskiri (PDF)](http://arhmus.tlu.ee/tlibrary/f/text/19/C1-taseme-eksami-eristuskiri_eesti_keele_tasemeeksam_2017_112619.pdf)
- [Eesti keele B1-taseme eksam, Innove](https://www.innove.ee/eksamid-ja-testid/eesti-keele-tasemeeksamid/b1/)
- [Eesti keele B2-taseme eksam, Innove](https://www.innove.ee/eksamid-ja-testid/eesti-keele-tasemeeksamid/b2/)
- [Eesti keele tasemeeksamite ülesehitus ja läbiviimise kord, Riigi Teataja](https://www.riigiteataja.ee/akt/103112023012)

The writing tasks, the two listens and the pause before each listening task were read off the
`eristuskiri` PDFs above; the break between the halves is from the Board's own English page, which
says the written parts run two to three hours and the spoken part follows a short break without
putting a number on it.

`lib/exam/spec.test.ts` asserts every figure in the table above. A change to one of them is a change
to a claim this product makes about an examination somebody may be about to book.

## 2. What this app reproduces, and what it does not

**The frame is real.** Four parts in order, each on the published clock, the published points, the
sixty percent, and the zero-in-one-part rule. Sit a paper here and you meet the same arithmetic you
will meet in the hall, including the way a strong candidate fails by never recording the spoken part.

**The questions are not the real questions**, and could not be. This app never writes Estonian
(ADR-005), so it cannot set a four hundred word magazine article or an examiner's dialogue. What it
can do is what `lib/estonian/cloze.ts` has always done: take sentences a lexicographer recorded and
hide, shuffle or surround them. Every task therefore declares in `standsFor` which official task it
is standing in for, and the briefing screen prints it before the clock starts.

| App task | Stands in for |
|---|---|
| Which word does each sentence use? | sobitamine |
| Choose the missing word | valikvastustega lünkülesanne |
| Put the sentence back together | tekstisiseste seoste mõistmine |
| Write a short message | teate koostamine |
| Write a text | loovkirjutamine või isikliku kirja koostamine, and the choice is offered |
| Write the form | **nothing the real paper sets**: grammatiline korrektsus, marked inside the texts |
| Which case does the verb take? | **nothing the real paper sets**: rektsioon, marked inside the texts |
| Write down what you hear | puuduva infoga ülesanne |
| Which sentence was it? | valikvastustega kuulamisülesanne |
| Speak | suuline esinemine ja dialoog |

**Two of those stand in for a marking criterion rather than for a task, and used to claim
otherwise.** The writing part sets two pieces of writing; grammatical accuracy is something an
examiner marks *inside* them. This app may not mark Estonian prose, because marking it means a model
deciding whether an ending is right, so it asks the accuracy directly instead. That substitution is
defensible and was undeclared, which is not: a candidate who practised two grammar exercises in place
of a letter arrived having rehearsed the wrong half of the part. The briefing now prints "not a task
the real paper sets" against both, `lib/exam/spec.test.ts` fails if either stops saying it, and the
two texts carry more of the part than the drills do at every level.

**The second writing task offers the choice the real one offers**, a story or a personal letter.
Both are marked identically, on length and on the words the task named, which is the only way this
app can offer a choice honestly: a mock where picking the letter scored differently would be
inventing a judgement about somebody's Estonian.

**A1 and C2 papers exist here and nowhere else.** The A1 paper is built to the A2 paper's shape, one
step easier. The C2 paper is built past C1 for the fun of finding out. Both are labelled "not
examined" everywhere they appear, and the level cards say why.

**Nothing scores pronunciation.** ADR-018 has not moved: there is no verified Estonian speech
recogniser available to this app, so the spoken part is recorded, played back and marked by the
learner against criteria they can actually hear themselves against. The result says which quarter of
the score came from that.

**Nothing about a mark is decided by a model.** Every mark in `lib/exam/score.ts` is a comparison
with a form the dictionary vouches for, and that module imports no provider and makes no request; an
invariant asserts it. Anu will read a composition back on request afterwards, and her note carries no
marks and is withheld whole if it quotes an Estonian form the learner did not write.

## 2a. Sitting it, which is half of what a mock exam is for

A mock exam is not a question bank with a timer bolted on. What fails candidates is rarely the
questions; it is the conditions, and four of them are reproduced here because they change what the
practice is worth.

**Each recording plays twice.** It used to play as often as you liked, which is the difference
between practising listening and sitting a listening test: somebody who gets there on the fifth play
has learnt nothing about whether they can get there on the second. `LISTEN_PLAYS` is the number, the
count is on screen, and a slow play spends one of them so the dictation's two buttons cannot quietly
hand out four. The count is kept on the question rather than in the button for exactly that reason,
and it only counts a play that actually happened: a clip that would not load costs nothing and takes
the unheard path instead, which leaves the question out of the marks rather than counting it wrong.

**A listening task opens with a pause to read the questions**, which every specification describes.
Thirty seconds, skippable, with the play buttons held shut until it is over. It is skippable and the
real one is not, because the point is to teach the shape of the part rather than to make somebody sit
out half a minute they have already used.

**A part closes when its time goes.** The screen said "in the hall the paper would be taken away
now" and then let you carry on answering, which is a mock exam telling you a comforting thing about
itself. The part's questions are now inside one `fieldset` that is disabled when the clock reaches
zero: radios, text boxes, both compositions, the word tiles, the play buttons and the microphone, in
one, because the failure worth designing against is one question shape staying answerable because
somebody forgot to pass a flag down to it. The clock also says something at five minutes and at one,
which is what an invigilator does, and that announcement is the accessible half of the timer: the
countdown itself no longer sits in a live region, where it was announcing a number a second at a
screen reader for the length of a fifty minute part.

**There is a break between the halves**, ten minutes, endable early, and labelled as this app's own
figure since the Board publishes "a short break" and no number. Running the spoken part straight off
the back of ninety minutes of writing makes it a test of stamina rather than of speaking.

**And the paper survives a closed tab.** "Nothing here is saved until you hand in, so sit it in one
go" was the honest description of a real defect: three hours and five minutes of B2 written paper,
and a reload, a crash or a phone call took the lot. `app/(app)/exam/[level]/resume.ts` keeps the
answers, the part, and each part's deadline on the device. Three things about it matter. The
deadlines are absolute times rather than a remaining count, so shutting the tab does not stop the
clock, which is what shutting it would not have done in the hall. Nothing stored is a mark or a
question: the paper is rebuilt from its seed and marked on the server, so the worst somebody can do
by editing it is give themselves back time they already spent. And it is offered rather than
restored, because dropping somebody back into a paper they had forgotten about is a worse surprise
than the loss it prevents. It lives beside the screen rather than in `lib/exam/`, which has no clock
and no browser in it.

**Blank answers are queried before a part closes.** On the real paper you cannot come back, and a
guess is worth more than a blank on every question here. The dialogue says how many are blank and
what leaving them costs, and then does what it is told.

**What the two written tasks are marked on is visible while they are written.** The words the task
named tick off as they are used and the length meter fills, both through `lib/exam/written.ts`,
which is the marker's own function rather than a second implementation of it: a chip that lit up on
a rule of its own would be promising a mark the server was not going to give. It is a module of its
own rather than an export of `score.ts` because the sitting screen may not import the marker at all,
which is the invariant that stops a client marking its own paper, and one convenience import is
exactly how a rule like that gets softened.

**The spoken answers are timed.** "Aim for about ninety seconds" over a microphone button is not a
timing, because nobody knows how long they have been talking. The recorder counts up, and going past
the target is neither stopped nor penalised, because the examiner does not stop you either.

**What is still not imitated** is said out loud on the briefing rather than left to be discovered:
the C1 paper's single-listen task, and the few minutes of conversation with an examiner that the real
spoken part opens with.

## 3. A short paper says so

A paper is only as long as the dictionary can make it. Without an Ekilex key the built-in 360 word
set is what there is, and some tasks cannot be filled: there are only so many sentences short enough
to dictate.

Rather than quietly setting a shorter paper, every task reports a `shortfall` and the reason, the
briefing prints the fill rate, and each part is marked out of what was actually asked. A part nothing
could be set for is left out of the total entirely and named on the result, rather than scored as
zero, because scoring it as zero would fail a candidate for a gap in the dictionary and trip the one
clause that is supposed to mean "you did not attempt this". This is the same trade
`scripts/lib/checks.mjs` makes with `absent(n, why)`: lower the target by exactly what was not
reachable, and print the reason, so a task that stops being set still shows up.

## 4. The confidence figure

The hub puts a percentage beside every level: how likely you are to pass that paper today. It is
computed in `lib/exam/readiness.ts`, in two steps, and both are published.

1. **A predicted score for each part.** Vocabulary coverage at the level and every level below it,
   weighted so the level itself counts most and the ones below it halve away, multiplied by how well
   recall actually goes. A part with its own record uses that record, blended in proportion to how
   much of one there is; a part with none falls back to overall recall accuracy.
2. **A confidence that the total clears sixty**, as a logistic on the margin whose spread widens as
   the evidence thins. Thin evidence does not make the app confident and wrong, it makes it visibly
   unsure.

On top of that sits a **ceiling**, because a model cannot earn a claim it has not seen enough to
make. Under 150 reviews, or with fewer than two skills practised, confidence is capped at 60. Under
800 reviews it is capped at 85. Above that, at 97. The tier is printed beside the number.

**A paper actually sat outranks all of it** for that level: the most recent sitting carries 65
percent of the weight, and its four part percentages are folded into the per-skill evidence.

**The placement check reaches the two parts nothing else does.** A review row carries no note of
which mode wrote it, so a dictation and a flip of the same card are one row: nothing in the log
separates listening and speaking from anything else. The level check at `/assess` (ADR-020) asks
them directly, so where one has been sat its per-skill levels are read as an expectation for each
paper, centred on the pass mark and moving about twenty points a band, and blended in at two thirds.
Never substituted: the check is ten minutes long and carries its own confidence field for that
reason, and letting it overwrite months of review history would be taking the smaller sample on its
own account. Its speaking figure is the learner's own rating rather than a measurement of ours, so
it is never read as a level (ADR-018).

The level the app "would bet on" is the highest one it puts at or above sixty percent confidence,
which is deliberately the same threshold as a pass: anything lower and it would be recommending a
sitting it expects to fail.

## 5. Advice, not a verdict

A confidence percentage on its own leaves somebody knowing exactly one thing they cannot act on. So
every gap the hub raises names what is costing marks, says how far off it is, and links to the screen
where it can be practised. A gap that cannot be turned into somewhere to go does not go in the list.
The strengths are there for the same reason in reverse: somebody grinding vocabulary they already
know is losing time they could spend on the part that is actually failing them.

**And the paper somebody said they were aiming at goes at the top.** The goal is asked for on the
first run, and the hub then listed six levels as though it had never been told. The target level's
card carries the weeks left beside the confidence, because those two numbers only mean anything
together: eleven weeks and 38 percent is a different situation from eleven weeks and 71. It names
the part standing in the way rather than only the number, and it links to the paper and to the place
the goal can be changed. With no target set there is no card, and nothing on the page claims one.

After a sitting, `lib/exam/report.ts` reads the marked paper back: which part lost the marks, which
task inside it did the damage, every question that was wrong with the answer beside it, and the words
that caught the learner more than once. That is the half a real result slip does not give you, and it
is the half worth having.

## 6. Where it lives

| File | What it is |
|---|---|
| `lib/exam/spec.ts` | The examination as data: levels, parts, minutes, points, bands, task shapes, and the conditions each part is sat under. Pure. |
| `lib/exam/paper.ts` | Assembling one paper from dictionary material. Deterministic in (level, seed, pool). Pure. |
| `lib/exam/score.ts` | Marking. No provider, no network, no model. Pure. |
| `lib/exam/written.ts` | The two things a machine may decide about a piece of writing: its length, and whether it used the words the task named. Shared by the marking and the screen. Pure. |
| `app/(app)/exam/[level]/resume.ts` | An unfinished paper, kept on the device. Answers and deadlines only, never a mark and never a question. |
| `lib/exam/readiness.ts` | Confidence, predicted scores, strengths and gaps. Pure. |
| `lib/exam/report.ts` | What to tell somebody who has just sat one. Pure. |
| `lib/progress/exam.ts` | The database half: the pool, the signals, the stored sittings. |
| `app/actions.ts` `submitExam` | Rebuilds the paper server side, marks it, grades through `applyGradeBatch`, records the sitting. |
| `app/(app)/exam/` | The hub, the sitting and the result. |
| `app/api/exam/write/` | Anu reading a composition back, metered, rate limited and form checked. |
