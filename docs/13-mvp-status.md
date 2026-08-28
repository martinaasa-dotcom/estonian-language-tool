# MVP Status and Decisions

What was actually built, what was deliberately left out, and which planning decisions changed once
the answers to `12-open-questions.md` came back.

**§6 is the current state.** Everything above it describes the first MVP; §6 covers the pass that
turned it from one person's study tool into something a stranger — or a class — can pick up.

## 1. The answers, and what they changed

| Question | Answer | Effect |
|---|---|---|
| Q1 Local or hosted? | **Local only** at MVP time; **reversed 2026-08** to hosted (Vercel + Supabase). No auth yet. | ADR-002 confirmed for v1, superseded by ADR-011. Schema was already Postgres-portable, so this was a datasource swap, not a rebuild |
| Q2 Level? | Learner is at **B1–B2**, but the app should cover **A1–C2** | 147 of 360 entries are B1 or above, including a C1 layer and the verb-government cases that trip up English speakers at that level. The model has no ceiling — C2 words drop in without a schema change |
| Q3 Digital class materials? | **None.** | The importer stayed generic and cheap. No time spent on a parser for a format that does not exist |
| Q4 Speakly? | Subscription exists, **not currently used** — "difficult to use" | Confirms ADR-006. Speakly has no public API (audit A3), so the paste importer handles it like any other source. Nothing Speakly-specific was built |
| Q5 AI budget? | **No cap — but free for now.** OpenRouter/OpenAI, and later "whatever works best" | ADR-004 reversed, see §2 |
| Q6 Browser extension? | **Gone.** | Confirmed out of scope |
| Q7 Other users? | **Reversed 2026-08**: real multi-user, Google sign-in via Supabase Auth | ADR-012. Cards/Tasks/Messages gained `ownerId` and are scoped per query; the dictionary (Lexeme/Form) stays shared, as anticipated |

## 2. ADR-004 reversed — provider-agnostic, not Anthropic-only

**Original decision:** `claude-opus-5` with adaptive thinking and prompt caching.

**What changed:** the requirement became "useful and free for now, and let me change my mind later".
Pinning one paid provider fails that.

**New decision.** `lib/tutor/provider.ts` speaks to whichever key is present:

| Key in `.env` | Used | Default model |
|---|---|---|
| `OPENROUTER_API_KEY` | OpenRouter (OpenAI-compatible) | `z-ai/glm-5.2:free` — genuinely free |
| `ANTHROPIC_API_KEY` | Anthropic Messages API | `claude-sonnet-5` |
| `OPENAI_API_KEY` | OpenAI | `gpt-4o-mini` |

All three stream. The Anthropic path keeps the `cache_control` breakpoint on the Estonian system
prompt, since that prompt is identical every turn. Nothing above the adapter knows which provider is
in play, so switching is a one-line `.env` change and a restart.

The daily spend cap from the original plan was dropped: with a free model there is nothing to cap,
and a cap on an unmetered path is dead code. If a paid model is adopted, this is the first thing to
add back.

## 3. What is built

| Area | State |
|---|---|
| `lib/estonian/` — cases, principal parts, gradation, derivation | Complete, 56 unit tests |
| Dictionary — search, paradigm, gradation, audio | Complete. With an Ekilex key it reaches the full Estonian lexicon; without one it falls back to the 360-word built-in set |
| Ekilex integration — live lookup, full retrieved paradigm, CEFR, verb government, Estonian definition | Complete. Seeded words are upgraded to the authoritative paradigm the first time they are viewed |
| English translations — layered: accepted → Wiktionary → AI → blank | Complete. Ekilex has no English on a reader key, so no single source suffices |
| Inflected-form search — `toas` finds `tuba` and explains that it is the inessive | Complete; matches stored principal parts and case endings on the singular and plural genitive stems |
| Built-in dictionary — 360 entries, 1 568 stored forms | Complete, hand-checked, CEFR-tagged A1–C1 (162 / 51 / 75 / 66 / 6). 70 carry gradation, 24 verbs carry government |
| Speech — TartuNLP, server-proxied, cached to disk forever | Complete and verified end to end |
| Flashcards — FSRS, 5 card types, keyboard-only review, undo-by-requeue | Complete |
| Today — due counts, streak, tasks, weak-word pick | Complete |
| My words — deck management, filters, weak-case breakdown | Complete |
| Anu — streaming chat, prompt chips, vocabulary bridge with AI provenance | Complete; needs a key |
| Tasks — tagged, week, due dates | Complete |
| Import — paste TSV/CSV/dash/semicolon lines, with dedupe | Complete |
| Add a word by hand, with principal parts and auto-classified gradation | Complete |
| Edit an existing entry — corrections rewrite its cards' text but never its FSRS scheduling | Complete |
| Export — full JSON backup | Complete |
| Visual design — pastel system, mascot, light/dark | Rebuilt 2026-08; see `14-design-system.md` |
| Public landing page at `/welcome` | Complete. Its demo reads real dictionary data and derives cases with the app's own code |
| Restore from a backup — merge (safe, idempotent) or replace (guarded) | Complete, verified by a wipe-and-restore round trip |
| Weak-case drill — click a case in the heatmap to review just those cards | Complete |
| Light and dark themes, keyboard operation, mobile layout | Complete; verified on an iPhone 13 viewport — no sideways scroll, 73×79px rating targets |
| Estonian text marked `lang="et"` so screen readers do not read it with English phonics | Complete |

## 4. What is deliberately not built

Each of these is a decision, not an omission.

- ~~Ekilex live search.~~ **Now built** — the key arrived, the response shape was read from real
  data rather than guessed, and the mapper is covered by contract tests.
- **Calendar / iCal.** No digital class schedule exists (Q3), so it would sync nothing.
- **Speech-to-text.** Unverified for Estonian (audit A5). Still a spike, not a feature.
- **Anki export.** JSON export and restore both ship; the Anki format is a nice-to-have, not a
  data-safety need.
- **Object-case and listening card types.** Defined in the model; not generated yet. They need
  example sentences the built-in dictionary does not carry for every word.
- **Auth, multi-user, sync.** Explicitly deferred to the Google-SSO version (Q7).
- **Undo in review (`u`).** Specified in `07-srs.md`, not built. `Again` already requeues the card
  within the session, which covers the common case; a true undo has to restore the previous FSRS
  state without deleting from the append-only review log, and that is more design than the MVP needs.

## 5. Known limitations, stated plainly

0. **Anu's Estonian depends entirely on the model.** Measured with `npm run eval:anu` against six
   grammar questions with known answers: `openai/gpt-4o` 6/6, `anthropic/claude-sonnet-5` 5/6,
   `openai/gpt-4o-mini` 5/6 — but the mini model invented "Ma söön aitamat", which is not Estonian.
   Free models are rate-limited hard enough upstream that they cannot be evaluated reliably, let
   alone relied on. This is exactly why the model is never allowed to supply an inflected form.

1. **Without an Ekilex key the dictionary is 360 words.** Enough for A1–B2 and the start of C1, but far short of the full
   lexicon. Anything outside it can be added by hand — the add-word form takes principal parts and
   classifies gradation itself, so a hand-added word behaves exactly like a built-in one. An Ekilex
   key would close the gap properly.
2. **Gradation detection is orthographic.** Quantitative gradation (*vältevaheldus*) is a change in
   duration that Estonian spelling does not record, so it cannot be detected from text. The app only
   ever reports the qualitative kind, and says so rather than implying a word does not alternate.
3. **Plural oblique cases need a stored genitive plural.** Where it is missing the table shows a gap.
   `tuba : toa` yields `tubade`, not `toade` — it is not derivable, so it is not derived.
4. **Anu's Estonian is only as good as the model behind it.** The free model is decent, not
   authoritative. Everything it suggests is tagged `AI · verify`, and it never supplies a dictionary
   form — that boundary is enforced in the data model, not just in the prompt.
5. **Editing a word does not regenerate its case-form cards.** Recognition and production cards
   follow a correction; a case-form card built from an old genitive keeps the old answer. Deleting
   and re-adding the card fixes it. Regenerating automatically would mean either losing the card's
   scheduling or silently changing what a card asks mid-schedule, and neither is obviously right.
6. ~~**A review needs the server.**~~ **Fixed in §6** — the app installs as a PWA and grades made
   offline are queued on the device and replayed with their real timestamps (ADR-015).


## 6. The second pass: usable by someone who is not you

The first MVP was complete for one learner who already knew what to study. Handing it to a stranger
exposed a different set of gaps — an empty deck with no obvious first move, self-graded flashcards, a
streak and nothing else to show for six weeks of work, and a promise about offline that the hosted
deployment had quietly broken. This pass closes those.

### What was added

| Area | What it is | Why it earns its place |
|---|---|---|
| **Onboarding** (`/welcome`) | Four steps — name, level, pace, starter units — ending in a real deck | An empty deck is where a new learner gives up. Setup now finishes with cards, not with a tour |
| **Learning path** (`/learn`) | 18 units, A1→C1, over the same dictionary. `lib/collections/path.ts` | "Here are 360 words, good luck" is not a course. Units are references, not copies, so nothing duplicates and a correction still lands everywhere |
| **Typed answers** | `lib/estonian/answer.ts` grades what you type, telling a dropped diacritic from a typo from a wrong word | Self-grading is the weakest part of a flashcard app. `sõda` is not `soda`, so a diacritic slip is called out by name rather than waved through or failed flat |
| **Multiple choice + first-look intros** | New cards lead with their answer; recognition cards can be asked as four options | Asking someone to produce a word they have never been shown is a guessing game |
| **Undo (`u`)** | Restores the card's previous FSRS state; the `Review` row stays | Specified in `07-srs.md`, unbuilt at MVP. The log is append-only, so what rewinds is the scheduling — which is derived — not the history |
| **Match** (`/review/match`) | Eight pairs against the clock | The only mode that makes you scan a *set* of words at once |
| **Practice hub** (`/practice`) | Every mode with its live state, plus one-click drills for weak cases | Answers "what should I do with five minutes" instead of listing modes |
| **XP, levels, quests** | `lib/gamification/` — derived from the review log, never stored (ADR-014) | A streak alone says nothing about six weeks of work. Three quests a day, chosen deterministically from the date |
| **Progress** (`/progress`) | Six-month heatmap, 14-day forecast, accuracy trend, per-case accuracy, CEFR reach | The forecast in particular is what stops an SRS becoming an unsustainable pile |
| **Class leaderboard** | Opt-in, name chosen by the learner, weekly XP only | The one feature a class actually asks for. Off by default; no email or history is ever shared |
| **Offline PWA** | Manifest, service worker, and a localStorage grade queue (ADR-015) | Restores the standing rule that review works with no network |
| **Local mode** | No Supabase keys → one learner, no sign-in (ADR-013) | `npm run setup && npm run dev` is a complete installation again |
| **⌘K palette, skip link, loading/error/not-found routes, phone nav sheet** | — | The difference between a demo and something you use on a Tuesday |

### What this pass deliberately did *not* do

- **No new Estonian content was written.** Every word, form and example still comes from the seeded
  dictionary or Ekilex. The path references lemmas and `lib/collections/path.test.ts` fails if one
  does not exist — an invented unit word would be an invented Estonian word by the back door.
- **No cloze or sentence-building mode.** It needs example sentences the dictionary does not carry
  for every word, and the honest source for those is Ekilex, not a model (ADR-005). Still shelved.
- **No speech-to-text.** Unverified for Estonian (audit A5). Unchanged.
- **No hearts, no lost streaks, no punishment mechanics.** Quests only add. The streak shield already
  covers the anxiety a study app is entitled to create.
- **No schema change.** Everything above rides on the existing tables plus the `Setting` key/value
  bag — which is why none of it needed a migration, and why a backup taken before this pass restores
  into it unchanged.

### Known limitations, still

1. **Match grades on recognition, not production.** A pair found among eight is easier than producing
   the word cold; it is recorded as Good, which is generous but not dishonest. Sprint has the same
   shape and always did.
2. **The leaderboard is a whole-instance board, not per class.** Everyone who opts in on one
   deployment sees everyone else who opted in. For a single class that is the right behaviour; for a
   public instance it would need class codes, which is a feature, not a fix.
3. **Undo trusts the client for the previous card state.** It is range-validated and can only ever be
   applied to a card the caller already owns, so the worst case is someone rewinding their own
   scheduling — which the button does anyway.
4. **The service worker keeps the app openable, not the data fresh.** A screen you have never opened
   while online shows the offline fallback. Review, the one path that has to work, does not depend on
   it: the queue does.
