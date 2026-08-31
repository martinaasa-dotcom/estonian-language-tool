# Open Questions

Questions whose answers change the plan. Each carries a recommendation, so nothing is blocked waiting
on an answer. The recommendation is what gets built if no answer arrives.

### Q1: Local only, or reachable from other devices? **(highest impact)**

Everything in ADR-002 follows from this.

- **Local only (recommended for v1):** SQLite, no auth, no hosting, no bill, works offline, review
  never depends on a network. One machine.
- **Deployed:** Vercel + Postgres (Supabase/Neon) + single-user auth. Phone access, but every daily
  action now depends on a network, and auth is real work.

**Recommendation:** local for v1. The schema is Postgres-portable and Phase 5 carries the migration
path. Deferring costs almost nothing; choosing hosted now costs Phase 1 time and permanent
complexity. *If phone review matters more than offline reliability, say so now. It changes Phase 1.*

### Q2: Which class, which level, which exam?

The app can organise around a concrete goal (A2/B1/B2 *tasemeeksam*) or stay open-ended. Concrete is
better: it gives Progress something to measure against and Today something to prioritise for.

**Needed:** current CEFR level, target level, and whether an exam date exists.
**Default if unanswered:** A1→A2, no exam date.

### Q3: Does the class provide vocabulary lists in any digital form?

This is the single biggest lever on how useful the app is in week one. A weekly word list that can be
pasted in beats any amount of dictionary search UI.

**Needed:** a sample of whatever the class hands out: PDF, docx, spreadsheet, photo of a handout.
The importer will be built around the real format rather than a guessed one.

### Q4: Is the Speakly subscription active, and does it matter?

Speakly is descoped to a link-out (ADR-006). If it is central to the learner's routine, the importer
gets a Speakly-shaped preset and better paste handling. If not, it can drop out entirely and free
time in Phase 4.

**Default if unanswered:** link-out plus generic importer, as specified.

### Q5: Daily AI budget?

`06-anu-tutor.md` §6 estimates ~$0.63 on a heavy 30-turn day, ~$19/month sustained. Default cap is
**$2.00/day**.

**Needed:** confirm, raise, or lower. Trivially changed later; worth setting deliberately once.

### Q6: Anything in v4.0 that was descoped and should not have been?

The browser extension, the Speakly embed and the Sõnaveeb embed are gone, the last two because they
are blocked by other people's servers, the first because it is a separate product. If the extension
("highlight a word on any page, save it to the deck") is genuinely wanted, it is a real project and
should be planned as one after v1, not smuggled into a table cell.

### Q7: Who else, if anyone, will see this?

Currently designed for exactly one user, which permits no auth, no onboarding and no multi-tenancy.
If classmates or a teacher might use it, that assumption needs revisiting **before** Phase 1, not
after. It changes the data model, not just the UI.

### Q8: Around 30 adjectives in the built dictionary are labelled `NOUN`

Found during the A1 to B1 gloss review (`docs/17-gloss-audit.md` §4) and left alone there, because
their glosses are right and the review was about glosses.

`scripts/expand-seed.ts` draws candidates from four Wiktionary categories in order and keeps the
first one a word appears in. Nouns are first, so a word listed as both a noun and an adjective
comes out a noun: `lilla`, `kallis`, `valge`, `sinine`, `noor`, `tark`, `paks`, `magus`, `kuiv`,
`vana`, `vale`, `võõras` and about twenty more. Ekilex cannot settle it either; it calls every
nominal a "noomen", which is why the builder asks Wiktionary in the first place.

**Something visibly breaks, and this entry used to say it did not.** The claim was that an Estonian
adjective declines like a noun so the paradigm is right either way, which is true about the forms
and was never the whole story. The course harvest tags these words `ADJECTIVE` and the built
expansion tags them `NOUN`, and `@@unique` is on `(lemma, pos)`, so the two do not collide: they
both land. Thirteen lemmas ship with **two entries each** (`hall`, `kallis`, `keskmine`, `kiire`,
`kuiv`, `lilla`, `must`, `noor`, `paks`, `roosa`, `rõõmus`, `sinine`, `valge`, `vana`), most of them
saying nearly the same thing twice: `must` is "black" and "black", `vana` is "old" and "old". Four
of the words named above are still `NOUN` alone (`magus`, `tark`, `vale`, `võõras`).

Which of a pair a learner met was decided by nothing at all until the search was given a tiebreak,
because the entry page renders one hit. That half is fixed (`bySubstance` in `lib/dict/search.ts`),
so the answer is stable and the course's own entry leads, and the other one is reachable from the
chip that names it rather than merely listed. What is left is this question: two of the
thirteen look like real pairs rather than mislabels, since `hall` is grey and also frost and
`keskmine` is average and also the middle, and telling those apart from `must` twice is the decision
nobody has made.

**And the search was not the only screen that had to choose.** The syllabus names *lemmas*, so
`where: { lemma: { in: [...unit.lemmas] } }` returns a row per entry, and seven places used every
one: `/learn/[unit]` listed a word twice and counted it twice, its worksheet printed it six times,
the lesson planner gave the duplicate a place in the sitting, `addUnitToDeck` and `recordLesson`
each built two sets of cards for the one word, the landing page's three-word demo could have picked
the entry with no forms, and React warned about two children with one key. `oneEntryPerLemma` is
the one answer and it is `bySubstance` again, so a course screen and the search box cannot disagree
about which `vana` is real. Found by a browser suite reading the console rather than by looking,
which is worth knowing: the pages looked right on a database that happened to hold one row.

It also still matters wherever the part of speech is the point rather than the shape: which practice
modes a word is eligible for, and any future rule that reads `pos`.

**Needed:** decide whether the fix is to prefer the more specific category (adjective over noun,
as the builder already does for adverbs), or to keep both and let a word carry more than one part
of speech. The second is truer and is a schema change.

**Default if unanswered:** leave it. It is wrong metadata rather than wrong teaching, and the
gloss review deliberately did not widen into it.

### Q9: A seeded dictionary is twelve words larger here than it is in CI

Measured rather than suspected. `prisma/expanded.ts` reports how many rows it actually inserted, from
`RETURNING`, and on this machine a fresh seed adds **4,656** expansion entries where the same commit
in CI adds **4,644**. The dictionary page then reads 5,971 words locally and 5,962 in CI. The file is
the same file: `prisma/data/expanded.json` holds 5,363 entries with 5,363 distinct `(lemma, pos)`
pairs, so nothing is being deduplicated inside it.

Twelve rows means twelve more `ON CONFLICT` collisions with what the seed put down first, and the
seed's own printed counts are read off the source arrays rather than off the database, so they agree
in both places and prove nothing.

Ruled out, each by running it: `db:seed` against `db:seed:ensure`, which is the entry point CI uses;
two consecutive fresh databases, which give the same number twice; the presence or absence of
`EKILEX_API_KEY` and every provider key, since the seed writes no live lookups; duplicate keys inside
the expansion; and the database collation, under both `C.UTF-8` and ICU `en-US`. What is left
untested is glibc `en_US.utf8`, which the `postgres:16` image CI runs uses and which is not installed
here, and where a locale with ignorable characters can make a unique index treat two rows as one.

**Why it is written down rather than chased further:** nothing depends on it that used to. Which of
two entries for a lemma a learner sees is decided by `bySubstance` now rather than by which rows
happen to exist, and `test-polish.mjs` states the precondition and waives by number where a pair is
absent, so a smaller dictionary reports itself instead of changing an answer. A deployment seeds its
own database, so no learner meets both.

**Needed:** seed once against `postgres:16` with its own locale and print the twelve. If they are
real words being silently dropped in one environment, that is a data bug; if they are rows the
expansion should never have held, the builder should not be writing them.

**Default if unanswered:** leave it. It is a reproducibility question rather than a teaching one, and
the app no longer behaves differently for it.
