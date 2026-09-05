# Where learners of Estonian go wrong, counted

This app has been keeping, since its first day, a record of every exercise anybody has answered
and whether they got it right. It keeps it because the scheduler needs it: FSRS decides when a
card comes back from the history of that card, and `Review` is append-only for that reason.

A side effect of that is a dataset nobody else has. Which grammatical case learners actually fail,
on which kind of stem, at which level, on which word, measured over thousands of answers from
people studying Estonian for real reasons. A textbook's ordering of difficulty is somebody's
judgment. A classroom's is twenty-five people and one teacher's memory. A corpus of written
Estonian records what natives produce, which is a different question again. None of them can
answer this one, and this can, because the collecting already happened.

`/api/research` is that dataset, aggregated to the point where it is no longer about anybody, as a
file an operator can send to somebody.

## 1. What is in it

Nine tables, all from the same review log.

| table | what it answers |
| --- | --- |
| `case` | accuracy per grammatical case |
| `case_by_task` | the same, split by what the question actually asked for |
| `case_by_level` | whether a case stays hard as the vocabulary gets harder |
| `case_by_gradation` | a case against whether the stem alternates under it |
| `gradation_pattern` | which consonant alternations are hardest |
| `task` | accuracy per shape of question, so the rest can be read against its mix |
| `level` | accuracy per CEFR level recorded in the dictionary |
| `pos` | accuracy per part of speech |
| `word` | an empirical difficulty ordering of the vocabulary |

Each cell carries the number of answers behind it, a band for how many people, the percentage
answered correctly, and the same percentage over mature reviews alone.

`case_by_gradation` is the one this app can draw that a general-purpose flashcard tool cannot. The
useful finding about Estonian case endings is not that a case is hard, it is that a case is hard
*on a stem that changes under it*: somebody comfortable with the osastav of `raamat` can miss it
every time on `tuba`. `lib/estonian/gradation` classifies every stem, from the principal parts the
Institute records, so the crosstab is available for free. `lib/analysis/diagnosis.ts` already makes
the same cut for one learner, on their own Progress page.

`word` is the table with no equivalent anywhere, and the one to hand over with the most care. It
says which of the words learners meet are hard. It does not say which words in Estonian are hard,
and the difference is the sampling: a word is in the table only if enough different people met it
often enough, which favors what the course teaches early.

## 2. Why it is safe to send

The output is counts, and by the time it exists it is not personal data. What makes that true
rather than asserted is `lib/research/corpus.ts`, which implements four rules from statistical
disclosure control. Read that file before changing any of the numbers in it.

**A threshold rule.** A cell is published only if at least ten different people are behind it and
it rests on at least fifty answers. Below either, it is absent from the file. Not zero, not a size
with the rate withheld: absent. So a missing category in this file means too little data, and never
that nobody gets it wrong.

**A dominance rule.** No single person may account for more than half of a cell's answers. This is
the rule a head count alone misses, and it is the one that matters most in a small deployment: ten
people is not ten people when one of them answered nine tenths of the cards, because then the
cell's accuracy is that person's accuracy with a percentage sign on it.

**Complementary suppression.** A group of cells that hides exactly one of them and publishes the
rest has not hidden it, because it comes back by subtraction from any total the reader can
reconstruct. So a group that hides one cell hides a second, the smallest of the survivors, and no
table publishes a total of its own.

**Deliberate imprecision.** Answer counts are rounded to the nearest ten and head counts are given
as bands. This is the only defense against the one attack the other three do not touch: two
vintages of this file, differenced, describe what happened in between. It costs a reader nothing,
since a proportion resting on 4,830 answers and one resting on 4,834 are the same finding.

The thresholds are identical in every table on purpose. It means one sentence is true of the whole
file, and one sentence is what somebody can actually check before sending it.

**And anybody can leave.** Settings has a row that takes a learner's answers out of the counts, and
out means the rows are never read rather than subtracted afterwards. `/privacy` describes all of
this in the same terms.

## 3. Producing one

Set `RESEARCH_TOKEN` in the deployment's environment. With it unset the route 404s, which is also
the state in which no export can be produced at all.

```
curl -H "Authorization: Bearer $RESEARCH_TOKEN" \
     "https://your-app/api/research?format=csv" -o learner-errors.csv
```

Without `format=csv` it returns JSON, which carries everything the CSV does plus the full method
block, and is what a second program should read.

The CSV is the form to send a person. It is one row per published cell in a long layout, so tables
of one and three dimensions live in one file, and everything above the header row is a comment line
starting with `#`. Both `read.csv(comment.char = "#")` and `read_csv(comment = "#")` skip those
without being asked, and a spreadsheet shows them as text at the top. That is deliberate: a file of
percentages that has been separated from its denominators and its caveats is worse than no file,
and a method note living in a second attachment is a method note that gets separated by the second
email.

Before sending one, open it and read the first thirty lines. If the corpus is small, most of the
tables will be nearly empty, and the honest thing at that point is to wait rather than to lower a
threshold.

## 4. What it cannot tell you

Every one of these is stated in the file itself, and they are the useful half of it.

**The mix of questions is this app's, not Estonian's.** Which cards exist for a word depends on
what the dictionary holds for it, so a word with a full set of recorded forms is asked about in
more ways than one held as principal parts alone. Read every table against `task`.

**Spaced repetition is not sampling.** A card somebody keeps missing comes back more often, so a
hard word is over-represented in the answer count and its accuracy is measured over repeated
attempts at the same word by the same person. This is the deepest limitation here and it cannot be
removed, only stated.

**Marked and self-graded answers cannot be told apart.** Most answers are compared against a form
the dictionary holds, but a learner can set review to show the answer and grade themselves, and the
log records the grade rather than how the question was asked. The corpus block reports how many
people have each setting, which bounds it without resolving it. Resolving it would mean recording
the shape of the question on the review row, which is a change to the one table in this schema
whose loss is unrecoverable, and it would only help data collected afterwards.

**A first meeting is not in here.** The app shows a new word with its answer and writes nothing
down; the grade comes from the retrieval a few cards later. So nothing counted here is somebody
being asked for a word they had never seen. That is a strength rather than a caveat, and it is
worth saying out loud because most flashcard data does not have it.

**Response time was left out.** `Review.durationMs` exists and is populated, and it is not
reported. It counts a card left open on a locked phone, it is clamped at both ends, and on a
self-graded card it includes deciding how to grade yourself. A median over that mixture is not
measuring difficulty, and a column nobody can validate is worse in a research file than a missing
one.

## 5. What it changes about asking

The letters to TartuNLP and to the Institute were, structurally, a favor: thank you for the free
thing, may we have some of your time. This makes them an offer instead. An anonymised account of
where real learners fail, at a size no single classroom or textbook pilot reaches, is something
neither an applied language-technology group nor a lexicographic institute can easily get, because
it needs a live product with real usage. That is the one thing this has and they do not.

Two things to be careful about when offering it. Do not promise a recurring feed: each release is
a one-off, and publishing successive vintages of the same table is exactly the differencing the
rounding is there to blunt. And attribute the Estonian: the words, forms and sentences the tables
are grouped by come from Ekilex, at the Institute of the Estonian Language, under CC BY 4.0.
