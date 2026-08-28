# MVP Status and Decisions

What was actually built, what was deliberately left out, and which planning decisions changed once
the answers to `12-open-questions.md` came back.

## 1. The answers, and what they changed

| Question | Answer | Effect |
|---|---|---|
| Q1 Local or hosted? | **Local only.** No login, no bill, no hosting. | ADR-002 confirmed. SQLite, no auth. Schema stays Postgres-portable for the eventual Google-SSO version |
| Q2 Level? | Learner is at **B1–B2**, but the app should cover **A1–C2** | 147 of 360 entries are B1 or above, including a C1 layer and the verb-government cases that trip up English speakers at that level. The model has no ceiling — C2 words drop in without a schema change |
| Q3 Digital class materials? | **None.** | The importer stayed generic and cheap. No time spent on a parser for a format that does not exist |
| Q4 Speakly? | Subscription exists, **not currently used** — "difficult to use" | Confirms ADR-006. Speakly has no public API (audit A3), so the paste importer handles it like any other source. Nothing Speakly-specific was built |
| Q5 AI budget? | **No cap — but free for now.** OpenRouter/OpenAI, and later "whatever works best" | ADR-004 reversed, see §2 |
| Q6 Browser extension? | **Gone.** | Confirmed out of scope |
| Q7 Other users? | **Just one for now**, but the app is intended to reach the wider Estonian-learning community later | No auth built. Everything user-owned is already keyed by row, not hardcoded, so adding an owner column later is additive |

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
| Dictionary — search, paradigm, gradation, derived case table, audio | Complete over the built-in dictionary |
| Built-in dictionary — 360 entries, 1 568 stored forms | Complete, hand-checked, CEFR-tagged A1–C1 (162 / 51 / 75 / 66 / 6). 70 carry gradation, 24 verbs carry government |
| Speech — TartuNLP, server-proxied, cached to disk forever | Complete and verified end to end |
| Flashcards — FSRS, 5 card types, keyboard-only review, undo-by-requeue | Complete |
| Today — due counts, streak, tasks, weak-word pick | Complete |
| My words — deck management, filters, weak-case breakdown | Complete |
| Anu — streaming chat, prompt chips, vocabulary bridge with AI provenance | Complete; needs a key |
| Tasks — tagged, week, due dates | Complete |
| Import — paste TSV/CSV/dash/semicolon lines, with dedupe | Complete |
| Add a word by hand, with principal parts and auto-classified gradation | Complete |
| Export — full JSON backup | Complete |
| Restore from a backup — merge (safe, idempotent) or replace (guarded) | Complete, verified by a wipe-and-restore round trip |
| Weak-case drill — click a case in the heatmap to review just those cards | Complete |
| Light and dark themes, keyboard operation, mobile layout | Complete; verified on an iPhone 13 viewport — no sideways scroll, 73×79px rating targets |
| Estonian text marked `lang="et"` so screen readers do not read it with English phonics | Complete |

## 4. What is deliberately not built

Each of these is a decision, not an omission.

- **Ekilex live search.** Requires a key we do not have, and the response shape cannot be verified
  without one. Writing a mapper against a guessed schema would be speculative code. The dictionary
  runs on 252 hand-checked words instead, which is enough for A1–B2. `docs/05-integrations.md` holds
  the contract for when a key arrives.
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

1. **The dictionary is 360 words.** Enough for A1–B2 and the start of C1, but far short of the full
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
5. **A review needs the server.** Grading is a server action, so the app must be running. It does not
   need the internet, but it is not yet an offline PWA.
