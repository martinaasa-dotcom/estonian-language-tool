# Open Questions

Questions whose answers change the plan. Each carries a recommendation, so nothing is blocked waiting
on an answer — the recommendation is what gets built if no answer arrives.

### Q1 — Local only, or reachable from other devices? **(highest impact)**

Everything in ADR-002 follows from this.

- **Local only (recommended for v1):** SQLite, no auth, no hosting, no bill, works offline, review
  never depends on a network. One machine.
- **Deployed:** Vercel + Postgres (Supabase/Neon) + single-user auth. Phone access, but every daily
  action now depends on a network, and auth is real work.

**Recommendation:** local for v1. The schema is Postgres-portable and Phase 5 carries the migration
path. Deferring costs almost nothing; choosing hosted now costs Phase 1 time and permanent
complexity. *If phone review matters more than offline reliability, say so now — it changes Phase 1.*

### Q2 — Which class, which level, which exam?

The app can organise around a concrete goal (A2/B1/B2 *tasemeeksam*) or stay open-ended. Concrete is
better: it gives Progress something to measure against and Today something to prioritise for.

**Needed:** current CEFR level, target level, and whether an exam date exists.
**Default if unanswered:** A1→A2, no exam date.

### Q3 — Does the class provide vocabulary lists in any digital form?

This is the single biggest lever on how useful the app is in week one. A weekly word list that can be
pasted in beats any amount of dictionary search UI.

**Needed:** a sample of whatever the class hands out — PDF, docx, spreadsheet, photo of a handout.
The importer will be built around the real format rather than a guessed one.

### Q4 — Is the Speakly subscription active, and does it matter?

Speakly is descoped to a link-out (ADR-006). If it is central to the learner's routine, the importer
gets a Speakly-shaped preset and better paste handling. If not, it can drop out entirely and free
time in Phase 4.

**Default if unanswered:** link-out plus generic importer, as specified.

### Q5 — Daily AI budget?

`06-anu-tutor.md` §6 estimates ~$0.63 on a heavy 30-turn day, ~$19/month sustained. Default cap is
**$2.00/day**.

**Needed:** confirm, raise, or lower. Trivially changed later; worth setting deliberately once.

### Q6 — Anything in v4.0 that was descoped and should not have been?

The browser extension, the Speakly embed and the Sõnaveeb embed are gone — the last two because they
are blocked by other people's servers, the first because it is a separate product. If the extension
("highlight a word on any page, save it to the deck") is genuinely wanted, it is a real project and
should be planned as one after v1, not smuggled into a table cell.

### Q7 — Who else, if anyone, will see this?

Currently designed for exactly one user, which permits no auth, no onboarding and no multi-tenancy.
If classmates or a teacher might use it, that assumption needs revisiting **before** Phase 1, not
after — it changes the data model, not just the UI.
