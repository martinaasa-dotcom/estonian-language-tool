# Working in this repository

## What this is

An Estonian learning app: dictionary, learning path, spaced-repetition review, practice games and a
grammar tutor. `docs/` holds the plan it was built from; `docs/13-mvp-status.md` says what is built,
what is deliberately not, and the known limitations. Read that first, and §6 of it especially. That
is the current state.

## Read before writing code

1. `docs/09-roadmap.md`: what phase we are in and what "done" means for it.
2. `docs/02-estonian-domain.md`: the linguistic model. Non-obvious and load-bearing.
3. `docs/04-data-model.md`: the schema.
4. `docs/03-architecture.md` §6: the ADRs. Do not silently reverse one.
5. `docs/14-design-system.md`: the visual language. Palette, tokens, motion, and what each
   colour is allowed to mean. Read it before adding a colour, a radius or a shadow.
6. `docs/18-voice.md`: how the app speaks. Warm, kind, concise, and never in a way that reads
   as generated. Read it before writing a sentence anybody will see, which is most changes.

## Rules that are not negotiable

**Never ship a credential to the client.** The Anthropic and Ekilex keys live only in server-side
Route Handlers and server actions. Nothing gets a `NEXT_PUBLIC_` prefix unless it is genuinely
public. CI greps the build output for key patterns, and that is true now rather than aspirational:
the `secrets` job in `.github/workflows/ci.yml` builds with a marked string in every server-only
variable and greps `.next/static` for it, so a leak names which variable leaked. It was verified
both ways, clean on the bundle as it stands and failing when a value was deliberately given a
public prefix and read from a client component, because a check nobody has made fail once is a
check nobody knows the state of.

**And the bundle is not the only way out.** `restoreBackup` and `deleteMyAccount` both end in
"and nothing was changed" followed by whatever the database said, which is the right shape:
those two are where somebody is owed a reason. What the database says is the problem. Prisma
quotes the datasource in an initialisation failure, and a restore runs a two-minute transaction,
which is exactly the window a connection drops in, so that sentence on a learner's Settings
screen could carry the deployment's own host, user and password. `redact` in
`lib/observability/report.ts` already knew a DSN is a credential, because the error log has to be
safe to post to a webhook; it scrubs the same shape CI greps the build output for. A message
rendered in somebody's browser is at least as public as that log and was the one path not going
through it. `safeMessage` is that function plus a length, and an invariant fails on any
`"use server"` export reaching for `.message` itself, and on `safeMessage` quietly ceasing to
redact.

**Never write Estonian.** Not morphology, not example sentences. Forms come from Ekilex or the
seeded principal parts; example sentences come from Ekilex `usages` and are only ever *hidden* or
*reordered* to make an exercise (`lib/estonian/cloze.ts`). The model may translate into English and
explain grammar; anything Estonian it produces in chat is boxed and tagged, and never stored as a
form. (ADR-005, ADR-017.) The one module that writes *about* Estonian at length,
`lib/estonian/grammar.ts`, holds no Estonian at all. Every form on the grammar pages is read from
the dictionary by `lib/progress/caseExamples.ts` and rendered with its provenance.

**Estonian is taught in Estonian, and the Latin names are the cross-reference.** Nobody teaching
this language says "the inessive". A course in Tallinn, a school textbook and the state examination
all name a case by its Estonian name and, more often, by the question it answers: `kus?`. The verb
is named by four axes a course keeps apart, `aeg`, `kõneviis`, `tegumood` and `pööre`, of which only
two are tenses the verb inflects for. This app had all of that data and led with none of it. Every
screen headed a case "Inessive" and set `seesütlev` in small italics under it; the flashcard asked
for "tuba → inessive" and put the question in the hint; the reference called `lihtminevik` "the
imperfect", which is a Latin category Estonian does not have; and the placement check offered a
beginner "Inessive, Elative, Allative" as multiple choice. A learner who has only ever met the
English names cannot follow their own teacher, which is the one thing a course-shaped app must not
do to somebody who is also taking a course.

So the Estonian name and the question lead, everywhere, and the English name stays as a labelled
cross-reference for anyone reading an English reference grammar. `lib/estonian/terms.ts` is the one
table of what a point is called, and it is **deliberately partial**: a point is in it only where
there is a term a class actually uses, and `grammarTerm()` returning nothing is the honest answer
for `irony` rather than a cue to invent one. `grammar.ts` still holds no Estonian and its tripwire
is unchanged, which is why the terms live next door rather than in the prose. Two invariants hold
the rest: every case and every part of the verb carries the name a class uses, and a screen that
names a case in Latin names it in Estonian too. The second is anchored on a member access rather
than on the word, because a file declaring `caseEt: string` in an interface and never rendering it
satisfied the first version of it.

Three things are **not** covered by this and should not be "fixed": an English column heading over a
table of Estonian ("Case", "Singular"), the English prose that explains a point, and the topic ids
in URLs. The ids are keys that 83 syllabus entries and any bookmarked link point at, and renaming
them buys a slug and risks the course.

**The built-in dictionary is built, not typed.** `scripts/expand-seed.ts` produces
`prisma/data/expanded.json` from two sources with a strict division of labour: every Estonian
form and every example sentence comes from Ekilex, every English gloss from Wiktionary, and the
script only joins them. No model writes a character of it. It loads through `prisma/expanded.ts`
as a cache warm-up with `ON CONFLICT DO NOTHING`, never an update, so a hand-written entry, a
learner's correction and a live Ekilex fetch all win over it. Regenerating is resumable and
caches every answer, and a source that will not answer is never written down as a miss: that bug
cost four fifths of the dictionary on the first run and looked like a clean result.

**A gloss is the answer side of a flashcard, so a wrong one is drilled rather than displayed.**
`npm run audit:glosses` re-runs the parser over every entry's own Wiktionary page and prints
what disagrees; `--write` applies it. **The first pass over the whole of `expanded.json`, all
5,363 entries, came back clean on 2026-08-31**, which is worth writing down because every pass
before it stopped at B1: A1 to B1 is 2,164 entries and the 3,199 above it had never been asked.
`.github/workflows/drift.yml` asks weekly and had not fired yet, having landed on main the same
day after that Monday's cron, so this was its first execution by hand. A clean result over a
parser this quiet is only worth the words if the check can fail, so it was made to: run the same
comparison against a translation known to be wrong and all 5,363 flag. What remains is not parser
drift but a page being wrong about its own word, which is what the report queue is for. The
first systematic pass over A1 to B1 corrected 25 of 2,164, and four of those were a different
word rather than a different sense: `lamp` was being
taught as "random", `oktoober` as "hard hat", `ooper` as "opera house", `rida` as "many, much".
One cause under all of them. `{{l|en|lamp}}` renders as the word "lamp", `cleanWikitext` deleted
balanced templates wholesale, and an emptied line sent the picker to the next sense, which on a
page with more than one etymology belongs to another word. Where the template sat mid-line the
gloss survived with a hole in it instead, which is worse: `segama` read "to , to , to" and `vana`
read "an person", and nothing watching this file could tell a hole from a short gloss. Both
shapes are invariants now. **Only an English-tagged link is ever unwrapped**: `{{m|et|kohta}}`
is an Estonian word quoted inside an English note, and unwrapping it by a language-blind rule
would write Estonian into a gloss (ADR-005). That guard has its own invariant, and it took two
attempts: the first quoted an Estonian word with no diacritic in it inside a trailing
parenthetical the parser strips anyway, so deleting the guard left the check passing.

**Which sense a learner needs is not a judgement this pipeline makes.** Demoting the senses
Wiktionary marks `rare`, `obsolete` or `dialectal` was tried and reverted. It corrected `kõrb`,
whose everyday "desert" sits under a later etymology than a `rare` sense, and it broke more than
it fixed: `soldat` is tagged `obsolete` on "soldier" and would have been drilled as "jack",
`vats` is `dialectal` on "belly" and became "rumen", `raisk` is `dated` on "carrion" and landed
on a vulgar usage note. Sense order stays the page's own, and the entries the labels get wrong
are for a person to correct, which the dictionary is editable for. The course's authored glosses
in `prisma/data/harvested.ts` were checked against the same references and none needed
correcting: of the 684 with an independent English gloss, 657 agree outright and all 27 that do
not are a choice between synonyms. Those are authored rather than parsed, so no fault above can
reach them, which is the argument for the division of labour and not for skipping the check.

**A word's gloss and its part of speech are two facts about one line, so they are read off one
line.** They were not, and that is the whole of what went wrong. The gloss is the first definition
on the page; the label was whichever of Wiktionary's four part-of-speech categories the candidate
was drawn from first, and nouns are drawn first, so every word listed as both came out a noun:
`kallis`, `valge`, `sinine`, `noor`, `tark`, `vana` and 55 more. The obvious fix is to prefer the
more specific category, and it was measured and is worse. It relabels 86 words and breaks 25 of
them, because a category says only that the word has *some* sense of that kind somewhere on its
page: `lamp` is in the adjectives category for a colloquial sense meaning "random", `pea` and
`kama` are in the adverbs category, and `mari`, `norm` and `seadus` would all have been labelled
against the very gloss printed beside them. Reversing the order moves the fault rather than fixing
it.

Every definition sits under a `===Noun===` or `===Adjective===` heading, so
`extractEstonianEntries` returns each sense with its own, and `lib/dict/pos.ts` is the one table of
who answers what: Ekilex draws the verb line, because that is the line it actually draws and the
one that decides which principal parts a word has; the page's heading decides among the nominals;
the category is a fallback for a page headed `Participle` or `Postposition`, which are true things
this app has no column for. `npm run audit:pos` re-runs it over the shipped file, 61 labels
corrected.

**The course harvest cannot be wrong this way, and is checked anyway.** `harvested.ts` is generated
and its `pos` is a passthrough: `harvestWord` reads the label off the syllabus entry and returns it
untouched, so the label and the English gloss are authored by one person in one line of
`lib/collections/syllabus/` and cannot come apart the way a parsed gloss and a category can. The
audit checks it regardless, matching each authored gloss to the Wiktionary sense it describes and
comparing that sense's heading: 673 of 1,248 checkable, none wrong. It **reports and never writes**,
because a correction belongs in the syllabus, and because `syllabus.test.ts` keys the course on
`lemma|pos` against the harvest alone, so editing one file and not the other already fails
`npm test`. Do not add an invariant for that; it is the same check twice. **An adjective claim from either the heading or the `{{et-adj}}` headword is enough,
and a noun claim from the headword alone is not**, which is an asymmetry in the sources rather
than a thumb on the scale: `{{et-adj}}` carries a superlative, which only an adjective has, while
`{{et-noun}}` is the ordinary nominal declension an adjective shares, so one is a statement and
the other is a shrug. That is what keeps `võimas` an adjective under its `===Noun===` heading and
`üksik`, `lämbe` and `lämmi` adjectives under their `{{et-noun}}`.

**`pos` is half of `Lexeme`'s conflict key, so correcting one is not an edit, it is a move.** Twelve
of those 61 words were already in the dictionary *twice*, because the course harvest labelled
`kallis` an adjective and the builder labelled it a noun, and two labels means two rows with two
ids and two sets of cards. Nothing reported it. They are one entry each now, which is the only
reason `SEED_SET_SIZE` has ever gone down. The same key is why `prisma/data/pos-corrections.json`
exists: a deployment seeded before this holds the old label, a reseed finds no conflict and adds a
second row beside it, so `applyPosCorrections` repoints the existing one first. It runs before the
early return `--only-if-empty` takes, for the reason `ensureSearchIndexes` does, and before the
harvest is written, because the harvest inserting its own correct label first strands the stale row
this was meant to replace. It writes no content, never touches a row somebody edited by hand, and
never moves a row onto a key another row holds, since `hall` is legitimately a noun meaning "frost"
and an adjective meaning "grey".

**The syllabus names words; Ekilex decides whether they exist.** `lib/collections/syllabus/` is
the course, and a lemma in a unit is a *request*, not a fact. `scripts/harvest-ekilex.ts` asks
Ekilex for each one and keeps only what comes back with forms matching the part of speech
asked for; anything else is dropped and reported. So a misspelled or imagined word cannot reach
the dictionary, it can only fail to arrive, loudly. That is what let the vocabulary grow from 360
to 1,248 words without a single generated form. The English gloss is the only authored column
in the whole pipeline, and English is the one language this project may write.
`lib/collections/syllabus/syllabus.test.ts` fails if a unit names a word the harvest did not
bring back, which is what makes this mechanical rather than aspirational. Re-run the harvest with
`npm run harvest`; responses are cached, so it costs Ekilex nothing.


**The words between the words are a request like any other, and a unit that was cut does not take
its vocabulary with it.** Fourteen A1 units of nouns, verbs and adjectives and not one for the
words every sentence is made of: nobody asking `kes?` or `millal?`, or looking up `täna`, `peal`
or `september`, found anything, in a dictionary of six thousand words. Six units carry them now,
question words, pronouns, the adverbs of time, the postpositions, the months and the countries,
appended after the fourteen so that the first three units at A1, which is what first run builds a
deck from, stay what they were. `PRONOUN` is a part of speech for it, harvested as a nominal
because it declines like one (`kes`, `kelle`, `keda`), and a pronoun with no singular (`meie`,
`nemad`) is kept the way an adverb is, attested and formless, rather than dropped. The pronoun
unit builds no case cards from the seed alone, because a pronoun's everyday case forms are the
short ones (`mulle`, `mul`) that no rule over the genitive reaches, and a card answering `minule`
would mark the form everybody says wrong; Ekilex records both and an enriched entry shows the pair.
`lib/collections/syllabus/retired.ts` is the other half: the ten C2 units were cut in §19 of the
status doc with the note that their 170 words stay in the dictionary, and the harvest reads the
syllabus, so the first re-run after that cut would have quietly taken them out of the seed. They
are a request list of their own now, in a unit's shape, read by the harvest beside the units and
listed by no screen.

**Never generate Estonian morphology.** Inflected forms come from Ekilex, never from the model. This
is not theoretical: `gpt-4o-mini` invented "Ma söön aitamat" when asked for an example. The AI may
explain grammar and suggest an English translation; it may never supply an Estonian form. AI output
is tagged and needs confirmation before becoming a flashcard answer. An unverified form does not
just sit there being wrong, the SRS drills it in. (ADR-005.)

In the writing grader this is *enforced*, not requested: `lib/tutor/verify.ts` checks every Estonian
word in the model's feedback against the forms it was given and withholds the note otherwise. A live
test showed a model reaching for forms unprompted despite the instruction, which is the whole
argument for checking rather than asking. If you add another path where a model discusses Estonian
the learner will act on, put it behind that check too.

**"Never generate" means never by a model.** A deterministic rule over a form already stored is not
the thing this forbids, and reading it that way would delete the ten regular cases `morph.ts` builds
off a genitive stem, the ADR-009 fallback for a word held as principal parts alone, and the derived
case `matchEstonianForm` vouches for when believing a scanned word. A derivation is wrong the same
way for every word that takes the ending, so it is one bug found once, and the form says on screen
that it was derived. A model is wrong about one word, unpredictably, in output that looks exactly
like the attested forms beside it. ADR-005 amendment 1, because the ADR's own wording said "Ekilex
only" and three later decisions had already been reading it the narrower way.

**The verb has one derivable part, and it was checked against every verb before it was shipped.**
A seeded verb holds five principal parts and nothing else, so on a deployment without an Ekilex key
every one of the 799 verbs in the built dictionary showed `loen` and stopped: no `loed`, no `loeb`,
no `ei loe`, and a conjugation card for `olevik · ta` could not be built at all. The present
indicative is the one part of the Estonian verb that really is a suffix on a stored stem for every
verb in the language but one: take the `n` off the first person and the other five persons, the
negative after `ei`, the conditional in `-ksi-` and the singular imperative are regular endings on
what is left. `lib/estonian/conjugate.ts` is that rule and it is the only module allowed to join a
person ending to a stem, asserted, for the reason the case suffixes have one home: it is the module
that also holds the exceptions. `olema` gets no present from it, because its third person is `on`
and nothing about `olen` predicts that; `minema` gets no imperative, because it says `mine` off
the infinitive. **The simple past is not derived and may not be**: `lugesin` goes to `luges` but
`tahtsin` to `tahtis` and `võtsin` to `võttis`, with the grade changing on the way, so its third
person stays attested-only and a seeded verb makes seven conjugation cards where an enriched one
makes eight. `npm run audit:verbs` derives every slot for every verb in the shipped dictionary
and compares it with every form Ekilex records for the same word: 797 verbs, thirteen slots
each, no disagreement, and the two exceptions above are the ones it found. Re-run it before
widening the table. Every derived form says so on screen, the dictionary entry prints the table
under "worked out from loen" with the stored form in bold, the four verb topic pages show the point
on the learner's own verbs with a provenance chip, and an attested form always answers first, so
the moment an entry is enriched the rule steps aside.

**And a derivation never stands where the dictionary has the real thing.** The paragraph above is
the licence to derive; this is its limit, and it was broken for a year in the one case that has an
exception. Estonian has two illatives: the long one is the genitive stem plus `sse`, which a rule
can produce, and the short one, the *aditiiv*, is lexically unpredictable and is the form people
say. `tuba` goes to **tuppa**, not `toasse`; `aeg` to `aega`, not `ajasse`; `abi` to `appi`. The
dictionary held it all along as `ILL_SG_SHORT`, on 2,969 of the shipped entries, every one of them
different from what the ending gives. `NounStems` had no field to put it in and `deriveCase` took a
bare genitive string, so none of the eight callers could have consulted it. The landing page taught
`toasse` as its headline demonstration, the grammar reference printed it under a label saying a
lexicographer wrote it down, and `lib/srs/cards.ts` put it on the back of a flashcard: a learner
typing the correct answer was marked wrong and shown the card again until they stopped.

So `illSgShort: string | null` is a **required** field on `NounStems`, and that is the whole of the
fix that matters. `null` means the dictionary was asked and holds none; a caller that never asked
does not compile. It is the shape `buildOptions` takes a parsed `Government` for, and for the same
reason: prose had said an attested form wins since ADR-005 was written, and the code disagreed the
entire time. `caseAnswer` is the one function that answers "what is this word in this case", it
puts a retrieved form ahead of the seeded short illative ahead of a suffix, and it returns every
spelling that counts as right, because a screen printing one form and a marker accepting one form
are two different questions. Three invariants hold it: the field stays required, nothing joins a
case suffix to a stem outside `lib/estonian/derive.ts`, and the six modules that produce a case
form for a learner all read `caseAnswer`. `lib/estonian/attested.test.ts` is the other half, and
it is the half that can fail on a word: it walks all 5,363 shipped entries and was made to fail
first, on `tuba → toasse`.

Two things this does **not** licence. The other ten cases really are one ending each, and the audit
asserts that too, so the illative is singled out rather than the whole table distrusted. And the
long form stays *accepted* everywhere the short one is shown, since both are Estonian and marking
somebody wrong for the other true answer is the fault this started as, pointed the other way.

**And accepted is not the same as printed, which is how one bug got fixed twice into two bugs.**
Leading with the long form hides `tuppa` and teaches `toasse`, which is where this started.
Leading with the short one and hiding the long one is the same fault turned around, and it is
worse than it looks: 1,937 of the 2,700 short illatives in the shipped dictionary are spelled like
the nominative, genitive or partitive, because that is what this case does, so `aadress` printed
`aadressi` down three rows of one column and `aadressisse`, the form somebody writing a sentence
needs, appeared nowhere. Both readings shipped three weeks apart and each was written as the fix
for the other.

There is no third form to choose. Estonian has two illatives, a course teaches them as a pair, and
`alsoRight` on `DerivedForm` and `CaseAnswer` is that pair: `shownForms` is the one reader, and
every screen that prints a case form prints `tuppa / toasse`. The separator is the one the app
already uses for the parallel forms it has, and it is load-bearing rather than cosmetic, because
`acceptedAnswers` splits on it: what a screen shows and what a marker takes are the same string.
`lib/srs/cards.ts` and `lib/collections/lesson.ts` had been joining on it since long before any of
this, so the app had already answered the question and three screens had not caught up.

`accepted` is deliberately wider and may not stand in for it. It holds every spelling a marker lets
through, including a suffix guess sitting beside a form Ekilex retrieved, and printing that pair
would assert the guess is a word. `alsoRight` holds only the two that are.

The one place they came apart was the writing exercise, whose own comment said `accepted` "is what
makes the marking fair where a word genuinely has two" and which then kept `value` alone: a learner
asked for the illative of `tuba` who wrote `toasse` was told they had not used the form at all, and
the near miss beside it reported their correct sentence as the wrong case. `WritingTask` carries
both now.

**Nothing a person reads may sound like a machine wrote it.** Every screen, every error, every
empty state, the README, the policy pages and Anu are one person explaining Estonian to another.
Almost everybody using this is also sitting in a class or working through a textbook, and they read
a teacher carefully and skim marketing, deciding which a screen is inside about a sentence. So a
panel that opens `Unlock the power of spaced repetition` has already been sorted into the second
pile and the useful thing underneath it goes unread.

The standard is **warm, kind, concise, and unmistakably a person**, and each of those is a decision
rather than a mood. Warm is attention, not enthusiasm: `six days in a row` is warmer than `amazing work`
because one of them is about the learner and required us to have been looking. Kind is where
the news is bad, which is most of the copy in this app, and it is never softening a correction into
vagueness, since a learner left unsure whether they were wrong rehearses the error. Concise has no
word count; it is that every sentence does work for the person in front of it, and two sentences
that answer the question are kinder than six that circle it.

`lib/copy/voice.ts` is the one table of what gives a sentence away: the em dash and the en dash,
the stock openers (`It's important to note that`, `Moreover`, `In conclusion`), the inflated
shapes (`not just a rule, but a pattern`, `more than just`, `that's where X comes in`), the
brochure vocabulary (`delve`, `leverage`, `seamless`, `empower`, `embark on`, `your journey`,
`unleash`, `a plethora of`, `whether you're a beginner or`), the praise adjectives, and emoji. Three files used to state this
and no two of them agreed: `humanize.ts` stripped seven openers out of Anu, `prompt.ts` asked the
model for roughly the same thing in its own words, and the sweep over hand-written copy covered
nine brochure words across **six hand-listed files out of four hundred**. So a phrase Anu was
forbidden from using was fine in the panel beside her, and the 73-unit course page, the exam
briefing and every empty state were outside the check entirely. There is one table now,
`readerCopy.test.ts` sweeps the whole of `app/`, `lib/`, `components/`, the README, this file and
`docs/` against it, and `VOICE_RULES` is interpolated into Anu's system prompt so what the model is
asked for is what the sweep enforces. An invariant fails if any of those three stops reading the table, if the sweep
narrows back to a list, or if a rule stops reaching the prompt.

Adding a tell means arguing that the phrase is never right on a screen here. `perfect` is not on
the list, because taisminevik is the perfect tense and a grammar page has to say so; `unlock` is
not, because the exam recordings genuinely unlock. A check that fires on honest copy gets waived,
and a check everybody waives is a check nobody reads. The emoji rule is drawn the same way: the
arrow in "Estonian to English", the return key in a keyboard hint and the tick on the week strip
are typographic glyphs doing a job, and only the pictographic kind is banned.

**One tell is not brochure, and that is the point of it.** `paradigm` is the linguist's word for
the thing a class calls the forms of a word, the case endings, or just the table. Nobody learning
Estonian in Tallinn has met it, so a screen that uses it stops the reader while they work out which
lesson they missed, which is the same fault as heading a case "Inessive" and is banned for the same
reason. Write what a teacher writes on the board. The word survives in three places and each one is
a decision: the table that bans it, the single test line that proves the ban fires, and
`lib/ekilex/client.ts`, which types Ekilex's own JSON and may not rename a key it does not own. That
last is excused **by name** rather than wholesale, through an `only` list on the exemption, because
excusing a whole file from the phrase rule to keep one key would have handed it every brochure word
as well.

**`docs/` is not exempt, and was.** The sweep skipped it on the argument that those pages are read
by contributors rather than by learners, which was true and was not a reason: they are still
somebody explaining something to somebody, they are the first thing a new contributor reads, and a
project whose own documentation is written in the voice it forbids on screen has told that person
which of its rules are real. There were 388 dashes behind that argument, and three of them were the
`NO_VALUE` fault wearing a different hat, an empty cell in a table of forms written as a bare dash
that a mechanical sweep turns into a comma sitting where a form should be. A fenced block and an
inline code span are still skipped, because a document quoting the Prisma schema or the secret
scan's own grep is quoting code, and because backticks are how a page names a banned phrase without
using one. `docs/18-voice.md` is exempt from the phrase rule alone, since it has to show the copy it
exists to prevent, and `lib/ekilex/client.ts` from one phrase of it and no more.

**The table is half the rule.** No regex tells kind from cold, or notices a paragraph that is
twice as long as it needs to be. `docs/18-voice.md` is the other half, with worked before-and-after
examples off real screens, and it is what to read before writing a sentence anybody will see.

**How much of it there is is the other way copy stops being read, and no rule above can see it.**
Every sentence in this app passed the voice rules and the app still felt like work, because there
were too many good sentences. Thirty-nine dead ends each explained the whole feature to somebody
who could not use it yet: the dictation screen spent forty-one words on where Ekilex sentences come
from and why one you cannot hold in your head tests memory rather than listening, to a learner
whose deck was empty and who wanted the button. The level check spent 260 characters on what it was
before offering to start it. Practice put a paragraph beside each of five targeted modes, on a page
whose own promise is answering "what should I do with the next five minutes". Progress explained
each of its eight charts underneath itself, in prose, where the section title beside it had an
empty slot on the right the whole time.

So there is a ceiling and `readerCopy.test.ts` holds it: 100 characters on an `Empty` body, 95 on a
page `lead`. Both are deliberately generous rather than tight. The measured worst in the tree after
the pass that set them was 88 on each, so they are not caps anybody has to write around, they are
caps that catch the paragraph growing back. `Empty`'s body is optional for the same reason, and
that is the load-bearing half: where the title is the whole story there is no body at all, and the
action is the way out that the deleted sentence used to describe in words.

What is **not** capped is prose in the body of a screen, a grammar explanation or a policy page. A
page whose subject is an explanation is allowed to explain. What is capped is the furniture around
the thing a reader came for. And a cap cannot tell a short sentence from a good one, which is
`docs/18-voice.md`'s job exactly as before.

**A blurb belongs where somebody is reading, not where they are scanning.** The five targeted
practice modes are drawn as the same compact tile the six quick rounds already used, and their
`blurb` was not deleted with the paragraph: `components/CommandPalette.tsx` shows it as the hint
under each mode and searches its words. A sentence explaining rektsioon earns its place where you
are looking the thing up. It does not earn its place eleven times over on the page you press.

**The chat guard is a notice; only the grader has a gate.** `verifyComment` withholds a whole reply
before the learner sees it, which only a non-streaming answer can afford. The main chat streams, so
`flagUnverifiedEstonian` checks Anu's prose against the dictionary after the fact and names what it
could not confirm in a trailing line. It inherits `estonianTokens`, which only reaches a quoted word
or one carrying õäöüšž, so ordinary Estonian in a sentence of prose passes untouched, and that hole
stays open on purpose: the dictionary behind the check clears an English word only when it happens
to be an Estonian lemma too, so a wider net would flag English as unverified Estonian and teach
somebody to ignore the line on the day it is right. What compensates is the UI, not the check. Do
not raise the extractor's recall without changing what sits behind it. ADR-005 amendment 2.

**A photograph is read by a model; whether it is believed is decided by the dictionary.** Scanning a
page (`/scan`) is the one path where a model unavoidably looks at Estonian, and it does not get an
exception. `lib/scan/extract.ts` transcribes and is pure: no database, no network, and every string
it returns is a *candidate*. `matchEstonianForm` in `lib/dict/search.ts` decides, and accepts only
an exact lemma, a diacritic-folded lemma, a stored form, or a regular case built on a genitive stem
(`VOUCHED_SCORE`); a prefix match is right for a search box and wrong here, because it hands
somebody a card for a word that is not on their paper. A vouched word brings its own principal parts,
so nothing the model wrote survives into the card. An unvouched word is shown as exactly that,
editable beside the paper, and reaches the deck only once a person has ticked it, which is the same
standard the paste importer meets. Do not loosen the match to rescue more words. (ADR-021, asserted
in `scripts/test-invariants.ts`.)

**The photograph itself is never stored.** It is decoded in a Route Handler, sent once and dropped,
exactly as the cloze exercise treats a pasted passage. `Scan` holds the confirmed word list and has
no column an image could go in; the invariant suite fails if one appears, and if the scan route ever
writes to the database at all. A picture of somebody's homework has their name at the top of it.

**A word offered in the dictionary's suggestion row is worth the click, and the dictionary is what
decides that.** The row read `ORDER BY lemma ASC` with a twelve-row window inside the first forty,
so the app spent its whole life inviting people to look up `aasialane`, `aastatuhat`, `aatomipomm`
and `aberratsioon`. The skip moved by one row a day and never left the letter A, which is why it
looked alive and was not. Three sources now answer instead, one per render, in an order rolled per
render so the two behind the leader are not dead code: words off the front page of the news, words
for the time of year, and a random draw over the graded dictionary that is always available. The
row says which, because words that change without saying why read as noise, and a source has to
fill most of the row on its own rather than be topped up from another, since a caption true of two
thirds of what is under it is worse than a shorter row. Two filters hold for all three and are why
`aberratsioon` cannot come back: a word carries a CEFR level, which is the record that the course
or the graded seed vouched for it rather than the tail of the Wiktionary expansion, and it is a
noun, a verb or an adjective, which are the entries with a case table for the chip to open. (ADR-024.)

**A headline is read from a feed; whether it is offered is decided by the dictionary.** The same
sentence as the photograph above, on the second path where Estonian this app did not write comes in
from outside, and the same gate: `lib/news/` produces candidates and `matchEstonianForm` decides, at
the confidence floor a scanned page has to clear. What reaches the screen is the dictionary's own
headword, never the spelling the headline used, so `ettepaneku` is offered as `ettepanek` with a
case table behind it and nothing a news feed wrote survives. Nothing of the learner's goes out with
the request either: it asks for a front page and would ask for the same one if nobody were signed
in, which is why the feed is not a recipient on `/privacy` and adding it there would make a page
about personal data harder to read. Cached for an hour, single-flighted, 1.5 seconds, and every
failure silent, because two sources sit behind it; a feed that will not answer is written down as a
miss, which is the rule the seed and `enrichFromEkilex` each learned the expensive way. Nothing
under `lib/news/` may touch the database or run in a browser, asserted.

**The seasonal row names units of the course, never words of its own.** `lib/collections/topical.ts`
is a calendar of Estonia's year, and every window in it names unit ids from
`lib/collections/syllabus/`; the words come out of the course, where a lemma is already a request
the Ekilex harvest either honoured or reported. A hand-written seasonal word list would be this app
writing Estonian and the first misspelling would ship in silence (ADR-005). The table is checked
both ways: `topical.test.ts` fails on an id that is not a unit and on a year with a day in it that
no window covers, and the invariant fails on an entry spelled like a word rather than like an id.

**Never let the correctness of a form be decided by a model.** The writing exercise checks the
required form by string comparison against the dictionary *before* any call, so a hallucination
cannot mark a right answer wrong and a missing key does not break the exercise. Keep that ordering.

**The illative is the one case with two answers, and only one of them is derivable.** `toa` plus
`sse` is `toasse`, which is a real form, is what Ekilex records as the sisseütlev, and is not what
anybody says: the word is `tuppa`, and `käsi` goes to `kätte` rather than `käesse`. Both of those are
stored, because no rule over the genitive stem reaches either, which is what `ILL_SG_SHORT` is for.
`buildCaseTable` takes it and reports that row as STORED, so the landing page's case explorer puts it
with the forms you memorise and its two headings count what is under them: `tuba` reads four and ten
where `raamat` reads three and eleven. A stored short form has to *differ* from the three principal
parts to be worth saying, though. `sõber` records `sõpra`, which is already its partitive, so
promoting it would print one word twice under two names and hide `sõbrasse`, the form somebody
writing a sentence needs.

Everything else on that card was checked against Ekilex rather than reasoned about: 55 singular
forms across the five words, all agreeing, and every long plural with them. What differs is the
parallel short plural Estonian genuinely has, `raamatuis` beside `raamatutes`, which the card does
not show. That comparison needs a live key, so what is asserted offline is the half that rots on its
own: `lib/collections/demoWords.ts` is the one list of which words the card asks for and which stems
it falls back to when the database is unreachable, and an invariant checks that copy against the
built dictionary character for character.

**Never store derived case forms.** Only principal parts are persisted (five per lexeme). The ten
regular cases
are computed from the genitive stem at render time. Storing them creates a second source of truth
that goes stale.

**`Review` is append-only.** No updates, no deletes. It is the one table whose loss is unrecoverable
and it is the input to FSRS parameter optimisation.

This is now a property rather than a hope: `Review` has *no foreign key* to `Card`. It carries its
own `ownerId` and `lexemeId` and keeps `cardId` as a plain column, so deleting a card or restoring a
backup over a deck cannot cascade the history away. Do not re-add the relation for the convenience
of a join. `lib/srs/replay.itest.ts` will fail, which is the point. The same property is what makes
offline sync conflict-free: grades are facts with timestamps, and replaying them in order reproduces
the state exactly, because `grade()` takes `now` as a parameter.

**Never re-add the iframes.** Sõnaveeb and Ekilex send `X-Frame-Options: DENY`; Speakly has no public
API. This was verified, not assumed. See `docs/00-audit-v4.md` §A.

**Review must work offline.** It is the daily path, and it may not depend on any network call.
A grade that cannot reach the server goes into the IndexedDB outbox (`lib/offline/db.ts`) and is
replayed in order by `replayGrades` with the timestamp it was actually answered at, never dropped,
never re-stamped. Replay is idempotent because the client generates each grade's id. Anything added
to the review path must survive `navigator.onLine === false`, and `scripts/smoke-offline.mjs`
checks that in a browser. (ADR-015.)

**AI spending is always metered.** `lib/usage` has no off switch and fails closed, because sign-up
is open by default. Any new path that calls a paid provider goes through `authoriseCall` before the
call and `recordUsage` after it. An unrecognised model prices at the dearest rate in the table. A
cap that fails open is not a cap. This is asserted now rather than asked for: the invariant finds
every module that opens the provider chain and fails on one that does not mention the ledger,
because prose had been enough to keep four routes honest and not enough to catch the fifth path.
That fifth was `lib/tutor/translate.ts`, reachable from the dictionary search box. A word the
local table and Wiktionary both missed fired a real completion with no burst limit, no daily
allowance, no global budget check, and no row written afterwards, so the Settings usage meter
reported nothing spent because from the ledger's view nothing was. The meter lives inside `ask()`
rather than in its two callers, so the next short helper that wants a sentence from a model
inherits it by reaching for the function.

**The ledger writes the call down when it authorises it, not when it finishes.** `authoriseCall`
used to read four aggregates, return a verdict, and leave the row to `recordUsage`, which for a
streamed answer on a two-minute route lands tens of seconds later. That is check-then-act: ten
tabs read the same "under the limit" inside the gap and all ten went ahead, and the global budget,
the one that is supposed to be the hard backstop on the whole deployment's bill, had the widest
window of the three. So a call is booked at an estimate inside the same transaction that reads the
counters, under a deployment-wide advisory transaction lock, and the tokens the provider actually
reports arrive afterwards as a `SETTLEMENT` row carrying the difference, which is negative
whenever the estimate was generous. Two rows rather than an edit, because `UsageEvent` is
append-only for the same reason `Review` is. Spend sums every row; the call counts count `CALL`
only, and getting that backwards would silently halve every allowance in the app. A call that
never happened hands its authorisation back through `releaseReservation`, or a deployment with a
rejected key would ration its learners over calls none of them received. `lib/usage/ledger.itest.ts`
authorises twelve at once, which is the only way to see any of this.

**Every mutation a learner makes is a Server Action, so that is where a throttle belongs.** Five
Route Handlers called `checkRateLimit` and none of the forty-odd actions did, which is the gate on
the quiet door again. `lib/security/actionLimits.ts` is the one table of what the per-call
expensive work is allowed, and the invariant reads that table: an allowance with no action
applying it fails, and so does an action throttling against anything but the owner it resolved.
Most actions must **not** have one. Grading a card is a single indexed write and a limit there
would be met by learners and nobody else.

**A bucket key the caller chooses is worse than no bucket key.** `clientIp` read
`X-Forwarded-For` whatever this app was standing behind. On Vercel that is right, because the
platform overwrites it; self-hosted behind a proxy that passes it through, it is a value the
caller picked, and a caller who picks a new one per request gets an unlimited number of
allowances. So it is read only when `TRUST_PROXY_HEADERS` or `VERCEL` says a proxy is there, and
every unattributed request otherwise shares one bucket, which is the honest shape for not
knowing. Signed-in work never touches any of it.

**Signing out leaves the device the way a stranger should find it.** It cleared one cookie and
nothing else, and everything the app keeps in the browser to make review work on a train stayed
behind for the next person on the same machine: the pages the service worker had cached, which are
somebody's own deck and progress rendered and ready to serve; the last review session, stashed with
every card in it; any grade still queued; and a mock exam paper they had started, composition
included. A school computer, a shared laptop and a phone handed to a friend are the ordinary case,
not the edge. `lib/offline/forget.ts` removes all three stores, after the outbox has been given its
chance to drain through the provider's `flush`, and both places that sign a learner out go through
it, asserted. A grade that still could not land is the one thing the device cannot keep and must
not quietly drop, so the rail asks before losing it. And nobody signing out is the other case: the
shell mounts `DeviceOwner` with a digest of the account id, and a different account appearing on the
same browser clears what the last one left. What it does not touch is what is about the device
rather than a person: the theme, the install prompt's memory, and the audio and build caches.

**Nothing in a `"use server"` file may take an owner id from its caller.** Every export there is a
public endpoint. Resolve the owner with `requireUserId()`; if a helper needs one as a parameter, it
belongs in `lib/`, not in `app/actions.ts`. See `addCardsFor` and `applyGradeBatch` for the shape.

**A comparator that returns 0 is not a tie, it is the database deciding.** Two entries can share a
lemma, by design and by accident: `hall` is a noun and an adjective, and a learner adding a word by
hand or off a photograph gets their own row beside the seeded one. Both score 100 for the exact
lemma, and `localeCompare` of a word with itself is 0, so `rankCandidates` used to return 0 for the
pair. `sort` is stable, so that means "keep the order you were given", and the order it was given
came from a `findMany` with no `orderBy`: a fact about the query plan and the physical layout of the
table rather than about Estonian. `/dictionary` opens `hits[0]` without asking, so which entry a
learner was shown for their own search was settled by the planner, and could differ between two
identical requests. It is the fault `resolveScan.ts` has a comment about, one layer up. The order is
total now: it ends on `bySubstance`, the same rule `oneEntryPerLemma` reads, so the entry with a
stated part of speech, a hand-written provenance and the most forms leads, and the id settles what
is left. One comparator rather than two, because a course screen and the search box disagreeing
about which `vana` is the real one would be worse than either answer alone. Do not add a ranking
key without asking what happens when it ties.

**The shared dictionary is shared; a deck is not.** `Lexeme` and `Form` are reference data every
learner sees, so an edit to one is an edit for everybody. It is attributed (`editedBy`), it may
replace only the principal parts, and it must never touch a form retrieved from Ekilex. Anything
scoped to a person (cards, reviews, tasks) is always filtered by `ownerId`, including in an
`updateMany`. `lib/dict/edit.itest.ts` exists because all three of those were once wrong.

**A dead end offers a way out, and the way out is a queue somebody works.** Nothing here may tell
somebody it cannot help them and then stop. A search that found nothing, an answer marked wrong that
was right, a word off their own homework the dictionary would not vouch for, a grammar page that
contradicts their teacher, a screen that threw: every one of those used to end in a sentence and a
back button, and the person who knew what was actually wrong was the one person with nowhere to put
it. `components/SuggestFix.tsx` is mounted beside the failure rather than filed under a contact
page, and it carries the failure with it, because "kohv is wrong" teaches a reviewer nothing and the
same words under `/review` beside "we asked for the partitive and marked kohvi wrong" teach them
everything. The note is optional on purpose: somebody annoyed enough to press it has already given
us the useful half by pressing it there, and a form that will not send without a paragraph collects
nothing from the people worth hearing from.

`lib/suggestions/model.ts` is the one table of what can be reported, and two invariants hold it up.
Every category must be reachable from a screen, asserted against the mounted components rather than
against the files, because a key also appears in the queue's own fallback and matching that would
let a category pass while being unreachable. And the four screens where the dead end is structural
have to still render both halves, the failure and the button beside it, since a file that keeps the
failure and loses the button is the regression worth catching.

**The unit of review is the group, not the report.** Sign-up is open and every failure offers this
button, so the queue's size is decided by how many people meet one fault. A list ordered by time is
one dead link four hundred times over with the report that matters on page nine. `groupKeyFor` is
deliberately blunt about it: over-grouping two similar reports costs a reviewer one extra read,
under-grouping costs them four hundred. One person gets one open report per thing, so the count
beside a group means people rather than clicks, which is the only reading that makes it worth
printing. Accepting acts on the group.

**Accepting is a write into the shared dictionary, so it obeys every rule a hand edit does.** Both
go through `lib/dict/upsert.ts`, which is one function rather than two copies of the answers that
matter: only principal parts may be replaced, a form retrieved from Ekilex is never touched, and an
entry Ekilex supplied stays marked as Ekilex's after a correction. `lib/suggestions/apply.ts` may
remove an example sentence and never rewrite one, because editing an attested sentence would be this
app writing Estonian. Every Estonian character that reaches the dictionary this way was typed by a
person into a form, exactly as ADR-005 requires; no module under `lib/suggestions/` can reach a
provider at all, and an invariant says so. It never rewrites anybody's cards: the hand-edit path
rewrites the editor's own and deliberately nobody else's, and a reviewer accepting a stranger's
report has less claim still.

**Who reviews is a deployment fact, like who the controller is.** `lib/auth/admin.ts` reads
`ADMIN_EMAILS`, exact addresses only, never a domain: "this school may sign in" and "this person may
change what everybody reads" are different questions. A hosted deployment that has named nobody has
no reviewers and the queue says so out loud, the way `/privacy` says an operator was not named,
because an empty list looks like an empty queue. Local mode is one learner on one machine who
reviews their own. There is no way to grant this from inside the app, since a privilege a request
can grant is a privilege a forged one can grant. `reviewSuggestion` resolves a reviewer through
`requireAdminId` rather than settling for a signed-in user, and the throttle invariant was widened
for it: what it asserts now is that the id was resolved by a `require...()` in the same file, not
that it is spelled `ownerId`, because naming an admin binding after a regex is naming a variable
after the check that reads it.

**And it does not revalidate its own queue.** Revalidating `/admin/suggestions` inside the action
re-rendered the list, which unmounted the row that had just been acted on along with the sentence
saying what it did: the reviewer clicked "Accept and apply" and the line vanished with no word about
whether a word had been added. Rows must not reshuffle under the cursor between clicks either. The
row reports its own outcome and the list is right again on the next load.

**A number shaped for a screen is never a divisor, and a headline is never a second opinion on
the sentence under it.** The plan at `/assess` and on the last screen of first run is arithmetic
somebody is going to make a decision on, and it was wrong in two ways that both look like rounding
and are not. `project` rounded the learner's pace to one decimal and then divided the published
hours by it: three minutes a day three days a week is 0.15 hours, was shown and used as 0.2, and
that is a third more study than the learner said they would do and a quarter off the weeks the app
alone would need. So `lib/assessment/plan.ts` returns every figure exact and
`components/assessment/PlanPanel.tsx` rounds on the way to a tile, which is where a question about
a screen belongs. And the verdict band was drawn at ten hours a week measured against the
*optimistic* end of the range while the note under it quoted the distance at five found hours a
week, so 335 of the 704 combinations a learner could click said "It fits, but only with study
outside this app" over a sentence putting the date three years out. Both read
`FOUND_HOURS_PER_WEEK` now, and the band sits at the pessimistic end, which makes those two
sentences the same claim rather than two answers to one question. A deadline already gone is its
own verdict rather than a division by no time: it used to floor at one week and print "in 0 weeks
your daily goal puts in about 0.4 of those hours" over a note asking for 1 099 hours a week. Two
invariants and an exhaustive sweep of every combination in `plan.test.ts` hold all three.

**And the unit is part of the number.** All of that arithmetic was then printed in hours to one
decimal place, which at the top of the range is fine and at the bottom is a different quantity: a
daily goal of ten cards three days a week is nine minutes, and it read `0.2h`, which is twelve.
The shortfall note was worse, since it rounds a figure the panel only shows when it is above zero:
`0.0218` hours a week still to find printed as "roughly 0 to 0 hours a week", under a headline
saying there was study left to do. `lib/time/duration.ts` is the one module that units a stretch
of study, minutes below an hour and hours above, with a range stepping back down a unit rather
than rounding its smaller end to a zero it is not. It lives in `lib/time/` and not in `clock.ts`,
because a duration is not a time of day and the 24-hour rule has nothing to say about it. Two
spellings, `min` for a tile and `minutes` for a sentence, since the same figure is read in both.
The invariant is that the pace never reaches a screen except through that module, and `weeksNeeded`
is the one caller allowed the raw figure, because it divides by it rather than showing it.

**Progress is derived, never stored.** XP, levels, streaks, quests and every chart are computed from
the append-only review log on each request (`lib/gamification/`, `lib/stats/`, `lib/progress/`).
Do not add a counter column. A stored score is a second source of truth that drifts, and it can be
awarded for something that never happened. The only exceptions are values no log can reconstruct: a
personal best, and which days a streak shield has already covered. (ADR-014.)

**A query that is cut short says where to cut, and a query whose answer is picked from says how to
pick.** Derived progress is only as trustworthy as the rows it was derived from, and four places had
handed that choice to Postgres. The shape is always the same: a `take` with no `orderBy`, or a
comparator that can return 0 for two different rows, and then one of the results is shown. It looks
settled, because a plan over unchanged rows usually is, and it is not a promise.

All four were real. The dictionary showed one of two entries for a lemma and nothing chose which, so
a scanned word could shadow a word the app knows and take its forms off the page, and three
browser suites failed on it in one run and passed in the next with the code untouched. The grammar
reference picked its example words the same way. `readinessSignals` capped three queries at twenty
thousand rows without saying which twenty thousand, in a file whose own header promises no
confidence percentage can drift from the reviews behind it. And the weakest-case panel, already
consolidated to one component and one calculation, still had three inputs, so a learner who had
fixed their partitive was told 100% on Progress and 50% on Practice on the same day.

So: `bySubstance` ends on `id` because a total comparator is the only kind whose answer does not
depend on the array it was handed; a truncated query is ordered even where the order looks
arbitrary, since arbitrary-but-stable is what makes a wrong result reproducible; and where two
screens answer one question, the query is a function they share rather than a query each
(`lib/progress/cases.ts`). Ordering is free wherever the index is already there, and it was in every
one of these. What is not free is a number that moves on its own.

**And the rule had nothing behind it, so eleven queries had drifted from it.** Every truncated
read in `lib/progress/` ordered on a column that is not unique and then took the first N. Two of
those ties are not theoretical: `Card` was ordered by `(createdAt, lexemeId)` and `addCardsFor`
writes a word's recognition and production cards in one `createMany`, so both share both keys
exactly; and `Lexeme` was ordered by `(fetchedAt, lemma)` while `@@unique` is on `(lemma, pos)`,
so on a freshly seeded deployment, where every `fetchedAt` is null, the two entries for `hall`
tied outright. The exam pool is the one where that is a correctness fault rather than an
inconsistency, because `submitExam` rebuilds the paper from (level, seed, pool) in order to mark
it: a pool that comes back in another order marks somebody on questions they were never asked,
and the `take` means a tie at the five hundredth row decides which of a pair is in the paper at
all. All eleven end on `{ id: "asc" }` now and an invariant reads the *last* key, because an
order that is total in the middle and loose at the end is loose.

**And the invariant behind it stopped at `lib/progress/`, so five reads outside it said nothing at
all.** Not a loose order: no `orderBy` whatever, next to a `take`, which is the plan choosing the
rows a screen is built from. Today's weakest cases took an arbitrary five thousand; `/review/government`
and the minimal-pairs round each took an arbitrary two thousand cards to decide which words were
already in the deck, so whether an answer graded a real card changed between visits; the class week
counted its three figures off an arbitrary three hundred; and the dictionary's suggestion row
shuffled an arbitrary two hundred. All five say where to cut now, and a second invariant holds the
rest of the app to that much. It asks only for an order and not for a unique one, because ending
every truncated read in the app on the primary key is a larger change than the rule needs to be
useful, and where a screen orders by `due` and cuts, arbitrary-but-stated still beats
arbitrary-and-silent. The stricter rule stays where a number is derived.

**A shared calculation over an unshared input is not a shared answer, and Today proved it twice.**
`lib/progress/cases.ts` exists because "your weakest cases" was drawn from three different queries
behind one calculation, so a learner who got the partitive wrong three hundred times last year and
right three hundred times this month read 100% on one screen and 50% on another, on the same day.
The home page was then rewritten, reached for `caseAccuracy` like everybody else, and wrote the old
query beside it, which made it the fourth answer: all of time rather than the half-year, and
unordered. The pairing is asserted now rather than described, anchored on the *call* rather than on
the import, because a file can import the shared query and go on using its own rows, which is
exactly what happened. It is scoped to `app/`: the class roster rolls a whole class up at once and
the badge stats read all time on purpose, and a check that fires on honest code is a check people
learn to waive.

**And a `take` beside a `distinct` bounds nothing at all.** Prisma deduplicates in the client, so a
`LIMIT` would cut rows before the deduplication and it emits none: the query reads every matching
row, adds an id column of its own to deduplicate with, sorts, and throws the surplus away in
JavaScript. The number beside `take` reads exactly like a bound and is not in the SQL. `countGroups`
in the suggestion queue carried a comment saying a `groupBy` "would read every matching group to
count them, which at the volume this queue is built for is the one query that would stop being
cheap", and what replaced it read every *row* to produce one number, on the one table open sign-up
lets strangers grow. Practice had the same shape over `examples`, the longest column in the schema,
fetched once per card rather than once per word. So the pairing is owner-scoped or it does not
happen, which is what the invariant asserts: one learner's own cards are bounded by their deck
whatever the `take` says, and anything deployment-wide counts in Postgres.

**A cap on rows is not a cap on time, and a loop of queries is where the difference lives.** Three
loops were measured against a real database rather than reasoned about, and they did not all need
the same answer. The offline replay asked "have I seen this grade before" once per item, which is
the one query in it that does not depend on what the previous grade did: a `Review` id is generated
on the client and the only rows that loop writes are its own, so the answer for a whole batch is one
read. The rest of it stays per item, because that part genuinely is what the grade before left
behind. The word importer asked the dictionary about every pasted row on its own, five hundred of
them at the cap, and `@@unique` on `(lemma, pos)` means one `IN` answers all of it; what is left per
word is `addCardsFor`, which takes a lock and is half the cost, and collapsing that would mean a
second path that writes cards. And `addUnitToDeck` was measured and left alone: twenty words and
seventy-three cards in 117ms, so the lock it takes per word costs nothing worth restructuring for.

Where a loop cannot be collapsed, the route needs a budget: `MAX_IMPORT_ROWS` is 500 and the time
those rows imply is not something a platform's default ten seconds covers, so
`app/(app)/settings/page.tsx` says `maxDuration`. Deduplicating the input belongs there too, and for
the reason that is easy to get wrong: `createMany` with `skipDuplicates` makes the *write*
indifferent to a repeated line, so what a missing dedupe breaks is the *counting*, and a paste of a
new word beside a repeated old one reads "Skipped 2 you already had" about one word. The first check
written for that asserted the created count, which is 1 either way and so could not fail.

**"Is it already there" is check-then-act, and the deck had it too.** The ledger learned this about
spending; `addCardsFor` had the same shape about cards. It read a learner's existing cards for a
word, filtered the generated ones against them, and inserted the rest, so two requests inside that
gap both see an empty deck and both insert. Measured against a real database: two concurrent adds
gave two cards, four gave four, and eight gave fourteen where two is right. A learner meets it by
double-tapping "Add to deck", and `addUnitToDeck` walks it once per word with no throttle in front,
so one impatient second on a nineteen-word unit is the worst case rather than the unlikely one. The
answer is the ledger's, for the reasons its header already gives: a *transaction* advisory lock, so
a pooler cannot strand it, and the blocking form, since the non-blocking one serialises nothing.
Keyed on the learner rather than deployment-wide, because two learners adding two different words
are not each other's concern; the ledger is deployment-wide because a shared budget is. With it,
sixteen concurrent adds make two cards in 28ms. A unique index is the other answer and is the one
not taken: a deck that already holds duplicates from this bug would fail the push, and the
deployment's own build is what runs it.

**And then the batched builder arrived without it, which is why the key is the learner and not the
word.** `addUnitsToDeck` is the rewrite of the loop that called `addCardsFor` per word, and it kept
the shape and inherited no lock, so the fault came back a whole unit at a time: eight concurrent
adds of an eighteen-word unit wrote 180 cards where 36 is right, and the two screens that reach it
are "Add to deck" on a unit and the last button of first run, which is the one place in the app
where somebody is already waiting and inclined to press again. `lockDeck` in `lib/srs/deck.ts` is
the one definition and both paths take it. The key had to widen to do that: a key naming the word
is safe against another add of the same word and says nothing about a batch containing it, so two
keys would leave each path guarded against itself and neither against the other. What that costs is
that one person's own two adds queue, which is milliseconds of work they asked for twice, and first
run still builds 982 cards in 217ms. `lib/srs/deck.itest.ts` fires eight at once, because no unit
test can see any of this.

**The syllabus names a lemma; the dictionary may hold two entries for it.** `@@unique` is on
`(lemma, pos)`, so `where: { lemma: { in: [...unit.lemmas] } }` can return more rows than the unit
has words, and seven places rendered or wrote every one of them. Measured with a scanned `tuba`
confirmed into the dictionary beside the Ekilex one, which is a thing any learner can do in a
minute: `/learn/kodu` listed the word twice, its printable worksheet printed it six times, the unit
counted more words than it teaches, the lesson planner split the duplicate into the sitting,
`addUnitToDeck` and `recordLesson` each built two sets of cards for one word with one of them
unanswerable, the landing page's own three-word demo could have shown an empty case table, and React
was warning about two children with the same key, which it says may duplicate or omit a row. The
adjective/noun pairs of open question Q8 are the same shape and ship with a fresh seed: there were
thirteen when this was written, and answering Q8 by reading the part of speech off the sense the
gloss came from took it to two, `hall` and `rõõmus`. That changes how often this fires and not
whether it has to, because a word confirmed off a photograph makes a pair for any lemma at all and
no upstream correction reaches that. `oneEntryPerLemma` in `lib/dict/search.ts` is the one answer and it is
`bySubstance`, the rule the search already leads with, because a course screen and the search box
disagreeing about which `vana` is the real one would be worse than either answer on its own. It
also returns the caller's order, since the sort it replaced (`order.get(a.lemma) -
order.get(b.lemma)`) returned 0 for exactly the pair that is the problem. Counting distinct lemmas
into a `Set` is the other honest answer and two places do that; what may not happen is rows reaching
a render or a write.

**There is one shuffle, and `sort(() => Math.random() - 0.5)` is not one.** There were ten copies of
this function in three implementations: four in `app/` that were Fisher-Yates character for
character, four in `lib/` that were the same again with an rng passed in, and two places that used a
comparator. A comparator is asked about a pair and expected to answer the same way each time; one
that answers at random leaves the sort finishing early over runs it believes are already ordered, so
an element stays near where it started. Measured over 200,000 rounds at the sizes the app actually
uses: in the 40-card sprint the first card led 7.0% of rounds against a uniform 2.5%, and the first
ten cards filled the first ten places 39.5% of the time against 25%; in the 20-card listening round
the first card led 11.7% against 5.0%. Those pools arrive `orderBy: { due: "asc" }`, so that was the
most overdue card leading about three times as often as chance while the tail of the pool went
under-practised. `lib/random/shuffle.ts` is the one, and `random` is a parameter so a seeded caller
hands in its own generator and a test hands in a fixed one. `lib/exam/paper.ts` is the single
exception and its header says why: the server rebuilds a paper from its seed to mark it, so changing
how that one draws would mis-mark a paper somebody started before a deploy and handed in after.
Both halves are asserted, because fixing the two wrong copies and leaving eight right ones is how a
ninth gets written.

**A seed is only as fixed as what it is seeded over.** `planLesson` promises the same seed gives the
same lesson, and the wrong answers came from an unordered sixty of the 478 words at A1 or the 1,302
at B1. Measured: a bulk touch of the level, which is what re-running `npm run harvest` does, swapped
seven of the sixty, and the seven that left were `Tere hommikust!`, `Aitäh!`, `Palun`, `Head aega!`,
`Nägemist!`, `kohv` and `elu`. Ordering by lemma alone fixes the drift and reads badly for the reason
the grammar reference did, since every lesson at a level would then draw its decoys from the same
sixty words at the front of the alphabet. The window starts where the unit points, which is the
answer `paperFor` had already reached one file over.

**A day is the learner's day, and every screen that counts one is rendered on a server.** The
streak, the daily goal, the quests, the week strip, the heatmap and the two badges about the hour
of the day are all derived server-side, and a server's midnight is the deployment's. `lib/time/day.ts`
had a header saying its days were "the learner's own calendar days" and a body reading
`getFullYear()`, which is the day boundary of whichever process is running: on Vercel, UTC. The
shortcut that file was written to forbid was being taken one layer down from where it forbade it.
A learner in Tallinn who studied on Monday morning, at one in the morning on Tuesday and again on
Wednesday morning kept a three-day streak; those sittings fall in two UTC days with a hole between
them, so the app said 1 and, with a shield banked, spent it bridging a Tuesday they had not missed.
So a day boundary needs a zone, `dayClock(zone)` is how you get one, and anything touching the
database takes one rather than calling the process-bound free functions. The learner's zone is
whatever their browser reports (`components/TimeZoneSync.tsx`), stored under `SETTING_KEYS.timeZone`
and never asked for, because the device already knows. **A naive timestamp needs two `AT TIME ZONE`s**:
Prisma maps `DateTime` to `timestamp without time zone`, and on a naive value one of them
*interprets* rather than converts, which read 22:00 UTC as 22:00 in Tallinn. The single
`AT TIME ZONE 'UTC'` that preceded this was the same mistake wearing a disguise, since its result is
a `timestamptz` that `TO_CHAR` renders in the *session's* zone: right on a UTC session and a day out
on any other.

**A word is taught before it is asked, and the app marks what it can mark.** Two rules, one
screen, and the code already believed both of them before it did either.

`askFor` routes a card nobody has seen to `intro` under a comment saying a card you have never seen
cannot be recalled, only met. It then handed over Again, Hard, Good and Easy anyway, so the screen
asked how well a memory had held up four seconds after admitting there was no memory yet, and Easy
scheduled the word a week out. A first meeting teaches now: the word, its gloss, and it doing its
job in an attested sentence with the form the card is about to ask for marked inside it
(`teachingSentence` and `splitOnForm`, next to the `sentenceContaining` the gap-fill cards already
used). Nothing there is written or derived; the sentences had been sitting in `Lexeme.examples` all
along and the review query simply never selected them. Where the dictionary has none, the screen
says so, because a bare word looks the same as a word nothing could be said about.

`inTeachingOrder` is the other half. Every card of a word is written in one `createMany` with one
`createdAt`, so ordering the new-card queue by that column leaves them tied and Postgres answers in
whatever order it likes: a learner's first sight of `juhtuma` could be a conjugation card asking for
`olevik · ma`, a form of a verb whose meaning the app had not told them yet. The tie is broken in
code, in the order a lesson teaches in.

And the four buttons are gone from everywhere they were asking a question already answered.
`checkAnswer` compares a typed answer against a form the dictionary vouches for and returns the
rating to use; the screen took that verdict, drew a ring round one of the four, and waited. A clean
hit grades itself and moves on, the way a picked choice already did, and a miss keeps its screen,
because the correction is the one moment in a review worth stopping for. What is left is the flip
card, the one shape with nothing to compare, and speaking, where ADR-018 says the learner is the
only judge there is. Both read `SELF_GRADES` beside `RATINGS`: two options, not four, because the
difference between Hard and Good is the difference between a six and a ten minute interval, which
is a question about a scheduler nobody can see, put to somebody trying to learn Estonian.

**`RATINGS` is untouched and so is the scheduler.** `submit` still takes any of the four, a near
miss is still graded Hard by the marker, and `Review`, undo and the offline replay carry exactly
what they always did. What went is the asking, and that distinction is what keeps this a change to
one screen rather than to the append-only log underneath it.

**Every mode grades through `gradeCard`.** Sprint, Listening and Match are not side games with their
own scores. They write to the same review log, so the scheduler sees what was actually practised.
An abandoned round writes nothing. (ADR-016.)

**Every mutation goes through the forged-request gate, and it is not an `/api/` rule.** Every
mutation a learner makes here is a Server Action, which is a POST to a *page* path, so a gate
inside an `isApi` branch would be watching the quiet door. `lib/security/sameOrigin.ts` reads
`Sec-Fetch-Site` first (a browser sets it and page script cannot), falls back to comparing
`Origin`'s host against `Host`, and **allows a request carrying neither**: that is not a browser,
so it has no ambient cookie to forge with, and refusing it would break every server-to-server
caller for nothing. It runs before the auth branch in `middleware.ts`, because a redirect keeps
the method and the body. The Content Security Policy is set there too, on every response
including the refusals; the static headers are in `next.config.ts` so they cover the files the
matcher skips. `Permissions-Policy` keeps `microphone=(self)` on purpose: speaking practice
records, and denying it would switch that off with no error anybody could act on.

**The error state is a screen, so something has to render it.** `app/error.tsx` is one of the four
states every view owes a reader and it was the only one nothing ever put on a screen: an invariant
read its source for the failure copy and the report button, which is a different question from
whether a client component that throws while rendering leaves a learner with a blank page. Driving
it needs a server that genuinely fails, so `scripts/test-error.mjs` starts its own on a spare port
against a database that is not there, which is the case the page was written for. That is also how
the page turned out to be wrong about itself. Its header argued that showing the message turns a
fixable problem, "usually a missing DATABASE_URL", into something a self-hoster can act on; what a
production build actually shows is Next's own line saying the message was withheld, so the sentence
promising the useful part below it pointed at boilerplate. Keeping the message on the server is the
right default, since one can carry a connection string. What crosses is the digest, the same digest
sits beside the full error in the server log, and the page says so.

**A check that reads a file reads its code, not its prose.** This is the oldest recurring mistake in
this repository's own checks and it has now been made four times: the marker sweep whose haystack
included the list naming the markers, the `AI_TAG` assertion that matched its own import line, the
lemma check that fired on a paragraph describing the query it had removed, and a suite explaining in
a comment why it does not call `baseUrl()`, which satisfied a check looking for that call. Strip
comments first; `code()` in `scripts/test-invariants.ts` is what does it. And the other half of the
same discipline: a check that fires on honest code gets waived, so when one does, widen the rule
rather than contorting the code. The lemma check learned a third answer that way, since keying rows
on `(lemma, pos)` is the unique key itself and stronger than either answer it knew.

**A suite that exists is a suite CI runs.** The workflow names its suites one line at a time, and
its own comment says why: "a suite added to `npm run test:browser` alone is a suite CI never runs".
It had drifted in the other direction too, with nothing counting, and five suites had nothing
watching them at all, `test-restore.mjs` among them. The source of truth is the filesystem: every
`scripts/*.mjs` that declares a suite is one CI runs, and anything else is named in
`scripts/lib/suites.mjs` with a written reason. Two are, and both are facts about the route rather
than about anybody's schedule.

**A word is heard as often as it is met, and the voice is the learner's to choose.** Speech
used to arrive on a button press only, in one voice chosen by whoever deployed the app, which on
the daily path meant a learner clicking a speaker icon on every card or hearing nothing. A card
now reads itself aloud when a word is first met and when its answer appears, the next card's clip
is fetched while this one is being answered so the play is instant, and `lib/audio/voice.ts` is
the allowlist of TartuNLP's twelve Estonian voices a learner may pick from in Settings. The state
examination's listening part is read by more than one speaker and so is the country, so a learner
who has only ever heard one voice say a word has learned that voice rather than the word. A
requested voice is checked against that list on the way into the speech route and never passed to
a third party as typed; the disk cache and the service worker's cache both key on it. A right or
wrong answer makes a short sound made with the browser's own oscillator, so it costs no request
and works offline. All three are settings, on by default because a missing row has to read as
the behaviour everybody had, and `components/AudioPrefs.tsx` publishes them once from the shell so
every speaker button and every round reads one answer. `lib/audio/clip.ts` is the one place a
clip's cache key is built, since three copies of "text, speed, voice" is where two of them stop
agreeing about what is in the cache.

**A cap on a shared quota is charged to the learner, never to their address.** `/api/tutor`,
`/api/tts`, `/api/share` and `/api/export` all go through `lib/security/rateLimit.ts`. Twenty-five
students on one school network are one IP and a review session asks for audio on nearly every
card, so per-address counting would refuse a whole classroom in its first few seconds. `/api/tts`
also joins an identical request already in flight rather than making a second one: the disk cache
is consulted before the call and written after it, and the gap between those is exactly where a
class starting the same unit together lands. What that limiter is *not* is the first line of
defence for spending: it is per-instance and a burst spread across cold starts meets an empty map
every time, so the thing that actually bounds cost is the Postgres ledger, which is the same
number whichever instance answers.

**A policy page states this deployment, or states that nobody filled it in.** Kodukeel is
software somebody installs, so the controller is whoever runs the copy, and "ask whoever runs
this installation" is honest but not an answer: there is no way to find out who that is.
`lib/legal/operator.ts` reads the identity from `OPERATOR_NAME`, `OPERATOR_ADDRESS`,
`OPERATOR_EMAIL` and an optional registry code, and `/privacy` and `/terms` render it. Never
add a placeholder: an unset deployment says out loud that it is unset, because a page that
quietly says nothing looks finished. Both pages are `force-dynamic` for the same reason, since
a notice baked in at build time describes the build machine's environment, which is nobody's.
The recipients list is generated from the deployment's own configuration (`lib/legal/recipients.ts`)
rather than described in the abstract, so a reader is told which companies and whether they are
in Estonia. Estonia sets the age of consent at 13, not 16. A recipient a deployment can switch on
with one variable is generated like the rest: `ERROR_WEBHOOK_URL` puts an error-reporting endpoint
on the list, named by host and never by path, because a webhook path is a common place to keep a
token and that page is public.

**Two sources, two licences, and the page has to say which is which.** Ekilex was credited in four
places and Wiktionary in none, while Wiktionary supplies the English gloss for most of the
built-in dictionary and is the second layer of every live lookup. Its terms are the stricter of the
two: CC BY 4.0 for the Estonian, **CC BY-SA 4.0** for the English, which is share-alike and
therefore reaches `prisma/data/expanded.json` as a build product of both. Both are credited on
sign-in, in the landing footer and on /terms, and `LICENSE` says the code is MIT and the data is
not.

**Erasure and export are promises, and both were being broken.** "Delete everything" emptied
every table and left the identity in Supabase Auth, where the email address, the Google subject
id and the sign-in history live; `lib/auth/erase.ts` removes it, and where a deployment has no
key that can, the screen says which part is left rather than reporting a success. The export was
five tables and the page said nothing was held back: settings, tutor conversations, level checks,
stars and badges were all missing, and a level check cannot be recomputed from anything. The
invariant reads the owner-scoped models out of the schema rather than a list somebody typed, so a
new table fails until a person decides about it. `UsageEvent` is the one deliberate exclusion and
/privacy names it.

**And then the check's own skip list became the hole.** Three models had been added to the
exemption rather than to the query (mock exam sittings, classes and class memberships), so the
backup stopped at ten tables out of thirteen and the invariant called it complete. A sat paper
carries the composition the learner wrote, which is the single least reconstructable thing in the
schema, and it was in no backup and, worse, survived "delete everything" entirely. Exemptions live
in `lib/legal/exportCoverage.ts` now and each one has to carry a written reason, so appending a
model name is no longer a way to make the check pass. **Erasure has no exemptions at all**, and
that is its own invariant plus a DMMF-driven integration test, because the version written from
the same remembered list agreed with it.

**A source that will not answer is written down as a miss, in the live path too.** The seed
learned this expensively. `enrichFromEkilex` had the same bug with a symptom nobody looks for:
it recorded nothing when Ekilex had nothing, so every render of that word asked again, two round
trips to a free academic service, for ever, against a 2,500ms deadline. `Lexeme.lookupMissAt` is
the marker and is deliberately **not** `fetchedAt`, which `lib/progress/exam.ts` reads as "words
the dictionary knows most about": folding a miss into it would sort the least known words to the
front of a mock paper. It expires after a day, because Ekilex is a living database.

**There is one in-flight map, and it lives in `lib/cache/singleFlight.ts`.** A cache consulted
before a call and written after it has a gap exactly as wide as the call, and a class of
twenty-five starting the same unit lands in it. Speech worked this out first and the dictionary
needed the same thing; a second copy of the pattern is where the `finally` gets dropped and one
bad minute upstream is remembered as a failure until the next deploy. A joiner is not charged for
a request it did not make, which is why `singleFlightTagged` reports which caller it was.

**A round trip is the unit of a page, not a query.** Nothing here is slow. Measured against a
socket on the same machine, Today's forty queries were eighty-eight milliseconds of database time
in total, which is why nobody had ever looked. The deployment reads a Supabase pooler in another
AWS region, and there each of those is a round trip: giving every query a 20ms delay and measuring
again, Today was 400ms and fourteen of those trips happened **one after another**, because the page
awaited the clock, then the deck, then the settings, then a batch, then another batch, then the
badge check, then the level. Nine of the forty queries were the same read of the same fifteen
settings rows.

Three rules came out of it and each has an invariant or a module behind it. **A read that is a fact
about the shared dictionary is not a fact about the person waiting**, so it is cached across
requests in `lib/dict/facts.ts`: every lemma with its band, the decoy pools, the course words the
dictionary can answer for, and the id-to-lemma map that lets a deck read resolve its words without
Prisma's second statement. A minute's TTL rather than a call site per write path, because a cache
cleared from six places goes stale the first time somebody adds a seventh, silently and for ever.
Nothing keyed on an `ownerId` may live there, asserted, since that map is shared between learners.
**A read that is a fact about one learner and is wanted twice in one render is memoised for that
render**, with `cache()` from React, which is what `requireUserId` already did and what
`lib/settings/store.ts` and `latestFor` do now; a write corrects the held value rather than
dropping it, because a Server Action that banks a shield and then reads the count back is real and
is on Today. And **two answers that do not need each other are asked at once**, which is most of
what was wrong: the four opening reads of Today were four `await`s in a row and are one `Promise.all`.

**And what a page does not need before its first byte goes behind a `Suspense`.** The badge check
on Today is three round trips to decide whether to draw a toast over a page that has not rendered
yet, and the class board on Progress is four to fill the last panel on a page of charts. Both now
stream in behind the page rather than in front of it. This is not licence to wrap everything: a
panel that can turn out to be nothing (`ExamCountdownCard` when no target was set, `StruggleAreas`
with nothing to report) would show a skeleton and then vanish, which is a layout jump on somebody's
home page, and that is worse than the wait it saves. A boundary is right where the fallback is
honestly the same shape as the answer, or where there is nothing to hold a place for at all.

**A prefetch that stops at the skeleton is not a prefetch, and every route here is dynamic.**
`components/PrefetchLink.tsx` is the app's one link, imported as `Link` everywhere, asserted.
Next fetches a link that is on screen, but for a dynamic route that answer is 150 bytes and no
query: the grey rectangle, not the page. So a full fetch is asked for on intent instead, when a
pointer has *settled* on a link for 90ms or a link takes keyboard focus, which is early enough to
matter and late enough that a pointer crossing four rows to reach the fifth does not render four
pages. Measured in a browser with the same 20ms per query: pressing Progress in the rail was 458ms
and is 64ms after the pointer had rested there. Touch keeps the skeleton and the router cache,
which is the other half: `staleTimes.dynamic` is **zero** by default, so going back to the page you
were on ten seconds ago was a fresh render of it, queries and all. Thirty seconds is safe here
because every mutation in this app is a Server Action and every one of them calls `revalidatePath`,
which drops the client's copy too.

**Where the app runs is part of this and is the largest single number in it.** `vercel.json` pins
the functions to the region the database is in. A page is several sequential round trips and a
reader's own distance is one, so colocation beats proximity by about the number of queries on the
page; a deployment nearer its learners and further from its database is slower, not faster. See the
deploy section of the README, which says what to do when the two can move together.

**Every cache the service worker keeps has a ceiling, and the one that does not is the reason
why.** `lib/audio/clipCache.ts` was written because a cache that never evicts is a leak with a hit
rate, and one layer down the worker had the same shape twice over with nothing watching either.
Speech is a WAV per phrase and review plays audio on nearly every card, so a phone kept every clip
it had ever heard; the build-output cache was worse, since `_next/static` names are hashed per build
while the cache name is typed by hand, so every deploy added a set of chunks and nothing removed the
last one's. The cost is not a slow app, it is a lost fallback: a browser evicting an origin's
storage takes all of it, and `/offline` is the entry with nothing behind it. So `/offline` and the
icon live in their own cache which is **never** trimmed, and everything else has a count in `LIMITS`
with a trim after every write. Oldest first rather than least-recently-used, because the Cache API
cannot record a read and re-putting on every hit would make a lookup a write on the busiest path in
the app. `VERSION` is what clears the arrears, and it is the only thing that has ever removed a
stale entry here.

**The service worker warms the page you were on when it took over.** The page cache fills as a
side effect of a navigation the worker intercepts, and the worker never serves the navigation
that installed it: the page is fetched, the worker installs behind it, and `clients.claim()`
takes over a client whose own page was never seen. So the first journey failed and the second
worked. `warmOpenPages` on activate is the fix, and it caches whatever window is open rather
than a list of routes, because the rule is "the page you were last on opens again", not "one
route is special". The shell is warmed one URL at a time and never through `addAll`, which is
atomic: one URL that will not fetch throws away the batch, and `/offline` is in it.

**A unit test states a machine, it does not run on one.** The provider suite cleared three
provider keys and inherited the rest from whoever ran it. CI carries none, so it passed; a machine
with `GROQ_API_KEY` exported failed thirteen of them, and the failures read as chain bugs rather
than as the suite reporting its host. A test whose answer depends on the machine is not a test.
`PROVIDER_KEY_ENV` is the one list and it is **exported by `provider.ts`, not retyped in the test**:
the fault was a list in the test falling behind the chain, so a copy living there is the same fault
waiting to happen. Two sessions fixed this within the hour and the other kept its list in the test;
that copy was deleted rather than left beside this one. If you add a provider, add its key to
`PROVIDER_KEY_ENV`, three lines above the function that reads it.

**A screen shows what earns its place now, and one module decides what that is.** The feedback that
produced `lib/ux/disclosure.ts` was that the app overwhelms somebody just getting started, and the
cause was not any one screen: every screen showed everything the app can do to everybody, from the
first minute. Today led with eleven panels and on day one ten of them were reporting on an empty
review log, so a streak of nought, a goal ring at nought percent and a "word to revisit" from a deck
nobody had read yet all had to be scrolled past to reach the one button that matters. The rule is a
table of three stages keyed on the learner's own history: `arriving` until they have graded a card,
`starting` until roughly three days at the default goal, `settled` after. Nothing is *deleted* by
it. Every panel a stage withholds is still in the rail, in the palette and on its own page, and
`disclosure.test.ts` asserts each stage is a superset of the one before, because a panel that
appears and then vanishes reads as a bug rather than as restraint. The invariant fails on a screen
that stops asking the module, and on anybody outside it comparing a review count against a number
of their own, since a second answer to "has this learner started yet" is how the first one rots.

**And then the rule over-reached, and day one paid for it.** "A figure computed from an empty log"
is a streak of nought, a goal ring at nought percent and a level bar at 40 XP, and those are still
held back. It is not the word of the day, which is a dictionary lookup keyed on the date and reads
the same on the first morning as in the second year, and it is not the practice tiles, which are
doors rather than measurements. Both were withheld anyway on the strength of not being the review
button, so `arriving` was two cards on an otherwise empty page, which a learner reads as an app with
nothing in it. Restraint that leaves a screen looking broken is not restraint. The test a panel has
to pass is "does this say something true and useful on a log with nothing in it".

**Today is a dashboard, and its modules are declared before they are placed.** What a card is and
which column it sits in are two questions, and they were one six-hundred-line return statement with
a `shows()` wrapped round each branch. The page now names each module, then lays them out: the wide
column is the day (what is due, what is written down, what keeps going wrong, how the run of days is
going) and the narrow one is the material (a word, the next unit, the practice modes, Anu). Inside
the wide column the two you can act on come before the two that report on you, since a streak is
worth more on the way out than on the way in.

**One word a day, chosen by the date, that nothing else on the page was going to show you.** Every
other panel on Today reports on the learner's own deck, so every one of them is silent on the first
morning and repeats itself on the four hundredth. `lib/copy/almanac.ts` decides what today is: a day
with a name (Estonia's own first), a day that moves and is worked out from Easter, the shape of the
number, the weekday where Estonian has something to say about it, and the month, which always
answers so nothing falls through. `lib/progress/wordOfDay.ts` asks the dictionary who carries the
meaning and prints the reason beside the word, because `pannkook` on its own is a vocabulary item
and `pannkook` under Pancake Day is something somebody tells a friend at lunch.

**The almanac is English and holds no Estonian at all, which is the whole design.** A word typed
into that table would be this project inventing vocabulary and putting it on the home page every
morning under a heading saying it was chosen for you. So the table names a *meaning*, the dictionary
supplies the word, and every Estonian character on the card came from Ekilex or the built expansion.
The English gloss is the only authored column, which is exactly the latitude the syllabus already
takes (ADR-005). A gloss is a **request**, not a promise: the dictionary decides whether it can be
met, and when nothing can be, the card says the word was simply drawn rather than claiming a reason.
A reason nobody can check is worse than no reason. Two invariants hold it up, and the second is the
one that matters: every gloss the table can ask for is one the shipped dictionary can answer, since
a dead gloss fails silently and for ever and the card quietly stops being about the date. Five were
dead when the table was first written.

**A word it has already shown you is not a word of the day.** Not in the deck, not starred, not in
the review log, and the log is checked separately because `Review` deliberately has no relation to
`Card` and outlives one. "Met" is measured at the start of the learner's day rather than now, which
is what makes the card's own "add it to my deck" button work: otherwise doing what the panel asks
makes the panel change under your hand. The matching is against a whole *sense* of a gloss and never
a substring, because a gloss is a comma-separated list and a substring runs through the commas: a
`contains` match on "dark" reaches a slur four rows down and one on "love" reaches "love child",
and either would have been printed as today's word.

**The date somebody gave us belongs on the screen they open.** A learner answers two questions in
their first five minutes here, what they want to reach and by when, and the app then stored both and
never mentioned them again on the one page they see every morning. `lib/progress/countdown.ts` puts
the target band, the days left and the chance of clearing it on Today, and it is not a second
calculation: `goalsFor` reads the goal, `readinessSignals` gathers the evidence and `assessReadiness`
does the arithmetic, the same three the examination hub uses. It is held to `settled` for the reason
the figure itself gives, since the confidence is capped by the evidence behind it and on a thin log
it is a number the app has to caveat rather than lead with. It runs only once there is a target to
spend it on, and it is handed the deck snapshot the page already has rather than fetching a second.

**A confidence figure carries its evidence, and that stopped being a property the moment two screens
printed one.** ADR-022's headline rule held while the hub was the only place the number appeared,
and the hub kept its own object literal of what each tier was worth. So `EVIDENCE_NOTE` and
`EVIDENCE_LABEL` live beside `Evidence` in `lib/exam/readiness.ts`, in two lengths because there are
two shapes of room, and the invariant finds every screen that reads `.confidence` off those modules
and fails on one that does not also read the tier. It is anchored on a **member access**, not on the
word: written loosely first, the word "evidence" sitting in a sentence of copy on the card satisfied
it after the tier had been deleted, which is the same trap `code()` exists for one layer up.

**And the card does not write its own advice.** It said "speaking is the part standing in the way,
predicted at 0 against the 60 a pass needs", which for somebody who has never sat a paper is not a
prediction: a `Review` row carries no note of which mode wrote it, so the app cannot tell a dictation
from a flip of the same card and genuinely has nothing on speaking. Reporting nothing as a zero tells
a learner they are failing a part they never attempted. `assessReadiness` already knows that
difference and already ranks its advice, so the card prints the first thing off `readiness.gaps`
with its own way through, rather than a second opinion beside it.

**What the learner has kept from the word of the day is counted, never stored.** The obvious way to
put "11 kept" on that panel is a counter that goes up on a click, and a stored count drifts, survives
the card being deleted and can be awarded for something that did not happen (ADR-014). So a card
added from the panel carries `ALMANAC_SOURCE` in the `source` column `Card` already has, and the
count is a query over `createdAt`. It counts **words rather than cards**, since one press adds a
recognition card and a production card and "22 kept" for eleven words is counting the machinery, and
the run of days is `computeStreak`, the same function the review streak uses, so two runs in this app
break at the same midnight.

**A hue has a fill and an ink, and that rule finally has something behind it.** It was in
`docs/14-design-system.md` and in the design suite, which can only measure a state it can reach: six
places were painting words in a hue's fill and the browser had seen none of them, because the two on
`/week` and `/tasks` only render once a learner has set a class week and no fixture ever set one. The
invariant reads the source instead and covers a `tone` prop as well as a `color`, because `Stat`
takes a colour rather than a tone name, which is exactly how `/tasks` came to draw its "Known" figure
in mint at 2.52:1 while `/week` drew the same figure correctly in the ink beside it. A line naming
both, a fill for a bar and an ink for its label, is the pairing this protects rather than a breach of
it. `scripts/demo-data.ts` now sets the week and the goal for the same reason: a rule enforced only
where a fixture happens to walk holds on about half the app.

**Where a screen lives and what a card is are still two questions, and so are the week and the
homework.** `lib/ux/nav.ts` says the class week lives inside Tasks, so Today does not get a panel for
it; the "On today" card carries one line saying which week you are in, because that card is already
"what is due" and the week is the frame that gives it a date. `SETTING_KEYS.currentWeek` moved out of
`app/actions.ts` for it: that file is `"use server"` so it cannot export a constant, every export
there being a public endpoint, and the only other way to read the key was to type it again.

**Late is decided in one place, and it was being decided twice and wrongly.** A due date is typed
into `<input type="date">` and stored at midnight UTC, so `TaskRow`'s `due < new Date()` marked
everything due today as overdue from midnight onwards, and from three in the morning for a learner
in Tallinn. `bucketFor` in `lib/ux/agenda.ts` counts whole days on a clock it is handed, the row and
the heading above it both read it, and an invariant fails on anything comparing a due date against
`new Date()`. The panel groups by when rather than printing four loose dates, and the late group is
the one bucket with no heading of its own: the panel's hint already counts them and every row in it
says "Overdue" against its date.

**Where a screen lives is one table, and nothing lives behind a button marked "More".** The rail
promoted four destinations and hid the other twelve behind a disclosure, which is not fewer links,
it is the same links somewhere a learner has to remember. It also had a bug you only met by using
it: `showRest` was `railOpen || secondaryActive`, so on any page *inside* the hidden group the
button read "Less" and pressing it did nothing at all, because the click flipped the first half and
the second held it open. Fixing the toggle was the small half. `lib/ux/nav.ts` is the one table of
what the app contains and which of four questions each destination answers, the desktop rail draws
every one of them under its heading, and the phone keeps one button only because five cells across
a phone is a different problem from a column with a screen of height in it: what it opens is the
same sections with the same headings. This is not `lib/ux/disclosure.ts` and does not overlap it.
That module decides what a *screen leads with* by how far in the learner is; this one decides where
a thing lives, and the answer is the same in the first minute as in the first year.

A place that lives *inside* another place carries `within` and keeps its row out of the rail
without leaving the table, so the palette still reaches it. Eight do. Three were there from the
start: Anu, because her button is in the corner of every signed-in screen and a row saying "Ask
Anu" was a second door onto a room whose door is always open; the class week, which leads the Tasks
page where its homework already was; and the scanner, which is a way of getting words *into* the
dictionary and sat under "Look it up", which is not what it does.

The other five are one question asked five ways. Homework is what Today already lists, and the
deck, the level check, the mock exam and a class are four readings of "how am I doing", which is
the question `/progress` exists to answer: standing them beside it as four more rows made the rail
a list of every noun in the app rather than a set of places to go. Seven rows are left, under three
headings rather than four, because a heading over a single row is furniture: a heading earns itself
by telling two or three rows apart, and "where you are in the course" and "how far along it you
are" turned out to be one question rather than two sections.

This is not the "More" button coming back, and the difference is the whole point: a disclosure
hides a link somewhere a learner has to *remember*, and each of these is on the screen they are
already standing on when they want it. `within` has to say which, and that it really is linked
from there is asserted rather than described, because a `within` nobody wired up leaves a screen
reachable only through the palette, which is worse than the menu it left.

**The same field, with the same meaning, cuts the practice menu.** `lib/ux/modes.ts` had already
drawn the distinction and then ignored it: `targeted` is described there as "what you open when you
already know what is going wrong", and all five of them sat on a menu under a heading saying so,
which is a list of answers to a question the learner has not been asked yet. A verb government
drill is worth pressing on the page explaining rektsioon and worth nothing beside four other
things. So the five carry `within` and each is on the page that names the thing it drills: the
leech clinic under the panel listing the cards you keep failing, minimal pairs under quantitative
gradation, writing under the case it asks you to write in, and pasting your own Estonian beside the
scanner, which is the other way of bringing your own text in. `components/DrillLink.tsx` is one
drawing for all of them, reading the same table, so a mode renamed once is renamed everywhere it is
offered. `/practice` is the six rounds, which is what a menu is the right shape for.

The table is read by the rail, the phone sheet and the command palette, because it was four lists
and they had drifted. The palette offered six practice modes while `/practice` offered
eleven, so the Leech clinic was reachable from one screen and unfindable from the box that promises
to go anywhere; `components/PracticeModes.tsx` held a seventh copy that no screen rendered at all
and has been deleted; and `lib/copy/tour.ts` named nine screens a second time with their own icons,
which went with the `/guide` page it fed, since a second description of the app offered to somebody
who has just pressed "start" is the landing page again with a worse audience.
`lib/ux/modes.ts` did the same for the practice modes, and
the split is deliberate: what a mode *is* lives there, what it is like *right now* is a database
question and stays in the page. Two invariants hold it, plus `scripts/smoke-new.mjs`, which opens
the app and asks the two questions no source check can: the rail draws its links with nothing to
open first, and a phone reaches every place a desktop does. `icon()` falling back to a sparkle is
why `nav.test.ts` checks every name in both tables resolves. Two modes shipped with the placeholder
before a screenshot caught them.

**A letter lying on a page has a character, and the room it has is along the edge it hangs off.**
õ, ä, ö and ü are the four letters an English keyboard has no key for, which is the most concrete
thing there is about writing Estonian, so they are what this app decorates itself with. Four of them
are tucked over the sides of the case explorer and they wandered three or four pixels towards the
card over ten seconds, which is a page that is technically alive and reads as still: you have to
watch one for several seconds to be sure it moved. The reason it was that small is that the wander
was pointed the one way there is nothing to spend, since a letter on a top edge has about four
pixels before it is sitting on a word.

The room is **along** the edge. A letter on the top edge can slide most of the width of the card
without coming a pixel nearer anything it could land on, so õ and ö travel 42 and 49px sideways now,
ä and ü 56 and 43 up and down their own sides, and what crosses the edge is one to four pixels.
Measured, at three widths, over twice the frames the suite asks for. The small budget goes on the
rock and the squash instead, and `room` scales those per placement, because a rotated square is
wider than its side and eight degrees on the tightest of the four costs more than fifteen on the one
with a gutter under it.

`lib/ux/letterMotion.ts` is the table of **four characters rather than one wander**: one ambles, one
crouches and springs, one hangs and swings, one rolls. Four squares doing the same thing a second
and a half apart is a mechanism, which is the thing the page is arguing it is not. The signs live in
that module and never in the keyframes, because a keyframe cannot know which edge a letter is on and
one written to reverse on x is a letter walking off the page the day somebody moves it to the left.

**They answer a pointer, and the rule is the wander's rule.** Coming near one slides it towards the
cursor along its free axis and settles it further onto the card; it never leans outward, since a
letter that shied away from a pointer would leave the card at the exact moment somebody was looking
at it. They stay `pointer-events-none` and `aria-hidden`. The lean is `transform` on a wrapper and
the wander is `translate`, `rotate` and `scale` on the tile inside it, because a keyframe and a
transition on one property is the keyframe winning and the pointer doing nothing. The tile is
`absolute inset-0` rather than static, and that is load-bearing: every suite that measures whether
something is inside its box skips an element that positions itself, and it reads the element rather
than its ancestors, so a statically laid out tile inside a placed wrapper is walked as ordinary text
lying across a card.

Two invariants. Every character names keyframes the stylesheet declares and every declared set is
named by a character, because an `animation-name` pointing at keyframes nobody wrote is not an error:
it is a letter sitting perfectly still, looking exactly like one that was meant to. And a decorative
letter is hidden, untouchable and placed, asserted on the one component, with no screen drawing its
own. `components/LetterTile.tsx` is that component and `.letter-key` is the same idea where a letter
is a control: the six keys that type õ, ä, ö, ü, š and ž grow under a pointer and shake once on the
way in, which is the app's ornament recognising its own keys.

**And they are the case card's, not the page's.** A set was tried in the landing page's own margins,
where the reading column does not reach and a letter can travel forty pixels and roll right over.
It is more room and it is the wrong room: these letters belong to the one object on the page whose
contents are the letters themselves, and one drifting in the margin beside a headline reads as a
decoration that has come loose rather than as one that was placed. `edge` is required on the tile
for that reason, which is also what deletes the branch of `leanFor` that could move a letter on both
axes at once.

**Where you are is one pane, and under a pointer it arrives rather than travelling.**
The rail and the phone bar used to say it by painting the row you arrived on and unpainting the one
you left, which is two things happening at once and reads as two things: a light going out over
here and another coming on over there, with nothing connecting them. What connects them is a marker
that moves, borrowed from Upside Lab's dock with its measurements intact.

**Whether it travels is a question about the input, not about the design**, and the two surfaces
answer it differently for the reason Lab's two docks do. A thumb has nothing else to do while a
server answers, so the phone bar's pill slides from the cell you left to the cell you asked for. A
pointer has already arrived: you clicked one row, you know which, and watching a marker take a
quarter of a second to agree with you is the rail being slower than you are, next to the page it
just changed. So `NAV_MOTION.rail.travelMs` is zero, `glide` writes the resting geometry and
returns, and the marker is simply there on the row you pressed. What carries the movement on that
surface instead is the pointer's own pane, which has been following the cursor down the column all
along, so by the time you press, the card is already where the marker lands and clicking only
settles it. Measured on the rail: a press puts the pane exactly on the row with **no animation in
flight at all**, where it used to run a 260ms journey.

On the bar, where it does travel, three things carry it. Its **leading edge sets off before its
trailing edge follows**, so the pill stretches across the
ground it is covering and gathers itself up on arrival, which is why a mark is two edges rather
than a position and a size: the stretch falls out of the arithmetic and scales with the distance,
measured at 1.40x for one cell of the phone bar, where a fixed keyframe would give every distance
the same. It is a **transform animation handed to the compositor**, never a transition on `top` or
`left`: those are laid out and painted on the main thread, and the main thread is exactly what a
page navigation is busy with, which Lab measured as three frames of travel, five frames frozen
while the new room rendered, then the rest of the way in one. And it **leaves on `pointerdown`**,
because these pages are rendered on a server and the wait is real; that is a bet, so it is called
off by a press dragged off the cell, by a page that answers with a different cell, or by four
seconds of nothing, which is long on purpose since snapping the marker home mid-wait looks far more
broken than letting it stand where somebody put it. **A click on the aimed cell ends the betting**,
though, and that one is not a refinement: calling a bet off puts the marker back on whatever is
still marked, which during a navigation is the row you are *leaving*, so before this any pointer
event landing off the cell while the new page rendered sent the pill all the way home and all the
way back. Measured on this rail at three travels for one tap, 127 to 817, 817 to 127, then 127 to
817 again, and on a phone the browser taking the gesture for a scroll does it on an ordinary tap. A bet that loses **arrives
rather than travels**, because reverting is a correction and not a journey. A cancel *before* the
click used to be read as an abandoned press outright, and on a bar a finger reaches that is wrong:
the browser fires one at a finger that has done nothing at all, having taken the touch to stop the
page's momentum. What tells the two apart is whether the pointer wandered, which is the same
question the click deadline below asks.

**And the page settles the bet, never the marked cell, because the bet is what moves the marked
cell.** Reading it as "the marked cell is now the pressed one" holds only while that comes from the
path alone, and the moment anything else lights the pressed cell the next measure declares the bet
won about two frames after it was placed. That is not cosmetic: every way this has of standing down
begins by asking whether a bet is outstanding, so a release off the cell, a `pointercancel` and the
four-second backstop all quietly become no-ops. Lab measured the same shape at four seconds of the
wrong room on screen. It is the address changing that settles it, to this cell's page or, on a
redirect, to another one. And **the pressed cell is an address rather than a node**, since the
surface re-renders between the press and the events that settle it, the bet itself being what makes
it re-render.

**A tap is a tap the first time, and on a phone the browser often does not make one.** A press
becomes a navigation by becoming a click, and a touch landing while the page is still flinging is
spent stopping the fling, while a drag begun on a fixed bar pans the document. Both leave an
ordinary `pointerup` on the cell and no click behind it, which is invisible to the release rule and
to `pointercancel` alike, so the tap did nothing and then took back the page it had already shown.
A tab bar is not page content, so it judges the tap on its own evidence, landed on a cell, released
on that cell or taken from it without ever having wandered past `TAP_SLOP`, and not held past
`TAP_HOLD_MS`, which is somebody asking for the browser's link preview. It navigates itself and
`preventDefault`s a click that arrives afterwards, so nothing is entered twice, measured as one
history entry per tap. The hold is read off `Event.timeStamp` and never a wall clock, because the
render the press itself starts is part of what is keeping the main thread busy and a perfectly
ordinary tap can reach its handler hundreds of milliseconds later.
`lib/ux/navMotion.ts` is the arithmetic and is
pure, `lib/layout/navMarker.ts` measures the cells and plays it, `app/nav.css` says how a pane
behaves once placed, and both surfaces read all three, because a second marker is two answers to
one question drifting apart a number at a time.

Five things about it are decisions rather than details. **A surface nobody is looking at does not
measure itself**: both are always mounted, the rail is `hidden md:flex` and the bar is `md:hidden`,
so at every width one of the two has no layout box and reports its offsets as zero. Measuring one
writes a collapsed marker at the far edge down as its last known place, and the first travel after
the breakpoint is crossed sweeps the whole width from there, measured at `x 0 scaleX 0.01 -> x 288`
going from 1280 to 390. So a surface with no layout box measures nothing, animates nothing, writes
nothing down, and drops any outstanding bet, since the press that placed it was on a surface the
reader is no longer looking at; the first measure after it comes back arrives rather than travels.
**A pane is placed by measurement on both
axes**, never by an inset typed to match a padding: the rail is a scroll container, so its padding
box takes in the scrollbar's gutter and a pane inset from both edges came out four pixels narrower
than the row it was under. **A pane with no offset on the axis it travels stays at its static
position**, one padding in from the edge, while the cell it is chasing reports an `offsetTop`
measured from the padding box, which drew the whole rail's marker 16px low on every row until
`restingStyle` pinned the origin. **The curve is solved once**, into a table of 1,024 points read
by interpolation, because the keyframes are worked out inside the `pointerdown` handler before the
browser can dispatch the click that navigates, and binary searching a bezier twice per sample is
about 1,900 iterations on the press path for a curve that never changes. **The panes sit at a
negative z-index** so the cells can stay
unpositioned and keep reporting their offsets against the well rather than against whichever
section they are in, which is the same measurement fault arriving through the door marked
`position: relative`. And **the current row still carries its own card until a pane exists**: a
marker cannot be placed on a server, so the well declares the material once as `--nav-marker-bg`
and the row wears it until `data-nav-marked` says the pane has taken it over, or every hard load
would paint a rail with nothing marked and then flicker a card into place. The rail deliberately
does **not** breathe the way the phone's capsule does, since a column lurching beside
the page it just changed is arguing with a decision the reader has already made; what a pointer
gets there instead is the pane following it, which is the hover those rows never had.

**Reaching and arriving are one object at two weights, and that took two goes.** The pointer's pane
started as the raised tint on the rail's own ground, two percent of lightness apart in the light
theme, which is technically a hover and practically nothing on the surface a pointer spends most of
its time over. The answer to that was a second material: the accent's softest tint, the row's words
in `--accent-deep`, and a 3px shadow spread so the pill reached past the row. It was visible and it
was wrong, because it made the two states of one row two different objects. Point at a row and a
lavender pill appeared; click it and a white card appeared somewhere else; and on the row you were
already on, which is the row a pointer is nearest most of the time, the tint stuck out round the
card as a second outline. That doubled ring is what a reader sees first.

So both panes read one fill, `--nav-marker-bg`, and the marker's own `--nav-marker-shadow` is the
whole of the difference: pointing at a row is a preview of pressing it, and pressing it settles what
was already under the cursor. Neither pane reaches past the cell it was measured on, which is also
what lets the two stack invisibly on the row you are on rather than ringing each other. The hovered
row's ink goes to `--ink`, the ink the marked row wears, rather than to a hue of its own, since a
row you are reaching for being a different colour from the row you are about to make it was the
other half of the same fault. What still tells the two apart is what a pane cannot say: the marked
row is bold and its glyph wears its own colour. `test-design.mjs` hovers a row and measures the ink
against the pane in both themes, because a hovered state is not one a page arrives in and nothing
else sweeps it: 15.88 and 15.39 against a bar of 4.5, where the tint it replaced measured 5.16 and
7.93. And the measure that places the panes **runs on every render of the
surface**, where `offsetTop` and `getClientRects` each force a style and layout recalculation of
the whole document: measured at 26 to 37 forced reads for one navigation, on two surfaces at once,
nearly all answering a question nothing asked. What moves a pane is the marked cell changing or
the pointer moving, which is element identity and free to compare, and geometry moving under a
still pane is the observer's job, so an ordinary re-render is two comparisons and a return. The
same observer answers "does this surface have a box" for nothing, which takes that question off
the render path too. Measured after: 11 to 15 reads, and one `getClientRects` rather than eleven.

**Space is what says two things are separate, and it was saying five different things.** Pages
stacked their top-level sections at gap-5, gap-6, gap-7, gap-8 and gap-9 depending on who wrote
them, so moving from Progress to Practice changed how tightly the app breathed for no reason a
reader could name. `Stack` in `components/ui.tsx` is the one rhythm and it is the generous one: 32px
between sections, against 20px inside a card and 8px between rows in a list. Only the outermost
column uses it, because proximity is what says a grid of cards or a list of rows belongs together.
The rail follows the same rule at 28px between its groups, which is the largest space in that
column on purpose: four groups two rows apart read as one list with words in it.

**And a panel drawn three times is three answers.** "Your weakest cases, click to drill" was on
Progress, Practice and My words, each with its own markup, and My words tallied the review log in a
local function of its own instead of calling `caseAccuracy`, so one learner could read two different
numbers for one case and nothing in the app would disagree with either. `components/WeakestCases.tsx`
is the one component and `lib/stats/history.ts` is the one calculation. My words dropped the panel
and the five thousand row query behind it and points at Progress instead, which is what
`test-polish.mjs` drives now: a consolidation that drops the signpost is just a removal.

**Where a walkthrough is short, the reason is that the questions were spread, not that they were
dropped.** First run was eight screens and is four. Every answer it used to collect it still
collects: what to call you, where you are, why, how far, by when, how often and the daily goal. What
went is four screens that each carried one question, a screen of feature tour repeating the landing
page, and a plan panel whose six cited facts and essay on where the hours come from now live on
`/assess` behind `compact`. The order is still the argument: the limits are stated before anything
is asked for, the level is measured before the plan is built on it, and the plan is seen before a
deck is built on it. `test-assess.mjs` drives all four screens and would fail if the deck step ever
moved above the plan.

**The one answer it stopped collecting is which units to start with, because a stranger cannot
answer it.** The last screen was fourteen units with checkboxes and three of them ticked. Somebody
ninety seconds into an app has no way to know whether they need `Riided` before `Ilm`, and at A1 the
honest answer is that it does not matter: the units are ordered and the order is the answer. What a
list like that actually invites is ticking everything, and ticking everything at A1 builds 2,063
cards, which at the pace this app itself calls sustainable is a four year backlog assembled by
accident on the evening somebody installed it. `lib/collections/starter.ts` is the one table: the
first three units at the learner's level, named on screen rather than hidden, with the rest of the
course two clicks away on `/learn`. That is a default, not a restriction, and the difference is that
the screen says which units it chose and where to change them.

**A screen that offers a deck says how big it is, and the only honest way to say so is to build the
cards and count them.** It printed `words * 2`, and two is the count for a unit that drills nothing:
a recognition card and a production card. Every A1 unit but the first also drills seven cases and up
to two recorded sentences, so the deck described as 104 cards is 404, and the multiplier runs from
2.00 to 10.94 across the course depending on the unit and on what the dictionary happens to hold for
each word. There is no constant to correct it to. `previewUnits` in `lib/srs/deck.ts` runs the same
generator the builder runs, so the number promised and the deck delivered are the same number, which
was checked by building one: the screen said 404 and the deck came out 404. `weeksToLearn` takes
cards rather than words for the same reason.

**And a deck is built in a fixed number of queries, because this is the one screen where a stranger
waits with nothing to look at.** `completeOnboarding` called `addUnitToDeck` per unit, which
re-resolved the session, read the dictionary a word at a time, read that learner's cards a word at a
time and revalidated three paths. Six units of eighteen words measured 330 queries against 5 for the
same 982 cards; on a socket that is half a second, and on a hosted database at a 25ms round trip it
is eight seconds of latency before anything else, which is what "Building your deck..." hanging
turned out to be. `addUnitsToDeck` reads the lexemes once, reads the existing cards once and inserts
in chunks of 500, since a whole level is over 2,000 rows and Postgres binds at most 65,535
parameters in one statement. Both halves of this have an invariant, and both were made to fail once.

**A daily goal counts reviews, and raising it does bring words in faster.** The copy said the
opposite, on two screens: "setting this higher does not make words arrive faster". The app's own
arithmetic is `sustainableNewCardsPerDay`, which is the goal over ten, so Intense introduces four
new cards a day where Casual introduces one. Four times is not "no faster". The true half had been
compressed out of it: a goal of fifteen is fifteen *reviews*, and nine in ten of those are words
already met, so it is not fifteen new words a day and a beginner who reads it that way is planning a
year they will not have. Both halves are said now, with this learner's own deck in the sentence
rather than a general warning. The minutes are `minutesFor` and are no longer also written out per
row, which is where "About about 8 minutes a day" came from: a figure written down twice is a figure
nobody is checking.

**A level is something a learner may simply tell the app, and the later answer wins.** Three
things measure Estonian here and none of them can know that somebody was moved up in the class
they sit in every Tuesday, or sat the real state examination, or read a check taken on a bad
evening and knows it is wrong. Settings has a row of five chips for exactly that.
`courseLevelFor` used to order by richness, taking the level check first and the stored setting
only when there had never been one, which would have made that button do nothing: a check sat in
March beats a correction made this morning, silently, on every screen that reads a level. So what
decides is **when**, not which, and `cefrPlacementAt` is what makes that possible. A declaration
with no timestamp reads as older than any measurement, which is both every row written before the
picker existed and, deliberately, the level ticked in first run by somebody who has not answered
a question yet.

**And a level has to be worth setting, which means it decides which words somebody meets.**
"Around your level" was one `Record<Level, readonly string[]>` inside `lib/dict/suggest.ts`, where
exactly one of the three things that choose words for a learner could see it. The other two did
not band at all, and it did not look like an omission because both had an `ORDER BY cefr ASC` in
front of a `take` that reads as deliberate and is the bottom of the dictionary: the minimal pairs
round drew two thousand rows starting at A1, so a C1 speaker got beginner contrasts on their first
visit and on their four hundredth, and the government drill took the easiest two hundred of 268
governed verbs, so the C1 ones were the verbs nobody was ever shown. `lib/collections/levels.ts`
is the one table, one band either side, and an invariant fails on a second copy of it and on a
reader that stopped asking.

What is **due** in review is not banded and may not be: FSRS decides when a card comes back, and a
level that reordered that is not a schedule. What has never been seen has no schedule yet, so
`aroundFirst` puts those around the learner's level first. It **orders and never drops**, which is
the whole of why this is safe on somebody's own deck, and a word with no CEFR tag counts as at
level, because a word typed in, pasted or photographed is one the learner went to the trouble of
putting there.

**Local mode is a deployment shape, not a switch.** With no Supabase keys the app runs as a single
local learner; with them, every route is gated. It keys off the absence of configuration only. Never add a flag that can disable auth on a deployment that has it. (ADR-013.)

**Who is signed in is worked out, not asked for, and never without a deadline.** `getUser()` hands
the access token to Supabase and asks whether it is still good, which is a network call, and this
app was making three of them one after another on every signed-in page load: the middleware's gate,
`requireUserId()` and `currentLearner()`, each waiting on the last and none able to reuse another's
answer. Measured against a project in eu-west-1 that was 138 to 187ms before the page had done
anything, paid on the landing page and the privacy notice as readily as on somebody's deck, and paid
again on `/auth/callback`, which was waiting to be told about a session it had not created yet.
Nothing capped the wait either, so a minute where the auth service stopped answering was a 504 from
the platform twenty-five seconds later, which is the least useful sentence available for "the login
server is busy".

`lib/auth/identity.ts` is the one answer and it asks three things, cheapest first, each one a
question the next no longer has to ask. **A public page that renders the same either way is answered
without a client at all**, which is /welcome, /privacy, /terms, /offline and the OAuth callback;
/sign-in is the single exception, because it still has to send somebody already signed in home.
**A request with no `sb-<ref>-auth-token` cookie is signed out, definitively, for free**, which is
every visitor who has not signed in yet. **What is left is verified rather than asked about**:
`getClaims()` checks the token's signature against the project's public keys, cached in the process,
so the same request costs 7 to 9ms. That last one needs the project on asymmetric JWT signing keys,
which is a dashboard setting rather than a code change; on a legacy shared secret `getClaims()`
calls `getUser()` itself, so the fallback is the old behaviour and never a weaker one.

What it trades is freshness: a session revoked elsewhere survives until its access token expires
rather than until the next request. The allowlist is not part of that trade, because the address is
a claim inside the token and `isAllowedEmail` still runs on every gated request.

**And "we could not tell" is not "signed out".** Every call goes through a transport carrying a
2,500ms deadline, the same one the dictionary gives Ekilex, and the transport records whether the
service answered at all, which is the only place that fact is known: a 401, an expired token and a
bad signature all arrive as ordinary responses and are facts about the session, while a call that
never completed is a fact about the network. `Identity` has three states for that reason, and the
third is let through rather than redirected. Reading it as a sign-out would take a learner's deck
away from them over a bad minute at somebody else's server, on the screen they open every day, and
send them to a sign-in page that could not sign them back in either. It cannot leak anything,
because the middleware is not the check that decides: every page, action and route resolves its own
owner through `requireUserId()`, which throws when the session cannot be verified. `!== "in"` is the
shape that breaks this and it is the natural thing to write, so the invariant reads for it.

## Conventions

- TypeScript `strict` plus `noUncheckedIndexedAccess`. No `any` without a comment justifying it.
- `lib/assessment/`, `lib/estonian/`, `lib/gamification/`, `lib/stats/`, `lib/collections/`,
  `lib/time/`, `lib/offline/`, `lib/security/`, `lib/scan/`, `lib/questions/`, `lib/ux/`,
  `lib/random/` and `lib/copy/` stay free of
  React, Next.js and Prisma: pure functions, unit tested. Anything that
  needs the database lives in `lib/progress/` or a route. Asserted, because it
  had been prose alone and it is not a tidiness rule: the unit suite gates every
  commit on being hermetic, so one `import { prisma }` inside `lib/stats/` puts
  a database behind a function four hundred tests call, and the suite does not
  fail, it gets slower or it passes against whatever rows happen to be there.
  Each directory is checked to exist too, so a rename fails there rather than
  quietly covering nothing.
- Data that drives UI but holds no JSX (badges, path units, quests) carries a lucide icon *name*;
  `components/icons.tsx` is the only place that turns one into a component.
- Settings go through `lib/settings/store.ts`. No new string keys scattered through pages. The five
  goal keys (`goalReason`, `goalTarget`, `goalDeadline`, `goalDays`, `goalNote`) are declared there
  and nowhere else, and an invariant checks it.
- Server actions for mutations; Route Handlers for streaming and third-party proxying.
- Every new view implements all four states from `docs/08-ux-ia-a11y.md` §4 (empty, loading, error,
  offline). A view without an empty state is not finished. **Loading is the one a route group can
  lose wholesale**, because it is a file rather than a branch: `app/(app)/` had one and the
  chromeless group and the two policy pages had none, so the landing page, sign-in, first run,
  /privacy and /terms each showed a blank screen. An invariant checks per group, which is the
  granularity Next resolves a `loading.tsx` at.
- **A screen names itself, in the tab and to a reader.** Thirty-four of forty-five routes set no
  title, so every one of them was called "Kodukeel. Estonian that finally sticks" and two tabs side
  by side were indistinguishable. A page states its own name and `title.template` in
  `app/layout.tsx` adds the app's. And a practice round carries an `h1` even where there is no room
  to draw one: each mode renders three or four screens from one component, the empty and finished
  ones each had a heading and the round did not, so an accessibility run that met an empty deck saw
  one and passed. That is why it is asserted from the source rather than from whichever branch a
  fixture rendered, and why the browser suite now walks every route rather than the fifteen a branch
  happened to add.
- Unit tests stay hermetic: no database, no network, no clock you do not control. Anything needing
  Postgres is an `*.itest.ts` under `npm run test:db`. The unit suite gates every commit and must
  stay fast enough that nobody is tempted to skip it.
- **A cache of object URLs that never revokes one is a leak with a hit rate.** `Speak` and
  `PairsSession` each held a `Map` of blob URLs and neither released anything: `Speak`'s was
  module-level and so outlived every navigation, `PairsSession`'s went unreachable when the round
  ended and was still held by the browser. Review plays audio on nearly every card, so a phone
  left in the app kept a WAV per word for the session. The presence of a cache is what made this
  look solved, which is why `lib/audio/clipCache.ts` is bounded and least-recently-used rather
  than merely revoking: an unbounded cache that revokes on eviction never evicts. One module
  rather than a copy per caller, on the argument `lib/cache/singleFlight.ts` makes about itself,
  and the invariant fails on any component that mints an object URL without revoking it. That is
  how `ShareProgress` turned up, holding a shared card for the life of its tab.
- **"Pick one of these" is one component, and a chip is not a control.**
  `components/Choice.tsx` is it: `ChoiceGroup` plus `ChoiceChip` or `ChoiceCard`. There was no
  primitive for this and every screen that asked invented its own, two of the three wrongly. The
  worst was a bare `<button>` wrapped round a `<Chip>`, which is the app's *label* primitive: no
  border, no shadow, no hover, so first run, the screen that decides a learner's year, read as a
  legend rather than as a form. Chosen was `--raised` swapped for `--accent-soft`, two percent of
  lightness apart on the dark theme, which is the palette's own rule about hue being broken on the
  one screen where the distinction *is* the answer. And a set of mutually exclusive options wore
  `aria-pressed`, so it announced as that many unrelated switches and cost that many tab stops
  rather than as one radio group saying "3 of 8". Its chosen states live in `globals.css`
  and not in a `style` prop, for the reason in the next rule: a control that paints its resting
  background inline can never define a hover, which is what made this unfixable in place.
- **A hover makes a control more present, never less.** `.choice-btn` for a box, `.tap-tint` for a
  bare row or icon button. Twenty-odd controls carried `transition-opacity hover:opacity-80` as
  their whole hover state, and dimming is exactly how every disabled control here is drawn, so the
  strongest signal a mouse got on those screens was the control appearing to switch off. A link
  may still fade, and a `<button>` drawn as underlined text is a link wearing the right element,
  which is the one exemption the invariant reads.
  Two sessions found this the same day from opposite ends, main on the multiple-choice answers and
  this branch on the settings and first-run questions, and both worked out the same cause: an
  inline style beats a class `:hover`, so a control that paints its resting background inline can
  never define one. Main's answer is the one kept, because a `--choice-bg` custom property is how a
  caller passes a tone *through* a hover, where an inset ring is only how you avoid needing to.
  The second copy was deleted rather than left beside it.
- **A pointer over something pressable says so.** Tailwind 3's preflight put `cursor: pointer` on
  every button. Tailwind 4's hands the element back to the browser, whose default for a `<button>`
  is the arrow, and this app is built almost entirely out of real buttons: the rail, the practice
  chips, the four rating keys, the multiple-choice answers, the letter bar and every close cross
  all drew the same arrow as the paragraph beside them. The only things in the whole interface that
  changed under a mouse were the handful of plain `<a href>`s, so a learner working out what is
  pressable by hovering it was told "nothing here", everywhere, wrongly. Measured rather than
  assumed: with the rule stripped out of the compiled stylesheet a bare `<button>` reads `default`,
  a `<summary>` and a `[role="button"]` read `auto`, and the file picker reads `default`.
  One rule in `app/globals.css`, keyed on roles and input types rather than on a class. `.press`
  and `.tap-tint` are how a control *moves*, which is not the same set as the controls that can be
  pressed, so a rule keyed on either reaches only the ones that remembered to ask for it; a control
  is covered here by being a control. A `<label>` is on the list only where clicking it operates
  something, since the `label-xs` caption over a text field moves a caret and a pointer there
  promises a button that is not present. And a disabled control goes back to the arrow rather than
  to `not-allowed`: everything disabled in this app is waiting for the learner, a send button with
  an empty box or a rating key before the answer is shown, never refusing them. That is the one
  declaration `.choice-btn` used to carry for itself, and it is one declaration now.
- **A control the 44px floor makes bigger centres its own content.** The floor under a coarse
  pointer is a `min-width` and a `min-height`, and an inline box lays its content out from the top
  left, so on a button holding nothing but an icon all of the slack lands on one side: measured at
  390px, the cross on the phone's More sheet sat six pixels left of the middle of the circle around
  it, and so did every other icon-only control that had not thought to say `flex` for itself. One
  rule in `app/globals.css` centres them, written inside `:where()` and keyed on `[aria-label]` plus
  a lone `svg` child, so it carries no specificity and reaches only the controls whose whole content
  is the icon. A control that lays its own icon out keeps doing exactly what it says. The invariant
  asserts the pairing rather than the rule, because a floor that inflates a box with nothing
  centring what is inside it is the state that produced this.
- **Two speeds are one control, not the same icon twice.** Normal and slow were two identical
  speaker buttons side by side on the dictionary entry, the speaking round and the listening part of
  the mock exam, which reads as a rendering fault rather than as a choice, and the only way to find
  out what the second one did was to press it. `SpeakPair` in `components/Speak.tsx` is one pill with
  a divider whose slow half says "Slow" in words, since a `title` attribute is a hover and this app
  is measured on a phone. It goes away as a pair: both halves ask the same service for the same
  sentence, so a failure is a fact about the service and not about a speed.
- **A colour may not be the only thing carrying a distinction, and a tooltip is not text.**
  Dictation's `diacritics` and `typo` share a hue on purpose, because the palette has one colour
  for "nearly" and inventing a sixth to carry a distinction is what the design system forbids. So
  the two were told apart by a `title` attribute, which is a hover tooltip, in an app measured at
  360px whose README leads with "works on a phone". And telling them apart is the entire
  pedagogical claim of that exercise. `wordNote` in `lib/estonian/dictation.ts` says which in
  words, reusing `droppedDiacritics` rather than rewriting the loop that knows which letters
  exist.
- **No em dash or en dash in anything a person reads**, anywhere in `app/`, `lib/`, `components/`
  or the README. A dash used as a clause break is the loudest single tell that a sentence was
  generated, and every screen here is one person explaining Estonian to another.
  `lib/copy/readerCopy.test.ts` walks the whole tree and fails on one, alongside every other tell
  in `lib/copy/voice.ts`; its `ALLOWED` list is now the table itself, the one file that has to name
  what it bans, and a test fails if an entry there stops containing one, so it cannot become a
  parking space. Replacing a dash between two independent clauses with a comma
  makes a splice and reads worse than the dash did: use a full stop. A separator in a label takes
  the middot the app already uses.
- **Some code reads a dash rather than writing one, and a sweep cannot tell those apart.** The word
  list separator in `ImportPanel` and the punctuation class in `lib/estonian/dictation.ts` were
  both rewritten once, silently: a pasted list stopped splitting and a stray dash in an Ekilex
  sentence became a word the learner had to type. Both are named constants written with escapes,
  and `readerCopy.test.ts` asserts they still read all three characters.
- **An empty cell says `NO_VALUE`, which is "n/a"** (`lib/copy/values.ts`). It was an em dash,
  which is now the one banned character; a bare hyphen is worse, since in a table of forms it
  reads as a one-character form and beside a percentage as a minus sign whose digits failed to
  load. `lookup.ts` still recognises all three spellings a stored translation may carry, because
  the dictionary is seeded data that outlives a deploy.
- **A date is written the way the reader writes dates, and only their browser knows how that is.**
  `lib/time/clock.ts` pins the hour and deliberately leaves date order and month names to the reader,
  which is true of a client component and was false of the two places this app formatted a date on
  the server: `undefined` as a locale means the deployment's, so on a machine set to en-US Today's
  greeting line read "Sunday, August 30" to somebody in Tartu who writes "pühapäev, 30. august".
  `components/LocalDate.tsx` renders what the server wrote and lets the browser replace it on mount.
  A separate rule from the day boundary above, because the fix is different: a zone can be stored and
  handed to the server, and a locale is a list of preferences only the browser has.
- **24-hour clock everywhere** (`lib/time/clock.ts`), never am/pm. Estonia writes the time that
  way and so does every country whose language this app teaches, and a reading that changes shape
  with the browser's locale is one a teacher and a student cannot compare. `hourCycle: "h23"`
  rather than `hour12: false`, which renders midnight as "24:00" in en-US.
- Style through the tokens in `app/globals.css`, never with a raw hex. The five hues carry fixed
  meanings (`docs/14-design-system.md` §1). Mint is "recalled", peach is "missed", and neither is
  free for decoration. **A hue has a fill and an ink and they are not interchangeable**: `--accent`
  is what a button is painted, `--accent-deep` is what a word is written in, and text set in the
  fill measured 3.87 on the week header and 4.05 in the leech clinic against a bar of 4.5. Contrast
  is measured in a browser rather than reasoned about from the token list, and **in both themes**,
  because light and dark are two palettes rather than one with a filter over it: the first batch of
  failures was entirely in dark mode and the second entirely in light. What a colour is worth
  depends on what it is sitting on, which a palette cannot tell you.
- **`opacity` never goes on a box that holds words.** It multiplies through everything inside, so a
  fade meaning "not yet" fades the sentence explaining why. A locked unit on the course page ended
  up saying "you can still open it" at 2.63:1, on every locked row of a 73-unit course; the badge
  shelf and the grammar reference had the same shape. A state that means "not yet" has a border, an
  icon and a sentence to say so with. Where a fade genuinely helps, it goes on the icon.
- **And the sweep is axe, not a hand-rolled one.** `scripts/a11y-check.mjs` spent its life saying it
  was "not a substitute for axe", which was true and was also why five real failures sat unseen. The
  contrast pass it replaced scoped to `main`, so the navigation rail on every signed-in screen was
  outside it, and it read a colour's own alpha but not an `opacity` inherited from a parent. axe
  found both in one run, plus an `<ol>` on the landing page whose `<li>`s sat behind a wrapper `div`,
  so the list announced itself as empty. What stays hand-written is only what axe has no opinion
  about: exactly one `main` and one `h1` per screen, and a title that is not the landing page's.
- Signed-in routes live in `app/(app)/`; pages that own the whole screen (the landing
  page, sign-in, first-run setup) live in `app/(chromeless)/`. A new public page has
  to be added to the allowlist in `middleware.ts` as well.
- Every interactive element is keyboard-reachable with a visible focus ring, and under a coarse
  pointer every one of them clears 44px.
- **A shortcut works wherever the control it presses is drawn, and "drawn" is one question with one
  name.** A new card in review leads with its answer, because a card you have never seen cannot be
  recalled, only met, so `askFor` returns `intro` and the rating buttons arrive with it. `revealed`
  stays false, since nothing was revealed. The render worked that out in four places and wrote
  `revealed || ask === "intro"` longhand in each of them; the keydown handler is where the fifth copy
  should have been and was not, so it read `!revealed`, returned before the rating branch, and the
  number keys did nothing at all on the one shape a learner meets every time they start a new word.
  The buttons were right there and the mouse graded them, which is what kept it invisible. It is
  `answerShown` now, defined once, and the invariant fails on a sixth reader spelling it out again
  rather than on today's markup. The lesson generalises past this screen: a control's visibility and
  its shortcut are one condition, and two copies of it are a bug with a delay on it.
- **Text and icons stay inside the boxes they were drawn into, and that is four declarations rather
  than a habit.** Every other rule here about the shape of a page is about the page, and none of
  them can see this fault: it happens inside a card that is itself exactly the right size, so the
  document never scrolls sideways and every check that measures the document reads a clean pass
  while a word sits on the ground behind the card. `overflow-wrap: anywhere` is inherited from the
  body, and `anywhere` rather than `break-word` is the whole point: both break a word that has
  already overflowed, but only `anywhere` counts towards min-content, which is what a flex or grid
  item's automatic minimum is, so with `break-word` one long word is a floor under the row and the
  row leaves the card having broken nothing. `svg.lucide { flex: none }` stands in for `shrink-0`
  on several hundred icons, which was on about a fifth of them: an icon with no `flex` of its own
  both shrinks and grows, measured at 0x15 in a deck row and 28x16 in the rail. A replaced element
  is capped at its box, because nothing about wrapping reaches one: Settings' backup picker is an
  `<input type="file">` laid out at 336px inside a 278px card. And **a table is the one exemption**,
  because a table of forms is read by comparing them down a column and a form broken across two lines
  has to be reassembled first. It buys that with a scroller of its own, which every table in the
  app sits in and an invariant checks, since the worksheet's did not and was 103px over a phone.
  `scripts/test-containment.mjs` measures the rectangles, on **every route the app has** at 360,
  768 and 1280, in the dark as well as the light, in the states a route does not arrive in, and on
  the three screens that need a row made before they can be visited at all. Four questions each
  time: cut off by something that clips, drawn over a border somebody painted, drawn on top of
  something else, or resized away from the size it declared. Then the same four again with every
  run of text swapped for one **of the same length** with no space or hyphen in it. Same length is
  the discipline: a stress test that hands every element a forty-character word is unfalsifiable,
  since a ring whose middle says "42%" fails it and no markup would pass, while same length asks
  the question Estonian actually poses.

  **768 is where the faults were**, and it went unmeasured for a while because it is neither end.
  It is the width at which the rail appears and the content column is therefore at its narrowest,
  and five things were wrong there. The worst was the shell: `main` is a flex item and had no
  `min-w-0`, so from `md:` up a table of forms or a row of chips made it wider than the window,
  and since the body clips sideways there was not even a scrollbar to find the missing half with.
  Then a case row whose fixed columns came to more than its card had inside it, an exam card whose
  chips set a floor it could not meet, the landing page's ornaments swallowing taps on the card
  they are tucked over, and `Chip` itself. With the four declarations removed the suite fails 395
  of its 1010 checks, which is how anybody knows it is looking.
- **The root element declares no overflow.** Setting either axis on `html` makes it a scroll
  container, and every library that positions a floating element works in document coordinates
  instead of viewport ones when it is: a menu hung off the sticky rail or the fixed phone bar is
  then drawn one scroll offset from where it belongs, which on a scrolled phone means open,
  focused and off the top of the screen. Sideways is still clipped, on `body`.
- **Nothing may be `position: fixed` over moving content and carry a `backdrop-filter`.** That
  pairing re-filters its backdrop every frame of every scroll; Upside Lab measured it at 42
  repainted frames in one pass down a phone screen, the worst a third of a screen behind where the
  page was. The phone bar is a solid fill for this reason, and the pull-to-refresh ring carries no
  filter.
- **Nothing pinned to the bottom of the window types its own offset.** `lib/layout/dockClearance.ts`
  measures the phone bar and publishes `data-dock` and `--dock-clearance` on `<html>`, and only
  while it is drawn; `.bottom-notice` and `.dock-pad` read those. A `:has()` selector would answer
  yes for a `md:hidden` bar in the DOM drawing nothing, which is how three notices ended up
  floating most of an inch up an empty landing page.
- **`overscroll-behavior-y: none` is load-bearing and it took the browser's pull to refresh with
  it.** There is no setting that keeps one and not the other, and installed to a home screen this
  app has no address bar and so no reload button anywhere in it. `components/PullToRefresh.tsx` is
  the gesture put back under our own control. It settles on the router's own request landing,
  observed through resource timing, **not** on `useTransition`'s pending flag: measured here that
  goes true and never comes back, which would have turned the ring for its full eight second
  ceiling on every pull.
- **The Estonian letter bar is a desktop thing, and a choice.** `õ ä ö ü š ž` are not on a UK or US
  keyboard, so a row of click-to-insert buttons under every Estonian field is the only thing making
  half these exercises answerable. It was drawn for everybody, everywhere, always, and it should
  have been neither. A phone keyboard already carries those letters, on a long press or a keyboard
  switched to Estonian, so the row buys a phone nothing and spends the one thing a phone has none
  of; and a learner typing on an Estonian keyboard has them as keys, so it is clutter under every
  field in the app. Neither is detectable: a browser will not say what is printed on the keys, and
  a learner who never reaches for õ looks exactly like one who cannot. So it is asked, once, on the
  first screen of first run, and changed afterwards from Settings or from the row itself, which
  carries its own way out because the moment somebody notices they do not need it is the moment
  they are looking at it. `lib/ux/letterBar.ts` holds the letters and the answer, `app/globals.css`
  holds the one definition of "a desktop" (a width **and** a real pointer, since `min-width` alone
  hands the row to a tablet with nothing attached to it), and the signed-in shell publishes the
  learner's answer as `data-letters` in the render rather than from an effect, because an attribute
  written after hydration shows the row for a frame to everybody who asked for it to be gone.
  **On is the default and stays the default**: everybody who signed up before the question existed
  is never asked, and reading a missing answer as "off" would take away the only way they have of
  writing õ. `scripts/test-mobile.mjs` measures all of it in a browser, which is the only place the
  pointer half of the rule is real.

## Model configuration

**Provider-agnostic, and it is a chain rather than a choice.** `resolveProviders()` returns every
key in `.env` in order, free first: OpenRouter (default), Anthropic, then OpenAI. Do not re-pin a
single provider. `openWithFallback` walks past a provider that is throttled or having a bad
minute, and never past a rejected key or a model that does not exist, since every provider would
answer those the same way and trying them all turns one clear message into a slower one. A
provider is only ever walked past **before it has said anything**: once text is reaching the
learner a failure stays a failure, because a second answer appended to half of a first one is two
teachers talking over each other. `withRetry` is patient only on the last link of the chain, which
is where waiting is the only option; on every link before it, moving on costs one request and
sitting through 4.5 seconds of backoff against a provider that has already said no costs 4.5
seconds. The Anthropic path keeps a `cache_control` breakpoint on the static Estonian system
prompt. This supersedes the original ADR-004; see `docs/13-mvp-status.md` §2.

**Reading a picture uses whichever model the deployment already configured.** Not a better one
chosen behind the operator's back: turning the camera on must not move a free-model deployment onto
a paid one, and the free chain that is now the default is text-only. `OPENROUTER_VISION_MODEL`,
`ANTHROPIC_VISION_MODEL` and `OPENAI_VISION_MODEL` are how that choice is made, and they affect
scanning and nothing else. The chain is deduplicated by model first: OpenRouter contributes a link
per free model, so an override would otherwise ask one model the same question three times and read
the third refusal as having exhausted the chain. The image path
falls back more readily than the chat path does, and deliberately: `openWithFallback` refuses to
walk past a 400 because every provider would refuse a malformed request the same way, but whether a
model can see is a fact about that one model, so `completeWithImage` walks past everything except a
rejected key.

**Which model answered is a fact about the answer, so it travels with it.** Never the head of the
chain: a screen naming the wrong model is worse than one naming none. The handshake finishes
before the response head is written, which is what lets `x-model-provider` and `x-model-id` be
headers at all; the chat reads them back and the line under the conversation says "Will ask" until
a reply has arrived and "Answered by" after. A trailer was tried and is not an option, because no
browser exposes one.

**Anu's English is cleaned on its way past, and her Estonian never is.** `lib/tutor/humanize.ts`
strips dashes used as clause breaks and stock openers, reading both from `lib/copy/voice.ts` rather
than keeping a list of its own. It streams, holding text back only where a
rule could still change it, so it costs the learner nothing they would notice. Only the phrases
carrying no information are rewritten: there is no mechanical translation from `seamless` back into
whatever was meant, so a brochure word is asked against in the prompt and swept in hand-written
copy rather than replaced mid-sentence with something Anu did not say. `FIX:` and `VOCAB:`
lines pass through byte for byte: rewriting punctuation inside a corrected sentence would be the
app editing Estonian, which is the rule the whole project is built on. The first version of the
stream got that wrong in the way only a test finds, rewriting a corrected sentence one chunk
boundary at a time once the first half of its line had already been shown, so the line's character
is now decided when it opens and carried until it ends.

**A class shows effort, never contents.** `lib/classroom/roster.ts` is the whole boundary: reviews
this week, streak, words known, last-seen, the group's weakest cases in aggregate, and, amending
ADR-019, each student's own weakest case as a rolled-up percentage over their own reviews, gated on
`MIN_STUDENT_CASE_REVIEWS` so one bad card never names anybody. That is still never an individual's
deck, searches or answer history: a student's raw mistakes stay theirs alone, only the roll-up moves.
The join screen states this before anyone joins, and `weakestCase` may only ever be a `{grammCase,
accuracy, total}` roll-up, never a specific answer, a search, or a card.

**Never score pronunciation.** Not because none is reachable, which stopped being true, but
because the reachable one is not good enough and that was measured rather than assumed.
`scripts/measure-asr.mjs` runs `whisper-large-v3` over sentences the dictionary already carries,
spoken by a native synthetic voice: clean audio, no accent, no noise, which is easier than any
learner's recording. It comes back at a 14.6% word error rate, and its mistakes land on consonant
length (`Poiss` as `Pois`), voicing (`abikaasaga` as `abigaasaga`) and word boundaries, which is
precisely where an Estonian learner is weakest. Showing that transcript would report correct
pronunciation as an error four times in five. Re-run the script before re-opening the question. It compares recognisers on byte-identical
audio and refuses to report a rate when the service refused too much of the sample, which it
learned by once reporting 2% over three surviving sentences and reading as a breakthrough.
Speaking practice compares a recording with a native rendering and lets the learner judge. (ADR-018.)
The level check has a speaking section for the same reason it has the other three, and it obeys the
same rule: it collects the learner's own rating, reports it as theirs, and contributes **nothing**
to the level. `SCORED_SKILLS` in `lib/assessment/score.ts` names the three that count, and
`scripts/test-invariants.ts` fails if speaking ever joins them.

**A placement question is answered in Estonian, not about it.** Nobody sitting a real Estonian test
is asked to name a case. The state examination's published reading tasks are `valikvastustega
ülesanne`, `valikvastustega lünkülesanne` and `sobitamine`; the placement tests Estonian language
schools set are almost entirely the middle one, a sentence with a hole in it and three or four forms
of one word underneath. The level check led with the terminology instead, and half of every reading
section was metalanguage: which case is this ending, which form does this case call for, which case
does this verb govern. It cost more than tone. "Which case does the verb kõlbama demand of its
object?" was asked of 45 entries that are nouns and adjectives, and of verbs that take no object at
all; and 18 of those questions offered a second genuinely correct case as a *wrong* answer, because
a word's government string names every case it governs and the distractors were drawn from all of
them, so a learner who knew that `segama` takes the comitative was marked wrong for it. The writing
section had the same shape and worse feedback: it asked for `kolmandik` in the seesütlev and then
answered "why that form" with "the seesütlev answers milles? kus?", which is the question again.

So every one of those is a gap now, in a sentence a lexicographer recorded, with forms of one word
to choose between or to type. `lib/estonian/cloze.ts` was already hiding words out of sentences for
the mock exam and both callers use it rather than keeping a copy. The Estonian names still appear in
the **explanation** after an answer, where they are the cross-reference `lib/estonian/terms.ts`
exists for, alongside `CASE_NOTES`'s one line on what the case is *for*, which is the half that was
missing. A form that is two cases at once is named as neither: `ajalugu` is the nimetav and the
osastav, and the version that named whichever the dictionary listed first called a partitive object
"the subject of a sentence". An invariant fails on a case name in a question, and
`scripts/test-assess.mjs` asks the same thing of the rendered screen, because a source check cannot
see a name arriving through an interpolated option.

**A placement check has no way to skip it, and one way past one question.** Every section opened
with "Start this section" and "Skip reading" as two buttons of equal weight, and every typed
question offered "Skip this one" beside Check. The overall level is the weakest of three skills
(ADR-020), so a skipped section is not a gap in the report, it is a hole underneath the number: the
app measures what somebody felt like doing and then prints a level as though it had measured them.
Both are gone. What stays is `skipSkill` for listening, which is not a skip and is reached only
when the speech service cannot make audio at all, so there is nothing on the screen to answer, and
it leaves the section unmeasured rather than failed. Leaving a box empty and pressing Check is
still allowed and is honest, because it marks nothing wrong that was not. The one skip left in
first run is the *goal* screen, whose answers only feed the plan.

**Feedback explains the sentence, it does not label it.** A gap's explanation read "Here kõhn is in
the nimetav, the nominative. The dictionary form. The subject of a sentence, and what you point
at.": three sentences of grammar vocabulary at somebody who has just been told they were wrong, and
none of them about the sentence in front of them. `explainGap` leads with the sentence put back
together, then says what the gap took and names the form as the cross-reference it is, then gives
`CASE_NOTES`'s one line on what the case is *for* and its `englishHook`, which is the half that was
missing entirely: "of the book", "the book's cover" lands in a glance where "possession, and the
stem eleven other cases are built on" is a fact to be learned before it can be used. The Estonian
name still leads the English one, because that is the rule above and a class uses the Estonian.
**The typed version of the task prints the same string**, from the same function: the writing
section used to answer "why that form" with the whole sentence and nothing else, which tells a
learner what the answer was rather than why, and `WriteItem.because` is now `explainGap`'s own
output so the two shapes of one task cannot say different things.

**Speaking is asked, not recorded.** The check played a native rendering, recorded the learner, and
asked them to rate the comparison. Nothing scored it (ADR-018), so what the microphone bought was a
permission prompt and a clip in exchange for a rating that was going to be the learner's own
judgement either way, and the two clips play one after the other rather than together, which is not
how anybody hears their own accent. The recorder is gone from the placement check and the question
is the honest version of what it was already collecting: hear it said properly, and say how
confident you are saying it. `SCORED_SKILLS` is unchanged and speaking still contributes nothing.

**A usage is not always a sentence, and `naturalSentence` is where that is decided.** Ekilex records
a usage against a *sense*, so what comes back under a headword is sometimes lexicography rather than
something somebody said, and three shapes of it reached a real sitting. A usage that trails off
(`Uuringud näitavad, et ..`), offers two alternatives round a slash (`Elekter läks ära / kadus.`) or
is numbered out of a list of definitions is not answerable. And a usage opening with its own
headword before a comma is the label pattern, where the entry names itself and then illustrates a
sense the gloss beside it does not name: `Kahvel, lipp kukub!` is filed under `kahvel` and is a
sailing call about a gaff rather than about a fork, which is precisely the question a learner cannot
answer and cannot argue with. Only a *nominal* is caught by that last one, because a verb before a
comma is an ordinary main clause and `Usun, et ta ei valeta` is a sentence worth reading. It lives in
`lib/estonian/cloze.ts` beside `buildCloze` and the placement check and the mock exam both read it,
because two papers disagreeing about what counts as a sentence is two answers to one question. It
rejects 101 of the 8,826 usages that pass the length rules, which is the cost of it.

**A word means everything the dictionary files under its lemma, so none of that is a wrong answer.**
"What does kallis mean" offered `expensive`, `beautiful`, `fast` and `morning`, and the learner who
chose `beautiful` had a case, because `kallis` is also what you call somebody you are fond of.
`differentMeaning` compares one gloss against another and a sense the printed gloss does not mention
is invisible to it. What *is* visible is a second entry under the same lemma, and `@@unique` is on
`(lemma, pos)` so the dictionary holds plenty of them: `hall` is a noun meaning frost and an
adjective meaning grey, and offering "grey" against "frost" marks somebody wrong for knowing the
word. `meaningTest` treats every gloss filed under the lemma as an answer. It does not reach a sense
no entry records, which is `kallis` itself: that is a gloss worth correcting, and `npm run
audit:glosses` and the report queue are the two ways that happens. `prisma/data/harvested.ts`
already carries "expensive, dear" for it, so a deployment showing "expensive" alone is one seeded
before the course harvest and is fixed by a reseed rather than by code.

**Why somebody is learning Estonian is a set, not a choice.** Living here, an Estonian partner and a
job whose meetings are in Estonian are three true answers, and the app made somebody pick a
favourite and then implied the target the whole plan was built on from whichever they picked. The
stored value is still one string, space separated, so every row written before this reads back as
the single reason it holds; `reasonsFor` is the one parser and `impliedTarget` offers the *highest*
band any chosen reason needs, because the smaller goal sits inside the bigger one and planning for
the smaller would tell somebody they were finished when they were not.

**There is no page describing this app to somebody already inside it.** `/guide` was the first-run
feature tour kept at a URL: every screen with a reason to open it, and an equally long list of what
this app cannot do. The landing page makes that case to somebody who has not decided yet, which is
where it belongs, and a learner who skipped it finds out what the app does by using it. Offered from
inside the setup wizard it was a link out of a flow ninety seconds from finishing. `lib/copy/tour.ts`
went with it, which is the last second table of this app's own screen names; the one sentence of
honest limits it led with is on the first screen of first run, last, in one line.

**A word governs every case its entry names, so none of them is a wrong answer.** The two drills
that keep asking the question rather than replacing it, the mock exam's `rektsioon` task and
`/review/government`, had the same fault the placement check did. An Ekilex entry records a word's
whole government and `parseGovernment` returns the primary; `buildOptions` filtered only that one
out of the distractor pool, so any of the others could stand as a wrong answer. 60 of the 268
governed verbs in the shipped dictionary name more than one case: `aitama` is `keda/mida*
(partitive) · millest (elative)` and takes both, so somebody who knew `see ei aita millestki` chose
the elative and was marked wrong, and `alustama` governs three and could be shown two of them at
once. Government is the one thing an English speaker cannot reason out, so a drill that marks them
wrong for being right is the drill teaching them to ignore it.

`buildOptions` takes the parsed `Government` rather than a case key, which is what makes that
unforgettable: the type cannot be satisfied by a caller holding only the answer, so a fifth drill
cannot reintroduce the fault by not knowing about it. It returns null rather than padding when
nothing honest is left, and the caller drops the question. **Reading the cases out of the string is
a scan, not a substring search**: `adessive` ends in `essive` and `abessive` contains it, so a
`indexOf` per name invents a government the entry never mentions, and `hakkama` grew a third out of
its `(adessive)`. One left-to-right scan taking the longest name at each position answers both
"which is primary" and "which else", because two scans over one string are two answers waiting to
disagree. And a task titled "which case does the verb take" asks a **verb**: the dictionary records
a government for 36 nouns and 12 adjectives too, `osa` genuinely takes the partitive and the
elative, and the exam builder was asking about them as verbs. Two invariants, both made to fail
first.

**A level is never decided by a model, and never built out of Estonian we wrote.** The placement
check at `/assess` is assembled from `Lexeme`, `Form` and recorded `usages`; every question says
which of those its Estonian came from. Marking is a stored index, a recorded sentence, or a string
comparison against a form the dictionary vouches for, in that order, and no provider is reachable
from `lib/assessment/`. A learner meeting this app for the first time cannot tell when the machine
is the one that is confused, so the machine is never the judge. The overall level follows the
**weakest** measured skill, because a CEFR level is a claim about everything you can do at it.
(ADR-020.)

**A level read off two questions is a coin toss, and every number in the paper is measured now.**
Nineteen questions at two per band per skill was the whole paper, and `PASS` is two thirds, so a
band of two demanded a perfect score and one lucky guess out of four options moved it from half to
full. Simulated against papers built from the shipped dictionary, that placed **43%** of learners
at their own level and put **57% of them below it**, which is what a check that does not feel like
your own Estonian is. It is eighty questions now: six reading and six writing at each band, three
listening, one spoken, and the placement runs 97, 98, 93, 85, 80 and 72 percent from pre-A1 to C1.

Three findings sit under those numbers and only the first is the obvious one. **Two thirds has to
be a score somebody can reach**, so a band size is a multiple of three, and 4 per band measured
worse than 3 because it demands three quarters. **Writing is the noisiest skill**, since its
answers are typed and nothing puts a floor under a band the way four options do, so at a fixed
eighty items spending them on writing beat spending them on listening or reading. And **the
overall level is the weakest of three skills**, so noise anywhere lands on the result, which is
why raising reading alone took it only to 52%.

Two scoring rules changed with it. The level is **the highest band passed consecutively from the
bottom**, which is the rule published placement tests use and was not the rule here: the old one
climbed past any band between half and two thirds, so A1 at 100%, A2 at 55% and B1 at 70% reported
B1 over a band the same screen printed as failed. And the floor is **the band below the lowest one
asked**, not always `pre-A1`: writing sets no A1 question and structurally cannot, so a failed A2
was being read as "below A1" on the strength of a band nobody had been asked about, on most
sittings. `session.ts` stops a skill one band past the first it was not passed at, which is what
keeps an eighty question paper at about fifteen questions for a beginner.

**Two numbers for one paper is how a finished sitting stops being stored.** `recordAssessment`
capped its posted arrays at a literal 60, written when the paper was nineteen, and the blueprint
grew past it: every sitting then failed `safeParse` while the runner, which computes the level in
the browser, showed the result anyway. The learner read their level and the hub said nothing had
ever been measured. It is `PAPER_SIZE`, the blueprint added up, and an invariant fails on a literal
coming back.

**A question is only as hard as its second best option, and three of the four were free.** The
check filled its wrong answers out of the whole dictionary in shuffle order, so a beginner asked
what `must` means chose between "black", "plastic bag", "narcomania, drug addiction, substance
abuse" and "user experience": two C1 nouns and a three-sense gloss beside a one-word A1 adjective,
every one of them crossable by somebody who has never seen an Estonian word. Over sixty pools drawn
the way `paperFor` draws one, 99% of the meaning questions carried at least one option a learner
could eliminate on part of speech, on a CEFR band two or more away, or on the number of senses in
the line. It is 19% now, and the count of questions that cannot be asked at all is unchanged at
zero, because `lib/questions/distractors.ts` **ranks rather than filters**: the candidates that
survive the caller's own test of what counts as the same answer are the same ones as before, and
this only decides which three of them are worth printing. A gloss is ranked on the course unit that
teaches the word, its part of speech, its band and the shape of the line, which is how "black" ends
up beside "white" and "grey" rather than beside a plastic bag; `lib/collections/syllabus/` supplies
the unit, and a word the course does not teach is ranked on the other three. A form is ranked on
how much of the stem it shares, so `toast` and `toasse` are offered where `tuba` used to be, and a
sentence on the words it shares with the answer, which is what makes it have to be read.

**The mock exam had the same fault and now reads the same table, which is why the table is not in
either of them.** `lib/questions/distractors.ts` is the one answer to what a wrong answer is worth,
and three callers ask it: the placement check, `lib/exam/paper.ts`, and `buildOptions` in
`lib/estonian/government.ts`, which decides what cases to offer against a governed one and is
shared by the exam and the government practice mode. That last one is the only thing still asking
for a case to be ranked, since the level check stopped naming cases in English, and it is a
question about a verb rather than about a form: what it needs is the scoring, so what came back
with it is `caseNearness` and none of the labelling that used to go with it. A case is ranked on
the cases answering the same question word, since `kus?` is answered by seesütlev and alalütlev
both, and osastav is offered against nimetav and omastav, the two other cases an object is ever in.
The exam was worse off than the placement
check in one way, because it had no test of what counts as the same answer at all: a deck holding
`auto` and `masin` could offer "car, automobile" against "car, machine" and mark a candidate wrong
for choosing the other one. Measured over 120 papers built from the shipped dictionary, 90% of its
meaning questions carried an option that could be crossed out on part of speech, band or shape,
against 16% now, with the same 802 questions asked. A spoken word was hidden among three drawn at
random, so 2% of those questions had an option spelled anything like the answer and it is 77% now:
`tõusen` is offered against `tõusin`, where it used to sit beside `teksti` and `munasid`. A gap in
a sentence keeps the rule it already had, that a form of the word being asked about outranks a form
of any other word, since the claim of that task is that the learner is choosing an ending; what
changed is that the strangers it falls back on when a word has too few forms are now the nearest
ones rather than the first three off a shuffle.

**Nearer options mean a stricter test of what counts as one answer, never a looser one.** Two
glosses sharing a content word are one meaning and cannot appear together, which is the rule that
was already there; what changed is that a word carrying no meaning of its own no longer counts as
shared, so "in the morning" and "in the evening" can finally be offered against each other, and
both sides fall back to the full reading the moment either is left with nothing, or "one" would
empty out while "one, single" kept `single` and the two would be offered as different answers. A
sentence is rejected on **containment** rather than on one shared word, because sharing a word is
what makes two sentences worth reading and containing one is what makes them both right, and a
sentence is never offered against another sentence recorded under the same headword, which is the
likeliest pair in the dictionary to be two ways of saying one thing. And a signal that marks an
option as familiar has to be a *match* rather than a bonus: rewarding the first-year cases outright
put three of them around every answer, so a question about kaasaütlev became one odd option among
three the learner had met, which hands back the elimination the ranking exists to remove.

**`Assessment` is append-only, like `Review`.** A sitting is written once when it ends; a later
check is another row, and there is no update path. The one deletion path is the same one `Review`
has, somebody erasing their own account, because the promise on `/privacy` outranks the append-only
rule. It is also the third exception to "progress is derived", after a personal best and a shield
date: a measurement of answers that were never cards cannot be recomputed from the review log.

**A mock exam is assembled, marked mechanically, and says where it stops imitating.** The state
examines at A2, B1, B2 and C1, and `docs/16-exam.md` cites every figure the app repeats about it.
Three separations hold the feature up and all three have an invariant behind them.

The **paper is assembled, never written**: `lib/exam/paper.ts` hides, shuffles and surrounds
sentences Ekilex recorded, the same latitude `cloze.ts` takes, and nothing more. It is deterministic
in (level, seed, pool), which is what lets a reload mid-paper return the same questions and lets the
server rebuild the paper to mark it.

The **marking is mechanical**: every mark in `lib/exam/score.ts` is a comparison against a form the
dictionary vouches for, so that module imports no provider and opens no socket. Anu reads a
composition back afterwards, on request, and her note carries no marks and is withheld whole if it
quotes a form the learner did not write. A model deciding whether somebody is ready to book a real
examination is the exact judgement it is least qualified to make.

The **imitation declares itself**. Each task names the official task it stands in for and the
briefing prints it; the A1 and C2 papers are labelled "not examined" wherever they appear, because
the state sets neither; and the spoken part says on every screen that the learner is marking
themselves. Two of those tasks stand in for a **marking criterion rather than a task** and used to
claim otherwise: the real writing part is two pieces of writing, `teate koostamine` and then a story
or a personal letter, and grammatical accuracy is what an examiner marks inside them. This app may
not mark Estonian prose, so it asks the accuracy directly and now says "not a task the real paper
sets" against both, which is the difference between a defensible substitution and a candidate who
rehearsed the wrong half of the part.

**The conditions are the paper too, and four of them were missing.** A recording plays twice and no
more, counted on the question rather than on the button so the dictation's slow play cannot hand out
four; a listening task opens with a pause to read the questions; a part **closes** when its clock
goes, inside one `fieldset` rather than a flag threaded through eleven question shapes, because the
screen used to say the paper would be taken away and then let you carry on writing; and the spoken
part follows a break, since running it off the back of ninety minutes of writing tests stamina
rather than speaking. The clock announces at five minutes and at one, and does **not** sit in a live
region, which had it reading a number a second at a screen reader for fifty minutes.

**An unfinished paper is kept on the device**, because "nothing is saved until you hand in" was an
honest description of losing three hours of B2 to a reload. `app/(app)/exam/[level]/resume.ts` holds
answers and deadlines and never a mark or a question, the deadlines are absolute so shutting the tab
does not stop the clock, and /privacy accounts for it. What the two written tasks are marked on is
shown live from `lib/exam/written.ts`, which is the marker's own function: a chip that ticked a word
off by a rule of its own would promise a mark the server was not going to give. It is a module
rather than an export of `score.ts` because the sitting screen may not import the marker at all. **What the dictionary cannot fill is reported, not dropped**: a task states its
shortfall, a part is marked out of what was actually set, and a part nothing could be set for is
left out of the total rather than scored zero. Scoring it zero would fail a candidate for a gap in
the dictionary and would trip the one clause that is supposed to mean "you did not attempt this".

The client never sends a mark, only a level, a seed and the answers. A result anybody can type is
not a measurement. (ADR-022.)

**A confidence figure carries the evidence behind it.** `lib/exam/readiness.ts` predicts a score per
part and then a chance of clearing sixty percent, as a logistic whose spread widens as the evidence
thins, under a ceiling set by how many reviews are behind the claim: 60 under 150 reviews, 85 under
800, 97 above. A learner with ninety reviews may not be told the app is ninety percent sure of
anything. The tier is printed beside the number, and a paper actually sat outranks the model for its
own level. **The placement check of ADR-020 is the only source that reaches listening and speaking**:
a `Review` row carries no note of which mode wrote it, so a dictation and a flip of the same card
are one row in the log, and without a sat check the hub can only say it has nothing on two of the
four parts. Its per-skill levels are blended in at two thirds, never substituted, because it is ten
minutes long and says so. Its speaking figure is the learner's own rating and is never read as a
level (ADR-018).

## More than one session works this repository at a time

**Read what landed before you merge, not just the conflict status.** On
2026-08-29 three sessions were open at once. Two of them fixed the same bug in
the same two files twenty minutes apart: the demo fixture produced no card with
enough lapses to flag, so the sticking-points panel was empty and the checks
behind it never ran. Both fixes were correct. A clean three-way merge is
exactly what you get when two people build the same thing in different lines,
and that is the case that hurts, because nothing fails and you end up with two
of everything.

**A clean merge is not a merge that lost nothing, and `npm run audit:merge` is
how you find out.** Twice in one afternoon a merge resolved with no conflict at
all and silently reverted somebody's work: a `tap-tint` hover main had added to
two of the three weakest-case panels a branch was extracting into one component,
and an inset ring on Today's week strip that exists because mint on that card is
2.52:1. Git had no reason to ask in either case, because one side changed lines
the other side had moved or deleted. The script asks the question mechanically:
for every line the other side added since the merge base, is it still in the
tree? It reports rather than fails, because a branch that deliberately deletes a
file the other side edited is doing nothing wrong and a check that fails on that
is a check people learn to skip. Run it after every merge that touched files
both sides own. It is the marker-grepping ritual below, done by a machine that
does not have to remember which markers.

When somebody else's work overlaps yours, one of them has to go. Keep the one
that is safer or more precise and **delete the other outright** rather than
leaving both: their fixture entry reaches four lapses in twelve reviews and
says in one entry what two of mine said, and their assertion requires the
sentence to name a count where mine only asked that a word appear somewhere.

It happened a third time the same day, on `lib/tutor/provider.ts`, and that
one is worth reading because the rule as written did not fit it. Two sessions
fixed the same two faults within the hour: a 402 pasting raw OpenRouter JSON
at the learner, and the catch-all under it doing the same for every other
status. Theirs was better in two ways, `reportError` with the provider, model
and status as structured context where mine was a `console.error`, and a 402
thrown as a 402 rather than laundered into a 502 to make it walkable, so
theirs was kept and mine deleted. But "keep one and delete the other" is only
the whole answer when both are the same shape. Mine also carried a clause
theirs had no reason to: a 404 is walkable between models of one provider,
which matters only because this branch made the default a chain of free
models, and a free model is retired without notice. That clause survives on
top of their version. Read what each side is for, not just which is better.

**Then audit what taking their side reverted.** Resolving thirty-nine
conflicts in their favour silently undid four things on this branch, and only
two announced themselves: the typechecker caught the tutor naming the
configured provider instead of the one that answered, and lint caught a script
importing the portable launcher and then calling the sandbox path anyway. The
other two were silent, because a re-run copy sweep turned an em dash meaning
"no value" into a bare comma in a table of forms, and `readerCopy.test.ts`
passes on that happily: a comma is not a dash. Grep the markers the branch owns
after any merge that touched its files. `NO_VALUE`, `formatHour`,
`DASH_SEPARATED`, `launchChromium`, `baseUrl`, `scroll-host`, `bottom-notice`,
`useDockClearance`, `PULL_REFRESH_EVENT`, `ProseStream`, `openWithFallback`,
`overflow-wrap`, `svg.lucide`, `useStickToBottom`,
`x-model-provider`, `isSameOriginMutation`, `checkRateLimit`, `markPaper`,
`rawAvailable`, `absentParts`, `standsFor`, `stageOf`, `SuggestFix`, `groupKeyFor`,
`requireAdminId`, `upsertLexemeWithForms`, `PLACES`, `QUICK_MODES`, `naturalSentence`,
`PAPER_SIZE`, `bandsAround`, `aroundFirst`, `recordCourseLevel`, `decisiveItems`,
`VOICE_RULES`, `findTells`, `useNavMarker`, `travelKeyframes`, `--nav-marker-bg`,
`FOUND_HOURS_PER_WEEK`, `appHoursPerWeek`, `readIdentity`, `boundedTransport`, `gapFrom`,
`explainGap`, `ESTONIAN_WORD`, `formatDuration`, `alsoGoverned`, `teachingSentence`,
`splitOnForm`, `inTeachingOrder`, `SELF_GRADES`, `DrillLink`, `lockDeck`, `caseReviewsFor`,
`alsoRight`, `shownForms`,
`PrefetchLink`, `lemmasByCardLexeme`, `dictionaryLemmas`, `decoyGlosses`, `forgetSettings`,
`staleTimes`, `BadgeCheck`, `letterVars`, `leanFor`, `LetterTile`, `letter-key`, `derivedVerbForms`,
`conjugatedForms`, `pres1sgFrom`, `useAudioPrefs`, `fetchClip`, `playFeedback`, `VOICES`. Most of them now
have an invariant behind them; that list is what to check when adding one.

## Commands

```
npm run setup            # install + create db + seed (first run)
npm run dev              # dev server
npm run typecheck        # tsc --noEmit
npm run test             # unit tests (Vitest), hermetic: no database, no network
npm run test:db          # integration tests, needs Postgres in DATABASE_URL
npm run test:invariants  # the rules in this file, asserted
npm run audit:glosses    # re-check every built gloss against Wiktionary (--write applies)
npm run audit:pos        # re-check every built part of speech the same way (shares the page cache)
npm run audit:verbs      # derive every verb's present, negative, conditional and imperative, and compare with Ekilex
npm run audit:merge      # after merging: what the other side added that is no longer here
npm run check:secrets    # fails if a credential reached the client bundle
npm run db:seed          # reload the built-in dictionary
npm run harvest          # re-ask Ekilex for the syllabus vocabulary (cached, needs EKILEX_API_KEY)
npm run demo             # two months of sample history, for looking at the charts
npm run test:e2e         # every browser suite, needs the server running
npm run test:browser     # the newer browser suites: routes, modes, offline, scanning, suggestions, a11y

npm run test:browser     # the newer browser suites: routes, modes, exam, offline, a11y
npm run test:mobile      # the phone, measured; needs the server running
npm run test:containment # text and icons inside their boxes, measured; needs the server running
```

With no Supabase keys the app runs as a single local learner (ADR-013), which is what makes the
browser suites possible without driving a Google sign-in from Playwright.

**Reloading a deployed dictionary is a button, and it is the one workflow that reads a secret.**
`.github/workflows/seed-production.yml` runs `npm run db:seed` against the deployment, by hand,
after somebody types a word into the confirmation box. `ci.yml` says of itself that nothing in it
maps a repository secret into a job, so a workflow file cannot become a way to read one; this file
is the exception and keeps what it can of that, being `workflow_dispatch` only and mapping the
connection string into the three steps that need a database and no others. It exists because a
deployment seeded before the harvest and the built expansion keeps saying it has 360 words for as
long as nobody reseeds it, and the person who can see that number is rarely the person with a
checkout and the production password. It never pushes the schema: the deployment's own build does
that, and a workflow that can reshape the production database is a bigger thing than one that can
reload the dictionary inside it.

**One character is still text, and the contrast pass was skipping every one of
them.** `test-design.mjs` measured a text node only at `length > 1`, so no
single-character run was ever checked, and the one that mattered was exactly
that shape: the tick inside a reviewed day on Today's week strip, white on mint
at 2.52:1, sitting in the app unseen by the suite whose job is finding that. It
measures them now, and the exemption is `data-ornament` in the markup rather
than a length: a 92px step numeral in a hue's own tint, behind a card that says
the same thing in words, is decoration and has to say so. `aria-hidden` cannot
stand in for it, because the tick carries that too and is still the thing a
sighted reader looks at. The fix on the other side was `--on-mint`, since
`--mint-ink` is the ink on mint's *tint* and there was nothing for its solid
fill (docs/14-design-system.md §"Every hue has an ink").

**A suite states its preconditions; it does not inherit them.** `letterBar` is a
stored preference that decides whether a control is drawn at all, so a database
where any earlier suite walked through first run and answered "I have them
already" draws no letter bar, and `e2e.mjs` then spent thirty seconds waiting for
a button that was correctly hidden before failing in Playwright's words rather
than in ones that name the cause. CI escapes it only by seeding fresh, which
means the one place it bites is somebody's own machine, in their own order, with
the least context for reading it. `scripts/lib/prefs.mjs` holds `ensureLetterBar`
and `requireLetterBar`: set the answer you depend on, and fail in seven
milliseconds and in words when it is not there. The same rule covers data and
not only preferences: `/review/government` builds its questions out of the
learner's deck and correctly asks nothing when no verb in it carries a recorded
government, and `smoke-interact.mjs` met that by clicking a button that was not
there, which is thirty seconds of waiting, a throw, and the eight checks after
it never running, all reported as one failure naming a regex. It reads the
precondition and waives its three checks with the reason on screen instead. Cleaning up after yourself is the
weaker version of the same idea, since it only works while every suite remembers
and cannot help the first run on a machine somebody has been clicking around on.

**A suite that writes to the shared dictionary invents the word it writes.** `Lexeme` is unique on
`[lemma, pos]` rather than on the lemma, deliberately, because `hall` is a noun meaning frost and an
adjective meaning grey. So a fixture that ticks a word the seed already holds does not collide with
it, it sits *beside* it with no forms behind it, in a dictionary every later suite shares.
`test-containment.mjs` ticked `tuba`; `e2e.mjs` opens with four checks on `/dictionary?q=tuba` and CI
runs it two steps later on the same database. The cost was never one wrong check, it was a suite that
threw on its first wait and reported a Playwright timeout with none of its twenty-one checks run.
`test-scan.mjs` and `test-suggestions.mjs` had each worked this out alone and each carries an
invented string; the invariant reads the built dictionary and fails on a third suite that does not.
Spell it so nobody could mistake it for Estonian, because the app writes none (ADR-005) and neither
do its fixtures.

**An agent branch does not deploy, because the account has a hundred deployments a day and there
is only one production.** Vercel's free tier counts them across the whole account, and a session
that pushes eight times to a branch spends eight of them; on 2026-08-30 the hundred ran out in an
afternoon and every push after that answered `api-deployments-free-per-day`, which is the same
answer production would have got. `vercel.json` turns preview deployments off for `claude/*` and
nothing else, so `main` deploys exactly as it did and the cap is spent on the thing people visit.
Upside Lab has the same two lines for the same reason and reached them the same way.

The cost is real and worth stating: a `claude/*` pull request has no preview URL, so a change
somebody wants to *look at* has to be run locally or pushed to a branch named something else. That
is the trade, and it is the right way round while the alternative is production not deploying.

**A suite that ran nothing looks exactly like one that passed, so every suite
counts.** `scripts/lib/checks.mjs` gives each one a `check` that tallies what
it reached and a `done` that refuses to pass below a declared floor. Two
faults made that necessary and both are in this repository's history:
`test-design.mjs` hardcoded a port, so anywhere else it threw on its first
navigation, before check one, and printed no FAIL line at all; and
`test-teaching.mjs` gates five checks on the sticking-points panel having
rows, so when the fixture produced none the gate failed honestly and the five
behind it were skipped in silence, one reported failure covering six unlooked
things. The floor is **the count CI reaches**, not the minimum across every
state a database could be in: a floor low enough never to complain is a floor
low enough to miss what it was built for, which was measured by deleting a
block and watching a floor of 30 wave 34 checks through. Against a thin local
database a suite now says so, which is worth hearing. Raise a floor when you
add checks; never lower one to make a run pass.

**A floor is only honest while the count is a property of the code rather than
of the machine.** It was not. `test-teaching.mjs` was measured on a box whose
environment carried `EKILEX_API_KEY` and `OPENROUTER_API_KEY`, so dictation
built a real round and Anu had a text box, and its floor of 38 counted both.
CI has neither key, ran the same correct code, came in at 34, and the floor
read that as a block having stopped running. Lowering it was not available:
the number that lets CI through is the same number that lets a deleted block
through, which is the fault the floor exists for. `absent(n, why)` is the
third outcome beside pass and fail: it lowers the target by exactly n, prints
the reason and the arithmetic, and leaves a block that stops running still
tripping the floor, because nothing waived it. Waiving more than half a suite
fails outright whatever the reasons say. It replaced a `console.log` with the
word SKIP in it, which said the same thing to a person and nothing at all to
the tally, and an invariant now fails on that shape and on a waiver with no
number behind it.

Both of the checks that failed there were **real gaps that only a keyless
deployment reaches**, which is the default one. The dictionary's case table
linked to the grammar reference from the forms retrieved from Ekilex and not
from the derived table, so without a key that table was a dead end; and Anu's
no-key empty state dropped the question a review card had just handed her, so
the key was the price of even seeing what you were about to ask. Neither was
reachable on a machine with the keys set, which is the argument for running a
suite in the state a stranger installs into.

**And a waiver that fires on every possible run is a hole wearing a waiver's clothes.** That
is the one thing the machinery above cannot see: `absent(n, why)` states a fact about *this*
run, and it never asks whether some run exists where the fact is false. `test-assess.mjs`
waived sixteen of its forty-two checks every time it had ever been run, on any machine and in
CI, because `/start` correctly redirects anyone holding `onboardedAt` **or a single card** and
CI built the demo deck before it started the server. The reason was true, it was well under the
half that fails a suite outright, and nothing complained. So the wizard, the four screens a
learner meets before any other and the one place this app asks for anything, was verified by
nothing at all. All nineteen of those checks pass; they had simply never been asked. The
fixture is built *after* that suite now, which is a fact about the order of two lines in
`.github/workflows/ci.yml` and therefore asserted, because an ordering that matters and lives
only in a comment is an ordering that drifts. When you write a waiver, say which state would
lift it, and then go and find out whether anything ever reaches that state.

**The other permanent waiver was worse, because its reason was false.**
`scripts/test-containment.mjs` waived ten checks, five at each width, saying the deck had nothing
due. The deck had forty cards due. A review card is asked as a flip, as multiple choice or as
typing, decided per card, and the only thing that suite knew how to press was "Show answer". So
the revealed layout, which is the one with the most in it (the answer, the note about why this
card, and four rating buttons across a 360px phone) was never measured once, and the line saying
why sent whoever read it off to seed a database that was already seeded. A waiver that misnames
its own cause is worse than a failure: a failure sends you to the code.

`smoke-offline.mjs` had already found this and written it down, that a driver knowing only the
flip "silently stops testing anything the day the default changes. It did." Four more suites had
each worked it out separately, and `test-teaching.mjs` had two shapes of the three and got the
third by accident, its `3` keypress landing on the third option rather than on a grade.
`scripts/lib/review.mjs` is the one definition and it **reveals without grading**, because the
containment suite runs third and everything after it reads the same deck. An invariant fails on a
suite that presses the flip and knows no other shape, and on the helper learning to grade.

**A failure may not misname its cause either, and that is the same rule pointing the other way.**
`/api/export` allows six backups an hour, because it reads every owner-scoped table.
`test-restore.mjs` read the body and not the status, so the seventh run in an hour, which is an
ordinary afternoon of working on this, said `export produced a backup (0 KB)` and stopped. The
export was working perfectly. That line sends whoever reads it to the one part of the app the
suite exists to protect, and the answer was the clock. It reads the 429 now and says the
allowance is spent and that restarting the server clears it, since the limiter is per instance
and in memory. Still a failure rather than a waiver: a run that could not take a backup has not
checked backup and restore.

`scripts/test-containment.mjs` is the one that looks inside a card rather than at the page. It
walks every text-bearing element, every icon and everything that arrives with a width of its own,
on **every route the app has** at 360 and 1280, plus the landing page with its disclosures open
and a paper actually being sat, and asks four things: whether anything is cut off by an ancestor
that clips, whether anything is drawn outside a border somebody painted, whether anything is drawn
on top of anything else, and whether any icon is drawn at other than the size it declared. A
scroller ends the first question rather than answering it, and so does a `truncate`, because both
are a way out that somebody chose. Then it asks all four again with the text swapped for text of
the same length that cannot break, which is how it caught the streak circles 2px over the card on
a 360px phone and the backup picker 58px over its own.

Every route rather than a chosen spread, because the first version of the list was twelve screens
picked for carrying text from somewhere other than a designer, and the third fault it found was on
a printable worksheet nobody would have thought to check. A route costs about two seconds and a
route left out is a screen where the whole rule is unenforced. The count of things on a page is
part of each pass for the same reason: a route that rendered its 404 has a heading and a button
and passes everything on the strength of having nothing to look at, which is exactly what
`/grammar/topic/rektsioon` did for one run before the count said so.

**Three screens need a row before they can be visited**, so the suite makes them: a classroom, a
paper sat and handed in, and a page scanned with the model stubbed the way `test-scan.mjs` stubs
it. The classroom is the one worth knowing about. In local mode `/class` deliberately replaces the
create and join forms with the reason there is nobody to share with, so that screen is unreachable
by driving the app and `scripts/demo-data.ts` lays one down instead. Without it the suite would
waive twenty checks on a real screen for want of a fixture, which is the sort of hole a waiver is
supposed to report rather than create. Each maker has a time budget and says what it did, because
this runs before the first check and a suite that dies before its first check prints nothing at
all.

**And the states a route does not arrive in**: the command palette, Anu's panel, a review card with
its answer shown, and the landing page with its disclosures open. A modal drawn over the page is
not a fault and is not reported as one, since the hit test skips anything under something `fixed`
or `sticky`; what is asked is whether the modal contains its own contents.

The fourth question is asked by hit-testing the letters, not by comparing rectangles, and that was
arrived at the hard way. Sibling rectangles report a wrapped inline as one box spanning every line
it touches, and an inline whose font changes mid-run (any Estonian prompt with an arrow in it) as
overlapping fragments; excluding inline elements clears both and leaves the check blind, since the
painted text here is nearly all inline. What it excludes now is what a reader cannot see anyway or
what is layered on purpose: text past an ellipsis, an absolutely positioned ornament, and anything
under the fixed bar or the paper's own sticky header. It was made to fail once, by covering a deck
row in the browser.

`scripts/test-mobile.mjs` is the phone measured rather than eyeballed, at 360, 390, 430, 768 and
1280: no horizontal overflow, nothing fixed carrying a filter, the bar's clearance published on
phones and gone above the breakpoint, every target clear of 44px, and the pull gesture driven for
real. `scripts/test-invariants.ts` asserts the rules above, and CI runs it, which is the only
reason it will stay green: Upside Lab kept one that nothing ran and it drifted to twenty-three
failures before anybody counted. Assert the rule, not today's markup.

`scripts/test-assess.mjs` sits a whole level check in a browser, question by question, and checks
the things a unit test cannot see: that every question says where its Estonian came from, that the
listening section abandons itself rather than dead-ending when the speech service is unavailable,
that the result names how few questions it came from and refuses to call itself a certificate, and
that first run reaches the plan before it asks anybody to pick a single word.

`scripts/test-scan.mjs` is the paper path driven end to end, with the model the only thing stubbed:
the picture leaving the device, the confirmation list, a ticked word becoming a card, and the review
session then asking about it. It needs a provider key to be *present* on the server (any string will
do, since the route it would authenticate is intercepted), because with none configured the scan
page correctly offers no camera.

`scripts/test-exam.mjs` sits a whole paper end to end at two levels: the briefing's disclosures, the
per-part clock, one question of every shape, handing in, and the result's per-part breakdown and
answer list. It also checks the hub's confidence figures carry an evidence tier, because a
percentage whose basis is not stated is the one thing this feature must not ship.

`scripts/test-suggestions.mjs` drives the loop that starts at a dead end and ends in the shared
dictionary: a report sent from a failed search, accepted in the review queue, and read back on the
entry, then a correction to that entry sent and accepted the same way. Every part of it is in a
different process, so nothing smaller than this can say the loop closes.

`scripts/test-modes.mjs` covers the path, the practice modes, typed answers, undo and the command
palette. `scripts/test-teaching.mjs` covers the half that teaches rather than tests: the grammar
reference (including that every form on it says where it came from), dictation, the printable
worksheet and its answer key, the retention reading, and the shortcut sheet.
`scripts/smoke-offline.mjs` is the one worth keeping green above all: it pulls the plug, grades,
reloads with the network still down, and checks the queue drains when it comes back. It was green
for a while without grading anything. Its driver filtered the multiple-choice options on
`/^[1-4]\S/`, and an option reads "1", a newline, then the word, so the pattern could not match:
the function fell through, returned false into a discarded value, and the outbox read 0 at every
step. Two of the three checks around it are satisfied by 0, and the third is satisfied by the
offline banner, which is up whether or not anything was graded. It answers with the key the card
itself advertises now, and asserts a card was answered before asserting anything about the queue,
because every check after that one reads as an app fault when the answer is no.

**And it now runs in CI, which is the only reason any of that is worth writing down.** It did not,
and it was red on main for an unknown length of time with a real fault behind it. The page cache is
filled as a side effect of the worker serving a navigation, and a worker does not serve the
navigation that installs it: a first visit fetched the page, the worker installed behind it, and
`clients.claim()` took over a client whose own page had never been seen. Offline and reload at that
point and there was nothing to match, so somebody who opened the app for the first time on the way
to the bus stop got "this screen needs a connection" for the whole journey and a working app on the
way home. `warmOpenPages` caches the pages already open at the moment the worker takes over. Every
open window rather than a hardcoded `/review`, because the promise is "the page you were last on
opens again" rather than "one route is special".

CI runs typecheck, lint, the unit suite, the invariants, integration tests against a real
Postgres, the production build, the credential scan, the phone and the offline smoke test. It is the enforcement behind
the rules above: do not add a rule without one.
