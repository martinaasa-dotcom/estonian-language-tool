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

Full write-up in `docs/17-gloss-audit.md` §6. The original question follows, unchanged.

---


Found during the A1 to B1 gloss review (`docs/17-gloss-audit.md` §4) and left alone there, because
their glosses are right and the review was about glosses.

`scripts/expand-seed.ts` draws candidates from four Wiktionary categories in order and keeps the
first one a word appears in. Nouns are first, so a word listed as both a noun and an adjective
comes out a noun: `lilla`, `kallis`, `valge`, `sinine`, `noor`, `tark`, `paks`, `magus`, `kuiv`,
`vana`, `vale`, `võõras` and about twenty more. Ekilex cannot settle it either; it calls every
nominal a "noomen", which is why the builder asks Wiktionary in the first place.

Nothing visibly breaks today, because an Estonian adjective declines like a noun and the paradigm
is therefore right. It matters wherever the part of speech is the point rather than the shape:
which practice modes a word is eligible for, and any future rule that reads `pos`.

**Needed:** decide whether the fix is to prefer the more specific category (adjective over noun,
as the builder already does for adverbs), or to keep both and let a word carry more than one part
of speech. The second is truer and is a schema change.

**Default if unanswered:** leave it. It is wrong metadata rather than wrong teaching, and the
gloss review deliberately did not widen into it.
