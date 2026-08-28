# Spaced Repetition Design

v4.0 said "Leitner / SM-2 algorithm" — two different algorithms, undecided, both dated — and modelled
a single implicit card type. Both are upgraded here.

## 1. Algorithm: FSRS (ADR-003)

`ts-fsrs` (MIT, v5.4.1, verified on npm).

| | SM-2 (1987) | FSRS |
|---|---|---|
| Memory model | One "ease factor" | Separate **stability** and **difficulty** |
| Retention target | Emergent, unsettable | **Explicitly configurable** |
| Tuning | Hand-tuned constants | Parameters optimisable from the user's own review log |
| Typical result | Baseline | Same retention for meaningfully fewer reviews |

For a learner reviewing daily for a year, "fewer reviews for the same retention" is the entire
value proposition of an SRS. Default target retention **0.90**, configurable.

```ts
import { fsrs, generatorParameters, Rating } from "ts-fsrs";
const f = fsrs(generatorParameters({ request_retention: 0.9, enable_fuzz: true }));
const scheduling = f.repeat(card, new Date());
const next = scheduling[Rating.Good].card;
```

Fuzz is on: without it, cards added in one session return in one clump forever.

**Why the `Review` log is append-only** (`04-data-model.md`): FSRS parameters can be optimised
against a user's own history once there are ~1 000 reviews. Discarding review history discards the
ability to ever personalise the schedule. Phase 5 adds an "optimise my parameters" action.

## 2. Card types — the Estonian-specific part

One card type cannot teach Estonian. A learner who can translate `tuba → room` still cannot say
"into the room". These types come directly from `02-estonian-domain.md`.

| Type | Front | Back | Teaches |
|---|---|---|---|
| `RECOGNITION` | `tuba` | room | Passive vocabulary |
| `PRODUCTION` | room | `tuba` | Active recall — harder, scheduled separately |
| `CASE_FORM` | `tuba` → **inessive**? | `toas` | Case formation from the stem |
| `GRADATION` | `tuba` → genitive? | `toa` — qualitative, `b : ∅` | The gradation pattern itself |
| `GOVERNMENT` | `aitama` takes which case? | partitive — *aitan sind* | Verb government (*rektsioon*) |
| `LISTENING` | 🔊 audio only | `tuba` / room | Aural recognition; quantity contrasts |
| `OBJECT_CASE` | "I read the book (finished)" | `Lugesin raamatu läbi` — total object | Aspect via case |

`RECOGNITION` and `PRODUCTION` are separate cards with independent scheduling, because recognising a
word and producing it are genuinely different memories with different decay.

**Auto-generation.** Adding a lexeme from the dictionary offers a checklist of card types, defaulting
by part of speech and CEFR level: a noun defaults to recognition + production + one case-form card; a
verb adds a government card when government data exists; a word with gradation adds a gradation card.
The learner can always override.

## 3. Review session

**Keyboard-first.** An SRS used daily is unusable if it needs a mouse.

| Key | Action |
|---|---|
| `Space` / `Enter` | Show answer |
| `1` `2` `3` `4` | Again · Hard · Good · Easy |
| `u` | Undo last grade — **specified, not yet built** (`13-mvp-status.md` §4) |
| `e` | Edit card inline |
| `a` | Replay audio |
| `s` | Suspend |
| `Esc` | End session |

Session composition: due reviews first, then learning cards, then a configurable number of new cards
(default 10/day). New cards are capped because uncapped introduction is the classic way an SRS
becomes an unsustainable workload three weeks in.

Each session ends with a summary: count, accuracy, time, worst cases, and a "drill the weak ones"
follow-up.

## 4. Offline

Review works with no network at all. Cards, scheduling state and pre-warmed audio are local; grading
writes to SQLite. This is the daily path and it depends on nothing external — which is a large part
of why ADR-002 chose a local database.

## 5. Weak-case analytics

Every `Review` records `targetCase`. Aggregated, this produces the **weak-case heatmap**
(`01-product-spec.md` §3.7): accuracy per grammatical case across all cards.

This is the feature that turns the app from a card box into a diagnostic. "Your partitive plural is
at 61% and your adessive is at 94%" is directly actionable — and clicking the weak cell starts a
filtered session on exactly those cards.

## 6. Export (audit C10)

- **JSON** — complete, lossless, including review history.
- **Anki-compatible CSV/APKG** — so the learner is never locked in.
- Automatic local snapshot before every schema migration.

Available from Phase 3, not deferred. Months of review history is the one irreplaceable asset in the
system.
