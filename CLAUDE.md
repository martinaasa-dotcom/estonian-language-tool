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

**Knowing a word exists is a different job from teaching it, and thirty-two requests buys the
first.** The dictionary ships 5,363 entries and every other Estonian word came back as "nothing
found", which is the same blank a learner gets for a misspelling and for an English word. That was
reported plainly and the example was the app's own copy: `uudishimulik` appears on screen in
Kodukeel and searching for it in Kodukeel found nothing.

Harvesting the language properly is one request per word, and Ekilex holds about 261,000 Estonian
headwords: a quarter of a million requests against a free service the Institute runs for the good of
the language, for a convenience. Ekilex's search takes a wildcard, so `a*` returns every word
beginning with `a`, and thirty-two letters is thirty-two requests for the whole list.
`scripts/build-wordlist.ts` is that, and `KnownWord` is 154,995 rows of one column.

**It is not a dictionary and must not be made into one.** It holds a word and nothing else: no
forms, no gloss, no level, because the search that returns it returns a headword and an id and
asking for the rest is back to one request each. `Lexeme` stays the dictionary, the thing a learner
can study, and this answers the one question a search screen could not: *is that a word*. That turns
out to be most of what was missing, because it tells three dead ends apart that used to render
identically. A real word with no entry says so and the live lookup fetches it. A near miss gets the
spelling (`lib/dict/known.ts`, prefix-indexed candidates ranked by edit distance). Neither gets the
blank, quickly, without spending two requests on somebody else's service to reach the same answer.

Three filters keep it honest and each is a decision. **The general datasets only**: Ekilex hosts a
hundred specialist term bases beside the general dictionary, and `esterm`, `mea` and the rest are
95,000 words a learner will never search and would only meet as noise in a spelling row. **Single
words**, because the search is given one. **Nothing with a capital in it**, which loses the place
names and is the right side to err on, since an index full of two-letter abbreviations makes every
typo look like a word.

Reference data like `Lexeme`, so it is in no backup and no erasure: there is nothing personal in a
list of Estonian words. Inserted and never updated, outside `--only-if-empty`'s early return for the
reason `ensureSearchIndexes` is, because a deployment seeded before this has a full dictionary and
an empty word list.

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

**Ekilex numbers its homonyms, and the harvest used to take the first one in silence.** The
candidate loop returned on the first exact match whose forms fit and never looked at the next, and
87 of the course's 1,185 words have more than one. Six came back as a different word: `kohus` was
taught as "court" carrying the forms and eight sentences of the moral duty (`kohuse`, not `kohtu`),
`kaste` as "sauce" with the forms of dew, `iga` as "every" with the case table of `iga : ea`, age,
and `pidama`, the one A1 verb a learner needs for "ma pidin minema", with the past of the verb for
keeping a farm, so the conjugation card answered `pidasin` and marked `pidin` wrong. `WordSpec`
takes a fourth slot naming the Ekilex word id, which is a number rather than a word because this
file may not write Estonian either, and the five that were wrong are pinned. Unpinned ambiguity is
now printed at the end of the run, all 31 of them, with the ids to choose between: taking the first
is right for about eighty of them and dropping the lot to fix six would cut a fifth of an A1 unit,
so it is reported rather than dropped or hidden.

**And only two of the three gradation values are ever assigned, which is the language rather than an
omission.** `GradationType` allows `QUANTITATIVE` and `classifyGradation` has never returned it, on
any of the 5,363 entries the dictionary ships. Estonian's third quantity is not written down:
`kooli` the genitive and `kooli` the partitive are the same letters in the same order and differ in
how long the vowel is held, so a classifier reading principal parts as strings cannot see it, and
neither can a learner reading a page. What is spelled is the consonant centre changing, and that is
what the field records.

The value stays in the type, because it is a true category somebody editing an entry by hand may
want and `Lexeme.gradation` is a string column a future Ekilex field could fill. What may not happen
is a dataset claiming three where the data holds two: `lib/research/sections.ts` describes the
exported crosstab to somebody outside this project and named all three, so a researcher was told a
column takes a value no row has ever held. The two are paired by an invariant in both directions, so
the day the classifier learns to assign it the description has to catch up.

**A nominative -s that simply goes is an ending, not a grade.** `classifyGradation` counted it as
part of the consonant centre, so the chip on the dictionary entry and the hint on the flashcard
said `hammas` alternates "ms : b" and `ratas` "s : t", which are not patterns in the language, and
121 of the 133 entries labelled "s : ∅" were words whose only change is losing that -s: `kapsas`,
`kuningas`, `rahvas`, `taevas`, `kallis`. EKK keeps astmevaheldus, a change inside the centre,
apart from lõpuvaheldus, an ending that comes and goes. The -s comes off before the centres are
compared, so `hammas : hamba` reads mm : mb and `ratas : ratta` reads t : tt, and where peeling it
leaves exactly the genitive the word gradates in nothing. The peel **adds readings and never
removes one**: `mees : mehe` is s : h, `poiss : poisi` is ss : s and `viis : viie` is s : ∅, and
peeling those leaves the patterns nothing to match, so a peel that finds nothing falls back to the
whole word. 174 entries in the built dictionary were re-graded by it.

**One language per column, because a screen cannot mark what it cannot tell.** `Lexeme.notes` was a
bare `String?` and held two different things. `scripts/expand-seed.ts` put the further English senses
Wiktionary lists there, so `aadress` carried "email address"; `mapEkilexDetails` put Ekilex's own
Estonian explanation there, and `enrichFromEkilex` wrote it on every live lookup. So the first person
to look a word up with a key deleted the English from the shared dictionary for everybody, and the
entry rendered whichever survived in one grey box with no heading and no `lang`, next to five blocks
that all have one. A screen reader said the Estonian with English sounds.

`definition` is the Estonian one and `notes` stays the English. The two lines beside the overwrite
already knew better, since government is not replaced because a worked example teaches more and
sentences are merged rather than replaced; this was the odd one out. A row that already holds the
copy clears it, in the seed for every deployment and again on the next lookup, and the rule is
exactly the rows the old code made: where the two columns hold the same sentence, the note is that
copy. A real English note is never equal to an Estonian definition.

**A correction replaces what it supplied and leaves alone what it did not, and the shared upsert had
one column on the wrong side of that line.** `upsertLexemeWithForms` took a `notes` parameter and
wrote `notes: input.notes || null` in an update, and neither caller has ever sent one: the
add-and-correct form has no notes field and the suggestion queue passes forms and a gloss. So every
hand edit and every accepted report nulled the further English senses, in the dictionary everybody
reads, and correcting a typo in `aadress` deleted "email address" for the whole deployment. The
comment three lines below it already made the argument, about forms: replace only the principal
parts, because deleting the lot threw away what Ekilex supplied. The parameter is gone rather than
guarded, since a parameter nobody passes is not a feature, it is the bug's only door.
`lib/dict/edit.itest.ts` is where that is checked, beside the three faults it was written for.

**And a word Anu suggested is marked as a model's, which it was not.** `createLexeme` is reached
only from her vocabulary bridge, where a learner presses a button on a word she offered, and it
wrote the row down as `USER` with the sentence "Suggested by Anu, forms unverified" in `notes`. That
sentence was the only record of either fact. `AI · verify` is keyed on the provenance, so the chip
never appeared, not on the entry and not on the card whose answer had never been checked, which is
the one place ADR-005 cares about; and `enrichFromEkilex` refuses to touch a `USER` word, "hers, not
ours to overwrite", so the word could never be upgraded to real Ekilex forms either. Both turn round
with the label, and the tag goes away by itself the moment Ekilex answers, which is what "verify"
was asking for.

**And 1,359 Estonian definitions had been fetched and thrown away.** The harvest asks Ekilex for the
explanation of every course word and writes it into `prisma/data/harvested.ts`, and the seed wrote
none of them: `LEXEME_COLUMNS` marks `notes` as owned only by entries carrying its key, which the
phrases do and the harvest path never did, so the column was skipped for exactly the words that had
something to put in it. Measured before the fix: of the first 400 harvested words with a definition,
one row in the database carried any note and that one was English. `onlyWhenOwned` is a set rather
than a boolean now, tested on the column's own name, because a second such column is what made the
hardcoded `notes` visible.

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


**A meaning is given in the language the learner thinks in, and Ekilex is the one that gives it.**
Most people learning Estonian in Estonia already speak Russian or Ukrainian, and an app that can
only say `kohv` is "coffee" asks them to reach a word through the language they are least sure of.
Ekilex records the equivalents in `synonymLangGroups`, in the same response the forms and the
sentences come from, written by the same lexicographers: 1,367 of the 1,371 course words carry a
Russian one and 1,165 a Ukrainian one, and it costs no extra request because the harvest already
had the response. `Lexeme.translationRu` and `translationUk` hold them, `lib/collections/glossLanguage.ts`
is the choice, and Settings is where it is made.

**The English never goes away, and that is what makes this safe.** This chooses what is printed
*beside* the gloss, not instead of it: the authored English is the one column every entry has,
Ekilex records an equivalent for the course and not for the Wiktionary expansion, and a card that
hid the English would be blank on the words with no other. Where there is none, the entry prints
the English alone rather than a dash, because "we have no Russian for this word" is not worth a
line of somebody's card.

**No model may reach either column.** They are the one place in the schema holding a language
neither the app nor the person reviewing the code necessarily reads, which makes ADR-005 stronger
here rather than weaker: a wrong gloss looks exactly like a right one, and more so in a language
you cannot check. The files that may name the columns at all are a closed list, asserted, the way
`prisma/columns.ts` is a closed list of what the seed writes, and nothing on the provider chain is
on it.

**The words between the words are a request like any other, and a unit that was cut does not take
its vocabulary with it.** Fourteen A1 units of nouns, verbs and adjectives and not one for the
words every sentence is made of: nobody asking `kes?` or `millal?`, or looking up `täna`, `peal`
or `september`, found anything, in a dictionary of six thousand words. Eight units carry them now,
question words, pronouns, the adverbs of time, the postpositions, the months and the countries, and
then the conjunctions and the particles, appended after the fourteen so that the first three units
at A1, which is what first run builds a deck from, stay what they were.

**The first sweep missed the two commonest kinds and nothing noticed for two passes.** It went
looking for the words a learner would try to *look up*, and a conjunction is not a word anybody
looks up: `npm run measure:scenes` counted instead, and found that 13,458 distinct words in the
attested corpus could not be vouched for by any entry and appeared in 79% of every sentence a
lexicographer recorded. The commonest was `ja`, 1,507 times, which the course had never taught. So
`sidesonad` and `maarsonad` are the same request as the other six and were built the same way,
30 lemmas named and Ekilex asked, all 30 back with four attested sentences each and none dropped.
Reading the ranked list rather than the total is what made it right, because the list holds three
faults and only one is a missing unit: the untaught conjunctions and particles, the forms of
`olema` that are neither stored nor derivable, and the short pronoun forms and the simple past that
two rules above already say arrive with enrichment. A unit built off the total would have taught
`oli` as a headword. `docs/21-situations.md` §26 has the measurements and §27 what
building them turned up, which was three things nothing had been checking.

**A homonym was reported on one path out of two.** The rule that a homonym is resolved by a person
or reported, never guessed through, was written into the path that reads forms, and an uninflecting
word has none, so every adverb and formless pronoun in the course took the first Ekilex candidate in
silence. It reports now, and the fifteen words that added were already in the course, all of them
from the six units the seventeenth pass added. All fourteen checkable ones had taken the right
sense, which is luck rather than design: the rivals include the adjective for porous, a ship's
course, a remixed piece of music and the name of the allative case.

**Nothing had ever checked a course gloss.** `audit:glosses` and `audit:pos` both read the built
expansion; the harvest's English, which is the one authored column in the whole pipeline, was
checked by people reading Ekilex definitions one at a time. `npm run audit:senses` is the check and
it needs no key, because the evidence came back with the harvest and sat unread: `note` is Ekilex's
own definition of the sense an entry carries, so two course words with the same definition are one
meaning, and that reads two ways. Same gloss is a production card with two right answers; different
glosses mean one of them describes a sense the entry does not carry, which is the fault that put
"but rather" on `vaid`. It found twelve pairs, and then the rule turned out to be wrong.

**A production card accepts every word its prompt could be asking for.** The check above grouped by
Ekilex's definition, on the reasoning that two words the Institute calls one meaning are one card
with two right answers. A card knows nothing but its front: it is `translation`, its hint is `pos`,
and `checkAnswer` marks against the back, so two entries collide when a learner cannot tell which is
wanted, whatever a lexicographer thinks. Grouping on the prompt found **372 of them in the shipped
dictionary** rather than twelve, and every one was a card able to mark a right answer wrong.
`sameMeaning` was tried as the grouping and is wrong the other way, since it is built for "could
these be different answers to one question" and called `abi` "help" and `aitama` "to help" one
prompt. The fix is the illative's: every answer on the back, joined with the separator
`acceptedAnswers` splits on, so what the screen shows and what the marker takes are one string.
`lib/collections/senses.ts` is the rule, `lib/dict/facts.ts` caches which words share a prompt
because that is a fact about the shared dictionary, and `lib/srs/deck.ts` reads it once per build
rather than once per word. `repairProductionBacks` in `prisma/repair.ts` widens the cards already in a
deck, because fixing the builder alone would reach new learners and nobody else. It runs where
`applyPosCorrections` runs and for the same reason, before the `--only-if-empty` early return, since
a card built the old way only exists on a database that was already seeded. It may touch the back
and nothing else, never a scheduling column; it only ever widens, so the answer the card had stays
first; and its guard is `back = lemma`, which is the signature of a card built before the fix, so a
second run matches nothing.

Ekilex's definition is the **diagnosis** rather than the trigger, and what it diagnoses is worse
than a synonym pair: where the Institute gives two definitions, the gloss is not describing its own
word. Accepting both only makes such a card fair rather than right, so the eleven that were in the
course were fixed rather than pinned, and there are **none left**: ten now carry the Institute's own
definition of their sense rendered in English, in the house style the course already had for one
English word covering two Estonian ones. `iseloom` is "character (a person's)" beside `tegelane`,
"character (in a story)"; `leib` and `sai` had been "bread (dark)" and "bread (white)" all along.
`seevastu` is the one that took a different fix, because "on the other hand" was not a shared prompt
so much as the wrong translation: it is "by contrast, whereas". Shared prompts fell from 372 to 362,
and `senses.test.ts` now asserts the flat claim rather than keeping a list, since an empty exemption
list with two tests round it is the parking space every exemption list becomes.
`ning`, `vaid` and `enam` were dropped for a day to avoid three of the twelve and are back, because
deleting three of the commonest words in Estonian to dodge a fault the dictionary had 372 of is one
unit paying for everybody.

**And the Institute says "synonym" in two ways, so a check reading one of them invents work.**
Comparing two definitions as strings finds the pair that disagrees and also the pair that agrees in
different words. Where Ekilex has nothing to add beyond naming the neighbours, its definition *is* a
list of them: `teravmeelne` is "vaimukas, nutikas, leidlik" and `vaimukas` is "teravmeelne, ootamatu
ja leidlik". That was the eleventh entry on the defect list, and it was asking somebody to invent a
distinction Estonian does not draw, which is the one repair worse than leaving a gloss alone. The
rule is **mutual** naming and that is the whole of why it is safe: a definition mentioning another
word means nothing on its own, since `konkurents` is defined as a `võistlus` for supremacy and is
not a contest, and `põhjendama` ends "seletama või `õigustama`" and is not self-defence. Measured
over the shipped dictionary, one-way naming picks up both of those and mutual naming picks up
neither, matching exactly one pair in the whole file. The boundaries are written out rather than
left to `\b`, which is ASCII: a space and an `õ` are both non-word characters to it, with no
boundary between them, so the obvious spelling misses the words this language is made of.

**And Ekilex's own part of speech was being discarded**, so a deliberate coarsening could not be
told from a mistake. `ekilexPos` records it. The table of legitimate coarsenings was set by
narrowing until something honest complained rather than widening until nothing did, and with it
written down the course's label and Ekilex's agree on all 1,404 words. `PRONOUN` is a part of speech for it, harvested as a nominal
because it declines like one (`kes`, `kelle`, `keda`), and a pronoun with no singular (`meie`,
`nemad`) is kept the way an adverb is, attested and formless, rather than dropped.
`lib/collections/syllabus/retired.ts` is the other half: the ten C2 units were cut in §19 of the
status doc with the note that their 170 words stay in the dictionary, and the harvest reads the
syllabus, so the first re-run after that cut would have quietly taken them out of the seed. They
are a request list of their own now, in a unit's shape, read by the harvest beside the units and
listed by no screen.

**What it costs to run is published, and every number on that page says where it came from.**
`/funding` answers the question three kinds of funder and one learner ask from different
directions: a ministry wants to know it is not underwriting a margin, a university wants to know
what happens when the money stops, a company's community budget wants the number to be real and
small, and somebody using a free app wants to know what is being sold instead. Nothing is, and a
page that only asserted that would be worth less than one showing the bill.

**There is one list, and it is `lib/funding/services.ts`.** What the app runs on, what a reader is
told it runs on, and what appears on the bill were three lists in the first version: a catalogue in
one module, hand-written line functions in the cost model, and whatever the page had been told
about. Adding a service meant remembering all three, and the one certain to go stale is the bill,
because nothing fails when a line is missing from a total. It simply comes out lower than the
truth, which is the worst way for a page like this to be wrong. A service now declares what it is,
who runs it, what a learner loses without it, the variable that switches it on, where its price
came from, and a `bill()` that says what it costs at a given size. Adding a new tool is one entry:
`model.ts` maps over the registry, and the page, the chart, the ladder and the totals all read it.
Asserted, both that the bill is generated from the registry and that no screen singles a service
out by id.

**Nothing anybody bills for is counted as free.** The first version modelled a free tier for the
host and one for the database and picked between them by traffic, which described a deployment
nobody runs: a free plan pauses when nobody is on it, forbids commercial use, and hands out an
allowance that goes the week somebody launches. What it produced was a page saying this app costs
nothing at a hundred learners, which was cheerful and wrong. Every vendor is on the plan a real
deployment is on.

**And what is given is credited, never priced.** Ekilex, Wiktionary and TartuNLP are public
institutions that decided this work should be available, and they ask for nothing. Pricing them at
a commercial equivalent and adding it to the total was tried and reverted: it turns a thing to be
grateful for into a line on an invoice nobody sent. So a service is **charged**, or **inside
another charge** (the news feed rides on a function already paid for), or **somebody else pays**
and the page says who (the learner's own phone), or it is **given**, in which case it is named with
what it provides and the licence it comes under and appears in no total. `wouldCostUsd` is the size
of the gift rather than a charge, so the page can show the scale of what is handed to this app
without billing for it, and an invariant fails on a `given` service that grows a `usd` or on a
total that reads the credit.

**Two lines are billed in euros and the rest in dollars, and every price is net of VAT.** The
operator is in Estonia, the tooling and the domain are billed in euros, and Vercel, Supabase,
Resend, Sentry and Amazon bill in dollars, so there is no arrangement where one currency is native
to everything. The model runs in dollars, a euro line carries its euro figure, and the rate is the
European Central Bank's own reference rate with the day it was published. VAT is on none of them,
because that is how every vendor quotes its own price: putting it on one line would make the bill
inconsistent rather than more complete.

**Three kinds of number, kept apart, because they are not equally solid.** `MEASURED` in
`lib/funding/facts.ts` was taken off this repository on a stated day and each entry carries the
command that produced it, so a reader who doubts one can re-run it: `pg_total_relation_size` after
a seed, 80,000 rows from `scripts/load-fixture.ts`, `curl --compressed` against a production
build, one request to TartuNLP read back off its WAV header. The vendor prices are somebody else's
and carry the page they came off and the day it was read, because they date faster than anything
else here. `ASSUMPTIONS` is everything left, on the page in full, each with the reason it is that
number. Keeping the third list short and visible is most of the honesty: burying "how many pages
somebody opens in a sitting" inside the arithmetic hides exactly the number a reader would want to
argue with.

**The model line reads the app's own ledger rather than a number of its own.** It is the one line
that could run away, and the app already answers it twice a second: `lib/usage/pricing.ts` says
what a call of a given shape costs and `lib/usage/quota.ts` says what everybody together may spend
in a day, with no off switch. So the projection calls `reserveMicros` with the chosen model and
reads `DEFAULT_LIMITS.dailyMicrosGlobal`, and cannot show a bill the running app would refuse to
run up. Which model answers is a choice on the page rather than a constant, because it is the one
decision funding changes directly, and the options are keys of that same table. That needed the
reservation profile to move out of `ledger.ts`, which imports Prisma, into the pricing table, which
imports nothing; it moved rather than being copied, for the reason `PROVIDER_KEY_ENV` gives about
itself.

**The lines that are easy to leave out are the ones that make the number wrong.** A funding page
errs in one direction by default: everything anybody forgets makes the total smaller. Two were
missing from the bill. **Transactional mail**, since the README already says Supabase's built-in
sender is for testing and a deployment that tells anybody about itself needs its own. And **the
tooling that writes the app**, which is not runtime infrastructure and is most of the bill at the
sizes anybody starts at, so leaving it out implied the software maintains itself.

**What the model found, rather than what anybody chose to admit.** The floor is about three hundred
dollars a month before a single learner arrives, and most of it does not move when they do, so the
first thousand people are close to free to serve. **Speech** is the fastest-growing thing on the
page: TartuNLP returns uncompressed 32-bit audio at 88 KB a second, 188 KB for a three-word
sentence, so the whole spoken dictionary is 2.8 GB, and at a hundred thousand learners buying that
speech would come to more than every billed line put together. **What is given outgrows what is
paid for** at that size, which is worth knowing about a project this small. Each is asserted, and
the per-learner curve was asserted three times before it was right: the first version claimed a
smooth fall, failed twice, and both failures were the model telling the truth.

**A public page that reads the environment reads it as a yes or a no.** The page says which parts
of the infrastructure this deployment has switched on, which it can only know by looking, and
several of those variables are keys. CI's bundle scan cannot see this one, because nothing ships
to the client and the server simply prints it. So `lib/funding/` reads the environment not at all
and the page reads it in exactly one place, through a helper that can only return a boolean. Two
reads is where the second one stops being a boolean, so the count is asserted.

Eight invariants, each made to fail once: the bill generated from the registry, no free tier
surviving in the facts or the cost type, what is given credited rather than billed and never read
into a total, the model priced off the ledger, every quoted price rendering the link it came from,
the single boolean environment read, every variable `services.ts` names being one the app actually
reads, and the page staying outside the sign-in gate, like `/privacy` and `/terms` and for the same
reason.

**A coverage number is a measurement of whatever is wrong, and usually that is not what you were
measuring.** `npm run eval:scene` is Phase 0's second half and it asks the one question the
Situations design rests on: what share of composed lines does the gate withhold, against a stated
line of one in twenty. It came back at 60 to 70 percent, and the number was never the useful part.
The first thing it measured was that `arsti-aeg`, a scene set at a health centre, could not vouch
for `arst`, and that none of the three scenes could vouch for `olema`, so every line built on "Kas
teil **on** valu?" was thrown away. The second was that the two commonest words it withheld a line
over were `ja` and `või`, taught by the course and declared by no scene. Neither is visible in a
rate. Both are the first two entries of the ranked list of words the model reached for, which is
the same instrument `measure:scenes` used to find the missing connectives unit, and which is why
the script prints one and why the star on it has to mean what it says: written against the lemma
list it starred `arsti`, `korteris` and `olen` as words the course does not teach, and they are the
genitive of `arst`, the inessive of `korter` and the first person of `olema`.

**And the residual is a fact about the course rather than about the gate.** Vouching is about 85%
of what is withheld in every run, register is none of it, and the lines being thrown away are
`Kui kaua see on kestnud?` and `Kas see aeg sobib teile?`, which is what a receptionist says.
`kestma`, `sobima` and `valutama` are in no unit at any level, and nor are `asuma`, `esitama`,
`korrus`, `katki` or `valmis`. The pattern is one sentence: the course teaches the nouns of a
situation and not the verbs that do things with them, `valu` and `haige` but not `valutama`, a
unit on housing but no `katki`. `docs/21-situations.md` §29 is the write-up and §19 is what it
changed, which is that Phase 1 waits on that vocabulary rather than on any code.

**Six runs of 63 lines cannot resolve eight points, and the table says so.** Two of the rows in
§29 are the same configuration and differ by eight, which is what stops the round-by-round
differences being reported as improvements: three lines per beat is a sampling floor rather than a
sample, and only the first drop is larger than the noise. A range twelve times over the line is
still a conclusion; a delta inside the noise is not. And a run that composes nothing says so
rather than reporting a rate, because the first version of this hit a free model's daily cap and
printed `0/0 withheld (0%)`, which reads as a perfect score.

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
person can never be derived, for any verb in the language. `npm run audit:verbs` derives every slot for every verb in the shipped dictionary
and compares it with every form Ekilex records for the same word: 797 verbs, thirteen slots
each, no disagreement, and the two exceptions above are the ones it found. Re-run it before
widening the table. Every derived form says so on screen, the dictionary entry prints the table
under "worked out from loen" with the stored form in bold, the four verb topic pages show the point
on the learner's own verbs with a provenance chip, and an attested form always answers first, so
the moment an entry is enriched the rule steps aside.

**A rule that cannot reach a form is a reason to store it, not a reason to have none.** The rule
above is complete for a regular verb and the paragraph stating its exceptions was also, without
saying so, a list of what a keyless deployment simply could not say. `olema` showed `olen` and
stopped: no `on`, no `pole`, and the commonest verb in Estonian could not answer `olevik · ta`. No
verb at all could answer `lihtminevik · ta`, since the simple past is not derivable, so every one
of them made seven conjugation cards where an enriched one made eight. And the pronouns had it
worst, because their everyday case forms are the short ones, `mulle` and `mul`, which no ending on
a genitive stem reaches: a card built from the rule answered `minule` and marked the form everybody
says wrong, so the pronoun unit shipped with **no case cards at all** rather than teach the wrong
one. `me`, `te`, `nad`, `neil`, `ta`, `tal` and `mu` were among the commonest words in the attested
corpus that this dictionary could not vouch for, which is how the whole of it was found.

So the harvest stores what the rules miss, and it **asks the rules rather than carrying a list**:
`unreachableSlots` in `conjugate.ts` and `unreachableCaseForms` in `derive.ts`, each living beside
the rule it is the complement of. A list would be two copies of one fact and the copy in the
builder is the one that rots, because a missing form does not look like an error, it looks like a
word that inflects less. Asserted on the call in both builders. That is 544 forms across 329 of the
1,404 course words, and every one of them is a verb's simple past, `olema`'s present, `minema`'s
imperative, `pole`, or the short forms of a pronoun or numeral. A regular noun stores nothing,
which is what says the test is drawn in the right place, and `pidama`, which has no imperative at
all, stores none either, because Ekilex records none and asking cost nothing.

Three things fell out of it and each is worth knowing. The pronoun unit **has** case cards now, and
`mina → kellele?` takes `mulle` and takes `minule`, because `caseAnswer` returns the pair and the
card carries both answers on its back. `NounStems.retrieved` holds a **list** per case rather than
one form: `Form`'s own unique key is `(lexeme, formType, value)` and says in a comment that
otherwise the second of two parallel forms overwrites the first, and this field was making exactly
that mistake one layer up. And a pair is printed only where a case has **exactly two** attested
forms, the illative's own long form excepted: Ekilex records three elatives for `kodu` and the
second of a list is not a form to put on a learner's screen. All of them stay in `accepted`,
because somebody who writes one is not wrong.

**And the tie-break in the scanner is a separate question that was measured and left alone.**
`matchEstonianForm` scores a diacritic-folded lemma at 90 and a stored form at 88, so `oli` resolves
to `õli`, oil, rather than to `olema`. Storing the simple past made 20 words reach that tier which
had not reached it before, and it is worth writing down that **none of them regressed**: `oli` was
not a stored form at all before, so it resolved to `õli` then too. The ordering is genuinely
two-sided, which is why it stands: `oli` says an exact spelling should beat a repaired one, and
`parast` says the opposite, since `pärast` is far commoner than the partitive of `paras`. Deciding
it needs frequency data this project does not have, and it changes what the scanner offers for the
whole dictionary.

**The one card the course never built was the one every other card is built on.** `GRADATION` asks
`hammas → kelle? mille?` and takes `hamba`. Nothing else in the deck asks for the genitive:
`PRODUCTION` wants the nominative, `CLOZE` wants whatever form the sentence happens to have, and
every `CASE_FORM` card is the genitive stem plus an ending, so a learner who cannot say `hamba`
cannot answer any of them. Consonant gradation is where that form gets hard and no rule predicts it,
and not one of the 79 units named the type. The landing page has been promising it the whole time,
beside government and the partial object, which units do ask for.

It is added in `unit()` rather than typed into 53 unit literals, because it is a property of the
word and not a choice a unit makes, and only where the unit asks for a form at all: a unit of
greetings teaches phrases, which have no stem to gradate. The generator produces nothing for a word
that does not gradate, so this is 86 cards across a course of 5,248. And the hint had to change with
it: it read `astmevaheldus mm : mb`, which is shown *before* the answer and hands `hamba` straight
over, so the card was not a question. The pattern is on the entry, on the grammar page the answer
links to, and in the chip beside the word.

The unit page's line names what a unit will build rather than what it asked for, which was already
loose and is now checked for this one type, since the column is a single field. The honest check for
the others would be fetching every example sentence to see whether a gap can be made, which is the
query this file warns about two sections down.

**And a unit does not ask for a card its own words cannot make.** `cardTypes` is a request against a
generator that builds only what a word supports, so a mismatch is silent: the page lists the type,
no card appears, and nothing says why. `objekt`, the B1 unit whose subject is the single hardest
thing in Estonian grammar, asked for `CASE_FORM` over twelve verbs. A case card needs a genitive
stem and a verb has none, so it built nothing at all, for as long as the unit had existed; it drills
persons now, and the object rule is taught on the grammar pages it links to and met in its gap-fill
cards. `syllabus.test.ts` walks every unit against the harvest and fails on a type none of its words
can make, `GRADATION` excepted because nobody declares it. Made to fail on `objekt` first.

The same audit is why gradation is added on `CASE_FORM` alone and not on `CONJUGATION`: a verb
gradates too, `andma` is `nd : nn`, and it shows in the present stem rather than in a case, so eight
units of verbs would have advertised a card the generator cannot build. And it is why the landing
page's FAQ no longer says all three hard parts "get a card of their own": gradation and government
do, and the whole-or-partial object has a unit and a grammar page.

**Which forms a gap-fill may hide is one answer, and it was five.** `buildCloze` hides a word it is
told to look for, so what it can hide is whatever list the caller hands it. Two callers, the lesson
planner and the level checkpoint, added the ten regular cases and were the same twenty lines twice.
Three did not: the review card, the printable worksheet and the mock exam, and the worksheet's own
comment said "a sentence about `tuba` usually contains `toas`, not `tuba`, and hiding the inflected
form is the more useful exercise" over a list that could not hide `toas` unless Ekilex happened to
have stored it. And none of the five knew a verb person at all, so `Kontsert algab kell 18.` could
not be gapped for `algama` and `Kuidas sa elad?` could not be gapped for `elama`, which are the two
commonest sentence shapes in the language. Measured over the graded half of the shipped dictionary,
2,201 words could carry a gap and 2,758 can now.

`lib/estonian/gapForms.ts` is the one answer: every stored form, the ten cases built on the genitive
stem, and a verb's persons off the stored first person. **Nothing is invented and the sentence is
the second opinion**, which is what makes this safe: a derived form only ever becomes a card by
matching a word a lexicographer wrote, so a wrong derivation matches nothing and disappears while a
right one is confirmed by the sentence it was found in. A principal part is deliberately **not**
labelled with a case, because `tuba` is its own nominative and its own partitive and the label is
what the accuracy chart counts, so a guess there is a wrong row rather than a missing one; the short
illative is the exception, since the dictionary only promotes it where it differs from all three.

`lib/exam/paper.ts` and `lib/assessment/items.ts` are exempt by name. Both build a marked instrument
from a pool and a seed, the exam rebuilds its paper server-side to mark it, and both surround the
answer with distractors drawn from the same list, so widening what can be gapped changes which
questions a candidate is asked and what is offered against them. That is a change to a measurement
rather than to an exercise and it is not made in passing.

**A verb the app can conjugate is a verb the dictionary can find, and for a year it was not.** The
search strips a case ending to look for a genitive stem, which is how `toas` finds `tuba`, and it
knew nothing whatever about a person ending. So a verb was findable by its lemma, by its two
infinitives, by its stored first person and its stored simple past, and by nothing else: not
`helistad`, not `helistab`, not `helistame`, not `loeksin`. `ta helistab` is the shape a beginner
meets in every sentence of a textbook, and this app derives it, prints it on the entry under
"worked out from helistan", and drills it on a card. Measured over sixty graded words and six forms
each, that one gap was **every miss the search had**: 87.5% of forms found before and 100% after,
first hit 85.6% to 97.8%.

`possibleFirstPersons` is the ending table read backwards and it lives in `lib/estonian/conjugate.ts`
beside the table it reverses, because an ending stripped in another module is an ending that stops
agreeing with the one this module adds. It returns candidates rather than answers: the search asks
the database whether any of them is a stored `PRES_1SG`, and `derivedVerbForms` decides afterwards
whether the word really is that verb's, so a wrong strip costs a lookup and never a wrong answer,
and the exceptions the rule already knows about are the exceptions the search inherits. A fifth
union branch and a partial index, measured at 0.05ms. `candidatesFor` in `lib/dict/resolveScan.ts`
is the same narrowing for the scanner and the news headlines and had the same three branches, so
`ta helistab` on a photographed page fetched no candidate at all and `matchEstonianForm` was handed
nothing to decide about. Both have five branches now: a stem here, a first person there. That is a
widening of what the scanner vouches for, at exactly the standard a derived case already met, since
a person built on a stored first person is wrong the same way for every verb that takes the ending
and a form the entry itself prints.

The label reads `olevik ta (present)`. It used to read `olevik ta (present ta)`, because `formName`
put the person in both halves and the person is an Estonian pronoun: the English gloss exists for
somebody reading an English reference grammar, and the pronoun is already in front of them in the
half that leads.

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

**And "the other ten are one ending each" was an assertion about five words until it was measured.**
The verbs had `npm run audit:verbs` and 797 of them checked against Ekilex; the nouns, which is the
larger half of the language and every case table in the app, had a note saying somebody had run the
comparison by hand for the five words the landing page demonstrates. `npm run audit:cases` is that
script pointed at the other half: every nominal the dictionary ships with an Ekilex word id, both
columns, 5,143 words and 113,000 forms. Ten of the eleven singular obliques agree for all of them,
and so do the eleven plural obliques built on the genitive plural, which is what makes the illative
worth singling out rather than the whole table distrusted.

**What it found is that the twelfth was never a rule.** `genSg + d` sat in `buildCaseTable` under a
comment calling it "the one regular plural", right for 5,098 of 5,143 and wrong for a whole
category: a pronoun is suppletive in the nominative plural and no ending reaches it. `see` goes to
**need** and the app printed `selled`; `too` to **nood** and it printed `tolled`; `kes` and `mis` do
not change at all and were printed as `kelled` and `milled`. Every pronoun in the dictionary that
has a plural was wrong, all eight, on the first words of anybody's first lesson. And thirty-three
mass nouns have no plural for a lexicographer to record, so `sealiha` was being given `sealihad` and
`sularaha` `sularahad`. So `nomPl` is a required field for the reason `illSgShort` is one, nothing
derives it, and `NOM_PL` is on `PRINCIPAL_FORM_TYPES`, which is what makes the harvest, the live
enrichment, a hand edit and an accepted correction all carry it without being told to. A word the
dictionary holds no plural for shows a gap, which is what the genitive plural and the partitive
plural have always done.

One word out of 5,143 still disagrees and is left alone. Estonian writes an apostrophe between a
foreign stem and its ending where the two would otherwise merge, so Ekilex records `grappa'st` and
the rule gives `grappast`. It is the only entry in the dictionary with an apostrophe in a principal
part, and a rule the app cannot tell when to apply is worse than a form that is one character off.

**A principal part is one form, and Ekilex often sends two.** `Form`'s unique key includes the value
deliberately, because Estonian has genuine parallel forms and a key without it would drop one. That
is right for the whole retrieved table and wrong for the six a learner memorises: 2,016 shipped
entries carried two `PART_PL` rows and 120 two `GEN_PL`, and which of the pair the app used was
decided by whoever read them. `stemsFrom` takes the first row it finds, in whatever order the
database returns them; every caller that builds a record with `Object.fromEntries` takes the last.
So the dictionary entry for `aadress` could show `aadresse` while the flashcard behind it asked for
`aadressisid`, and neither was a decision anybody made. Ekilex lists the primary first, which is the
one a course teaches, so the first wins: `asju` before `asjasid`, `aegu` before `aegasid`, `rindade`
before `rinde`. The parallel form is not lost where it matters, since an enriched entry keeps the
whole retrieved table under `EKILEX:<morphCode>` and those stay parallel exactly as before.

**And the built dictionary has one writer**, `scripts/lib/expandedFile.ts`. Four scripts write it,
the builder and the three audits that correct a gloss, a part of speech and a plural in place, and
three of them wrote it compact while the file in the repository is one key per line. Somebody had
reformatted it by hand and the next full run of any generator would have collapsed 5,363 entries
into a single 3MB line. That is not a style disagreement: the diff is the only way anybody reviews a
change to this file, and a generator that reformats on the way past hides every real change inside a
rewrite of everything.

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

**And neither is the seed, which is where the copy actually lives.** The sweep read `app/`,
`lib/` and `components/`, which is three directories of source and not the same thing as three
directories of copy. `prisma/data/other.ts` holds the note printed under `Tere hommikust!` on its
dictionary entry, and `verbs.ts` and `advanced.ts` hold the line printed under
`Government · rektsioon` for the words Ekilex records no government for. Nine of those reached a
learner with an em dash in them and six were on the A1 greetings, the first unit anybody opens.
`lib/collections/syllabus/` was already swept for exactly this reason and only because it happens
to sit under `lib`: where a file of authored English lives decided whether the rule reached it.

`prisma/data/harvested.ts` is exempt from the dash rule and from that one only, with the reason
written down beside it: it is generated, and every dash in it is inside Estonian a lexicographer
recorded, a street number, a range of years, a dash opening a line of speech. Rewriting one would
be this app editing Ekilex's sentences. Its single authored column is the gloss, which is written
in the syllabus and swept there, so nothing authored is excused. `expanded.json` is not swept
because the sweep reads source rather than data, and it was measured rather than assumed: its 40
dashes are all in Estonian usages and none of its 5,363 English glosses carries one.

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

**A blurb belongs where somebody is reading, not where they are scanning.** The targeted practice
modes are drawn as the same compact tile the quick rounds already used, and their
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

**And the headlines themselves are read, not only mined.** Every sentence a learner met here was
one a lexicographer recorded to illustrate a word, which is the right sentence for a card and is not
what a newspaper, a sign or a colleague says. The feed was being fetched once an hour for the
suggestion row and thrown away down to its words. `lib/dict/headlines.ts` keeps a few of the
headlines whole and puts the dictionary under them: the feed proposes, `matchEstonianForm` decides at
the scanned-page floor, and a vouched word links to the dictionary's own headword while a word it
will not vouch for is printed plain, because leaving it out would be editing the sentence and
guessing would be worse. A headline is offered only when most of it can be opened, so a beginner
meets one they can read through rather than a wall of names, and the block names the host it came
from, since these are somebody else's words. It lives on the dictionary landing beside the row it
grew out of, rendered from the same hourly cache and stored nowhere; asserted.

**Which words are worth learning first is a question about the language, not about the syllabus, so
it is answered by counting.** The course teaches in themes and the dictionary holds six thousand
words, and neither tells somebody in their first week where to start. `scripts/build-frequency.ts`
counts a published word list over the OpenSubtitles corpus and writes `lib/collections/frequency.ts`,
a hundred lemmas of each of four kinds. It is the third door onto the same rule as the photograph
and the headline: the corpus proposes, the dictionary decides, and every word on the page is the
dictionary's own headword. Nothing generated holds an English gloss, because a gloss copied out of
the dictionary is a second copy of it that goes stale the first time somebody corrects one, and the
correction path here is a queue strangers write to.

**The licence is why it is that corpus.** `hermitdave/FrequencyWords` is MIT for the code and
**CC BY-SA 4.0** for the counts, which is the licence Wiktionary already puts on the glosses in the
built dictionary, so it may be used commercially, it has to be credited, and what is built on it
carries the same terms. The University of Tartu publishes a better Estonian frequency dictionary
and it is **CC BY-NC**: no charge today is not a promise of no charge ever, and a non-commercial
clause is the one licence a project cannot walk itself back out of later. It is credited beside
Ekilex and Wiktionary on sign-in, in the landing footer, on /terms and in `LICENSE`.

**Two counting rules, both measured rather than reasoned out.** Only an *exact* spelling counts, never
a folded one: `matchEstonianForm` accepts a lemma with its diacritics folded away, which is right for
somebody typing `room` meaning `rõõm` and wrong over a corpus that is spelled correctly, and folding
put `õli` at the top of the nouns on the 294,452 occurrences of `oli`, with `ära` landing on `arg`
and `veel` on `väli`. And a **nominal is counted on its dictionary form while a verb is counted on
its persons**: summing every case looks more accurate and is worse, because the commonest words in
Estonian are function words and `välja` was being credited to `väli`, `ees` to `esi` and `sea` to
`siga`. A verb is the exception because `saan`, `tean` and `tahan` are only ever that verb, and
without them `olema` ranks nowhere since nobody says the infinitive. A spelling more than one entry
can claim counts towards none of them, which is the comparator rule again: `hall` is frost and grey
and there is no honest way to split thirty thousand occurrences. `meil` and `sai` are the residue
and are named in the script's header so nobody adds a third rule to chase them.

**And the count is what found the hole.** Of the four hundred commonest words in Estonian, 125 were
ones the dictionary could not vouch for in any form, and the top of that list is `ja`, `et`, `aga`,
`jah`, `ei`, `ka`, `siis` and `nii`. Six units of "the words between the words" had been appended
once and the job was half done. Three more A1 units carry the connectives, the replies and the degree
words, 51 lemmas, every one a request the harvest either honours or reports, and all 51 came back.
They are labelled `ADVERB` for the reason the harvest already gives about the connectives it had, that
an Estonian adverb does not inflect and demanding forms would drop every one of them; the label says
which card types a word takes rather than making a claim about word class, which is what `kas` has
been doing since the question words unit was written.

**A page that offers a hundred words at once adds them under one lock.** `planLemmas` and
`addPlanToDeck` are the shared body `addUnitsToDeck` was refactored into, so the frequency page
inherits the transaction, the deck lock, the dedupe against what is already there and the chunked
insert, rather than growing a fourth path that writes cards. Recognition and production only, because
a case card apiece would be eight hundred cards for one press. The invariant that guards this used to
name `addUnitsToDeck` and read its body; it counts inserts now, so a fifth caller fails it whatever it
is called, which is what the refactor itself demonstrated by silently emptying the old check.

**Reading a list of words and working through one are two different things, so they are two
screens.** `/dictionary/common` is the four lists as lists: what is on them, in order, with a button
that collects a hundred words cheaply. `/review/common` is what to do with them, which is a round per
list, and `/practice` carries the four as buttons on a card under Flash cards because that is the
screen somebody is on when they want one. The round is not a fifth card runner: it renders
`ReviewSession`, fills it with `withChoices`, picks its cards with `leastPractisedSlot` and grades
through `gradeCard` like every other mode (ADR-016), so it differs from Flash cards in its `where`
clause and in nothing else.

**Asking a word in a different form each time only works if the word has the cards to be asked
with.** The dictionary's button builds a recognition card and a production card, which is the right
trade for collecting a hundred words and is a round that can only ever ask what a word means.
`deepenCommonWords` is the other half: it plans `CARD_TYPES` entire and lets `generateCards` decide
what each word can actually build, so twenty nouns arrive with their cases and twenty verbs with
their persons and their government, and an adverb arrives with the two it supports and no more. It
names no card type of its own, which is what makes it proof against the `objekt` fault: a unit
cannot ask for a card its words cannot make if it never names one. Measured on the shipped
dictionary at 183 cards for twenty nouns and 223 for twenty verbs.

**And it is twenty at a time, because a hundred nouns built out is over a thousand cards for one
press.** That is the backlog first run already learned not to assemble by accident, and
`nextCommonBatch` is the bound. A word counts as finished when every type `availableCardTypes` says
it could support has a card behind it, which is what makes pressing twice progress rather than
stall: a word holding only the dictionary button's pair comes back and is deepened, while `ei`,
which can never make more than two, is finished at two and drops out. Counting rows instead would
leave it at the front of the queue for ever.

**No render writes cards, and this is the one that would have been invisible.** `PrefetchLink`
fetches a whole page once a pointer has settled on a link for 90ms, so a round that topped the deck
up while rendering would build somebody twenty words for hovering over the button, and no browser
suite would ever see it because a suite clicks. The add is a Server Action behind a press, the two
round screens may not reach a deck write at all, and that is asserted rather than remembered.

**And what a list is called is one table.** `lib/collections/commonGroups.ts` holds the four titles,
the four lines and the four slugs, because four screens print them now and it was two maps inside
one client component. The invariant is that the label appears exactly once in the tree, since a
screen that imports the table and then writes its own heading beside it satisfies any check that
only looks for the import. It reads `code()` rather than `read()`, which took one go to learn: the
comment in `CommonWords.tsx` explaining why the label moved out of that file names the label to do
it, which is the oldest recurring mistake in this repository's own checks, made for the fifth time.

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

**A word is mastered when the app has asked it in enough different ways, and for a year it could
not count them.** `Review` carried `targetCase`, which is the case a *card* is about and null on
every card that is not about a case, and `lib/srs/mastery.ts` counted distinct values of it as the
variety half of its claim: five correct answers across three different forms. That was written
down as undercounting in the safe direction and it was not undercounting, it was a counter nothing
could satisfy. A verb has no case cards at all, because `CASE_FORM` needs a genitive stem, so its
recognition card, its production card, its gap-fills and its eight conjugation cards were one slot
between them and not one of the 799 verbs in the shipped dictionary could ever be mastered. A word
added from the dictionary gets recognition, production and a gap-fill by default, which is two
slots at best. And the flash round draws the words that are *not* mastered, so the two faults
compounded: the round kept asking about words it was never going to let go of.

**So `Review.slot` records what was actually asked, and `lib/srs/slots.ts` is the closed list of
what may go in it**: a case, a named part of a verb, or the card's own type, because "what does
this word mean" and "how do you say it" are two questions about one word and always were. It is a
second column rather than a wider `targetCase`, and that is the whole of why it is safe:
`caseAccuracy` tallies whatever string it finds and hands it to a panel that prints the key in
lower case where it recognises nothing, so a morph code written there would put `indprsg3` on the
Progress page beside `osastav`. Two questions, two columns, neither bent to be the other. A row
written before the column reads `targetCase ?? ""`, exactly as it always did, so no history is
reinterpreted. It arrives through a `"use server"` export, so it is checked against the closed list
rather than trusted, the way `CARD_SOURCES` guards `Card.source` and for a stronger reason: a
forged slot would not break a count, it would tell somebody they had mastered a word in a form
nobody ever asked them for. Both doors carry it, since a grade taken on a train and replayed later
would otherwise lose the one thing that made it worth recording.

**And the bar is what the word can carry.** Three slots is right for a noun with eleven cases
behind it and impossible for `Tere hommikust!`, which has no forms to inflect, or for an adverb,
which does not decline. Asking a word for more variety than it has is the same fault in a smaller
room, so the threshold is `min(MASTERY_SLOTS, askable)` and `askable` is the union of the cards the
learner holds and what the dictionary can inflect the word into. Both halves are needed and the
second was found by watching a real round: `aasta` had a recognition card and a production card, so
the cards alone said two, while the round was asking it for the sisseütlev, which is a third. One
form decides it, the genitive singular for a nominal and the stored first person for a verb, and it
is read in the query that was already fetching the words. The part of speech was the cheaper answer
and is wrong for exactly the words this protects: an entry confirmed off a photograph is a `NOUN`
with no forms behind it.

**Flash cards is the round built on that, and it is not review with a different queue.** It used
to render `ReviewSession` over the words already met, which is the same four shapes drawn from
another list, and the learner's report was that it "reverts back to what is in the Review section".
`lib/games/flash.ts` asks five ways instead, and three of them are things review cannot ask: an
attested sentence spoken and never shown, with the form to be typed out of what was heard; a gap
with the meaning rather than the lemma beside it, so the sentence is what says which form is
wanted; and a sentence the learner writes themselves around a named form. Typed throughout, because
producing a form is a different memory from picking it out of four and picking is what stops
telling you anything about a word that is nearly known.

**The pool of shapes widens as the word settles**, so the first ask is the plainest available and
each correct answer opens the next one: `tuba` starts at "what is it in the seesütlev" and ends at
"write me a sentence with it". A shape is offered only where the dictionary can carry it, which for
the two sentence shapes means an attested usage holding that very form, and `gapForms` decides
whether a form may be hidden at all, because what a gap can hide is one answer for the whole app.
Nothing is written and nothing is generated: every Estonian character in a task came out of Ekilex
or off the app's own derivation from a stored stem, every task says which, and every mark is a
string comparison against a form the dictionary holds. `markFlash` names the ending the learner
reached for instead, which `lib/estonian/whichCase.ts` can do with certainty, and it asks that
question **before** `checkAnswer`'s typo rule rather than after: `toas` and `toast` are one
keystroke apart and so are `toale` and `toalt`, so the ordinary reading would have told a learner
who chose the seestütlev that they had mistyped the seesütlev, and marked the answer as recalled.

**Two faults in it were invisible to every unit test and turned up in the first rounds anybody
drove**, which is the argument for `scripts/test-flash.mjs` rather than for more unit tests. The
page took the first open slot and `CASES` is in the traditional order, so the first real round
asked for the sisseütlev seven times out of ten: the opposite of the variety the round exists for.
It now rotates on the word's own correct answers and its position in the round, both of which are
already there and both of which are deterministic, so a reloaded round asks the same question
rather than reshuffling under somebody who refreshed. And it offered all eleven cases built on the
genitive stem, so the second round asked `Venemaa → milles? kus?`, which is exactly the fault
`lib/estonian/place.ts` was written for: Estonian has two sets of local cases, a place name in
`-maa` takes the outside one, and `Venemaas` is not a way of saying "in Russia". A module that
knows something is only worth having if the next generator asks it.

**And the audit asked the same question of it, which found two more shapes of the same fault.**
`npm run audit:questions` builds every card, every paper and every clue the shipped dictionary can
make and asks the one thing no unit test can: is the answer already visible in what the learner is
shown. The flash round is the widest generator in the app and the newest, so it is in the audit
too, at 46,851 questions of the 98,318. It found thirteen asks whose answer was a word in the
English gloss printed beside them, none of them visible on any one word: the sisseütlev of `salv`
is `salve` and its gloss is "salve", `pagan` is glossed "pagan, heathen", `mink` "American mink".
`sameSpelling` is an exact comparison and catches only the case where the whole gloss is the word,
so the rule is the audit's own whole-word test. And it found one gap that left the other half of a
lexicographer's pair standing two characters away, `Auto jäi porisse/____ kinni.`, because
`buildCloze` refuses a sentence that repeats the word and looks for the same string, and a slot's
answers are not one string. The sentence shapes are refused there rather than the task dropped, so
the word falls back to being asked the plain way.

**And where every word stands has a page of its own, because the first answer was a panel nobody
found.** It was three cards down `/words`, which is a page about the deck, counted in cards; the
learner asked for the list twice and reported that they could not see it anywhere. `/words/mastery`
is the four tiers with a row per word, what each one still needs and which forms it has been right
in, and it is reachable from the deck it counts, from Practice beside the round that moves it, and
from the rail's own table so the palette goes there. `nav.test.ts` asserts that pairing now rather
than only the claim, and the check found two destinations that had been claiming a home which did
not link to them: `/words` and `/exam` both said they were reached from Progress and neither was,
so both were findable through the command palette alone.

**A word game may borrow a shape and may not borrow a look.** Sõnad is guess-a-word-and-be-told-
which-letters-were-right, which is older than computers: Mastermind sold it in 1970 and Bulls and
Cows was a pencil game before that. What the New York Times owns, and has enforced, is the name
Wordle and the look of it. So the name is different, the length is different, the tiles are circles,
the three states are this app's own hues rather than green and yellow and grey, the movements are its
own, and not a line of anybody's code or a word of anybody's list was taken. `lib/games/sonad.ts`
holds that argument next to the rules it is about.

**Six letters, and that is a fact about the dictionary rather than a taste.** Five is the English
game's length and is wrong here twice: Estonian words are longer, and the graded dictionary holds 450
five-letter content words against 603 at six, which after banding is 183 answers against 215 at A1
and 352 against 477 at B1. Four has the biggest pool of all at 816 and is guessed by accident.

**Two word lists, and they are not the same list.** The answers are graded dictionary entries at the
learner's own level, because an answer has to be a word the app can teach: the finish screen names
it, glosses it, links to its entry and offers to keep it. The *guesses* are `KnownWord`, the 154,995
headwords the Ekilex enumeration brought back, 7,134 of them six letters long, because telling
somebody an ordinary Estonian word is not a word is the one thing a game like this must never do and
the built dictionary alone would do it several times a round. That list is read once and handed to
the browser, since a round trip per guess is a round trip inside the one gesture the game is made of.

**The board knows the answer and may not know the score.** The word crosses deliberately, because
marking without a round trip is most of how it plays and anybody who opens the network tab has
spoiled their own morning. What may not cross the other way is a rating: `recordSonad` takes the
guesses, rebuilds the day's puzzle from the date and the level, and works out what the round was
worth on the server, which is `submitExam`'s shape (ADR-022) and is what keeps the game under
ADR-016 rather than exempt from it. Where the word is in the deck the round grades the production
card; where it is not, it writes nothing and the finish screen offers to add it.

**A hue is half a signal, and this is the screen that rule was written for.** The first board was
mint, butter's tint and `--raised`, which in the light theme is one strong green beside two pale
washes: "in the word somewhere" and "not in the word at all", the two that matter most, differed by
hue alone. They are three kinds of object now, a solid fill, a tint with a ring round it, and a flat
wash, and every marked circle also says which in words for a reader who gets neither. Measured in a
browser in both themes: 7.40 and 5.31 and 5.62 in the light, 11.70 and 9.27 and 5.49 in the dark. The
draft that dropped the fill and kept only the ring measured 3.52, because `--butter-ink` is drawn to
sit on butter's tint and not on a card.

**There is one table of which Estonian letters fold, and there were three.** Six letters an English
keyboard has no key for, and half the app has to answer the same question about them: is `sona` the
word `sõna`? Whether the answer is yes is each caller's decision, since a search box says yes and a
marker says no. Which six letters is not. `lib/dict/search.ts` had a `replaceAll` chain,
`lib/estonian/dictation.ts` and `lib/estonian/answer.ts` each wrote the same `Record` out again, and
they agreed, which is the dangerous state rather than the safe one: a marker and a search box that
disagreed about `ž` would mark somebody wrong for a spelling the dictionary had just offered them.
`lib/estonian/fold.ts` is the one table and it holds the Postgres `translate()` pair as well, so the
SQL that narrows a search and the JavaScript that decides it cannot drift.

**The fourth case is what found it, and it was a real screen.** The command palette matched a typed
query against a label with `includes`, so typing `sonad` found nothing and Sõnad, the one place in
this app with an Estonian name, was unreachable from the box that promises to go anywhere. For
exactly the learner `lib/ux/letterBar.ts` exists for, who has no õ key and therefore cannot type the
name at all. Both sides fold now, so `sõnad` and `sonad` both land.

Two exemptions and both are a different question. `lib/estonian/sounds.ts` folds *sounds a learner
confuses*, b against p and k against g, and says so at length. `lib/suggestions/model.ts` has a
function called `fold` that collapses whitespace for a grouping key and touches no diacritic, which
is a name collision rather than a copy. And the move is where it is on purpose:
`lib/estonian/passage.ts` was importing `fold` from `lib/dict/search.ts`, which imports Prisma, so a
layer asserted to be free of the database was pulling it in one import away and the invariant, which
reads each file's own imports, could not see it.

**One game a day, the same one every week, and nothing hidden by it.** Eleven rounds on a menu is a
decision to make before you can start; one on the home page with a reason beside it is an invitation,
and Thursday being Match every week is a thing somebody comes to know about their own Thursdays.
`lib/ux/weekGames.ts` is the table, it names rounds by their own href so a rename in
`lib/ux/modes.ts` carries, and every round is still on `/practice`, in the palette and at its own URL
on every day of the week. This is not `lib/ux/disclosure.ts` and does not overlap it: that module
decides what a screen leads with by how far in a learner is, this one by what day it is.

The two puzzles that really are one a day get the days that suit them. Sõnad and the crossword build
a new one each morning and are finished once you have done it, so featuring them is a nudge rather
than a limit: Sõnad opens the week because it is three minutes and the crossword is Saturday because
it is fifteen. The other five days carry a round that can be played again, so a Tuesday with ten
spare minutes is not a Tuesday that runs out. The card stands down on the day the quest is featured,
because the quest already has a card on Today and it is the better one, naming the learner's own
weakest case and what it is at; two cards for one round is furniture, and the cost is the "tomorrow"
line one day in seven.

**A crossword's format is nobody's; its grids and its clues and its name are somebody's.** The
interlocking grid with numbered clues is from 1913 and is not owned. What a newspaper owns is the
puzzles it publishes. So nothing here is taken from one: `lib/games/crossword.ts` compiles the grid,
the answers are dictionary headwords at the learner's band, and the clues are the English glosses
already beside them, cut to two senses. **No clue is written anywhere in this app**, which is what
keeps it inside ADR-005: the only authored English is the gloss the syllabus already carries, and no
Estonian is written at all.

**English clues and Estonian answers, one direction only, because that is the direction that
teaches.** You know what you mean and you are looking for the word, which is where a learner is
every time they open their mouth. The other way round is a reading exercise with extra steps.

**A criss-cross rather than a dense grid, and that is a fact about the dictionary.** A five-by-five
where every row and column is a word needs a search over words with the right letter in the right
place five times over, and at A1 there are 215 six-letter words to search: it does not reliably
terminate. A criss-cross places words at intersections, leaves the rest empty, always succeeds, and
is the shape a schoolbook puzzle takes. Measured over thirty days at three levels: seven words every
day, every time. **Empty cells are drawn as nothing rather than as black squares**, because a
criss-cross is mostly empty and sixty black squares read as a rendering fault.

**Nine by nine is a phone, not a taste.** At 360px, nine columns is a 36px cell and ten is under 32,
which is below what a finger can hit. The first compiler had no cap and produced a fifteen by eight
grid on its second day. A placement that would push the bounding box past nine is refused rather
than accepted and cropped, so a long word costs the grid a word rather than its shape.

**A real input per cell, which is the opposite of Sõnad's choice and right for the opposite reason.**
Sõnad is one word with a card of keys under it, so a keydown handler is enough. A crossword has
thirty cells in two directions: the caret has to be visible, a phone has to open its own keyboard,
and a composed õ has to arrive, which an `input` event carries and a `keydown` does not. The letter
bar under the grid is the app's own `DiacriticBar` and needed nothing added, since it types into
whatever has focus.

**The picture game and the conversation game are one game, and neither needs artwork.** Two were
asked for: describe a cartoon drawing, and hold a conversation in a situation. Both are the same
moment, a learner producing Estonian about something in front of them rather than recalling the back
of a card, and the only difference is what sets the scene. So `lib/collections/scenes.ts` sets both
at once: a situation named in English, and three things in it. The artwork was the blocker and
turned out to be the wrong thing to want. A generated cartoon is a licence question nobody here can
answer, a file per scene to ship and sixty of them before a round stops repeating; the things are
emoji, which is the argument `/review/emoji` already won, characters drawn by the reader's own font
with nothing shipped and no licence carried. The English label is authored and English is the one
language this project may write; the three words are **requests** against `WORD_EMOJI`, which is
itself a join against the dictionary, so a scene cannot name a word with no picture or no entry and
`scenes.test.ts` fails on one that tries. No level is declared, because a scene is as hard as its
hardest word and which band that is belongs to the dictionary rather than to a second table that
would go stale.

**Only one of the three words is named, and that is the whole reason the picture is worth having.**
The named one carries the case the task asks for, so the requirement is unambiguous and the marking
is certain. The other two are pictures and nothing else: using them is worth credit, not knowing
them still leaves something to write about, and both are revealed with their glosses once the
sentence has been marked. Naming all three up front would make the picture decoration. An emoji
carries its meaning to a sighted reader without a word of text, so the row is announced to a screen
reader as its three **English** meanings, which is parity rather than a giveaway: the Estonian for
the other two is still hidden, and only the named word's Estonian appears before the marking.

**"Not the form we asked for" is the least useful true thing this app can say, and it was the only
thing it could say.** Every other screen compares a written answer against one form and stops. A
learner asked for `majas` who wrote `majast` has made one specific mistake, has a good reason for
it, and can be told what they wrote instead in one line. `lib/estonian/whichCase.ts` is that,
built beside the table it inverts for the reason `possibleFirstPersons` lives beside the ending
table it reads backwards. One rule, and it is deliberately the strict one: **a case is named only
where it is the only case spelled that way.** `tuba` is its own nimetav and its own osastav and
neither may be named, while `raamatu` is only ever the omastav and naming it teaches something, so
skipping the principal parts wholesale would lose `raamatu` and naming the first match would call a
partitive object a subject. The three principal parts are *in* the index in order to collide, which
is what stops a short illative spelled like one of them being announced as an illative. Measured
over the graded dictionary: 34,541 of 36,240 spellings can be named, 95.3%, and the illative is
where they cannot, at 74.3% against 100% for the seven cases nothing else is spelled like.

**Three ratings rather than two, because the app can tell the middle case apart with certainty.**
The writing mode grades Good or Again: a form is the one asked for or it is not. Here, using the
word and choosing the wrong ending is a Hard and the scheduler should see the difference. Nothing
about `RATINGS` or the scheduler changed; this only decides which of the four to send (ADR-016). A
scene whose words are all new to a deck carries no card and writes nothing, which is the answer
`/review/emoji` already gives about a row for a card that does not exist.

**A sentence to compare against carries three different claims, so it carries three labels.** "A
native speaker wrote this about this picture", "a lexicographer wrote this with the very form you
were asked for" and "a lexicographer wrote this with this word in it" are worth different amounts,
and printing the third under the second's heading is the kind of small dishonesty a reader catches
once and then stops trusting. Requiring the asked form was the first version and was measured at
131 of 1,980 possible tasks, which is a panel absent from ninety-three rounds in a hundred: Ekilex
records a handful of usages per word and this asks about eleven cases. Widening it to any natural
sentence with the word, under its own label, covers 95.6%. `naturalSentence` and a three-word floor
both have to pass, because `usableExamples` keeps what is worth showing on a dictionary entry and
this panel makes a stronger claim: `Bussiaken.` and `Toores muna.` both came back on the first run
and neither is a sentence.

**A native speaker's sentence passes the same gate a photographed page does.** `npm run
scenes:template` writes a spreadsheet of every scene and `npm run scenes:import` reads it back, and
every word of every sentence goes through `matchEstonianForm` at the confidence a scanned page has
to clear (ADR-021). A sentence carrying one word the dictionary will not vouch for is reported and
not written, naming the word. That is the fourth door onto one rule, after the scanner, the
headlines and the frequency count, and being a native speaker buys no exception: what it catches is
a typo, a dropped diacritic and a word the dictionary has never heard of, and a model answer made
of words a learner cannot look up is worse than none. What is deliberately not checked is whether
the sentence is good, whether it describes the picture, or whether the grammar is right, because no
machine here can judge any of those and the contributor is the authority on their own language.
**Empty is a correct state** and is the shipped one: the mode is complete with nothing contributed,
which is what stopped the two games waiting on 280 sentences before either could be opened once.
`docs/20-contributed-sentences.md` is what to read before asking anybody.

**A daily puzzle needs a walk, not a hash, and it took two goes to get there.** `hash % pool` with
the string hash everybody writes (`h * 31 + charCode`) moves by one row a day, so Sõnad's first ten
days were `lammas, laulja, laulma, leidma, lemmik, lennuk, leping, lihtne, liiter`: a week of the
letter L. That is the `aberratsioon` fault again. Adding an avalanche fixes the walk and leaves a
draw, which collides at the birthday rate: `rekord` twice inside a fortnight on a 477-word pool.
`dayIndex` in `lib/random/dayHash.ts` is the answer, the day's ordinal times a prime stride, so
nothing repeats until the whole pool has been used and consecutive days are still far apart. The word
of the day's fallback reads it too, since it had the same walk and nobody had noticed. What stays a
hash is a tie-break among a handful of equally good candidates, which is not indexing a pool.

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

**And which header, and which hop in it, is the other half of that.** The rule above was written
and then only half implemented: `x-vercel-forwarded-for` was read first whenever proxy headers
were trusted *at all*, including the self-hosted `TRUST_PROXY_HEADERS=1` case the function exists
for. No proxy but Vercel's sets that header and no proxy but Vercel's strips it, so anywhere else
it is a value the caller typed, which is the fault the paragraph above rules out arriving through
the door it opened. It is read only where `VERCEL` says the platform that owns it is there. The
hop matters as much: `X-Forwarded-For` is a list the client starts and each proxy appends to, so
the leftmost element is whatever the caller put there and the rightmost is the one the trusted
proxy added about the connection it actually accepted. Vercel overwrites the whole header and is
read from the left; a self-hosted proxy appends and is read from the right.

**A release gives back the call, not only the money.** `releaseReservation` wrote a settlement at
minus the reserve, which returns the spend to zero and leaves the `CALL` row standing, and two of
the three limits count `CALL` rows. So a deployment with a rejected key still rationed its
learners by how many refusals they had collected: eight in a minute and the burst limit closed
over answers nobody received, which is the exact thing that function's header says it exists to
prevent, met for one limit out of three. `RELEASE` is a third entry kind, append-only like the
other two, and `snapshotUsage` counts `CALL` minus `RELEASE`. The Settings meter reads it too,
since a call that reached nobody is not a question anybody asked.

**And the reserve is about the person, so it counts the person.** The last slice of the global
budget is kept for somebody who has not asked anything today, and the test read `dailyCalls`,
which `snapshotUsage` fills with calls *of the kind being asked about*. A learner on their tenth
tutor call waited while the same learner's first scan, the dearest single call in the app, went
through as though they had asked nothing all day.

**No ledger write is left to a promise nobody is holding.** Every settlement and every release was
`void recordUsage(...)` next to the `return`. The deployment target suspends a function once its
response is sent and does not guarantee a pending promise runs, so a settlement that never lands
leaves the reserve standing and bills a free model at its estimate for ever, and a release that
never lands rations a learner over a call they did not receive. `after()` from `next/server` is
the platform's own answer and is the one thing that says "keep this invocation alive until this
finishes". Asserted, comment-blind.

**A mailed sign-in link may not change who is signed in without saying so.** The `token_hash`
branch of `/auth/callback` is deliberately not tied to the browser that asked, which is the whole
reason the template shape exists and is also login CSRF: an attacker who requests a link for an
address they control and gets a signed-in learner to open it lands that learner in the attacker's
account, silently, at whatever `next` says, and everything they write afterwards goes into a
stranger's deck. A link that would change the account ends the session that is there and sends
the learner to `/sign-in?switched=1` with a sentence saying what happened; `next` is dropped,
because it was chosen by whoever wrote the link. Nobody signed in is the ordinary case and is
untouched, which is what makes it safe: the link works exactly as it did for the person it was
mailed to.

**A name a class is going to see is cleaned, not trimmed.** `trim()` does not remove U+200B, so
two zero-width spaces were a two-character name that passed the empty check and rendered as
nothing on the roster; U+202E reverses what follows it and can make one pupil's row read as
another's. `cleanDisplayName` strips `\p{C}`, normalises to NFC, and requires a letter or a digit.
The roster is the one screen where a stranger's text is shown to a teacher beside real names.

**An argument that is supposed to be a string is not one.** Every export of `app/actions.ts` is a
public endpoint and its arguments are JSON off the wire whatever the types say, so
`joinClassroom(42)` reached `.trim()` and threw, which the framework answers with a 500 and a
digest where a refusal is the honest reply. `text()` in that file coerces; `normaliseCode` takes
`unknown` because it is the boundary of a pure module.

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

**A panel nobody renders is a feature nobody has, and two of them were.** `DangerZone.tsx` and
`UsagePanel.tsx` sat in `app/(app)/settings/` complete, commented and imported by nothing. Not
dropped by a merge, which is the failure this repository already knows about: `git log -S` finds no
commit on any branch where the settings page ever named either. So for the whole life of this app
there was no way to delete an account from inside it, while `/privacy` promised somebody could take
everything away and `deleteMyAccount` sat in `app/actions.ts` reachable from one file the router
could not get to; and the tutor's spending meter, which four rules above describe as where a learner
reads what they have used, was on no screen at all.

What let it survive is the fault this file keeps finding in its own checks, pointed at a component
instead of a comment. An invariant *reads* `DangerZone.tsx` and asserts the copy inside it, so it
passed with feeling on a file no reader could reach. A file being right is a different claim from a
reader being able to get to it, and only the first one was ever made. So the pairing is asserted
now: every module beside `page.tsx` in that folder has to put something on the page, tested on a
name the module exports being used as an element rather than on the import, because an import
nobody renders is the same silence one line later. It has the floor every sweep here has, and it
was made to fail first, on the real bug rather than on a hypothetical one.

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

**Meeting a word is not answering it.** The intro screen ended in `submit(3)`: a card the learner
had done nothing with but read was graded Good, in the append-only log, and the scheduler set its
first interval from a recall that never happened. The next real question was the next day, because
the ten-minute learning step lands after a seven-minute session has ended. Karpicke and Roediger
measured what that costs: learners who kept retrieving new pairs *inside* the first session
recalled about 80 percent a week later against about 35 for those who only restudied, and the whole
difference was whether retrieval happened while the word was being learned. So a first meeting
writes nothing and puts the card back five places on, where it is asked in its ordinary shape, and
that retrieval is the grade. `requeue` in `lib/srs/queue.ts` is the same helper the Again path uses,
so a miss and a first meeting wait the same distance, and a session too short for the gap asks at
the end rather than not at all. `wantsChoices` reaches a new recognition card now, for the reason
it already reached one still in learning: the memory is minutes old and asking for it cold is a
guessing game. Nothing about `Review`, undo or the offline replay changed; what changed is that the
row now records something that happened.

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

**And a word spelled the same in both languages is a fact, not a rendering fault.** Thirty entries
in the shipped dictionary have an English gloss that is the very same string, twelve of them taught
by the course: `film`, `number`, `park`, `sport`, `stress`, `argument`, `minister`, `risk`. Every
screen that prints a word above its meaning printed those twice, and the first meeting is the worst
of them, since a screen whose whole job is to teach a word appeared to be stuttering on it. Turning
over a recognition card and finding the question is the same thing one step later.

`sameSpelling` in `lib/copy/values.ts` is the test and `SAME_SPELLING` is what is said instead.
**Exact, never case-insensitive**, and that is the whole of the care this needs: `august` is
`August`, `november` is `November`, and the capital letter is the lesson, because Estonian writes
its months in lower case and English does not. Folding case would delete the one thing those five
cards teach. The sentence says "spelled" rather than "the same word" because it is not said the
same, and the audio beside it is exactly the point.

**A missing example is news; a phrase having none is not.** Ekilex records a usage against a
*word*, to show it doing its job in a sentence, so it holds none for `Tere!`, `Aitäh!`,
`Kuidas läheb?` or `Ma ei saa aru` and never will: those are already the sentence. All twenty
entries the A1 greetings unit teaches are `PHRASE`, all twenty have no usage, and both screens
that report an absence reported theirs. The first meeting said "No example sentence for this one
yet" on twenty of the first cards anybody ever sees, which is the app opening a beginner's first
evening by naming a gap in itself; the dictionary entry went further and promised that one "shows
up the first time you look this word up", which nothing was ever going to keep. An absence
somebody can wait out is worth saying. An absence that is simply what the entry *is* reads as the
dictionary being thin on the commonest thing in the language.

`isPhrase` in `lib/dict/pos.ts` is the one place that difference lives, and the invariant is the
pairing rather than the two filenames: a screen carrying that copy has to have the answer in its
hands, and whoever writes the field has to get it from the predicate rather than comparing a
string themselves. The review card is handed it by its own page, which is the right way round,
since that page is the side holding the part of speech and already decides what crosses the wire.
The offer to add a sentence from class stays on both, because a sentence somebody met using a
phrase is worth having.

**A card may not print its own answer, and 2,644 of them did.** Found by building every card the
shipped dictionary can make, 47,263 of them, and asking a question no unit test had: is the answer
already visible on the question side, in the prompt or in the hint. Three separate causes, all of
them invisible on any one word.

**A case whose form is the nominative asks nothing.** Estonian genuinely spells some that way:
`kallis` has the genitive `kalli`, so its inessive is `kalli` plus `s`, which is `kallis` again, and
the same holds for `kapsas`, `lusikas`, `maasikas`, `rahvas`, `taevas` and 109 more. The card read
`kallis → milles? kus?` with `kallis` on the back. Nobody can get one wrong, so the scheduler reads
every pass as a recall and stretches the interval, and the deck slot is spent for ever. Skipped only
where *every* accepted spelling is the word itself: seven words have the lemma as one of two,
`voodi / voodisse` among them, and there the pair is exactly what a learner should see.

**The gap's hint was the answer** wherever the gap wanted the dictionary form, which is 2,468 cards
and 302 of the ones the course builds. `lib/srs/cards.ts` says in its own comment that the lemma is
given deliberately because the card asks for the *form* rather than the vocabulary, and that was
true of every card except the ones where the form is the lemma. The hint falls back rather than
switching: the lemma and the meaning, then the meaning alone, then nothing at all. The last step is
not hypothetical, because a word can be spelled the same in both languages and `film`, `lamp`,
`monument`, `trend` and `kama` all had their answer sitting in the English. Thirteen cards end up
with no hint, and "which word goes in this gap" is still a question worth asking.

**And a gap may not leave its own answer standing in the sentence.** `buildCloze` blanks one
occurrence, the longest match, so a sentence saying the word twice printed it: `Poisid läksid ____
(= hakkasid kaklema).` had `kaklema` on the back. Refused rather than blanked twice, because two
gaps taking one answer is a different exercise and the marker takes one string; the caller has other
sentences and this costs fifteen cards. It is fixed in `buildCloze` rather than in the card builder
because the mock exam and the level check draw their gaps from the same function.

**And this corrects what is built, not what was.** A card's hint is a column on `Card`, so a deck
assembled before these three rules keeps the hints and the cases it was given: the fix reaches every
learner who has not started yet and nobody who has. That is deliberate rather than an oversight.
There is no path in this app that rewrites somebody else's cards, and the one that rewrites a
learner's own is the hand edit, which is theirs to ask for; a migration over every deck to save
three hundred cards a learner is a larger and riskier thing than the fault it would undo.

**And a crossword clue is the fourth place the same fault was waiting.** The clue is the English
gloss already beside the entry, which is what keeps a model out of it, and a few dozen Estonian
words are spelled the same in English: the clue for `film` was "film" and for `sport` it was
"sport, sports", so the answer was written across the top of the grid above the squares it goes in.
34 of the 5,329 words with a usable clue, 23 of them the answer exactly. `clueFrom` takes the
answer now and returns nothing where the clue gives it away, and that parameter is **required**
rather than optional for the reason `illSgShort` is: a caller that has not thought about this does
not compile. Case-insensitive, because a crossword is typed without case and "August" over `august`
hands over every letter.

**So the question is asked mechanically now, and it is `npm run audit:questions`.** Four instances
of one fault in an afternoon is a rule, and a rule found four times by hand will be found a fifth
time by a learner. It builds every card, every paper at every level, every level check and every
crossword clue the shipped dictionary can make, **44,818 questions**, and asks the one thing no unit
test can: is the answer already visible in what the learner is shown. No database and no key, since
it reads `prisma/data/expanded.json`, which is what the seed loads; about ninety seconds, most of it
the deck; a job in `ci.yml` rather than in the drift workflow, because this is a fact about our own
code rather than about anything upstream.

Two shapes are **not** faults and are excluded by name rather than by luck, because the first two
runs reported 2,060 of them and both times it was the harness. A matching task shows its word list,
since pairing sentences to words needs both halves on screen. A `heard` question hides its prompt
from the eye on purpose, so the answer written beside it is the exercise. And it carries a **floor**:
every generator sits in a loop that a `continue` away produces nothing, and this printed "none of
them prints its own answer" in exactly that case, which is the fault `scripts/lib/checks.mjs` gives
a suite a floor to prevent and which an audit script inherits from nobody.

**It disagreed with the rule written to fix the first three faults, which is the argument for it.**
The case rule was written to skip a card only where *every* accepted spelling was the word in the
question, keeping seven where the lemma is one of two. That was wrong, and shipped: the marker has
to accept `voodi` for the short illative of `voodi`, because refusing it is the `tuppa` fault
pointed the other way, so a learner who copies the word out of the question is marked right.
Showing the pair and asking it are different questions; `shownForms` still shows `voodi / voodisse`
wherever a screen prints a case, and no card asks for it.

`mentions` in `lib/estonian/cloze.ts` is the one whole-word test all three read, with the boundaries
the module already splits on rather than `\b`, which is ASCII and so does not know what õ is. After
all three: **zero cards print their own answer**, measured the same way.

**A generator fix settles the cards built from now on and not one card already in a deck.** That is
the half the audit cannot see, because it reads `prisma/data/expanded.json` and a learner's deck is
rows. `lib/srs/cards.ts` stopped building a case card whose answer spells the word in the question,
and a deck made before it still holds `liblikas → milles? kus?` with `liblikas` on the back: nothing
in the app will ever take one out, so it comes back due, the answer is read off the question, the
scheduler counts the pass as a recall and the slot is spent for ever. `npm run audit:decks` is the
other half. It reports by default and names every card it would remove, `--write` removes them, and
it is a command somebody runs rather than anything the app does on its own, because every row it
touches belongs to a learner. **Removing rather than suspending**, and the schema is what makes that
safe: `Review` has no foreign key to `Card` and carries its own `ownerId` and `lexemeId`, so the
history stays and only the unanswerable question goes. Suspending would leave a row somebody has to
decide about later, about a card that can never be right.

**And the round that fills itself from a deck inherits whatever the deck kept.** `/review/emoji`
draws its tiles from the learner's own case cards first, so it met those cards before any operator
ran anything, on a screen whose own lead promises the ending. It reads the rule off the card through
`acceptedAnswers`, which is the function that decides what counts as that card's answer everywhere
else, so the board and the marker cannot disagree about what the card says. Its dictionary top-up
applies the same test one layer up, since Estonian spells some of the eleven derivable cases like
the nominative and `liblikas`, `sipelgas`, `kotkas` and `kirves` are exactly the pictured nouns a
beginner meets: two of 1,166 case slots at A1 and eight of 1,903 at B1, so passing over them costs
the board nothing and 500 simulated boards a level come out full with no tile spelling its own word.

**And the scene game had it a third time, which is what made the audit worth widening.** A scene
puts three words on the screen and asks for one of them in a case, so a task whose answer is one of
those three is finished by copying, and `markDescription` grades the copy Good and sends it to the
scheduler. Eight of the 1,980 tasks the sixty scenes can set were free that way, every one of them
the seesütlev of a word already ending in `s`: `liblikas`, `sipelgas`, `kotkas`, `kirves`,
`labidas`, `maasikas`, `lusikas`, `haldjas`. `taskFor` refuses that case now and the round builder
walks the cases in priority order, so the word is asked in another one rather than dropped. Three
screens, three copies of one rule, and `npm run audit:questions` covers all three: it asks 46,790
questions over the shipped dictionary now rather than 44,818, and the scene section costs it 1.5
seconds.

**A single floor over five generators is a floor over the largest one.** The deck is 36,404 of
those 46,790 questions, so a section that stopped producing entirely, the crossword at 5,295 or the
scene game at 1,972, would leave the total above 40,000 and the script would print "none of them
prints its own answer" having asked nothing about it. Each section declares what it reaches and is
held to four fifths of it, printed beside the timings. The figures are **measured rather than
estimated**, and the first version proved why: `exam` was guessed at 6,000 from a sentence about a
different measurement and actually asks 2,500, so the check failed on the run that introduced it,
which is the check working.

**And Target was the fourth, which is when a rule stops being three coincidences.** The aim-and-hit
round draws four forms of one word under the lemma and the question its case answers, so a form
spelled like the lemma is the one option nobody has to read: 122 of the 51,447 case slots the
shipped dictionary can fill, every one a word ending in `s` whose seesütlev comes back to the
nominative. It is dropped from the pool rather than only from the answer, because such a form is no
better as a wrong answer than as a right one. **The test here is on what is printed**, and that is
where this differs from `lib/srs/cards.ts`: a typed card accepts every spelling, so any of them
showing makes it free, while a target carries one string and the learner hits it, so `voodi` in the
illative is refused for what the target would say rather than for what a marker would take.

`caseQuestion` is exported for the audit, because the round is a database read and cannot be asked
from a file. That section **samples where the others are exhaustive** and says so: the builder picks
one of the word's eleven cases itself, so one call asks one of them, and with the guard removed the
audit reported 15 of the 122 rather than all of them. Every one is a failure and the count is not
the point, but a fault on a single word could be missed on a single run. The rule in the round is
total; the audit is the backstop.

**A matching board is unique by what it asks with, not by what it answers.** 313 words carry a
picture and there are 249 pictures: the house stands for `maja` and `elamu`, the bus for `buss` and
`autobuss`, the man for `mees`, `meesisik` and `meesterahvas`, fifty of them in all. That is the table being right rather
than wrong, since Estonian has more than one word for plenty of things a picture can show and
`scripts/build-emoji.ts` has no business choosing between two true ones.

What it costs is downstream. `/review/emoji` is a *matching* board, so the picture is the question,
and two words sharing one put the same tile up twice against two different forms with no way for the
learner to tell which goes with which. Getting it wrong then marks a card they knew, which is the
`aitama` fault in a different room. Both of its pickers deduplicated on the lemma, which cannot see
this, because the two really are different words. The invariant is the pairing rather than either
line: a picker that writes a word down writes its picture down too, so a third one cannot be added
knowing half the rule, and `emoji.test.ts` is why that guard is load-bearing rather than
theoretical.

**A card never answers the card before it.** FSRS decides when a card comes back and has no
opinion on the order of the cards already due, which the queue took from `due` alone. A word's
cards are written in one `createMany`, graded in one session and come back within seconds of each
other, so they arrived side by side: measured on the demo deck, 13 of 32 due cards sat next to a
card of the same word, 17 of the 32 had a sibling within three places, and seven case cards of
`Eesti` ran consecutively. Answering `Eesti → millesse? kuhu?` straight after `Eesti → milles?
kus?` is reading the answer off the card before, and the log records a recall either way, so the
scheduler raises the interval on a memory nothing tested; the retrieval-effort account is that
what a recall is worth scales with how hard it was. `spaceSiblings` in `lib/srs/queue.ts` walks the
due list and defers a card whose word is still on screen, narrowing the gap it asks for rather
than giving up, so a session spends whatever room it has: six adjacent pairs become one on the
shape that was measured. It **moves and never drops**, asserted, because a spacer that filtered
would lose a due card in silence. New cards do not go through it: `inTeachingOrder` puts a word's
cards together in the order a lesson teaches them, and a first meeting is a teaching screen rather
than a retrieval.

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

**A browser refusing to autoplay is a fact about the gesture, and one module knows it.** Every
browser blocks `HTMLAudioElement.play()` on a page the reader has not touched yet and rejects it
with a `NotAllowedError`: the clip is in hand, the service answered, and the same call on a press is
allowed. `components/Speak.tsx` knew that and said so in a comment. The minimal-pairs round kept its
own copy of those three lines and did not: it wrapped the fetch and the play in one `try` and set a
state that replaces the whole drill with "No audio, no drill. It runs on TartuNLP and needs a
connection." That round autoplays on mount, which is the no-gesture case by construction, so on
every phone and every Safari a learner who opened it was told their connection was the problem,
handed a button back to Today, and never shown the 80px play button sitting behind that screen which
would have worked. A failure may not misname its cause, and this one sent people to check their wifi
about a browser policy. `playClip` in `lib/audio/clip.ts` is the one answer, `blocked` means ask for
a press, and nothing else in the app may call `new Audio(...).play()`; `components/Recorder.tsx` is
exempt by name, because it plays the learner's own recording from a blob it already holds, on a
click.

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

**A response built out of one learner's own rows says it is theirs and is never kept.** The
framework's silence is not a cache policy: `ImageResponse` stamps `public, immutable,
max-age=31536000` on anything that does not say otherwise, so the share card, which carries a
name, a streak and an XP total, was cached for a year at one fixed URL. Measured on the built app:
three fetches made one request, and the second and third were served from the browser's own cache
*after* everything `forgetThisDevice` clears had been cleared, so signing out on a shared laptop
left the last person's card one fetch away. `/api/export` and `/api/reminder` sent no freshness
directive at all, and the export is every review, every conversation with Anu and every exam
composition somebody has written. Every owner-scoped route says `no-store` now, and the two shapes
a shared cache would otherwise keep, a download and a picture, say `private` and vary on the
cookie that chose them. Asserted, because the next such route inherits the same silence.

**A call is booked once the request is worth answering, and not before.** The ledger writes a call
down when it authorises it, which is what stops ten tabs reading the same "under the limit"; the
price of that is that anything refused afterwards has to hand the booking back. `/api/tutor`
authorised first and then returned 400 on an empty message list, so four empty posts left four
pending calls against the global budget and spent four of that learner's ten for the day, having
answered nothing. And the speech route had the opposite fault: a cache miss makes a request of
TartuNLP and writes a WAV into storage nothing prunes, and nothing but an in-process limiter stood
in front of it, so `ALLOWANCE.TTS` described a gate that had never existed. A miss is metered now,
a joiner hands its booking back because it asked nobody for anything, and a failure hands it back
too.

**Adding to the shared dictionary is not the same as rewriting it, and a backup file is a document
somebody hands the server.** `restoreBackup` upserted every `Lexeme` in the file by id and then
deleted and recreated its forms, taking `lemma`, `provenance`, `editedBy`, `ekilexWordId` and every
`Form` exactly as written: any signed-in learner could rewrite any word every other learner reads,
forge "retrieved from Ekilex" on their own text, and delete the attested forms underneath. It does
what the seed does now, `ON CONFLICT DO NOTHING`, and what it creates is marked as the restorer's
own. `addExample` was the same door one plank narrower: no cap, no throttle, no attribution, and
`usableExamples` sorted by length alone, so eight short sentences from one learner pushed every
Ekilex usage off a word for everybody, including the sentences the mock exam and the level check
are built from. An attested sentence now outranks a typed one and a learner may occupy at most two.

**A half-configured deployment is neither mode and is answered as neither.** ADR-013 keys local
mode on the *absence* of the Supabase keys, and one of the two present is not an absence: it is a
hosted install with a typo in a dashboard. Read as local mode it opened that install to the
internet under one shared id with `isAdmin()` true for every visitor, behind a sign-in screen that
read as "set up later". `halfConfigured()` is the third state and the middleware answers 503
naming the variable.

**There is no analytics script, because /privacy says there is none.** Vercel Analytics was mounted
for every visitor of the hosted build, posting each page's path, the referrer and a derived visitor
id to a company outside the European Economic Area, while the deployment's own notice said "No
analytics, no advertising identifiers, no third-party trackers" and the generated recipients list
never named Vercel. Two of those three could have been edited to make the third true. This app is
for people whose data is the reason they are careful, and `/api/metrics` already answers whether
anybody comes back, out of the deployment's own database, which is what the notice describes.

**The review log answers a question nobody else can answer, and what makes that shareable is a
gate rather than a promise.** Every graded review already records what was asked and how it went,
because the scheduler needs it; `caseAccuracy` already turns that into accuracy per case for one
learner, and `lib/classroom/roster.ts` already does the group version for a class. `/api/research`
is the same two pieces aimed at the whole deployment: which case, which gradation pattern, which
word, and how often it comes back right. That number exists nowhere else. A textbook's difficulty
ordering is somebody's judgement, a classroom's is twenty-five people, and a corpus of written
Estonian records what natives produce rather than where learners fail. Nothing is collected for it
and no question is put to anybody, which is the same argument `/api/metrics` makes about retention.

**A table of averages looks anonymous and often is not**, so `lib/research/corpus.ts` implements
four rules of statistical disclosure control rather than describing them. A cell is published only
above `MIN_LEARNERS` people and `MIN_REVIEWS` answers, and below either it is *absent* rather than
reported as a size, because nothing in this file depends on the totals adding up. No one person may
be more than `MAX_LEARNER_SHARE` of a cell, which is the rule a head count alone misses: ten people
is not ten people when one of them is nine tenths of the data. A group that hides exactly one cell
hides a second, since a lone gap in a group whose total is reachable comes back by subtraction, and
no table publishes a total of its own. And counts are rounded and head counts banded, which is the
only defence against differencing two vintages of the file. The thresholds are the same in every
section on purpose: it makes one sentence true of the whole file, and one sentence is what an
operator can check before sending it to anybody. `gate` is the one place a figure is made,
asserted, and the four numbers have floors under them rather than equalities, because raising one
is always allowed and lowering one is the change worth stopping.

**And the export is where a rule this repo already had came due twice.** A `take` beside a
`distinct` bounds nothing, and Prisma's `distinct` deduplicates in the client, so counting the
corpus's learners that way would have read the whole of `Review` into the route whose own header
promises it never does: it is `COUNT(DISTINCT)` in one scan with the other four context figures.
And a source that will not answer is written down as a miss *except where the miss is not a
category*. A review can outlive its card, because `Review` has no foreign key to `Card` on purpose,
and grouping those as an `unknown` shape of question was tried and measured: the bucket is small by
nature, so it fails the threshold rule in nearly every group it appears in, fires complementary
suppression there, and takes the real category down with it. Sixteen rows became two. It is an
inner join now and the coverage is reported as a number at the top of the file instead.

**Nothing about it is asked at sign-up, and it can still be refused.** The output is not personal
data by the time it exists, so this is not consent, and a checkbox at the door would read as a
demand for permission the operator does not need, which makes the honest parts of the same screen
harder to believe. Settings has the row anyway, because this app is for people whose data is the
reason they are careful and "we aggregated it" is a sentence they have heard from somebody who was
wrong. Out means the rows are never read rather than subtracted afterwards, asserted on both
queries separately, since the first version of that check asked the file for a clause the file had
two of. In is the default and has to be: a missing row is everybody who used this before the
setting existed, and reading absence as refusal is a silent failure rather than a cautious one.
`/privacy` says all of it, and an invariant fails if the page and the Settings row stop naming the
same thing. `docs/19-research-export.md` is what to read before sending a file to anybody.

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

**And the learner's level is a tie-break on one path and a filter on the other, which is measured
rather than tidy.** A B1 account opened the app and was taught `keskmine`, an A1 adjective meaning
"average", which is a word somebody has before they start. It matches no gloss the almanac can ask
for, and that names the path: `pickAny`, the fallback for a day whose requests the dictionary could
not meet, filtered on nothing at all, so its skip landed anywhere in six thousand entries. It bands
on `bandsAround` now, and on a `cefr` being there at all, which is ADR-024's rule about the
suggestion row for the same reason: an entry with no band is the tail of the Wiktionary expansion,
and `aberratsioon` is no better a word of the day than it was a word to look up. The whole
dictionary is the second pass under it, because a learner far enough in has met every graded word
their level has and a blank panel is worse than a hard word.

The obvious fix is to band both paths, and half of it is wrong. Measured over a year of the shipped
dictionary at B1, banding the *themed* pick moved 37 days of 336 onto a word whose gloss carries the
day's meaning as a fourth sense, on 31 days that had the primary one. The almanac asks for `snow`,
`hand` and `week`, and those are A1 words because that is what those meanings are in any language:
there is no B1 word for snow. So the band ranks **under** the sense, where it changes six days of
336 and costs nothing, and a word chosen for today is a word for today first. Both halves have an
invariant, anchored on the order of two keys in one array, and `lib/progress/wordOfDay.itest.ts` is
the half that can fail on a word: it stars out everything the day could otherwise answer with and
asks a real dictionary which word three learners at three levels are handed.

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

**And a model may not overrule a fact, only move it about inside one.** A sitting of a paper is
the best evidence this app will ever have of whether somebody passes it, and the card puts the
result and a confidence percentage side by side: "You sat this and scored 85 percent, which is a
pass", over 46. Both were true of their own arithmetic. The figure was two thirds the sitting and
one third a model of coverage times recall, and coverage is the share of *this app's* word list for
the level that has stuck, which is not the examination's list. Somebody who learned Estonian in a
class and sat the mock to check can pass it knowing sixty of the five hundred words the course
happens to teach: their coverage is 0.12, their third of the blend is single digits, and it drags a
real result under the pass mark. Swept over the states a learner can be in, 90 of 288 contradicted
themselves and one sitting at exactly 60 read 25 percent.

"One bad evening is one bad evening" is the argument for blending at all, and it is an argument
about a *low* score, not a licence for a low model to overrule a high sitting. So the blend still
moves the number and moves it within what the sitting settled: a paper passed is never modelled
below the pass mark, a paper failed never above it. Where the two agree, which is most of the time,
nothing changes. The check is a sweep rather than three examples, because the fault lives exactly
where the two disagree and any case small enough to write by hand is one somebody chose.

**And one hole in the ladder used to promote somebody straight past it.** The hub prints two
levels, the one it would bet on and the one to aim at next, and it took the highest passable level
*anywhere* in the list and the lowest unpassable one. Those are the same two levels only while
confidence falls from left to right, and it does not: each level's figure rests on how much of this
app's own word list for it has stuck, and the lists are 1,069 entries at B1 against 99 at C1, so
meeting every C1 word the dictionary happens to carry outscores the B2 underneath it. A sitting
inverts it outright, since the clamp above puts a failed paper below the pass mark and a passed one
above, and a learner can fail B1 in July and pass B2 in September. Swept over 3,125 vocabulary
states, 802 came out the wrong way round, and the card said so in words: "We'd bet on you passing C1
today" over "B2 is next, and the gaps below are what's in your way", and at the bottom of the range
"We'd bet on you passing A2" to somebody whose own record showed A1 sat and failed at 20 percent.

`lib/assessment/score.ts` had this exact fault and corrected it, and its header explains at length
why: **the highest band passed consecutively from the bottom** is what every published placement
test scores on, because a level is a claim about everything you can do at it. The exam hub was
answering the same question by the rule the placement check was fixed away from, so the two screens
could disagree about one learner. The climb stops at the first level the app would not bet on,
whatever sits above it, and `next` is the level it stopped at, one above `assessed` by construction,
so the two can no longer point in opposite directions. The per-level figures stay as they are and
stay non-monotone, which is honest: the app knows different amounts about each level and publishes
the evidence tier beside each number.

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

**Where a screen lives and what a card is are still two questions, and the homework list was
neither.** `/tasks`, `/week` and the placement ladder were cut in the eighteenth pass
(`docs/13-mvp-status.md` §24): a to-do list and a calendar a class can set but a learner alone never
filled, and a second answer to the level check with nothing measured behind it. What stays is one
card on Today for work a teacher assigns, drawn by `components/TodayPlan.tsx` from the same
`agenda` buckets, because that card is already "what is due". Do not bring the pages back as
"organisation"; a learner organises their evening by opening Review.

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
without leaving the table, so the palette still reaches it. Two were there from the start: Anu,
because her button is in the corner of every signed-in screen and a row saying "Ask Anu" was a
second door onto a room whose door is always open; and the scanner, which is a way of getting words
*into* the dictionary and sat under "Look it up", which is not what it does. The class week was a
third until the page it led was cut.

The others are one question asked four ways. The deck, the level check, the mock exam and a class
are four readings of "how am I doing", which is
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
things. So they carry `within`, and each is on the page that names the thing it drills: the leech
clinic under the panel listing the cards you keep failing, minimal pairs under quantitative
gradation, the conjugation table under the verb pages, writing under the case it asks you to write
in, and pasting your own Estonian beside the scanner, which is the other way of bringing your own
text in. The count is deliberately not written down here: it was five when this was written and the
conjugation drill has joined them since, and a number in prose beside a table is the second list
this whole section is about. `components/DrillLink.tsx` is one
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
- `lib/assessment/`, `lib/estonian/`, `lib/exam/`, `lib/games/`, `lib/gamification/`,
  `lib/stats/`, `lib/collections/`, `lib/time/`, `lib/offline/`, `lib/security/`, `lib/scan/`,
  `lib/questions/`, `lib/ux/`, `lib/random/`, `lib/funding/` and `lib/copy/` stay free of
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
- **An inline link in a sentence is not a 44px target.** The floor covers a link drawn as a pill or
  as a lone icon, because those are controls; an inline link was given `padding-block` on the
  argument that a taller link is easier to press and the line still reads the same. Vertical
  padding on an inline box does not grow the line box, it grows the element's border box past it,
  so the link on a paragraph's last line reaches six pixels below the paragraph it is in: measured
  on the landing page's credit line at 360 with a coarse pointer, "TartuNLP" sat 5px outside the
  footer's own border and `scripts/test-containment.mjs` failed on it six times. Overlaying a
  bigger hit area with an absolutely positioned pseudo-element is the other way and is worse,
  since in running prose it takes the taps meant for a link on the line above. WCAG 2.2 makes
  exactly this exception for exactly this reason: a target in a sentence is constrained by the
  line-height of the text around it, and the way to make it easier to hit is to give it a line of
  its own.
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
- **A character a reader cannot see is written down by name, and that is a rule about the file
  rather than about the string.** `lib/research/corpus.ts` joined a cell's key parts on a NUL, which
  is the right separator, since it cannot occur inside a dimension value and so two keys collide only
  if they really are the same key. It was typed as the byte. A literal control character makes the
  file **binary** to every text tool that opens it: `grep` stops printing matches and says "binary
  file matches", which is how this was found, by searching that very file for its own anonymity floor
  and getting nothing back. `git diff` and a review go the same way, and an editor or a paste can drop
  one leaving no visible change. It happened twice more in one session here, both times a `\b` in a
  Python heredoc becoming a backspace inside a regular expression, so a check could no longer fire on
  anything and passed. `"\0"` and `"\b"` are the same strings at runtime and leave a text file on
  disk, which is the argument `DASH_SEPARATED` already makes one directory over. Tab, newline and
  carriage return are how a text file is laid out and are allowed; `lib/auth/access.test.ts` is
  exempt by name, because the NUL in it is the thing under test, and the exemption is checked for
  staleness so it cannot become a parking space.

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
- **And a date written on a server is written in the learner's zone, not the deployment's.**
  The rule above was half enforced. Its invariant asked about `toLocaleString(undefined`, which is
  one of the three ways to write a date here and the one nobody uses twice: `formatDateTime` and
  `formatTime` exist so a screen does not have to spell the options out, and both end in
  `Intl.DateTimeFormat(undefined, …)` with **no `timeZone`**. So four server components went
  straight through a check whose own header describes what they were doing, and on Vercel, which
  runs UTC, a learner in Tallinn who sat a paper at 01:30 on the third read "2 Sept, 22:30" on the
  exam hub, on their result, on their own reports and on the level check. A locale gets the shape
  of a reading wrong. A zone gets the **day** wrong, on four pages whose whole subject is when
  something happened. `components/DateText.tsx` is the server half of `LocalDate` and pairs the
  two things that were drifting: one set of options for the fallback and for the client formatter,
  in the zone `learnerDayClock` resolved, with the hour pinned to 24 wherever an hour is asked for.
  The invariant reads all three spellings now, and was made to fail on each.

- **And Today's own date is the one exception, because it is not a date being reported, it is the
  first Estonian a learner reads each morning.** The rule above is about a date the app hands back:
  a deadline, the day somebody joined a class, when a paper was sat, and the shape of those belongs
  to whoever is reading them. The line above the greeting is a word being taught. The seven weekday
  names and the twelve month names are in every course's first fortnight, and a date is the one
  piece of Estonian that needs no gloss to be useful, because the reader already knows what today
  is: they are matching a word they have against a word they are learning, which is how a weekday
  name is learned anywhere. So it leads `kolmapäev, 2. september` and keeps the English weekday
  beside it as the cross-reference, the same shape every grammar screen takes with the Latin case
  names, and that English is **pinned** rather than the reader's, because it is a gloss and every
  other gloss in this app is English. `lib/time/estonianDate.ts` reads both out of CLDR, which is an
  attested source in the sense Ekilex is and not a string anybody typed, so ADR-005 is kept the way
  the almanac keeps it: delete the two Estonian words from that file's comments and its output is
  identical. A build whose locale data has no Estonian **says nothing rather than English**, since
  `et-EE` on a small-icu build formats as English and reports no error, and English under a
  `lang="et"` would be read aloud by a screen reader with Estonian phonology; the page falls back to
  the line it had before. The zone is still the learner's, because that half of the rule above is
  about which day it is rather than how it is spelled.
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
- **A grid item needs `min-w-0` for the same reason `main` did, and a column count is a fact about
  the width.** The week calendar failed the containment sweep four times over and the two causes are
  worth keeping apart. A `truncate` paragraph is `white-space: nowrap` and `overflow: hidden` clips
  what is *drawn* without reducing what the box *asks for*, so the day card's min-content was its
  longest event title; a grid item's automatic minimum is its min-content, so one long title made
  every day of the week 382px wide inside a 360px phone. The `min-w-0` already on the text block
  cannot help, because that floors a flex item rather than capping what the column is sized to. And
  seven columns at 768 gave each event row **17 pixels**, with a 44px delete button inside it that
  is the tap-target floor and not negotiable, so the icon was drawn 13px outside the row it belongs
  to. A week is a list of days before it is a grid of them, so the columns arrive at 1280, which is
  the first width where they leave room for a title beside the control: at 1024 the row is 55px and
  the button and its gap take 50 of them. The short weekday name moved with them, since an
  abbreviation is for a column.

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

**Anu is told who is asking, and she is told by the server.** The chat posted `level: "B1"` for
everybody, typed into the client, and the route believed it: a beginner on their first evening and
a C1 speaker were both taught as B1, and nothing the app had measured about either reached her.
`lib/progress/tutorContext.ts` reads three things off the learner's own log at once, the level
`courseLevelFor` gives every other screen, the weakest case `caseAccuracy` gives the Progress page
over the same shared query, and the unit the deck has started and not finished, and `learnerNote`
puts them in a block sent **after** the static prompt rather than inside it, so the part that does
not change per person stays cached on every provider. The wording of that block is a decision: the
weakest case is offered for when a question touches it and never as a refrain, because a learner
who hears about their partitive every time they ask about the weather stops asking. It needs twelve
answers before it names a case, four times the chart's floor, since a teacher raising it in
conversation is a stronger claim than a bar. The route no longer reads a level from the request at
all, asserted.

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

**And an employer is a third seat, which is narrower than a teacher's rather than the same one
renamed.** `Classroom.kind` is `CLASS` or `WORKPLACE` and the difference is which query runs.
The per-student weakest case was widened into a teacher's view on a pedagogical argument, that the
aggregate said the class was weak on the partitive and nothing about who to sit next to, and that
argument does not survive the move into a workplace: an employer has no lesson to plan, and "Kadri
keeps getting the partitive wrong" follows somebody into a review they never see. So
`workplaceRoster` never selects `targetCase`, hands `assessReadiness` an empty `cases`, and returns
a `CohortSummary` with nowhere to put one. There is no XP column either, because ranking colleagues
by how much homework they did is a league table their employer is reading, and the list is ordered
by name for the same reason: sorting by band would put whoever is struggling at one end of it.

What a sponsor gets instead is a **band, never a percentage**. The learner's own hub prints "41
percent likely to pass B1" and should, since they can act on it and the tier beside it says what it
is worth; the same number about a named employee looks exact, cannot be argued with by the person it
describes, and decides nothing a band would not. `bandFor` reads `LIKELY_PCT` and `CLOSE_PCT` out of
`lib/exam/readiness.ts` rather than drawing its own lines, and it refuses to place anybody at all
below `MIN_EVIDENCE_TO_BAND`, which is stricter than the model's own ceiling: "needs time" beside a
name, computed off nine reviews, is a judgement the log cannot carry. A cohort's evidence is its
**weakest** member's, so one long-standing colleague cannot vouch for a group who joined last week.

The cost of a group is a fixed number of queries whatever its size, which is the same rule
`classRoster` states about itself: the per-member alternative is `readinessSignals` in a loop, nine
each. Accuracy and skills are read over one window (`COHORT_WINDOW_DAYS`) rather than the row cap a
single learner gets, because a cap spends itself on whoever reviews most and a figure printed down a
column beside several names has to cover the same stretch for all of them. The all-time review count
and the last review are read separately, so a member's evidence tier matches the one their own hub
shows them and somebody who stopped a year ago is not reported as never having reviewed.

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
question offered "Skip this one" beside Check. The overall level averages three skills
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

**And the table of question words was missing three cases, so three governments could not be read at
all.** Ekilex records a government as the question word a verb answers and `formatGovernment` names
the case beside it, which is what `parseGovernment` reads. That table was typed and had eleven of
the fourteen: essive, terminative and abessive had no row, so `kellena`, `kelleni` and `kelleta`
came back unannotated and the entry parsed to no case. `töötama kellena`, which is how you say what
you do for a living, had no government card; and `esitama` and `käsitama` govern the essive *beside*
the partitive, so the drill could offer it as a wrong answer and mark a learner wrong for knowing
it, which is the fault the paragraph above exists to prevent, arriving through a gap in a table
rather than through the parser. It is read off `CASES` now, which already holds the question a case
answers, so a case cannot be missing and the fourteenth would be covered by arriving.

Reading it back out has one trap and it was walked into on the first attempt. `kus` is the question
for the seesütlev *and* the alalütlev, and `kuhu` for the sisseütlev *and* the alaleütlev, so both
appear in two rows and a loop that wrote them down leaves whichever it read last. The harvest's diff
had `kus (adessive)` in it: a verb Ekilex records as taking a place would have been drilled as
governing one particular case, which is inventing a government. The three adverbial questions keep
the labels that name no case, and the loop does not overwrite them.

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
is the one that is confused, so the machine is never the judge. The overall level is the **average**
of the measured skills, floored (ADR-020 amendment 2).

**And the average is the level, because the minimum was reporting a stranger three bands under
themselves.** The rule was the weakest measured skill, on the argument that a CEFR level is a claim
about everything you can do at it. That argument is about a certificate, and the screen it printed
on says twice that it is not one. What it did to a real sitting of B2 reading, A1 listening and B2
writing was print **below A1**, on the one screen whose whole job is telling somebody where they
stand, and there is no reading of that learner under which it was true. A minimum takes the noise by
construction, and a skill can miss here for reasons that are not the learner: listening abandons
itself when the speech service will not answer, and writing is the noisiest skill in the paper by
measurement, for the reason two paragraphs down. So `overallFrom` takes the mean over `rank` and
floors it, the floor being the cautious half of the old rule and the half that was doing the work.
Where the average lands at least half a band short of the next one the result says so, *a confident
A2, and nearly B1*, and that sentence is deliberately rare, because a caveat printed on every result
stops being read.

`overall` is therefore a **derivation** and not a measurement, which is the thing to hold on to: the
per skill columns are what the sitting found and are never touched, and `readOverall` in
`lib/progress/assessment.ts` recomputes the headline from them on the way out, so a row written under
the old rule and one written under this one are read the same way and the history list does not show
two rules side by side. `Assessment` is still append-only in the sense that matters.

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
overall level is drawn from three skills**, so noise anywhere lands on the result, which is
why raising reading alone took it only to 52%. That last finding is also the measurement behind
amendment 2: a rule that reads the floor does not merely inherit the noise, it selects for it.

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

**And "did they use the word" is answered by the word's own forms, not by its first three
letters.** `usesRequiredWord` prefix-matched the lemma minus its last letter, floored at three
characters, on the reasoning that Estonian inflects and `raamatust` is `raamat` used. It is, and so
was `kirjutan` for `kiri`, `arvan` for `arv`, `aeglane` for `aeg` and `abikaasa` for `abi`.
Measured over the shipped dictionary, 1,529 of its 5,363 headwords have a needle that reaches a
different headword, so on nearly a third of the words a written task can name, a candidate could be
credited for a word they never wrote. A mock exam that marks generously tells somebody they are
ready to book the state examination when they are not, which is the one thing it exists not to do.

No prefix rule tells `kirja` from `kirjutan`, because the difference is not in the first letters.
What does is the table of forms the dictionary already holds, so `MustUseWord` carries the part of
speech and the forms, and `acceptedUses` is the lemma, every stored form, and the forms a rule
builds off those: the ten regular cases from the genitive stem, or the present, negative, conditional and
imperative from the stored first person (ADR-005 amendment 1). Nothing is written; `written.ts`
stays pure because both derivation modules are, which is what lets the marker and the screen agree
on which spellings count without either reaching a database. The rule is stricter and had to be checked for
being *too* strict: the thinnest entry in the dictionary accepts ten spellings and none accepts only
its headword, which is asserted rather than remembered.

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
`conjugatedForms`, `pres1sgFrom`, `useAudioPrefs`, `fetchClip`, `playFeedback`, `VOICES`,
`nomPl`, `EMOJI_LEMMAS`, `acceptedUses`, `markDescription`,
`billFor`, `reserveMicros`, `distinctClips`, `MEASURED`, `PRICE_REFS`, `SERVICES`, `.range`,
`MIN_LEARNERS`, `buildSection`, `researchOptOut`, `participationFrom`, `slotOfCard`,
`isKnownSlot`, `practisedSlot`, `askableSlots`, `shapeFor`, `markFlash`, `formIndex`,
`slotsNeeded`, `askableFor`, `MasteryBoard`. Most of them now
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
npm run audit:decks      # case cards already in a deck whose answer spells the word in the question (--write removes)
npm run audit:cases      # derive every case of every noun, both columns, and compare with Ekilex (--write fills the gaps)
npm run audit:senses     # re-check every course gloss against the sense Ekilex files it under
npm run audit:merge      # after merging: what the other side added that is no longer here
npm run check:secrets    # fails if a credential reached the client bundle
npm run db:seed          # reload the built-in dictionary
npm run harvest          # re-ask Ekilex for the syllabus vocabulary (cached, needs EKILEX_API_KEY)
npm run build:frequency  # recount the commonest words (cached corpus, --refresh to re-fetch)
npm run scenes:template  # write the spreadsheet a native speaker fills in, one sentence per scene
npm run scenes:import    # read it back, gated word by word through the dictionary
npm run wordlist         # rebuild the 155k headword list in 32 requests (cached, needs EKILEX_API_KEY)
npm run measure:scenes   # how much of a conversation the dictionary can already carry
npm run eval:scene       # what a model reaches for in a scene, and what the gate withholds
npm run demo             # two months of sample history, for looking at the charts
npm run test:e2e         # every browser suite, needs the server running
npm run test:browser     # the newer browser suites: routes, modes, offline, scanning, suggestions, a11y
                         # (test-first-day runs first and needs an empty deck: reseed before it)
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

**An integration test over the shipped dictionary states that it is the shipped dictionary.** The
crossword compiler is a fact about a real pool of words at a real level, so a dictionary another
suite left behind is a different question wearing the same name: `test-restore.mjs` empties it and
restores it, `test-edit.mjs` corrects an entry, `test-containment.mjs` ticks a word into it. Run any
of them first on a machine that is not CI and `crossword.itest.ts` failed with "B1 on 2026-01-01 got
no grid", which reads as the compiler being broken and sends the reader into `lib/games/crossword.ts`.
It cost an hour of looking in the wrong file. The precondition is asked once now, against
`SEED_SET_SIZE`, and fails in 93 milliseconds naming both the state and the command that fixes it.

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

**A suite waits for what it is about to assert, and `networkidle` is not that.** `test-first-day.mjs`
passed on this machine keyed, passed keyless, and failed in CI, which is the machine that decides.
The cause was in the navigation rather than in the app: the service worker installs on the first
page load and then fetches the shell a URL at a time, and `PrefetchLink` asks for a whole page
whenever a pointer settles or a link takes focus, so a wait for half a second of network silence is
a wait on all of that, on a two-core runner, forty-four times. Playwright discourages `networkidle`
for exactly this reason and 120 uses of it sit in `scripts/`.

Swapping it for the element is not enough on its own and would have been worse: a route group's
`loading.tsx` renders a `main` too, so waiting for the element trades a timeout for a skeleton,
which reads as an app fault rather than as a wait. The wait is now the check's own condition, `main`
holding text and exactly one `h1`, with a budget, and it is **best-effort**: a page that really does
render nothing runs the budget out and reaches the check, which says what it found. Throwing there
would report the same thing as a bare "Timeout". The elapsed time is in the failure message, because
a page that rendered nothing and a page that was still rendering read identically without it.

And the local runner now unsets the provider keys, because this box carries three and CI carries
none: a suite measured with `EKILEX_API_KEY` exported is a suite measured on a different app, which
is the fault `PROVIDER_KEY_ENV` exists for one layer down.

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

**And one suite's position is the whole of its safety.** `test-restore.mjs` empties the shared
dictionary and rebuilds it from a backup, which is what it exists to prove, and everything it puts
back is created as the restorer's own, because that is what a restore may do to a word the
dictionary does not already hold. Afterwards not one row is marked `SEED`, so every suite that
reads a seeded word is looking at a dictionary that no longer has one. `test-scan.mjs` says so out
loud when it happens, waiving seventeen checks and naming the cause, which is the right behaviour
and is not a substitute for the order: the person reading it is sent to reseed a database that was
seeded correctly an hour ago. The only thing that kept this harmless was the order of two lines in
a workflow file, so it is asserted, inside the browser job, since the sign-in suite is a separate
job with a database of its own and appears later in the same file.

**And the state a stranger installs into is a state, so a suite runs in it.** Every browser suite
ran after `scripts/demo-data.ts` laid down two months of history, which is the app as somebody who
has used it sees it. Half of this app is a figure computed from a review log, and on an empty one
every panel takes a branch nothing had ever rendered: no cards, no reviews, no settings, no
placement, which is what every learner has for their first five minutes.
`scripts/test-first-day.mjs` walks **every route the filesystem has** in that state and asks the
four things a first-day fault actually produces: does the page answer, does it render without a
client error, is there anything in `main`, and is there exactly one `h1`. Every route rather than a
chosen spread, for the reason `test-containment.mjs` gives about widths, and read off `app/` rather
than a list, because a list somebody maintains is a list that falls behind.

Two things about it are decisions. It **waits for `main` rather than sleeping**: several of these
routes redirect, `/` to the wizard and `/exam/A1` to a seeded paper, and a fixed 500ms held against
a warm server and lost four routes against one that had just started, which is exactly the state
this suite runs in, first, before anything else has touched the app. A suite that reports four
faults that are not there is worse than no suite. And it **states its precondition rather than
inheriting it**: it asks the app whether the deck is empty and stops if it is not, because run after
the fixture every check would pass while measuring a different app, which is the shape of the waiver
that left the first-run wizard verified by nothing for months. It runs above `demo-data.ts` in CI
beside `test-assess.mjs`, and the invariant that used to name one suite names both.

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
