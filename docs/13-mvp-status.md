# MVP Status and Decisions

What was actually built, what was deliberately left out, and which planning decisions changed once
the answers to `12-open-questions.md` came back.

## 1. The answers, and what they changed

| Question | Answer | Effect |
|---|---|---|
| Q1 Local or hosted? | **Local only** at MVP time; **reversed 2026-08** to hosted (Vercel + Supabase), with Google sign-in. | ADR-002 confirmed for v1, superseded by ADR-011. Schema was already Postgres-portable, so this was a datasource swap, not a rebuild |
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

The daily spend cap from the original plan was dropped at MVP time: with a free model there is
nothing to cap, and a cap on an unmetered path is dead code.

**Added back, 2026-08.** The default model is a paid one and sign-up is open, so the unmetered path
became one stranger away from an unbounded invoice. `lib/usage` now meters every call — a burst
window, a per-user day, and a global day cap — and there is no way to switch it off. It fails
closed, and an unrecognised model prices at the dearest rate in the table rather than at zero,
because a cap that fails open is not a cap.

## 3. What is built

| Area | State |
|---|---|
| `lib/estonian/` — cases, principal parts, gradation, derivation | Complete, 56 unit tests |
| Dictionary — search, paradigm, gradation, audio | Complete. With an Ekilex key it reaches the full Estonian lexicon; without one it falls back to the 360-word built-in set |
| Ekilex integration — live lookup, full retrieved paradigm, CEFR, verb government, Estonian definition | Complete. Seeded words are upgraded to the authoritative paradigm the first time they are viewed |
| English translations — layered: accepted → Wiktionary → AI → blank | Complete. Ekilex has no English on a reader key, so no single source suffices |
| Inflected-form search — `toas` finds `tuba` and explains that it is the inessive | Complete; matches stored principal parts and case endings on the singular and plural genitive stems |
| Built-in dictionary — 360 entries, 1 568 stored forms | Complete, hand-checked, CEFR-tagged A1–C1 (162 / 51 / 75 / 66 / 6). 70 carry gradation, 24 verbs carry government |
| Speech — TartuNLP, server-proxied, content-addressed cache | Complete and verified end to end. Now durable in object storage rather than per-instance; see §4b |
| Flashcards — FSRS, 5 card types, keyboard-only review, undo-by-requeue | Complete |
| Today — due counts, streak, tasks, weak-word pick | Complete |
| My words — deck management, filters, weak-case breakdown | Complete |
| Anu — streaming chat, prompt chips, vocabulary bridge with AI provenance | Complete; needs a key |
| Tasks — tagged, week, due dates | Complete |
| Import — paste TSV/CSV/dash/semicolon lines, with dedupe | Complete |
| Add a word by hand, with principal parts and auto-classified gradation | Complete |
| Edit an existing entry — corrections rewrite its cards' text but never its FSRS scheduling | Complete |
| Export — full JSON backup | Complete |
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

## 4b. Built since the MVP

| Area | State |
|---|---|
| CI — typecheck, hermetic unit tests, integration tests on real Postgres, build, credential scan | Complete. The credential rule this file's rules section always claimed had no enforcement until now |
| Spend ledger — per-user burst, per-user day, global day cap | Complete, fails closed. An unrecognised model prices at the dearest known rate rather than zero |
| Sign-in allowlist, open by default | Complete. A quota, not a guest list, is what makes an open door safe |
| Offline review (PWA, outbox, ordered replay) | Complete, and the append-only log is what made it cheap |
| Durable audio cache in object storage | Complete. The previous `/tmp` path was per-instance and wiped on every cold start |
| Error reporting with redaction; error, global-error and not-found boundaries | Complete, no third-party script |
| Privacy and terms, written from the schema | Complete |
| **Writing** — free production, marked mechanically first and by AI second | Complete. The forms check runs before any model call and works with no key |
| **Grader output verified against the dictionary** | Complete. `lib/tutor/verify.ts` — the prompt is a request, this is the check |
| **Verb government drill** | Complete, distractors drawn from the real distribution |
| **Minimal pairs** | Complete. Pairs are found in the dictionary, never authored |
| **Cloze from pasted reading** | Complete. The passage is not stored |
| **Diagnosis by error class** | Complete. Says nothing below eight reviews per group |
| **Leech clinic** | Complete. Classifies the failure shape and asks Anu a specific question |
| **Week as a spine** | Complete. `classWeek` now on Card as well as Task |

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

   Partly answered rather than fixed: the minimal-pairs drill teaches the part of the contrast that
   *is* written (`maja` / `majja`, `pika` / `pikka`) through audio, which is the only channel that
   can carry it. It deliberately does not claim to teach the second-versus-third quantity
   distinction, where both spellings are identical — speech synthesis is handed the same string and
   would say the same thing twice, so a drill built on it would be a lie.
3. **Plural oblique cases need a stored genitive plural.** Where it is missing the table shows a gap.
   `tuba : toa` yields `tubade`, not `toade` — it is not derivable, so it is not derived.
4. **Anu's Estonian is only as good as the model behind it.** The free model is decent, not
   authoritative. Everything it suggests is tagged `AI · verify`, and it never supplies a dictionary
   form — that boundary is enforced in the data model, not just in the prompt.
5. **Editing a word does not regenerate its case-form cards.** Recognition and production cards
   follow a correction; a case-form card built from an old genitive keeps the old answer. Deleting
   and re-adding the card fixes it — and now costs nothing, since deleting a card no longer destroys
   its review history. Regenerating automatically would mean either losing the card's scheduling or
   silently changing what a card asks mid-schedule, and neither is obviously right.
6. ~~**A review needs the server.**~~ **Fixed.** Review is a PWA: a service worker keeps the shell
   and the last session, grades go to an IndexedDB outbox, and `replayGrades` applies them in order
   with their original timestamps when the connection returns. The result is identical to having
   been online, because `grade()` takes `now` as a parameter and `Review` is append-only — there is
   no conflict to resolve. That is the payoff for never updating a review row, and it is why the
   sync is about a hundred lines rather than a subsystem.


## 6. What is still weak

Honest, and worth reading before promising anything.

1. **The built-in dictionary is still 360 words.** Everything scales with Ekilex, and the drills
   that mine the dictionary — minimal pairs especially — get much better with a key. Without one,
   minimal pairs finds sixteen contrasts. That is a real round, and not many.
2. **The AI grader's usefulness is model-dependent.** The *safety* is not: the form check is
   mechanical and the feedback is verified against the dictionary. But a weak model produces
   feedback that is merely bland, and the app cannot tell bland from insightful. `npm run eval:anu`
   measures grammar answers; there is no equivalent eval for grading quality yet.
3. **The verifier is a heuristic on the English side.** It flags any quoted word that is not a
   supplied form, the learner's own text, the English gloss, or a common grammar term. A model
   quoting an unusual English word will have its note withheld. The failure is conservative, and
   visible to the learner, but it is a failure.
4. **No FSRS parameter optimisation.** The review log has been carefully preserved as the input to
   it, and nothing consumes it yet. Default parameters are decent, not personal.
5. **Minimal pairs needs the network.** It is entirely about sound; with the speech service
   unreachable it says so and stops, which is honest but leaves it as the one mode that does not
   degrade.
6. **Object-case and listening card types** remain defined but ungenerated, for the original reason:
   they need example sentences the built-in dictionary does not carry for every word. The cloze mode
   is the partial answer — it gets real sentences from the learner instead.
