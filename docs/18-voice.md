# Voice

Every word on every screen is one person explaining Estonian to another. Not a product talking
about itself, not a system reporting its state, and never something that reads as though it was
generated. This is the standard for all of it: the interface, the errors, the empty states, the
grammar prose, the README, the policy pages and Anu.

It covers this page too, and every other one in `docs/`. The argument is about who is reading. Almost
everybody here is also in a class in Tallinn or working through a textbook at a kitchen table. They
read their teacher carefully and they skim marketing, and they decide which one a screen is within
about a sentence. A panel that opens "Unlock the power of spaced repetition" has already been
sorted into the second pile, and the useful thing underneath it goes unread.

## 1. The rule

**Warm, kind, concise, and unmistakably a person.**

Those four are not a mood board. Each one is a decision you can check:

**Warm** is attention, not enthusiasm. Warmth is noticing the specific thing this learner did and
saying it back to them. "Six days in a row" is warmer than "Amazing work!" because it is about them
and the other one is about us. Exclamation marks and praise adjectives are the cheap substitute, and
a learner spots the difference immediately, because one of them required us to have been looking.

**Kind** shows up where the news is bad, which is most of the places copy gets written. A wrong
answer, an empty deck, a search that found nothing, a paper that did not pass. Kindness there is
saying the true thing plainly and then saying what to do next. It is never softening the correction:
a learner who is left unsure whether they got it wrong will rehearse the error, and vagueness
dressed as gentleness is the least kind thing on this list.

**Concise** is the hardest and the one that slips. There is no word count. The test is whether every
sentence is doing work for the person in front of it: cut anything that restates the heading,
anything that explains why we are telling them, and any sentence that exists to round the paragraph
off. Two sentences that answer the question are kinder than six that circle it.

**Unmistakably a person** is the negative half, and it is the half a machine can help with. Section
2 is the list.

## 2. What is banned, and where the list lives

`lib/copy/voice.ts` is the one table. `lib/copy/readerCopy.test.ts` sweeps every reader-facing line
of `app/`, `lib/`, `components/` and the README against it; `lib/tutor/humanize.ts` applies the
rewritable half to Anu's stream on its way to the learner; `lib/tutor/prompt.ts` gives Anu the same
rules in the same words. Three files used to state this and no two of them agreed, which is how
"delve" came to be banned in Anu's answer and fine in the panel next to her.

**The em dash and the en dash, anywhere a reader can see one.** This is the oldest rule here and the
loudest single tell there is. A dash used as a clause break is the punctuation of generated prose and
almost nobody writes it by hand in an interface. Use a comma, a full stop, or a pair of brackets, and
pick per sentence. Note that replacing a dash between two independent clauses with a comma makes a
comma splice, which reads worse than the dash did: use a full stop. A separator in a label takes the
middot the app already uses. A range is "2 to 3 weeks" or "2028-2029". An empty cell is `NO_VALUE`
from `lib/copy/values.ts`, which is "n/a".

**Stock openers.** "It's important to note that", "It's worth noting", "At the end of the day",
"In essence", "Great question", "In conclusion", "Moreover", "Furthermore", "Additionally",
"Needless to say", "Rest assured", "That being said". Every one of them carries no information.
Start with the thing.

**Inflated shapes.** "Not just a rule, but a pattern" is "a rule, and a pattern". "It's not about
memorizing, it's about understanding" is one claim wearing two. "More than just a dictionary",
"That's where the review queue comes in". A teacher says what a thing is, once.

**Brochure vocabulary.** delve, leverage, utilize, seamless, effortless, cutting-edge,
groundbreaking, revolutionary, game-changing, world-class, transformative, holistic, synergy,
bespoke, meticulously, curated, a plethora of, a myriad of, a wide range of, tapestry, realm,
ever-evolving, fast-paced, testament to, embark on, your journey, unleash, supercharge, empower,
elevate, harness the, unlock the power of, take it to the next level, dive into, look no further,
say goodbye to, we've got you covered, "whether you're a beginner or...". Also the praise
adjectives: awesome, amazing, fantastic, incredible, stellar. And "As an AI", which Anu is not.

**The linguist's word where a class has its own.** `paradigm`. A learner has met "the forms of a
word", "the case endings" and "the table" in class, and has not met that one, so it stops the
sentence while they wonder which lesson they missed. Write what a teacher writes on the board: all
the forms, every form of the word, the case table. This is the same argument `lib/estonian/terms.ts`
makes about the case names, and it is the one tell here that is not brochure and not an opener: it
comes from writing about a language rather than teaching it. The Ekilex client keeps the word in one
place, because it is the key their own JSON uses, and `lib/copy/readerCopy.test.ts` excuses that file
for that one tell by name rather than for the whole list.

**Emoji.** This app has an icon system: data that drives UI carries a lucide icon name and
`components/icons.tsx` is the only place one becomes a component. An emoji at the head of a bullet is
the visual form of the same tell. The check is drawn narrowly and deliberately: the arrow in
"Estonian to English", the return key in a keyboard hint, the tick on the week strip and the warning
sign on a failed connection are typographic glyphs doing a job in one colour, and they stay.

## 3. Worked examples

The bans catch the obvious half. These are the ordinary sentences, where the fault is tone rather
than vocabulary.

An empty review queue:

> Nothing due right now. Great job staying on top of things! Come back later to continue your
> learning journey.

against

> Nothing due today. The next card comes back on Thursday.

The first congratulates them for the app having no work, and "learning journey" is doing nothing.
The second answers the only question somebody looking at an empty queue actually has.

A word the dictionary could not find:

> Unfortunately, we were unable to locate that word in our comprehensive database. Please try again
> with a different search term.

against

> No entry for that. Check the spelling, or tell us it is missing and somebody will look.

The first apologizes at length, calls the dictionary comprehensive on the one occasion it demonstrably
was not, and offers "try again" as advice. The second gives them the two things they can do, one of
which is `SuggestFix`, because a dead end offers a way out.

A wrong answer:

> Not quite! Remember, Estonian uses the partitive case in many situations. Keep practicing and
> you'll get there!

against

> Partitive here, so kohvi. The action is unfinished, and an unfinished action always takes the
> osastav (partitive).

The first is warm in the cheap way and teaches nothing: "many situations" is the shape of an answer
without the answer in it. The second names the rule, which is what transfers to the next sentence.

A streak:

> Amazing! You're on fire with a 6 day streak!

against

> Six days in a row. Your longest run so far.

A finished paper:

> Congratulations on completing your B1 mock exam! You scored 54%, which is a fantastic effort.
> Keep up the great work on your Estonian journey!

against

> 54 percent. The pass mark is 60, and listening is where the marks went. This is a practice paper,
> not the state examination.

Kind is not the same as encouraging. Somebody who has just sat ninety minutes wants to know where
they stand, and telling them 54 percent is fantastic is the one response that wastes the ninety
minutes.

### How much of it there is

The examples above are about tone. This one is about volume, and it is the fault that survived every
rule in this document: sentences that are warm, kind, concise and correct, and simply too many of
them for the screen they are on.

The dictation round with an empty deck:

> Dictation uses the sentences Ekilex records against the words in your deck, and only the short
> ones, a sentence you cannot hold in your head tests memory, not listening. Look a few of your
> words up in the dictionary, or add a unit from the path.

against

> **No sentences short enough yet**
> Dictation reads the short Ekilex sentences attached to words in your deck.
> [ Open the dictionary ]

Every clause in the first is true and worth knowing, and none of it is worth knowing *here*, to
somebody who cannot use this screen yet and is looking for the way out of it. The reason long
sentences are so tempting in an empty state is that there is nothing else on the screen to write,
which is exactly the wrong reason.

The level check, before anybody has taken one:

> Reading, listening and writing, climbing until it finds your level: a few questions each, and a speaking section
> you judge yourself because nothing here can honestly score a recording. It stops as soon as the
> questions get clearly too hard, and no answer becomes a flashcard.

against

> Reading, listening and writing, climbing until it finds your level. Speaking you judge yourself.

Three of the four dropped facts are on the results screen, where they answer a question somebody is
actually asking. The fourth, that no answer becomes a flashcard, is the honest kind of detail this
app is careful about, and it belongs in the briefing rather than in front of the button.

The test that holds this is a ceiling, not a target: 100 characters for a dead end's body, 95 for a
page lead. Neither number makes a sentence good. What they do is catch the paragraph growing back.

## 4. What this rule does not cover

**Comments, and code quoted inside a document.** Comments are for whoever maintains the code and may
punctuate however they like. The sweep skips them on purpose, and it skips a fenced block and an
inline code span in a markdown file for the same reason: `docs/04-data-model.md` quotes the Prisma
schema and `docs/10-testing-quality.md` quotes the grep the secret scan runs, and rewriting the
punctuation inside either would rewrite the thing being quoted. That is also how a page names a
banned phrase without using one, which is what keeps the exemption list to a single file.

**These pages are not exempt.** `docs/` was left out when this was first written, on the argument
that it is read by contributors rather than by learners. That was true and it was not a reason. They
are still somebody explaining something to somebody, they are the first thing a new contributor
reads, and a project whose own documentation is written in the voice it forbids on screen has told
that person which of its rules are real. There were 388 dashes behind the argument, and three of
them were the `NO_VALUE` fault from the source tree wearing a different hat: an empty cell in a
table of forms, in the four-states table and in the degradation table, each written as a bare dash
that a mechanical sweep would have turned into a comma sitting where a form should be.

This standard is the one exemption, from the phrase rule only. It has to name every phrase it bans
and quote the copy it exists to prevent, and §3 is nothing but that copy. It is still swept for a
dash like everything else.

**English headings over Estonian tables.** "Case", "Singular", "Plural" are labels, not prose.

**Estonian itself.** Nothing here licenses touching a word of it. Anu's `FIX:` and `VOCAB:` lines
pass through `humanize.ts` byte for byte, because rewriting punctuation inside a corrected sentence
would be the app editing Estonian, which is the rule the whole project is built on (ADR-005). An
attested example sentence from Ekilex is never tidied.

## 5. Anu

Anu is a teacher, on every screen she appears on. She does not narrate her own nature, apologize for
her limits at length, or open with a compliment. Her rules are the same ones above, given to her in
the same words: `VOICE_RULES` in `lib/copy/voice.ts` is interpolated into the system prompt, so what
the model is asked for and what the sweep enforces cannot drift apart. `scripts/test-invariants.ts`
fails if a rule stops reaching the prompt.

Two of those rules are enforced rather than requested, because a prompt is a request and a live test
showed a model reaching past one unprompted. `humanize.ts` strips the dashes and the stock openers
out of the stream before the learner sees them. `lib/tutor/verify.ts` withholds a writing-grader note
whole if it quotes an Estonian form the learner was not given.

What is deliberately not enforced is the brochure vocabulary, and the reason is worth keeping. There
is no mechanical translation from "seamless" back into whatever the writer meant, so rewriting it
mid-stream would put words in Anu's mouth that she did not choose. It is asked for in the prompt,
swept in hand-written copy, and left alone in a stream.

## 6. How this is enforced

| What | Where |
| --- | --- |
| The table of banned characters, phrases and shapes | `lib/copy/voice.ts` |
| The sweep over every reader-facing line of `app/`, `lib/`, `components/`, the README, `CLAUDE.md` and `docs/`, plus the table checked against itself | `lib/copy/readerCopy.test.ts` |
| Dashes and stock openers removed from Anu's stream | `lib/tutor/humanize.ts` |
| The same rules given to Anu | `lib/tutor/prompt.ts` |
| One table, one sweep, and the rules actually reaching the prompt | `scripts/test-invariants.ts` |
| The ceiling on a dead end's body and a page lead | `lib/copy/readerCopy.test.ts` |

Adding a tell means arguing that the phrase is never right on a screen in this app. `perfect` is not
on the list, because taisminevik is the perfect tense and a grammar page has to be able to say so.
`unlock` is not on the list, because the exam recordings genuinely unlock. A check that fires on
honest copy gets waived, and a check everybody waives is a check nobody reads.

The half in the table is the half a machine can hold. Sections 1 and 3 are a review standard, and
the only thing enforcing them is somebody reading the sentence back and asking whether a teacher
would have said it that way.
