# MVP Status and Decisions

What was actually built, what was deliberately left out, and which planning decisions changed once
the answers to `12-open-questions.md` came back.

**§7 is the current state.** §1–5 describe the first MVP, §6 the pass that made it usable by a
stranger, and §7 the pass that made it teach in context — sentences, speaking and classes.

## 1. The answers, and what they changed

| Question | Answer | Effect |
|---|---|---|
| Q1 Local or hosted? | **Local only** at MVP time; **reversed 2026-08** to hosted (Vercel + Supabase), with Google sign-in. | ADR-002 confirmed for v1, superseded by ADR-011. Schema was already Postgres-portable, so this was a datasource swap, not a rebuild |
| Q2 Level? | Learner is at **B1–B2**, but the app should cover **A1–C2** | 2,271 of about 5,400 entries are B1 or above, including a C1 layer and the verb-government cases that trip up English speakers at that level. The model has no ceiling: C2 words drop in without a schema change |
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
| Built-in dictionary, about 5,400 entries and 32,000 stored forms | 360 hand-checked entries, plus the rest built by `scripts/expand-seed.ts` from Ekilex (forms and sentences) and Wiktionary (English). CEFR-tagged A1 to C1 (433 / 636 / 1,095 / 1,071 / 105). 285 verbs carry government, up from 24, and 4,614 entries carry an attested Estonian sentence |
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

1. **The built-in dictionary is about 5,400 words.** Built by `scripts/expand-seed.ts` from Ekilex and Wiktionary, it covers A1 to C1 and works offline, but it is short of the full
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
   and re-adding the card fixes it — and now costs nothing, since deleting a card no longer
   destroys its review history. Regenerating automatically would mean either losing the card's
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
| **Learning path** (`/learn`) | 18 units, A1→C1, over the same dictionary. `lib/collections/path.ts` | "Here are five thousand words, good luck" is not a course. Units are references, not copies, so nothing duplicates and a correction still lands everywhere |
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


## 7. The third pass: teaching in context

§6 ended with a working daily loop and one obvious hole: every exercise asked about a word in
isolation. You could know all fourteen forms of `raamat` and still not know where it goes in a
sentence.

### What changed the picture

Ekilex's `/word/details` response carries **usages** — attested sentences recorded against each
meaning, `public`-flagged for display. That single fact is behind most of this pass: the app can
teach in context without writing a word of Estonian, because it only ever hides or reorders text a
lexicographer wrote (ADR-017).

| Area | What it is |
|---|---|
| **Example sentences** | Stored per word, shown on the entry with audio, translated one at a time on request and tagged `AI`. A learner can add one of their own from class |
| **Gap-fill cards** (`CLOZE`) | A form we hold, hidden inside a sentence Ekilex recorded. The lemma is the hint, so it asks for the *form*; the case it drills feeds the weak-case breakdown |
| **Sentence builder** (`/review/sentences`) | The word bank, over real Estonian. With a translation it is "say this in Estonian"; without one it shows the sentence, then scrambles it — and says which it is doing |
| **Speaking** (`/review/speaking`) | Shadowing: say it, then hear a native voice and your own recording back to back. No score — see below |
| **Classes** (`/class`) | A join code, a roster of effort, the group's weakest cases, and units set as homework into each student's own task list (ADR-019) |
| **Conjugation** | The verb paradigm as a table — persons down, present/past/conditional across — plus a `CONJUGATION` card type over stored forms |
| **Share card** (`/api/share`) | A 1200×630 PNG of streak, cards known and XP, generated per request for the signed-in learner |
| **Install and remind** | Apple touch icon, safe-area insets, 16px inputs (iOS zoom), a one-time install prompt, and a daily reminder as a calendar file rather than a push subscription |
| **Anu: check a sentence** | A structured check that names the rule before the fix, and boxes the corrected sentence as the model's own work rather than letting it read as dictionary data |

### Things this pass refused to do

- **Score pronunciation.** No verified Estonian speech recogniser is available to this app —
  TartuNLP publish TTS and nothing comparable the other way, and the browser's own recogniser has no
  dependable `et-EE`. A number invented on top of that would be trusted, so speaking compares
  instead of grading (ADR-018).
- **Write example sentences.** Not by hand, not with the model. Every sentence is attested.
- **Let a teacher see inside a student's deck.** A class exposes effort and aggregate weakness, and
  the boundary is one file (`lib/classroom/roster.ts`), not a policy paragraph (ADR-019).
- **Push notifications.** They need a server that stays awake and still do nothing on an unin­stalled
  iPhone. A recurring calendar event fires on the device the learner already trusts.

### Known limitations, still

1. **Sentences depend on Ekilex.** Without a key, the built-in dictionary carries no usages, so the
   gap-fill and sentence modes stay empty and say so. A free reader key fills them in as words are
   looked up.
2. **Translations of examples are machine-made.** Tagged `AI`, stored so they are fetched once, and
   overwritable — but they are not a translator's work and the app does not claim otherwise.
3. **A class is per instance, not per school.** One deployment, many classes; there is no
   organisation layer, no roles beyond teacher and student, and no way to move a class between
   instances.
4. **Classes need sign-in.** In local mode there is one learner, so `/class` explains that rather
   than offering forms that could not work.
5. **Installable, but not in the App Store.** Kodukeel installs to a home screen as a PWA and works
   offline there. An actual App Store listing needs a native shell (Capacitor or similar) around
   this same web app — that is a packaging and review exercise, not a rewrite, and it has not been
   done.

## 8. The merge: one app, not two

Passes seven (teaching in context) and the visual rebuild described in `14-design-system.md` were
built at the same time against the same `main`. Merging them was the last step of this round, and
the rule was that neither side got to win by default: the rebuild owns how the app looks, this
pass owns what it does.

What that meant in practice:

- The new routes moved into the `(app)` route group, so they get the rail, the mobile bar and the
  wash from the layout rather than each rendering their own chrome.
- Sentences and Speaking joined the Today page's quick-practice grid and the Practice hub, each
  with its own hue — six modes, six colours, no two the same.
- The screens listed in §7 were restyled onto `components/ui.tsx` (see `14-design-system.md` §9).
- Two responsive bugs the merge exposed were fixed rather than papered over: the Today hero packed
  three stat tiles and the goal ring onto one row at 390px, and a grid column without `min-w-0`
  let a long task title widen the page.

Verified after the merge: unit tests, `tsc --noEmit`, ESLint, all eight browser suites, and a
screenshot sweep of every route at 1280px and 390px with the console watched and horizontal
overflow asserted against.

## 9. The fourth pass: the teaching layer

Three passes built an app that tests. This one built the half that teaches — the parts a learner
reaches for when a flashcard has stopped helping, and the part a teacher reaches for when the
lesson is not on a screen at all.

| Area | What it is |
|---|---|
| **Grammar reference** (`/grammar`, `/grammar/[case]`) | One page per case: what it is for, where it turns up, the mistake an English speaker makes, and the case shown on real words with the provenance of every form. Linked from the dictionary's case table, the weak-case drills and the Progress breakdown |
| **Dictation** (`/review/dictation`) | Hear an attested sentence, write it down. Marked word by word — green for exact, butter for a word heard but misspelled, peach for one missed — so the learner sees *which* ending they lost |
| **Printable worksheet** (`/learn/[unitId]/worksheet`) | A unit as paper: vocabulary, gap-fills from attested sentences, a principal-parts table, and an answer key on its own sheet. The rail and the wash come off in print |
| **True retention** (on `/progress`) | Of the cards FSRS believed you had learned, how many came back — measured from `Review.stateBefore`, compared with the 90% the scheduler targets, and turned into one instruction |
| **Shortcut sheet** (`?`) | Every binding the app implements, grouped by where it works |

### Why the grammar page is allowed to exist

ADR-005 forbids the app from writing Estonian. A grammar reference is the obvious place to break
that rule by accident — one "for example, *majas*" and the page is presenting an unattested form
next to real ones. So the split is structural:

- `lib/estonian/grammar.ts` is English prose and holds no Estonian at all. A test keeps a tripwire
  on it (Estonian of any length reaches for its own letters), and says in as many words that a
  regex is not a proof.
- `lib/progress/caseExamples.ts` supplies every Estonian word on the page, out of the dictionary,
  each tagged with where it came from: an Ekilex form, a stored principal part, or the regular
  ending on a stored genitive. The page prints that tag next to the form.

The same rule shapes the worksheet: a gap-fill is a real sentence with one of its own words hidden,
and a case table is a table with cells left out. Neither invents anything, which is also why an
exercise simply does not appear when the material for it is missing.

### Known limitations, still

1. **Oblique-case examples depend on Ekilex.** The seeded dictionary holds principal parts, so the
   grammar pages for the inside/outside cases derive their forms and often have no attested
   sentence to show. Looking those words up once fills both in.
2. **Dictation needs short sentences.** Only sentences of three to nine words are used; a longer
   one tests memory rather than listening. A deck whose words have no short attested sentence gets
   an empty state that says so.
3. **Retention needs history.** Below thirty mature reviews the reading refuses to give a number,
   because one bad evening would swing it twenty points.
4. **The worksheet is one sheet per unit.** No question banks, no randomised variants, no per-class
   sets. It is deterministic on purpose: a class comparing answers has to be comparing the same
   sheet.

## 10. The fifth pass: diagnosis, and the rule at the moment it is wanted

§9 built the teaching layer. This pass connects it to the daily loop, and adds the one diagnostic a
spaced-repetition deck cannot do without.

| Area | What it is |
|---|---|
| **Sticking points** (on `/progress`) | The handful of cards that keep lapsing, one row per word, each saying what is wrong with it. Actions in order of what usually helps: the case explanation, the dictionary entry, and only then setting it aside — reversibly |
| **"Why?" on a revealed card** | A review card that has just shown its answer offers the grammar page for the case it drills, and Anu with the question already written |
| **Print from dark mode** | Fixed: the dark palette followed the page onto paper, so a teacher reading in dark mode printed white ink on white paper |
| **Two guards on the restore suite** | It refuses to run against a non-local database, and writes the export to disk before deleting anything |

### Why sticking points are named rather than scored

Anki's leech handling suspends a card after eight lapses. The instinct is right and the number is
wrong for a language course: by the eighth lapse the learner has spent twenty minutes on one word
and drawn a conclusion about themselves rather than about the card. So the threshold is four, and
the framing is diagnostic — a card that keeps lapsing after being learned is usually a grammar
problem wearing a vocabulary costume, which is why the explanation is the first action offered and
the off switch is the last.

One row per word, too. A noun with four card types produces four rows otherwise, burying every
other word behind the one the learner already knows they are stuck on; the worst card stands for
the rest and says how many.

### Known limitations, still

1. **Setting a card aside is per card, not per word.** The row that offers it stands for several
   cards; the button suspends the one it names. Suspending everything for a word is still done from
   My words.
2. **The undo is only good for the visit.** The list is built from unsuspended cards, so a
   suspended one is gone on the next load — `Put it back` is offered while the page is open, and
   after that the card lives in My words like any other suspended card.
3. **Anu is handed the question, not the card.** She gets a sentence naming the case and the word;
   she does not see the learner's answer, their history, or the rest of the deck.
