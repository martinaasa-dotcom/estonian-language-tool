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
| Write the form | andmete kirjutamine, the short controlled writing task |
| Which case does the verb take? | grammatiline korrektsus |
| Write down what you hear | puuduva infoga ülesanne |
| Which sentence was it? | valikvastustega kuulamisülesanne |
| Write a text | loovkirjutamine |
| Speak | suuline esinemine ja dialoog |

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
percent of the weight, and its four part percentages become the only per-skill evidence the app has
for listening and speaking, which a review row cannot distinguish because it carries no note of which
mode wrote it.

The level the app "would bet on" is the highest one it puts at or above sixty percent confidence,
which is deliberately the same threshold as a pass: anything lower and it would be recommending a
sitting it expects to fail.

## 5. Advice, not a verdict

A confidence percentage on its own leaves somebody knowing exactly one thing they cannot act on. So
every gap the hub raises names what is costing marks, says how far off it is, and links to the screen
where it can be practised. A gap that cannot be turned into somewhere to go does not go in the list.
The strengths are there for the same reason in reverse: somebody grinding vocabulary they already
know is losing time they could spend on the part that is actually failing them.

After a sitting, `lib/exam/report.ts` reads the marked paper back: which part lost the marks, which
task inside it did the damage, every question that was wrong with the answer beside it, and the words
that caught the learner more than once. That is the half a real result slip does not give you, and it
is the half worth having.

## 6. Where it lives

| File | What it is |
|---|---|
| `lib/exam/spec.ts` | The examination as data: levels, parts, minutes, points, bands, task shapes. Pure. |
| `lib/exam/paper.ts` | Assembling one paper from dictionary material. Deterministic in (level, seed, pool). Pure. |
| `lib/exam/score.ts` | Marking. No provider, no network, no model. Pure. |
| `lib/exam/readiness.ts` | Confidence, predicted scores, strengths and gaps. Pure. |
| `lib/exam/report.ts` | What to tell somebody who has just sat one. Pure. |
| `lib/progress/exam.ts` | The database half: the pool, the signals, the stored sittings. |
| `app/actions.ts` `submitExam` | Rebuilds the paper server side, marks it, grades through `applyGradeBatch`, records the sitting. |
| `app/(app)/exam/` | The hub, the sitting and the result. |
| `app/api/exam/write/` | Anu reading a composition back, metered, rate limited and form checked. |
