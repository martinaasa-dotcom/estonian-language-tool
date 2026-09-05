# The gloss review, A1 to B1

A spot check of 25 words put gloss precision at about 96% across A1 and A2. That is a good
number and it is not an audited one, and the difference matters here more than it usually does:
a gloss is the answer side of a flashcard, so a wrong one is not shown once and forgotten. The
scheduler repeats it until the learner has learned it.

This is the full pass over the band, and what it found.

## 1. Method

Every one of the 2,164 entries at A1, A2 and B1 was re-derived from its own Wiktionary page and
compared with what ships in `prisma/data/expanded.json`. The parser reproduced all 2,164 stored
glosses exactly before anything was changed, which is what makes the rest of it evidence: every
disagreement found afterwards is a fault in the parser rather than a difference of method.

`npm run audit:glosses` is that pass, kept. It caches every page, so re-running it is free.

Sampling could not have found what this did. The faults are not noise spread evenly through the
data; they are four mechanisms, each firing on a particular shape of markup, and each producing
a perfectly ordinary English phrase on the way out. There is nothing on the screen to notice.

## 2. What was wrong

**25 of 2,164 in the band, 41 across the whole dictionary.** Four of the 25 were not a different
shade of the same meaning. They were a different word:

| word | shipped as | should be |
| --- | --- | --- |
| `lamp` | random | lamp |
| `oktoober` | hard hat | October |
| `ooper` | opera house | opera |
| `rida` | many, much | row |
| `mark` | tally mark | mark |
| `moment` | aspect, side, point | moment |

One cause under all of them. Wiktionary writes some definitions as `{{l|en|lamp}}`, a template
that renders as the word "lamp". `cleanWikitext` removed balanced templates wholesale, so the
line went empty, and the picker moved on to the next numbered sense. On a page with more than one
etymology the next sense belongs to a different word, and `lamp`'s is a colloquial adjective
meaning "random".

Where the same template sat in the middle of a line the gloss survived with a hole in it, which
is worse, because a hole reads as a typo and not as missing data:

| word | shipped as | should be |
| --- | --- | --- |
| `segama` | to , to , to | to mix, to stir, to mingle |
| `vana` | an person | old |
| `neiu` | a unmarried , a , or a slightly older | a young unmarried woman, a teenager, or a slightly older girl |
| `sort` | kind, , brand | kind, sort, brand |
| `esimees` | chairman, chairperson, , president | chairman, chairperson, chair, president |

A third group lost only their first synonym, so they were never obviously broken and were still
teaching less than they should: `käsk` "command" for "order, command", `norm` "quota, standard"
for "norm, quota, standard", `trahv` "penalty, citation" for "fine, penalty, citation",
`variant`, `avalik`, `eesmärk`.

A fourth group carried a space before their punctuation from a different template being removed
in the same way: `kartma` "to be afraid , to fear", `kesklinn`, `lavastama`, `riiklik`,
`varblane`, `veoauto`.

And one, `müristama`, shipped as "to make a certain noise." That is a `{{rfdef}}` line, which is
an editor asking somebody to write the definition. With the request stripped out, what is left
looks like a definition. The word means "to thunder", on the next line down.

## 3. What was changed

`lib/dict/wiktionary.ts`, in three places, and then the data:

1. **Templates whose output is the gloss are unwrapped, not deleted**: `{{l|en|…}}` and its
   aliases, `{{tcl}}`, `{{vern}}`, `{{w}}`. **Only when the language is English.** `{{m|et|kohta}}`
   is an Estonian word quoted inside an English note, and unwrapping it by a language-blind rule
   would write Estonian into a gloss, which is the one thing this file may never do (ADR-005).
2. **The gap a removed template leaves is closed**: repaired once at the end rather than at each
   template, so a kind of markup nobody has met yet cannot open a new hole.
3. **A sense Wiktionary has asked somebody to define is skipped.**

Both shapes are invariants now, and both were made to fail before being trusted. The language
guard took two attempts: the first version of that check quoted an Estonian word with no
diacritic in it, inside a trailing parenthetical the parser strips anyway, so deleting the guard
left the check passing.

`müdistama` was dropped. Its only Wiktionary sense is a request for a definition, so there is no
gloss to ship, and the builder would not have written it in the first place.

## 4. What was deliberately not changed

**Sense order stays the page's own.** Demoting the senses Wiktionary marks `rare`, `obsolete` or
`dialectal` looked obviously right and was reverted after measuring it. It corrects `kõrb`, whose
everyday "desert" sits under a later etymology than a `rare` sense meaning a large uninhabited
forest. It also breaks `soldat`, tagged `obsolete` on "soldier", which would have been drilled as
"jack"; `vats`, `dialectal` on "belly", which became "rumen"; and `raisk`, `dated` on "carrion",
which landed on a vulgar usage note. The structure of the good case and the bad ones is
identical, so no rule separates them. Which sense a learner needs is a lexical judgment, and
this pipeline does not get to make it.

`kõrb` is therefore still glossed "a large uninhabited forest" and is wrong. It is left for a
person, which is what the dictionary is editable for.

**Part of speech was not touched, and is a separate fault.** `lilla`, `kallis`, `valge`, `sinine`,
`noor`, `tark` and around 30 others are adjectives labelled `NOUN`. The seed builder draws
candidates from Wiktionary's categories in order and keeps the first, and nouns are first, so any
word that is both comes out a noun. Their glosses are right, so it was out of scope here.

That was done separately afterwards and is §6 below. It turned out to be the same fault in a
second column, which is the argument for having written it down rather than fixed it in passing:
the gloss and the label are two facts about one definition line and were being read from two
different places.

## 5. The other half of the glosses

The course landed while this was in progress, and it brings a second gloss source:
`prisma/data/harvested.ts`, 1,248 words whose English is **authored** rather than parsed. Every
fault above is a parser fault, so none of them can reach that file. It is still glosses a learner
is drilled on, in the same band, so it was checked rather than assumed.

684 of the 1,248 have an independent English reference, either a Wiktionary Estonian entry or an
entry in `expanded.json`. **657 agree with one. The 27 that share no word with any reference were
read individually, and all 27 are a choice between synonyms rather than an error**: "native
language" against "mother tongue", "grey" against "gray", "cheerful" against "happy", "witty"
against "funny". Several are better than the reference. `meeldima` is glossed "to please, to be
liked by", where Wiktionary says "to like"; the Estonian verb takes the thing that pleases as its
subject, so the harvested gloss is the one that will not mislead a beginner about the case
pattern.

No correction was made to that file, and none appeared to be needed. The remaining 564 words have
no Estonian Wiktionary entry, so this method says nothing about them either way.

## 6. The part of speech, which was the same fault in the next column

Left open above and recorded as `docs/12-open-questions.md` Q8, on the reasonable-sounding grounds
that the glosses were right and it was only wrong metadata. It was the same fault. The gloss and
the label are two facts about one definition line, and they were being read from two different
places: the gloss from the first sense on the page, the label from whichever of Wiktionary's four
part-of-speech categories the candidate happened to be drawn from first.

Nouns are drawn first, so any word listed as both came out a noun.

**The recommended fix was measured and would have broken 25 words.** Q8's default was to prefer
the more specific category, adjective over noun. Run over the whole dictionary that relabels 86
entries, and a quarter of them against their own answer side:

| word | shipped gloss | category rule says | correct |
| --- | --- | --- | --- |
| `lamp` | lamp | ADJECTIVE | NOUN |
| `pea` | head | ADVERB | NOUN |
| `mari` | berry | ADJECTIVE | NOUN |
| `kama` | kama | ADVERB | NOUN |
| `seadus` | law | ADJECTIVE | NOUN |
| `norm` | norm, quota, standard | ADJECTIVE | NOUN |
| `kreem` | cream | ADJECTIVE | NOUN |

`lamp` is in the adjectives category for the colloquial sense meaning "random", which is the exact
sense the gloss audit above had just finished removing from the answer side. Reversing the category
order does not fix this, it only moves it onto a different set of words. A category says the word
has *some* sense of that kind somewhere on its page, and that is not the question.

**The question is what part of speech the shipped gloss is**, and every definition on the page sits
under a heading that answers it. Reading both facts off the same line is what makes them unable to
disagree. `extractEstonianEntries` returns each sense with its heading, and `lib/dict/pos.ts`
decides between the three sources that have an opinion: Ekilex draws the verb line, because that is
the line that decides which principal parts a word has and the only one Ekilex actually draws; the
page's own heading decides among the nominals; the category is a fallback for a page headed
`Participle` or `Postposition`, which are true things this app has no column for.

**One asymmetry, and it is in the sources rather than a thumb on the scale.** The heading and the
headword template disagree on 13 pages of 5,363, and neither wins them all. `võimas` is headed
`===Noun===` and declared `{{et-adj|võimsa|võimsat|s=võimsaim}}`; `üksik`, `lämbe` and `lämmi` are
headed `===Adjective===` and declared `{{et-noun}}`. All four are adjectives. `{{et-adj}}` carries
a comparative and a superlative, which only an adjective has, so nobody reaches for it by accident.
`{{et-noun}}` is the ordinary nominal declension, and an Estonian adjective declines exactly like a
noun, so an editor writing out the forms of `üksik` reaches for it with nothing whatever implied.
One is a statement and the other is a shrug, so an adjective claim from either source is enough and
a noun claim from the template alone is not.

**61 labels were corrected**, 60 NOUN to ADJECTIVE and one ADVERB to ADJECTIVE (`parem`, whose
first sense is the comparative of `hea`). `npm run audit:pos` is that pass, kept, and it shares the
gloss audit's page cache so whichever runs second is free.

**Twelve of the 61 were being seeded twice.** `pos` is half of `Lexeme`'s conflict key, so a word
the course harvest labels `ADJECTIVE` and the builder labelled `NOUN` did not collide: it was
inserted twice, as two entries with two ids and two sets of cards. `kallis`, `valge`, `noor` and
nine more were in the dictionary twice and nothing anywhere reported it. They are one entry each
now, which is why `SEED_SET_SIZE` went down by twelve without a word being dropped.

That same key is why `prisma/data/pos-corrections.json` exists. A deployment seeded before this
holds `kallis` as a NOUN, and a reseed looking for the ADJECTIVE finds no conflict and adds a
second one beside it. `applyPosCorrections` repoints the existing row instead, before anything else
the seed does and before the early return a normal deploy takes, so the correction reaches the
deployments that need it and skips the ones that do not. It writes no content: the translation, the
forms, the examples and the provenance are the ones that were already there, the row keeps its
id, and every card and review still points at it.

**What was deliberately not changed**, on the same reasoning as §4. `rõõmus` is headed
`===Noun===` on Wiktionary with `{{et-noun}}` under it and glossed "happy", which is an adjective by
any reading. Both signals agree and both are wrong, so no rule separates it from a genuine noun,
and inventing one would be this pipeline making the lexical judgment it does not get to make. The
course harvest carries the correct `rõõmus` adjective independently, so a learner meets the right
one. `asjatundja` and `brünett` read as nouns in English and are headed `===Adjective===` on their
own pages; that is Wiktionary's call and the dictionary is editable.

**The course harvest was checked for the same fault and does not have it**, which is a fact about
how the two files are made rather than luck. `prisma/data/harvested.ts` is generated and its `pos`
is a passthrough: `harvestWord` reads the label off the syllabus entry and returns it untouched, so
the label is authored by the same person who wrote the English gloss, in the same line of
`lib/collections/syllabus/`. The two cannot come apart the way a parsed gloss and a category can.

Checked rather than asserted, because "by construction" is still a claim. The authored gloss has no
heading it came from, so it is matched to the Wiktionary sense it describes and that sense's heading
is what the label is compared against. **673 of the 1,248 could be checked and none disagreed**; 475
have no Estonian Wiktionary entry and 100 no sense matching the gloss, which is the same silence §5
reported for the glosses and is reported rather than guessed at. The one review list worth printing,
nominals whose lemma carries an ending Estonian adjectives often take, came back empty: all 41 are
`-mine` and `-nne` nominalisations (`hindamine`, `ettekanne`, `värbamine`), which are nouns by
construction.

That pass is kept, inside `npm run audit:pos`, and it **reports and never writes**. The file says it
is generated, and a correction belongs in the syllabus, which is also where the existing test would
otherwise stop agreeing with it: `syllabus.test.ts` keys the course's words on `lemma|pos` against
the harvest alone, so a label changed in one file and not the other fails `npm test`. That was
verified by changing one and watching it fail, which is also how the audit pass itself was trusted.

## 7. Where it stands

25 corrections in 2,164 is a defect rate of 1.2%, so measured precision across A1 to B1 is 98.8%
against Wiktionary as the reference. Six of the 25 were a wrong word rather than a thin gloss,
which is 1 in 360.

The three residual known-wrong entries are `kõrb` (above), `krõps`, glossed "freezing, bitter"
from its adjective sense where the noun is a crisp, and `talguline`, "participant at.", truncated
because the Estonian word it pointed at was correctly refused. All three need a person, not a
rule.

## 8. The rest of the dictionary, 2026-08-31

Everything above is A1 to B1, which was the band the faults were found in and is 2,164 of the
5,363 entries in `prisma/data/expanded.json`. The 3,199 above it had never been asked, so the
number this file reports was a number about two fifths of the dictionary.

The whole file has now been through the same pass. **All 5,363 entries agree with their own
Wiktionary page, and nothing was written.** The four parser faults in section 3 were the whole
of it: fixing them at A1 fixed them at C2, which is what a mechanical fault looks like from the
other end, and is the argument for having found them by parsing rather than by sampling.

A clean result is only worth reading if the check that produced it can fail, and this one had
never printed anything but a pass over the untested three fifths, so it was made to fail first.
Running the same comparison against a stored translation known to be wrong flags all 5,363. The
comparison fires; there was simply nothing to fire on.

`.github/workflows/drift.yml` asks this question every Monday and had not yet fired: it reached
main on 2026-08-31, after that morning's cron, so its first execution was this one by hand. What
it is watching for from here is not the parser, which is now agreed with end to end, but
Wiktionary editing a page out from under a gloss. That is drift rather than a bug, which is why
the job reports it to a person instead of writing to the repository.

The senses this cannot see are unchanged and are section 6's: a page that is wrong about its own
word, or right in a sense a learner does not need. `kõrb` is still glossed "a large uninhabited
forest". Those are for a person to correct, which is what the report queue on every dead end and
the reviewers in `ADMIN_EMAILS` are for.
