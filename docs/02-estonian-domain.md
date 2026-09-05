# The Estonian Domain Model

This is the most important document in the repository. Every other feature is a view onto the model
described here. If the domain model is right, the app teaches Estonian; if it is wrong, the app is a
tab bar with a chat window in it.

**Design principle.** The app never *generates* Estonian morphology with hand-written rules. It
*retrieves* authoritative forms from Ekilex and *explains* the pattern. Estonian morphophonology is
too irregular for a rules engine to be trustworthy, and a confidently wrong form is worse than no
form. Rules are used only to *explain* retrieved data, never to invent it.

**Naming principle.** Every table in this document names a form in Estonian first, because that is
how the language is taught: *ainsuse omastav*, not "genitive singular". The app follows the same
rule on every screen (ADR-023). A case is identified by its Estonian name and by the question it
answers, which is the pair a class hears together; the English or Latin name is kept beside it as a
cross-reference for anyone reading an English grammar, and never as the heading. The verb is named
by *aeg*, *kõneviis*, *tegumood* and *pööre* rather than by a row of English-shaped tenses, of which
Estonian inflects for two. `lib/estonian/terms.ts` holds the terms, and holds none for a point where
a class has no settled one.

---

## 1. Nouns: principal parts, not "3 of 14 cases"

Estonian has 14 cases. Only a handful of forms are unpredictable; the rest are regular suffixes on a
known stem. The unpredictable ones are the **principal parts** (*põhivormid*), and they are the only
thing worth memorizing.

### 1.1 The six noun principal parts

| # | Form | Estonian name | `raamat` (book) | `tuba` (room) | Why it must be stored |
|---|---|---|---|---|---|
| 1 | Nominative sg | *ainsuse nimetav* | raamat | tuba | The citation form |
| 2 | **Genitive sg** | *ainsuse omastav* | raamatu | toa | **Stem for 10 other cases** |
| 3 | Partitive sg | *ainsuse osastav* | raamatut | tuba | Irregular; required for objects, numbers, quantities |
| 4 | Short illative sg | *lühike sisseütlev* | n/a | tuppa | Exists for some words only; unpredictable |
| 5 | Nominative pl | *mitmuse nimetav* | raamatud | toad | Suppletive for pronouns; absent for mass nouns |
| 6 | Partitive pl | *mitmuse osastav* | raamatuid | tube | Highly irregular; stem for the plural |

v4.0 stored only #1-3. #4 and #6 cannot be derived, so a three-form model silently teaches an
incomplete set of forms. #4 is nullable, and so is #5.

#5 was the last one to arrive and it arrived by measurement. It was written as a rule, genitive
plus `-d`, and `npm run audit:cases` put that to the Institute of the Estonian Language for every
nominal in the dictionary: right for 5,098 of 5,143 words and wrong for a whole category. A pronoun
is suppletive there and no ending reaches it, so `see` goes to **need** and the rule gave `selled`,
`too` to **nood** and it gave `tolled`, while `kes` and `mis` do not change at all and were given
`kelled` and `milled`. Thirty-three mass nouns (`sealiha`, `sularaha`) have no plural for a
lexicographer to record and were being handed one.

### 1.2 What the genitive buys you

This is the single most motivating fact for a beginner and the UI should say it out loud: learn the
genitive and ten cases fall out as regular suffixes.

| Case | Estonian | Suffix on genitive stem | `raamatu-` | Meaning |
|---|---|---|---|---|
| Inessive | *seesütlev* | `-s` | raamatus | in the book |
| Elative | *seestütlev* | `-st` | raamatust | out of the book |
| Allative | *alaleütlev* | `-le` | raamatule | onto the book |
| Adessive | *alalütlev* | `-l` | raamatul | on the book |
| Ablative | *alaltütlev* | `-lt` | raamatult | off the book |
| Translative | *saav* | `-ks` | raamatuks | becoming a book |
| Terminative | *rajav* | `-ni` | raamatuni | up to the book |
| Essive | *olev* | `-na` | raamatuna | as a book |
| Abessive | *ilmaütlev* | `-ta` | raamatuta | without the book |
| Comitative | *kaasaütlev* | `-ga` | raamatuga | with the book |

The oblique plural is built on the genitive plural, which is itself derived from the partitive
plural, which is why #6 is stored. The nominative plural looks like a rule and is not one, which is
why it is #5 and stored rather than derived: see §1.1.

The dictionary UI renders this as a **generated table clearly marked as derived**, alongside the
five stored forms marked as authoritative. The learner sees which forms they must memorize and which
they get for free. That framing *is* the pedagogy.

### 1.2a Two sets of local cases, and which one a word takes

Six of the ten above are *local* cases and they come in two sets. The inside three (*seesütlev*,
*seestütlev*, *sisseütlev*) are about being in something; the outside three (*alalütlev*,
*alaltütlev*, *alaleütlev*) are about being on it, and are also the ones Estonian uses for the
person or animal a thing is given to, taken from, or belongs to.

| | Inside | Outside |
|---|---|---|
| A room | toas, toast, tuppa | |
| A country in *-maa* | | Saksamaal, Saksamaalt, Saksamaale |
| A horse | | hobusel, hobuselt, hobusele |
| A teacher | | õpetajal, õpetajalt, õpetajale |

Which set a word takes is a fact about its **meaning**, so no rule over its spelling reaches it:
`hobusesse` is a perfectly derivable word and is not how anybody talks about a horse. The app reads
the Institute's own semantic type for the word's primary sense (`loom`, `in_elukutse`,
`koht_hoone`), which arrives in the same Ekilex response as the forms, and
`lib/estonian/caseQuestion.ts` is the one module every generator asks. A word the Institute
classifies as both a being and a place (`politsei`, `grupp`) takes both sets in ordinary Estonian
and is drilled on neither, the same answer `maa` gets.

The two interrogative pronouns follow the same fact and decline alike through all fourteen cases:
`kes` for a person or an animal, `mis` for a thing. So a card asks `hobune → kellega?` and `raamat →
millega?`. The adverbial questions `kus?`, `kuhu?` and `kust?` each name one case from **each** set,
so they are part of a case's name and never the question on a card about one word.

### 1.3 Consonant gradation (*astmevaheldus*)

The reason principal parts are unpredictable. A stem alternates between a **strong grade** and a
**weak grade** as the word inflects.

**Vältevaheldus: quantitative gradation.** The *quantity* (Q3 ↔ Q2) changes; the spelling usually
does not. `kooli` (Q3, "into the school") and `kooli` (Q2, "of the school") are written identically
and differ only in duration. This is invisible on the page, which is why audio is required data and
not decoration. See §1.4.

**Laadivaheldus: qualitative gradation.** The consonant itself weakens, changes or disappears.

| Pattern | Strong : weak | Gloss |
|---|---|---|
| kk : k | `lukk : luku` | lock |
| pp : p | `sepp : sepa` | smith |
| tt : t | `pott : poti` | pot |
| k : g | `märk : märgi` | sign |
| p : b | `kaup : kauba` | goods |
| t : d | `kartma : kardan` | to fear : I fear |
| b : ∅ | `tuba : toa` | room |
| g : ∅ | `lugema : loen` | to read : I read |
| d : j | `sada : saja` | hundred |
| s : ∅ | `uus : uue` | new |

Note `tuba : toa`: the `b` disappears *and* the stem vowel changes. Nothing in the nominative
predicts this, which is precisely why the genitive is a stored principal part rather than a computed
one.

Each lexeme is tagged with its **gradation type** (`none` / `quantitative` / `qualitative`) and,
where derivable, the specific alternation. This tag drives:
- a badge in the dictionary entry,
- a dedicated **gradation drill** card type (`07-srs.md`),
- filtering ("show me every qualitative-gradation noun I know"),
- Anu's explanations, which cite the pattern by name rather than hand-waving.

### 1.4 A note on quantity

Estonian has three phonological quantities (Q1/Q2/Q3). Q2 and Q3 are frequently **not distinguished
in orthography**: `linna` (genitive, Q2) and `linna` (short illative, Q3) are spelled identically
and differ only in duration. Two consequences:
- A text-only flashcard cannot always disambiguate; audio is not decoration, it is required data.
- The TTS clip for a form is part of the card, not an add-on. This is a direct argument for A4's
  TartuNLP integration over an absent browser voice.

---

## 2. Verbs: five principal parts

v4.0 stored `lugema` / `lugeda`. Those two cannot generate a conjugation, because the present stem
is in the weak grade and unguessable from the infinitive.

| # | Form | Estonian name | `lugema` | `tulema` | Generates |
|---|---|---|---|---|---|
| 1 | ma-infinitive | *ma-tegevusnimi* | lugema | tulema | Citation form; `-mas/-mast/-maks/-mata` |
| 2 | da-infinitive | *da-tegevusnimi* | lugeda | tulla | Complement of many verbs; imperative base |
| 3 | **Present 1sg** | *oleviku ainsuse 1. pööre* | **loen** | **tulen** | The whole present tense |
| 4 | Past 1sg | *lihtmineviku ainsuse 1. pööre* | lugesin | tulin | The whole simple past |
| 5 | tud-participle | *umbisikuline mineviku kesksõna* | loetud | tuldud | Passive, perfect, `saama`-passive |

Note `lugema → loen`: `g` disappears and the vowel changes. No rule recovers this. It is stored.

---

## 3. Object case: the highest-value grammar concept

The single most persistent error for an English speaker, and completely absent from v4.0.

Estonian encodes **aspect and completeness in the case of the object**:

| Sentence | Object case | Meaning |
|---|---|---|
| Lugesin **raamatut**. | partitive | I was reading the book / read at it (ongoing, partial) |
| Lugesin **raamatu** läbi. | genitive (total) | I read the book (completed, whole) |
| Ostsin **leiba**. | partitive | I bought some bread |
| Ostsin **leiva**. | genitive (total) | I bought the (whole) loaf |

The rule of thumb: **partitive** for ongoing, negated, partial or unbounded events; **total object**
(genitive sg / nominative pl) for completed, bounded, whole ones. Negation always takes partitive.

Modeled as:
- a `GrammarConcept` record with worked examples and a canonical explanation,
- a dedicated **minimal-pair card type**: the learner picks the case and gets told which reading
  their choice produced,
- a preset chip in Anu: *"Which object case does this sentence need, and why?"*

---

## 4. Verb government (*rektsioon*)

Which case a verb demands of its complement. Unlearnable by analogy from English; must be stored per
verb and drilled.

| Verb | Governs | Example | English trap |
|---|---|---|---|
| `aitama` | partitive | aitan **sind** | "help *to* you" |
| `helistama` | allative | helistan **sulle** | "call *to* you" |
| `meeldima` | allative experiencer | **mulle** meeldib see | inverted: "to-me pleases this" |
| `mõtlema` | `-le` / `peale` | mõtlen **sinule** | n/a |
| `uskuma` | partitive / `-sse` | usun **sind** | n/a |
| `vastama` | allative | vastan **küsimusele** | "answer *to* the question" |

Stored as a `government` relation on the lexeme: `{ case, preposition?, example, gloss }`. Surfaced
as a badge in the dictionary entry and as its own card type. For a class-based learner this is
exactly the material that class notes cover and no dictionary displays well.

---

## 5. Data sourcing and trust levels

Every morphological fact carries a provenance tag, and the UI shows it. This is a correctness
feature: the learner must know which forms are authoritative.

| Level | Source | Trust | UI treatment |
|---|---|---|---|
| `EKILEX` | Ekilex API form data | Authoritative | Shown plainly |
| `DERIVED` | Suffix applied to a stored genitive stem | High, mechanical | Shown, labelled "derived" |
| `AI` | Generated by Anu | **Unverified** | Amber "AI-generated, verify" badge; never silently promoted |
| `USER` | Typed in by the learner | As reliable as the learner | Editable, marked |

**Hard rule:** an `AI`-provenance form is never written into a flashcard's answer field without an
explicit user confirmation step. LLMs are strong at *explaining* Estonian morphology and unreliable
at *producing* rare inflected forms. The architecture reflects that asymmetry: Anu explains, Ekilex
supplies. See `06-anu-tutor.md` §5.

---

## 6. Level model

The learner is in a structured class, so the app tracks where they are.

- **CEFR levels** A1, A2, B1, B2, C1 on the profile and, where Ekilex supplies it, per lexeme.
- Estonian state language exams (*eesti keele tasemeeksam*) are offered at A2, B1, B2 and C1. Deck
  and progress views can be filtered to a target exam level, which gives the dashboard a goal to
  organize around rather than an open-ended word list.
- Vocabulary is additionally tagged by **class week**, linking the deck to the syllabus and joining
  Feature 1 (tasks) to Feature 6 (cards), the concrete fix for gap D4.
