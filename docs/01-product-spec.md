# Product Specification v5.0 — Estonian Learning Dashboard

Supersedes v4.0. Every change from v4.0 is justified in `00-audit-v4.md`.

## 1. The user and the job

One user: a native English speaker taking a structured Estonian class, studying most days, on a
laptop, at a desk. Not a consumer product, not multi-tenant, not a startup. Every decision below
optimises for *one committed learner using this daily for a year* — which permits choices a SaaS
could not make (local database, no signup, no onboarding funnel) and forbids others (no data loss,
ever; the review history is irreplaceable).

**The job:** "I have 40 minutes before class. Tell me what to study, let me study it without
opening five tabs, and answer my grammar question when I get stuck."

**The failure v4.0 does not prevent:** an app you open, look at, and close — because it has six tabs
and no answer to "what now". Hence the Today view (§3.0) as the default route.

## 2. Principles

1. **The word is the unit.** Tasks, dictionary entries, tutor messages and cards all link back to a
   lexeme. The dashboard's value is that these stop being separate apps. (Fixes D4.)
2. **One click to the deck.** Anything the learner sees — a dictionary hit, an Anu example, a pasted
   line — is one click from becoming a card. This is the app's central interaction, not a feature
   bullet.
3. **Never invent Estonian.** Authoritative forms come from Ekilex. The AI explains; it does not
   supply answer keys. Provenance is visible. (See `02-estonian-domain.md` §5.)
4. **Degrade, never blank.** Every integration is someone else's server. Each has a defined offline
   and failure behaviour. (Fixes C6.)
5. **The data is the user's.** Local-first, exportable to JSON and Anki from Phase 3. (Fixes C10.)
6. **Teach the pattern, not the form.** Show *why* `toa` is what it is, not just that it is.

## 3. Features

Each feature carries acceptance criteria. A feature is not done until every box is checkable by
someone other than the implementer.

### 3.0 Today (NEW — the default route)

The app's front door. Answers "what now" in one screen.

- Cards due today, with a one-click **Start review**.
- Tasks due today and overdue.
- Next class / calendar event.
- A 7-day streak strip and today's review count.
- "Word of the day" drawn from the learner's own weakest cards, not a generic list.

**Acceptance:** opening the app shows a session I can start in one click, with no navigation.
Empty state (nothing due) suggests a concrete alternative action rather than showing an empty box.

### 3.1 Tasks (v4.0 Feature 1 — kept, extended)

- CRUD, completion checkbox, persistent across restarts.
- Tags: `Grammar`, `Homework`, `Vocabulary`, `Speakly Goal`, `Listening Practice`, plus user-defined.
- Week number, due date, optional linked lexemes ("this homework covers these 12 words").
- Filter by week / tag / status; sort by due date, week, creation.

**Acceptance:** create a tagged task with a due date and 3 linked words; reload the browser; it is
intact. Filter to week 4 + `Grammar` and see only those. Completing a task with linked words offers
to add those words to the deck.

### 3.2 Dictionary (v4.0 Feature 3 — rebuilt, no iframe)

Native UI over the Ekilex API. Replaces the impossible embed (audit A1).

- Search Estonian or English; results with part of speech, CEFR level where available.
- Entry view shows: **five noun principal parts** or **five verb principal parts**, gradation type
  badge, the derived case table (clearly marked derived), definitions, translations, examples,
  verb government where known.
- TTS playback per form (TartuNLP, cached).
- `+ Add to Deck` on the entry and on each individual example.
- Recent searches; starred words.

**Acceptance:** searching `tuba` shows `tuba / toa / tuba / tuppa / tube`, flags qualitative
gradation `b : ∅`, renders the 10 derived cases from `toa-`, plays audio, and adds a card in one click.
With the network off, previously viewed entries still open from cache.

### 3.3 Anu — AI tutor (v4.0 Feature 4 — kept, hardened)

Full design in `06-anu-tutor.md`.

- Streaming chat with an Estonian-specialist system prompt and a defined persona.
- Preset chips: break down this sentence · which case and why · object case check · explain this
  gradation · parse these notes into cards · quiz me on this week.
- Context awareness: the current dictionary entry / selected task is offered as context.
- `+ Add to Deck` on any vocabulary or example in a reply, with provenance `AI` and a verify step.
- Visible token/cost meter and a configurable daily spend cap.

**Acceptance:** ask "why is it *raamatut* and not *raamatu*?" and get an object-case explanation
citing the aspect rule with examples. Responses stream. The API key is not present in any client
bundle (verified by a build-output grep in CI). Hitting the daily cap degrades to a clear message,
not a stack trace.

### 3.4 Flashcards / SRS (v4.0 Feature 6 — upgraded)

Full design in `07-srs.md`. FSRS via `ts-fsrs`, not SM-2.

- Seven card types: recognition, production, **case-form cloze**, **gradation**, **verb government**,
  listening (audio→meaning) and **object case** (total vs partial minimal pairs).
- Keyboard-first review: space to flip, 1–4 to grade, `u` to undo.
- Audio on the card. Session summary with accuracy and time.

**Acceptance:** a 20-card session is completable without touching the mouse. Grading `Again` brings
the card back in the same session. Scheduling state survives restart. Export produces a file that
imports into Anki.

### 3.5 Calendar (v4.0 Feature 2 — kept, moved to Phase 4)

- Month and week views showing task due dates, class times and review load.
- **Read-only** subscription to one or more iCal URLs (Google/Apple), refreshed on a schedule.

**Acceptance:** a Google Calendar iCal URL renders class times alongside due tasks. Deleting the
feed removes its events and nothing else. A malformed or unreachable feed shows a per-feed error and
leaves other feeds working.

### 3.6 Imports (v4.0 Feature 5 — generalised)

Speakly-specific parsing replaced with a format-agnostic importer (audit A3).

- Paste anything: TSV, CSV, JSON, `word – translation` lines, or free text.
- Preview table with per-row edit, duplicate detection against the existing deck, and optional
  Ekilex enrichment (fill in principal parts for recognised words).
- Speakly and Sõnaveeb are supported *shapes*, not required *integrations*.

**Acceptance:** pasting 20 lines of `sõna - word` produces 20 reviewable cards with principal parts
filled in for those Ekilex recognises, duplicates flagged, and nothing written until confirmed.

### 3.7 Progress (NEW)

- Reviews per day, retention rate, cards by FSRS state.
- **Weak-case heatmap** — accuracy per grammatical case, so the learner can see that their ablative
  is fine and their partitive plural is not.
- Vocabulary growth over time; per-week accuracy tied to the syllabus.

**Acceptance:** after 50 reviews the heatmap identifies at least one weakest case, and clicking it
starts a filtered drill session on that case.

## 4. Explicit non-goals for v1

Named so they do not creep in. Each is a real decision, not an omission:

- **Multi-user, accounts, sharing.** One user. Auth is a Phase 5 concern and only if deployed.
- **Mobile app.** Responsive web only; a native app is a separate product.
- **Browser extension.** v4.0 Phase 4 listed it in a table cell. It has its own build, manifest,
  store review and security model. Out of scope for v1.
- **Embedding Speakly or Sõnaveeb.** Blocked by their servers and their terms (audit A1, A3).
- **Generating Estonian morphology from rules.** We retrieve and explain; we do not invent.
- **Teaching content authored by us.** The class provides the curriculum; the app supports it.

## 5. Success criteria

The project succeeds if, after one month of daily use:
1. The learner opens the app *first* when studying, not their browser tabs.
2. ≥ 80% of cards were created inside the app rather than typed manually elsewhere.
3. FSRS retention sits in the 85–92% band (correctly tuned scheduling, neither too easy nor too hard).
4. No data has ever been lost, and an export has been produced and verified at least once.
5. The weak-case heatmap has changed at least one study decision.
