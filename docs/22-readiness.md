# How ready you actually are

What the app says about a learner's readiness for real life, why it says it in situations and
rungs rather than as a percentage, and what it refuses to claim. `lib/readiness/` is the
arithmetic, `lib/progress/readiness.ts` reads the log for it, and `/progress/readiness` is where
it is shown.

## 1. The number everybody else prints

A vocabulary app can compute "you would understand 81 percent of everyday situations" out of a
word count and a list of situations, and several do. It is not a lie. It is the answer to the
least useful question, because it measures the one thing a learner sitting a real exchange does
not need to be told: whether they would follow it. Knowing the words for a health centre is what
lets you follow the receptionist. It is nothing like what lets you answer her when she says one
sentence too fast, and it is nothing at all like what lets you open the exchange, steer it and
recover when it goes sideways. An app that sells the first as the third hands out a confidence the
counter takes away in ten seconds, and the learner concludes, wrongly, that they are worse at
Estonian than they are.

This app already had the ingredients for the honest answer and had never combined them. Every one
of the 82 course units carries a `canDo` claim written the way the CEFR writes one, "Describe a
symptom to a doctor and understand the advice you are given", and not one of those claims had ever
been checked against what the learner had done. The review log records, for every answer, what was
asked (`Review.slot`), whether it was right, and how long it took (`Review.durationMs`), and the
last of those had never been read by anything. The exam hub had an honest model of confidence
with an evidence tier beside every figure and a ceiling on what a thin log may claim. And the
Situations design (`docs/21-situations.md`) had already mapped encounters to the units that supply
their words and worked out which machinery every conversation runs on.

## 2. The situation is the unit, and it has three rungs

The unit of readiness is a **situation**, and the situations are the course's own claims: one per
unit, its `canDo` as the question, its lemmas as the words the answer is read off. A situation is
read on three rungs, in order, and the learner is placed on the highest one the log supports.

| Rung | What it claims | What it reads |
| --- | --- | --- |
| Follow it | You would understand most of what is said to you. | Recognition: the word came at you and you knew it. |
| Take part | You could answer when spoken to, with the words and endings it needs, without a long silence first. | Production: the meaning, case or person was asked for and you gave it, more than once, and the last time. |
| Lead it | You could open it, steer it and recover when it goes wrong. | Production with variety and at pace, plus everything the encounter leans on that is not its own vocabulary. |

Under those, **not yet** is a situation whose words the learner has met and cannot yet follow, and
**not started** is one the log has never seen, which is a fact about the course rather than about
the learner and is printed as one.

**The one promise is that recognition alone never clears the second rung.** A learner who has turned
over every card of a unit two hundred times and never produced a word of it is at "follow it",
whatever the percentage, because that is what they can do. The invariant suite drives the function
with exactly that evidence and fails if it says more.

**The bars are shares of words, not averages of scores.** A situation is read word by word and then
asks how many of its words stand at each rung, since an average lets three words you know cold
cover four you have never met, and an encounter does not: the one word you are missing is the one
the other person says. Three quarters of the words to follow, six in ten produced reliably to take
part, six in ten solid in more than one form with eight in ten produced reliably underneath to
lead. Round figures rather than fitted ones, on purpose, and the tier printed beside every reading
is what keeps the exact boundary honest.

## 3. What leading costs beyond the words

The top rung is where a word count is most wrong, so it reads four more things, and each one is a
struggle named on the screen when it is missing.

**Pace.** `Review.durationMs` is how long a card was on screen before it was graded, and the median
over *correct* production answers is kept per word. Only correct ones, because a wrong answer's time
measures the search for a word that was not found. Under four seconds is called quick and over
eight slow; both are assumptions, they are printed as such, and the seconds are printed beside the
word so a reader can disagree with the line rather than with a label. A typed answer includes the
typing, so the thresholds are generous rather than tight. A live situation whose words come at
eight seconds each is held at "take part" with the sentence "in a real exchange you get about two
before the other person fills the silence, usually in English", and the drill it points at is the
sixty-second sprint, because speed is drilled separately from knowing.

**The cases it turns on.** `SITUATION_FACTS` names, per situation, the cases the encounter actually
hinges on, as keys of `CASES` and never as words: directions live on the local cases, a doctor's
visit on the alalütlev, shopping on the osastav. Each is read off the same half-year case window
Progress prints (`caseReviewsFor`), so a learner told the osastav is at 55 percent on one screen is
told the same here. A case under seventy percent blocks the top rung and names itself in Estonian
with what it is for; a case with under six answers blocks it too, and says so, because "we have
not seen you use it" is a different sentence from "you get it wrong".

**The machinery it runs on.** Question words, numbers, the clock, the short replies, the pronouns.
A situation declares which of those it needs, and a needed one is held to "take part" on its own
unit before the top rung is claimed: nobody leads a shop encounter who cannot follow a price said
once. Unit ids, never words, exactly as the seasonal row names units (ADR-005).

**The ear.** Every answer in the log was typed or read. The only thing in this app that measures
whether somebody can follow *speech* is the level check's listening section, and a mock paper's
listening part after that. So a live situation is held off the top rung until one of those exists,
with the sentence "nothing here has tested your ear", and held off it again when the check placed
listening below the situation's level. That is the whole of what the app can honestly say about the
shock of somebody speaking faster than a card, and it says exactly that rather than guessing.

An own-pace situation, a reading or writing unit, is asked about none of the last three of those
beyond its cases, because a learner reading a business page is not being spoken to.

## 4. Thin evidence caps the rung

The exam model caps a *confidence* at what the log has earned. Here there is no percentage to cap,
so the rung itself is: under a dozen answers on a situation's words the app says "follow it" and no
more, whatever the answers were; under forty it says "take part" and no more. When the cap bites,
the reading says so in the first line of its struggle list, with the count, and the detail page
prints what the answers would have said, because "take part, on eleven answers" and the same words
on two hundred are two different sentences and a reader is owed both halves.

The tier beside every rung is `EVIDENCE_LABEL` from `lib/exam/readiness.ts`, the same three words
the exam hub uses, so one word means one thing across the app. An invariant reads every screen that
draws a rung chip and fails on one that does not print the tier beside it.

## 5. What the screen leads with

The headline over a level is a **distribution, never a percentage**: "Of the 23 situations at A1:
4 you could lead, 7 you could take part in, 8 you would follow and 4 you would be lost in". A
percentage averages the situation you could lead with the one you would be lost in and reports a
number true of neither, which is the sentence this screen exists to replace.

Then the struggles, ranked by which rung they stand in the way of, before the encouragement,
because somebody who reads "you could take part" and stops has read the headline, and the line
under it about pace is what they meet at the counter. Every struggle carries a door: the unit, the
grammar page for the case, the sprint, the level check, a dictation, review. An invariant drives the
readings across every kind of evidence and checks every door opens.

Then, only once the log supports "take part", **something real to go and do**: one authored
English line per situation ("Order a coffee and something to eat, and stay in Estonian when they
answer") and, for a live exchange, what will come back ("A question you did not plan for: here or
to take away, with milk, anything else"). The `expect` line is shown at every rung, since knowing
what is coming is useful before you are ready for it; the `tryThis` line is not, since an app
telling somebody to go and book a doctor's appointment on the strength of recognizing nine words
is the false confidence this whole thing is against.

And on every live situation, one line: nothing on this page has heard you speak, and how you sound
is yours to judge in speaking practice (ADR-018).

## 6. Where it lives

`/progress/readiness` is the list, grouped by level with the learner's own level first, each row
carrying the rung, the tier, the claim and the one thing in the way. `/progress/readiness/<unit>`
is the detail: the verdict, the three rungs as three bars, the pace, the struggles, the thing to
try, and the words not there yet as chips into the dictionary. Progress carries the distribution as
a panel, and every unit page prints its own rung under the claim it makes, since the claim and the
verdict on it belong on one screen. It is a `within` of Progress in `lib/ux/nav.ts`, so the palette
reaches it and the rail does not grow a row.

Where a scene in `lib/scenes/catalogue.ts` names the unit it tests, the detail offers it as a
rehearsal, between "you could take part" and the counter. The two modules are the two halves of
one question: Situations is where the claim is played out on somebody who wants something from you
(`docs/21-situations.md`), and this is where every claim, including the 79 with no scene yet, is
read off what the learner has actually done.

## 7. Nothing is stored, nothing is generated, nothing is guessed

Every reading is derived on the request from the append-only log (ADR-014); the module that reads
the database for it may only read, asserted. The situation table is English throughout and names
unit ids and case keys, never a word, so a typo fails a test rather than silently asking about
nothing; `situations.test.ts` checks every entry against the syllabus and the case table, checks
the authored lines against the voice table, and fails on a letter an English keyboard lacks or a
quoted word. `lib/readiness/` is in the list of layers asserted to import no database, React or
Next. No model is anywhere near any of it.

## 8. What it cannot see, said plainly

A `Review` row carries no note of which mode wrote it, so a dictation and a flip of the same card
are one row: the log cannot tell listening from reading, and this design does not pretend to. It
reads the ear off the level check and the mock papers, and holds a live situation short of "lead"
without them. Rows written before `Review.slot` existed carry no slot; the card they point at still
knows its type, so those rows take the card's slot, and a card since deleted leaves its rows read as
recognition, which is the safe direction. Pace is measured on typed answers and includes the typing,
which is why the thresholds are wide and printed. And nothing has heard anybody speak.

## 9. Measured, on the demo learner

The fixture in `scripts/demo-data.ts` lays down 350 reviews over 78 cards across a few A1 units.
Read by this module: 8 situations at "not yet", 15 not started, none higher, and the commonest
struggle across the level is that most of the words were last seen over a month ago, which is true
of a fixture written as two months of history. On the country unit, which it has worked hardest:
9 of 20 words followed, 3 produced reliably, pace 4.2 seconds over the 8 words with enough timed
answers, 4 words wrong the last time. That is a learner who could pick their own country out of a
sentence and would stall on the rest, and it is what the screen says.
