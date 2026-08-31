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

### Q8: Around 30 adjectives in the built dictionary are labelled `NOUN` **(answered)**

**Answered 2026-08-30: neither of the two options offered below.** Both were wrong, and measuring
them is what showed it. The recommendation was to prefer the more specific category, and that
would have relabelled 86 words and broken 25 of them: `lamp` is in Wiktionary's adjectives
category for a colloquial sense meaning "random", `pea` and `kama` are in the adverbs category for
senses they do not ship, and `mari`, `norm`, `seadus`, `kreem`, `kile` and `kogus` would all have
been labelled against the very gloss printed beside them. The category says the word has *some*
sense of that kind somewhere on its page, which is not the question being asked.

The question being asked is what part of speech the **shipped gloss** is, and the page answers it
directly: every definition sits under a `===Noun===` or `===Adjective===` heading, and the gloss is
the first definition on the page. Reading both facts off the same line is what makes them unable to
disagree. `lib/dict/wiktionary.ts` returns the heading with the sense, `lib/dict/pos.ts` decides,
and `npm run audit:pos` re-runs it over the shipped file the way `audit:glosses` does for the
English.

61 labels were corrected, 60 of them NOUN to ADJECTIVE. The second option, letting a word carry
more than one part of speech, was not needed and remains available: it is still the truer model and
it is still a schema change. `hall` is the case for it, a noun meaning "frost" and an adjective
meaning "grey", and it is correctly two entries today.

**What the app does with a pair that remains.** Two lemmas still land twice, `hall` and `rõõmus`,
measured against a freshly seeded database rather than counted from the file. The original entry
below says "thirteen" and names fourteen, which is a miscount in the entry rather than a change in
the data: fourteen minus these two is the twelve `lib/collections/seedSize.ts` records the seed
losing when the labels were corrected. A third path makes a pair for *any* word: confirming a scanned word the dictionary already knows
writes a second, formless row. So which of two entries a learner meets still has to be decided, and
it is, by `bySubstance` in `lib/dict/search.ts`: a known part of speech, then a hand-written entry,
then more stored principal parts, then `id` so the comparator is total. The other entry is reachable
from the chip that names it rather than merely listed.

**And the search was not the only screen that had to choose.** The syllabus names *lemmas*, so
`where: { lemma: { in: [...unit.lemmas] } }` returns a row per entry, and seven places used every
one: `/learn/[unit]` listed a word twice and counted it twice, its worksheet printed it six times,
the lesson planner gave the duplicate a place in the sitting, `addUnitToDeck` and `recordLesson`
each built two sets of cards for the one word, the landing page's three-word demo could have picked
the entry with no forms, and React warned about two children with one key. `oneEntryPerLemma` is
the one answer and it is `bySubstance` again, so a course screen and the search box cannot disagree
about which `hall` is real. Found by a browser suite reading the console rather than by looking,
which is worth knowing: the pages looked right on a database that happened to hold one row. It was
measured on a confirmed scan of `tuba` rather than on a Q8 pair, which is why answering Q8 lowers
how often it happens without retiring the fix.

Full write-up in `docs/17-gloss-audit.md` §6. The original question follows, unchanged.

---


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

It also still matters wherever the part of speech is the point rather than the shape: which practice
modes a word is eligible for, and any future rule that reads `pos`.

**Needed:** decide whether the fix is to prefer the more specific category (adjective over noun,
as the builder already does for adverbs), or to keep both and let a word carry more than one part
of speech. The second is truer and is a schema change.

**Default if unanswered:** leave it. It is wrong metadata rather than wrong teaching, and the
gloss review deliberately did not widen into it.

### Q9: A seeded dictionary was twelve words larger here than in CI **(no longer reproducible)**

**The file it was measured on no longer exists.** Answering Q8 rebuilt `prisma/data/expanded.json`
with the part of speech read off the sense each gloss came from, and this machine now seeds **4,644**
expansion entries from it, which is the number CI reported from the old file. That is not an answer.
Twelve is also what `lib/collections/seedSize.ts` records the seed losing when twelve words stopped
being labelled two ways, so the same number now has an explanation that has nothing to do with two
machines disagreeing, and the coincidence is close enough to be worth naming rather than believing.

What can still be said is what cannot be done: the original measurement compared two machines on one
file, that file has been replaced, and no run of the new one can reproduce a difference in the old.
If a discrepancy appears again on the current file it is worth chasing with the note below, which
records everything already ruled out. Until then there is nothing to chase.

The original entry follows.

---

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
