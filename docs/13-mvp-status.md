# MVP Status and Decisions

What was actually built, what was deliberately left out, and which planning decisions changed once
the answers to `12-open-questions.md` came back.

**§11 to §14 are the current state.** §1–5 describe the first MVP, §6 the pass that made it usable
by a stranger, §7 the pass that made it teach in context, §9 and §10 the teaching and diagnostic
layers, §11 the pass that measured the learner and stated what the app costs, §12 the pass that let
a photographed page become a set of words, §13 the mock state examination, and §14 the pass that
turned the path into a course covering A1 to C2. Those four were built at the same time against the
same main and landed one after another. Word counts in §1–7 are the numbers of their own time and
§14 supersedes them.

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
| Dictionary — search, paradigm, gradation, audio | Complete. With an Ekilex key it reaches the full Estonian lexicon; without one it falls back to the built-in set, which two build pipelines grew to about 5,970 words |
| Ekilex integration — live lookup, full retrieved paradigm, CEFR, verb government, Estonian definition | Complete. Seeded words are upgraded to the authoritative paradigm the first time they are viewed |
| English translations — layered: accepted → Wiktionary → AI → blank | Complete. Ekilex has no English on a reader key, so no single source suffices |
| Inflected-form search — `toas` finds `tuba` and explains that it is the inessive | Complete; matches stored principal parts and case endings on the singular and plural genitive stems |
| Built-in dictionary, about 5,970 entries and 34,500 stored forms | Grown twice over by two pipelines that turned out to be complements: 360 hand-checked entries, 1,248 fetched against the syllabus by `scripts/harvest-ekilex.ts` with authored English glosses, and the rest built by `scripts/expand-seed.ts` from Ekilex (forms and sentences) and Wiktionary (English). CEFR-tagged A1 to C2 (478 / 693 / 1,226 / 1,243 / 180 / 76, the rest ungraded by either source). 461 verbs carry government, up from 24, and 5,405 entries carry an attested Estonian sentence |
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

1. **The built-in dictionary is about 5,970 words.** Built by `scripts/expand-seed.ts` from Ekilex and Wiktionary and by the course harvest, it works offline, but it is short of the full
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
| **Learning path** (`/learn`) | 18 units, A1→C1, over the same dictionary. Rebuilt in §14 as `lib/collections/syllabus/`: 83 units, A1 to C2 | "Here are five thousand words, good luck" is not a course. Units are references, not copies, so nothing duplicates and a correction still lands everywhere |
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

## 11. The sixth pass: where you are, where you want to be, and what that costs

The app could tell a learner everything about their deck and nothing about their Estonian. Setup
asked them to place themselves on a CEFR ladder before they had met the app, took the answer as
fact, and then never mentioned levels again. Nothing anywhere said how long any of this takes, and
nothing said what the app cannot do.

| Area | What it is |
|---|---|
| **Level check** (`/assess`) | Four skills, ten minutes, assembled out of the dictionary. Reading as meanings, case forms, case identification, verb government and recorded sentences; listening as the same with nothing written down, plus dictation; writing as a sentence that must contain a named case; speaking as shadowing. Take it whenever, as often as sensible |
| **A ladder that stops** | Questions climb the bands and a skill is abandoned as soon as a whole band comes in under half. `lib/assessment/session.ts`, pure, so a test walks a whole sitting without a browser |
| **A profile, not a number** | Per skill levels with the band breakdown, an overall that follows the weakest measured skill, and a stated confidence that names how few questions it came from |
| **Goals** | Why you are here, the level you want, the date you want it by, and how many days a week you will really practise. Asked at first run, editable in Settings for ever |
| **A timeline with sources** (`lib/assessment/plan.ts`) | Hours between two levels, how many of them the stated daily goal covers, and how many are left to find elsewhere. Ranges, with the published estimates they came from named |
| **What this app is** (`/guide`) | Every screen and when to open it, what the app does, and at the same length what it does not. Shown in first run and kept at a URL |
| **First run, rewritten** | Eight steps: name, why, how far and by when, measure or estimate, pace, the plan, the walkthrough, the deck |

### Why the speaking section exists at all if it cannot be scored

Because leaving it out would be a different lie. A learner asking "what is my Estonian like" is
asking about all four skills, and an app that silently measures three and reports a level has
answered a narrower question than the one asked. So speaking is asked, recorded, compared with a
native rendering and rated by the only party qualified to rate it here, and that rating is reported
as theirs and kept out of the level (ADR-018). `scripts/test-invariants.ts` fails if it ever counts.

### Why the overall level is the floor rather than the average

A CEFR level is a claim about what a person can do, not a score to average. A learner who reads at
B1 and writes at A2 who is told "B1" will sit an exam they fail, and the app that told them will
have been the reason. The strongest measured skill is reported next to the weakest, because that
half is true as well and it is the half that says what to work on.

### Why the plan is allowed to be discouraging

Estonian is roughly 1 100 classroom hours for an English speaker by the Foreign Service Institute's
own budgeting. Fifteen minutes a day in this app is about 90 hours a year. Those two numbers put
together are the single most useful thing the app can say to somebody on their first evening, and
saying it costs a few sign-ups and saves the ones who stay from finding out in March. The plan
screen therefore reports what the app's own pace covers, what is left over, and what a moved
deadline would look like, rather than a streak.

### Known limitations, still

1. **The paper is marked in the browser.** It has to be: the answers are in it, feedback is
   immediate, and a round trip per question would be unusable on a train. Nothing is at stake in a
   forged result, it reaches no roster and no leaderboard, and the server still recomputes the level
   from the credits with `placement()` so a stale client cannot invent its own scale.
2. **The hours table is not measured on this app's learners.** It combines published CEFR guided
   hours with the FSI difficulty scale, both of which are about other people on other courses. It is
   shown as a range with its sources named, and the copy says the app will use the learner's own
   pace once there is a log worth reading.
3. **No sentences without an Ekilex key.** The built-in dictionary carries principal parts and no
   `usages`, so on a seeded-only deployment there is no dictation and no sentence comprehension. The
   sections that survive say they are short rather than pretending to be full.
4. **Listening needs the speech service.** Where it will not answer, the section abandons itself and
   is reported as not measured rather than as a failure, because a silent speaker is a fact about
   the deployment.
5. **A level check every fortnight measures the questions.** The history screen says so; nothing
   stops anybody doing it anyway.

## 12. The seventh pass: the half of the course that is on paper

Everything before this assumed the vocabulary was already digital: seeded, fetched from Ekilex,
typed in, or pasted. In a real Estonian course most of it is not. It is a handout, a page of a
textbook, a list copied off a whiteboard, last night's exercise sheet. The gap between that and the
app was a person retyping thirty words with diacritics on a phone keyboard, which is where somebody
stops using a study app.

### What was added

| Area | What it is | Why it earns its place |
|---|---|---|
| **Scan a page** (`/scan`) | Photograph a word list or your homework; the words on it come back matched against the dictionary | The importer that needs no typing. It is the only path into the app that starts with the thing the learner is already holding |
| **The confirmation step** | Every word arrives ticked, editable, and labelled "in the dictionary" or "read from the photo" | This is the feature, not an obstacle in front of it. A model read the picture; the only person who can say what is printed on the paper is the one holding it |
| **Inflected forms traced to headwords** | `toas` on an exercise sheet resolves to `tuba` and says it was the inessive | A textbook exercise is written in cases, not in citation forms. The inflected-form search the dictionary already had turns that from a problem into the lesson |
| **A page as a set** (`/scan/[id]`) | A named group of words with its own progress, drilled by `/review?scan=` | The same shape as a learning-path unit, and references rather than copies for the same reason: correct a word once and it is corrected on every page it appears on |
| **`lib/usage` kind `SCAN`** | A photograph is metered like anything else that costs money | A picture is a few thousand input tokens where a question is a few hundred. An unmetered path is one stranger away from an unbounded invoice, which is the whole argument of §2 |

### The one decision worth arguing about

Reading a page needs a model to look at Estonian and say what it sees, and ADR-005 says a model may
never supply an Estonian form. Transcription is not authorship, but a misread `ö` and an invented
word are indistinguishable by the time either becomes a flashcard, and the scheduler does not just
leave a wrong card sitting there being wrong, it drills it in for six weeks.

So the model's claim and the app's belief were separated. `lib/scan/extract.ts` transcribes and is
pure; `matchEstonianForm` decides, and only accepts an exact lemma, a folded lemma, a stored form or
a regular case on a genitive stem. A vouched word brings its own principal parts, so nothing the
model wrote is in the card. An unvouched word is shown as exactly that and needs a person to tick
it. See ADR-021, and `scripts/test-invariants.ts`, where both halves are asserted and were made to
fail on purpose before being made to pass.

### What this pass deliberately did *not* do

- **No new practice mode.** A page drills through the ordinary review session with the page as its
  filter. A private quiz over scanned words would keep a score the scheduler never sees, which is
  the thing ADR-016 exists to prevent.
- **No stored photograph.** The image is decoded, sent once and dropped. `Scan` holds the confirmed
  word list and has no column an image could go in, and the invariant suite fails if one appears.
- **No handwriting claims.** It reads clear handwriting about as well as the model behind it does,
  which is why every word is editable and none is added without a tick.
- **No new provider pin.** Scanning uses whatever model the deployment already configured, so
  turning the camera on cannot quietly move a free-model deployment onto a paid one. The
  `*_VISION_MODEL` variables exist for the case where that model is text-only.

### Known limitations, stated plainly

1. **A word outside the dictionary arrives with no verified forms.** It gets a recognition and a
   production card and nothing else, because there is no paradigm to build a case-form card from.
   With an Ekilex key the row's "look this up again" button fetches the real paradigm; without one,
   the honest answer is two cards.
2. **The English on an unmatched word is the photograph's, not the dictionary's.** It is shown as
   unverified wherever it appears, and correcting the entry corrects it for everyone.
3. **Sixty words a page.** A double-page spread of a vocabulary list will need two photographs. The
   limit is there because a reply longer than that is a mistake rather than a page.
4. **Quality is the model's.** A bad photograph produces a short list, not a wrong deck, which is
   the failure mode this was designed to have.


## 13. The eighth pass: the paper people are actually learning for

Most people learning Estonian are learning for a specific paper. The state examines at **A2, B1, B2
and C1**, sixty percent to pass, and a zero in any one of the four parts fails the whole thing
however the other three went. B1 is what a citizenship application asks for. An app that teaches
Estonian and cannot tell somebody which of those they could pass today is answering a smaller
question than the one being asked.

`docs/16-exam.md` is the full account, including every figure and where it was read from. What
follows is what it cost and what it does not do.

### What was built

| Piece | State |
|---|---|
| The examination as data (`lib/exam/spec.ts`) | Complete. Parts, minutes, points, bands and the pass rule for all six levels, the four real ones cited, asserted by 17 unit tests |
| Paper assembly (`lib/exam/paper.ts`) | Complete. Eleven task shapes, deterministic in (level, seed, pool), and a stated shortfall wherever the dictionary runs out |
| Marking (`lib/exam/score.ts`) | Complete. No provider, no socket, no model anywhere in it |
| Readiness and confidence (`lib/exam/readiness.ts`) | Complete. Per-part prediction, a pass chance with a widening spread, an evidence ceiling, strengths and gaps that link somewhere |
| The report (`lib/exam/report.ts`) | Complete. Where the marks went, which task did the damage, every wrong answer, the words that caught you twice |
| The screens | Hub, briefing, sitting, result. `scripts/test-exam.mjs` sits a whole paper at two levels, 39 checks |

### The thing that nearly sank it, and what it changed

**The built-in dictionary carries no example sentences at all.** Not few: none. Every one of the 360
seeded entries has an empty `examples` array, because sentences arrive from Ekilex `usages` and only
once a word has been looked at with a key configured.

Three of the task shapes need an attested sentence. Without a key that meant the reading part and
the listening part came out completely empty, and the honest shortfall machinery dutifully reported
half a paper as absent. Honest, and useless, on the install a stranger gets by default.

So a task that cannot be set falls back to one built from what the dictionary always holds: words,
forms, glosses, and a speech synthesiser that needs no key. Listening becomes single words rather
than sentences, which in Estonian is a harder test than it sounds, since hearing `toas` and writing
`toa` is exactly the failure the exercise exists to catch. Reading becomes meaning and form
recognition. The word-order task has no fallback and stays honestly empty, because rebuilding a
sentence genuinely needs a sentence.

**Every substitution is declared**: on the briefing, per task, before the clock starts. A paper that
quietly swapped in an easier shape would be worse than a short one.

This is the third fault in this repository's history that only a keyless deployment reaches, after
the dictionary's dead-end case table and Anu's empty state dropping the learner's question. All
three were invisible on a machine with the keys set, which is the argument for running the suites in
the state a stranger installs into.

### Two things the first version got wrong on screen

Both were found by rendering the page rather than by reading the code, and both were the same shape:
a number and its explanation coming from different places.

**"Reading is at 11 percent, across 143 goes."** Neither half was true of the other. A sat exam part
replaced the card-based percentage while keeping the card-based count, so a learner with 143
recognition reviews at 73 percent and one bad paper was shown the paper's percentage over the
cards' count. The two sources are now a weighted mean, a sitting counting as twenty reviews' worth.

**Four cards each claiming to be the biggest problem.** Every part below the threshold said "this is
the part costing you the most marks". They are ranked now and only the worst one says it.

### Known limitations

1. **The reading part is not text comprehension.** It cannot be: the app may not write Estonian, and
   the dictionary holds sentences rather than passages. With an Ekilex key it is gap-fill and
   matching over attested sentences, which is two of the four official reading tasks; without one it
   is word level. The briefing says which.
2. **The spoken part is marked by the learner** (ADR-018), and a paper is a quarter self-marked
   because of it. The result says so rather than folding it in silently.
3. **Listening and speaking rest on the placement check or on nothing.** A `Review` row carries no
   note of which mode wrote it, so a dictation and a flip of the same card are indistinguishable in
   the log, and adding a mode column to the one append-only table for a reporting convenience is a
   bad trade. The level check of section 11 is the way out: it measures all four skills directly, so
   where one has been sat its listening and reading levels are folded in at two thirds. Where none
   has, the advice says the app has nothing on those parts rather than claiming they have never been
   practised. Its speaking number is the learner's own rating and is never read as a level.
4. **Vocabulary coverage is measured against this dictionary, not against the syllabus.** The real
   B1 vocabulary is several thousand words and the built-in set is 360, so "88 of 100 A2 words have
   stuck" is a proxy. The gap states the fraction it is working from rather than hiding it behind a
   percentage.
5. **The confidence figure is a model, and it says so.** It is capped by how many reviews are behind
   it, and a paper actually sat outranks it. Nobody with ninety reviews is told the app is ninety
   percent sure of anything.

## 14. The ninth pass: a course rather than a shelf

§6 added a learning path and §9 a teaching layer, and between them they left one
honest gap that a direct question exposed: could somebody actually go from A1 to
C1 with this? No. The path was 18 units and 239 words, three quarters of them
A1, with **one** B2 unit and **one** C1 unit of fourteen words each. Nothing
gated anything, no unit named the grammar it taught, and there was no way to
find out what level a learner was at beyond asking them. It was a shelf of
themed word lists with a CEFR label on it.

### What the blocker actually was

Vocabulary, and the rule that this project may not write Estonian. The
dictionary could not grow by anybody sitting down and typing more of it.

`scripts/harvest-ekilex.ts` is the way round that, and the direction of
authority is the whole design. The syllabus names lemmas and glosses them in
English — the one language this project is allowed to write — and Ekilex
supplies every Estonian character that follows: principal parts, CEFR level,
verb government, and attested sentences. A lemma in a unit is a *request*, not a
fact. If Ekilex does not know it, or knows it with a paradigm that does not match
the part of speech asked for, it is dropped and reported. A misspelled or
imagined word cannot reach the dictionary; it can only fail to arrive, loudly.

The first run dropped 38, and every one was a real mistake: a genitive written
where a lemma belonged, a plurale tantum, a typo, and three nouns ending in `-ma`
that the part-of-speech heuristic had confidently called verbs.

### What is there now

| | Before | After |
|---|---|---|
| Units | 18 | 83 |
| Levels with real coverage | A1–B1 | A1–C2 |
| Distinct course words | 239 | 1 266 |
| Dictionary entries seeded | 360 | 1 315 |
| Stored forms | 1 568 | 6 927 |
| Attested sentences | almost none | 4 325 |
| Verbs with recorded government | 24 | 206 |

Words per level, which is where the old path fell apart:

| | A1 | A2 | B1 | B2 | C1 | C2 |
|---|---|---|---|---|---|---|
| Before | 138 | 45 | 28 | 14 | 14 | 0 |
| After | 229 | 219 | 188 | 215 | 245 | 170 |

| Area | What it is |
|---|---|
| **The syllabus** (`lib/collections/syllabus/`) | Six levels, one file each, 83 units. Every unit carries a CEFR can-do statement, the grammar it teaches, the units it builds on, and its word list |
| **Lessons** (`/learn/[unit]/lesson`) | A unit is taught, not handed over. See below |
| **Placement** (`/placement`) | Four words per level from A1 up, stopping the moment a level is failed |
| **Checkpoints** (`/learn/checkpoint/[level]`) | Twenty production questions at the end of a level. No multiple choice, no feedback until the end |
| **Grammar topics** (`/grammar/topic/[id]`) | 44 notes covering the moods, voice, participles, derivation, register and idiom the syllabus names |

### Why a lesson is not a pile of flashcards

Three rules shape `lib/collections/lesson.ts`, and they are the whole answer to
"why is this not tedious":

1. **Nothing is asked before it is taught.** A word is met with its gloss and a
   real sentence, recognised, practised on its own material, and only then
   produced cold.
2. **No two *questions* of the same kind in a row.** Teaching cards are exempt on
   purpose: meeting three new words one after another is a presentation, not a
   grind.
3. **Words come back inside the lesson.** Each rung is emitted a round later than
   the last, so a word met at the start is typed several minutes on.

Getting rule 2 to hold took three attempts, and the two failures are worth
recording. A shuffle-and-repair pass could hoist a question in front of the step
that teaches its word, and could do nothing about the run of identical steps at
the end of a plan because there was nothing past them to swap with. Interleaving
lanes by construction fixed both. The tail needed a structural fix rather than a
repair: listening now runs one-to-one alongside production, because the final
round has nothing else left and no later step to borrow.

A long unit is several lessons of six words rather than one lesson of nineteen.
The step budget used to run out and quietly drop the last rung for the last
words.

### What merging the parallel passes found, and what happened to the fix

§12 and this pass were built against the same main and neither could see the
other's effect. Reading a page narrowed the dictionary with `take: 4000` and no
ordering, which is the fault `searchLexemes` had been fixed for one pass
earlier and which nothing had carried across to `lib/dict/resolveScan.ts`. On
its own branch that was invisible, because the dictionary it ran against was
smaller than the ceiling. Against the course dictionary it is a third of the
words: probing twelve real entries from beyond row 4000 came back with five of
them unrecognised, all of them sitting in the table with their forms intact,
and *which* five depended on where Postgres happened to keep the rows.

**Two sessions found it within the hour and fixed it the same way**, which is
the hazard `CLAUDE.md` describes at the end: a clean three-way merge is exactly
what two correct answers to one question produce, and you end up with two of
everything. So one was kept and the other deleted outright rather than left
alongside it. The one on main is kept, because it had already been through CI
there and because putting the narrowing in `resolveScan.ts` keeps `fold` and
`possibleStems` where they were; this branch's `vouchableCandidates` in
`search.ts` was equivalent and is gone.

What survives from this side is the part the other had no equivalent of. That
fix was verified by hand, against real words from the far end of the table, and
carried no test. **The regression test asserts the narrowing rather than the
outcome, and that distinction is the whole lesson.** "The right word resolves"
passes on a small dictionary, and on a large one whenever the row happens to
land early, which is precisely why the existing tests were green on both
branches while the scanner was losing a quarter of the dictionary. "An
unrelated word is not fetched" fails on any version that reads the table, and
was made to fail before it was made to pass. `candidatesFor` is exported for
that and nothing else.

### The tap that did nothing

`scripts/test-scan.mjs` had been failing about a third of the time on "the
saved page opens as a set", on main as much as here: 4 runs in 10 against
`origin/main` itself. It was worth chasing rather than re-running, because the
thing the suite was reporting is a thing a learner does. They tap "Open the
page" on the card that has just told them their photograph is saved, and stay
on the capture screen. A second tap always works.

Five explanations were measured and all five were wrong: the card's spring
animation (a Playwright stability trap by reputation, still failing 2 in 10
under `reducedMotion`), a network race, `ScanCapture`'s own `router.refresh()`,
the Server Action's `revalidatePath("/scan")`, and the router dropping the
navigation. The last of those was right and had been measured wrong, which is
the part worth writing down: the run was scored on whether the whole suite
passed, and this suite has two independent faults, so a fix for one kept being
marked a failure by the other. Score the check, not the suite.

What settled it was instrumenting the handler with a counter. On a failing run
it had run exactly once: React dispatched the click, the component called
`router.push`, and no navigation happened. `AddWord` had already reached the
same conclusion from the other end and written it down, which nothing in the
scan path had read.

So the same answer: `window.location.assign`. This is the tap that finishes the
paper-to-deck path and it may not be best-effort. Falsified both ways, on one
build each: `router.push` fails 3 in 12 with everything else in place, the
document load passes 18 in 18 and then 15 in 15.

Two more faults in the same suite were in the harness and are fixed there, with
the reasons in the file. A document load commits the address *before* the body
arrives, where a router push swaps it only once the tree is applied, so two
lines that counted chips immediately after the URL changed had been reading a
page that had not rendered.

The third only ever failed in CI, and what it was really about is worth the
paragraph. Drilling a scanned page draws in the learner's existing cards for
those words, deliberately, because a page is references rather than copies. So
the first card can be new, or flip, or multiple choice, or typed, and the
driver waited for the ratings as though it were always the first. Which one you
get depends on which seeded word the suite picks; it picks the alphabetically
first, which is a question about the database's collation rather than about the
app, and the two collations disagree. `smoke-offline.mjs` learned exactly this
and says so in its own comment, down to the cause: a shape that had never come
up first started coming up first because the dictionary grew. Nothing had
carried that across either. Reproduced by giving the local word a reviewed
card, at which point it failed here every time as well, which is the only way
a CI-only failure stops being a guess.

None of the three weakens anything. Every assertion is unchanged; only the
moment each is taken, and the state each can be taken in.

Also here, and found by main's own phone check rather than by anything of ours:
the exam's composition task puts a full dictionary gloss inside a `Chip`, and a
`Chip` does not wrap because a chip is a short label. "gymnasium, secondary
school, high school" is 404px of unbreakable line in a 350px card, and it
pushed 76px of the paper off the side of a 390px phone. It only appeared once
the course dictionary replaced the shorter seeded glosses, so the markup had
been right about everything except how long a real gloss is. `Chip` takes an
explicit `wrap` now, and nothing else in the app asks for it.

### The offline promise, which was not being kept on the first journey

`smoke-offline.mjs` had been failing one check on main, and the reason it went
unnoticed is that CI did not run it. It runs it now, which is the half of this
that matters: the suite `CLAUDE.md` calls the one worth keeping green above all
was the only one nothing watched.

The fault behind it was real and had the worst possible shape. `/review` is
served network-first and cached as a *side effect* of the worker serving that
navigation, and a worker never serves the navigation that installs it. So on a
first visit the page was fetched, the worker installed behind it, and
`clients.claim()` took over a client whose own page had never passed through it.
Pull the plug at that point and there is nothing to match, so the fallback goes
to /offline. Somebody opening the app for the first time on the way to the bus
stop got "this screen needs a connection" for the whole journey, and a working
app on the way home.

Measured rather than reasoned about: at the moment of the offline reload the
page cache did not exist at all, only the two-entry shell cache the install
step writes.

`warmOpenPages` caches the pages already open at the moment the worker takes
over. Every open window rather than a hardcoded `/review`, because the promise
is "the page you were last on opens again" and not "one route is special", and
failures are swallowed per client because a page that will not fetch is exactly
the page with nothing to cache. Not `install`, where `cache.addAll` is atomic
and one redirecting URL would take the offline page down with it.

### Known limitations, stated plainly

1. **C2 is named, not delivered.** Its ten units cover the specialised registers,
   irony, dialect and nuance a C1 speaker still gets wrong, and the last unit
   says in as many words that C2 is finished by reading, arguing and living in
   the language rather than by finishing units. An app can name the ground. It
   cannot walk it for you.
2. **1 266 words is a real course and not a real vocabulary.** It is over five
   times what was here before and roughly a fifth of what a C1 reader knows. The gap closes as the learner looks words up, because a live Ekilex
   key stores every word it fetches, but the *course* stops at what the syllabus
   names.
3. **Placement measures recognition only.** So it places at the highest level
   passed rather than the one above, which biases it low on purpose, and it says
   so on the result screen. Nothing in twenty questions can test whether somebody
   can use the partitive.
4. **Ekilex's own CEFR coding thins out at the top.** 1 078 of the 1 248
   harvested words carry a level from Ekilex; the rest take the level of the unit
   that introduces them, which is an editorial judgement rather than an
   authority's, and they cluster at C1 and C2 where Ekilex grades least.
5. **A topic page is sparser than a case page, deliberately.** A case page shows
   the case on real words because every form on it is read from the dictionary
   with its provenance. There is no equally safe way to illustrate the quotative:
   picking sentences whose words end in the right letters would be the app
   asserting a grammatical analysis nobody verified.
6. **Renaming a word does not rewrite its gap-fill cards.** Recognition and
   production cards follow a correction because their text *is* the lemma. A
   gap-fill is an attested sentence with one of its own forms blanked out, and
   neither half is ours to rewrite because a headword was corrected. Same
   reasoning as the case-form cards in §5, and it only became visible when
   seeded words gained attested sentences.

## 15. The tenth pass: what a person has to be told, and what to stop asking twice

Three passes over one branch, and they turned out to share a shape: in each
one the app was doing the right thing and could not prove it, or was doing an
honest thing that quietly cost something.

### The policy pages named nothing, and could not

`/privacy` and `/terms` were written from the schema, which is why almost every
sentence in them was true. What they had no way to say was who was answerable.
Kodukeel is software somebody installs rather than a service with one address,
so the controller is whoever runs the copy, and the pages said exactly that:
"ask whoever runs this installation". That is honest and it is not an answer,
because there is no way to find out who that is.

Article 13(1)(a) wants a name and a contact at the point of collection, and the
Information Society Services Act wants the same of anyone providing an online
service. So the identity is configuration now, like the database URL:
`OPERATOR_NAME`, `OPERATOR_ADDRESS`, `OPERATOR_EMAIL` and, for a company, the
registry code. Both pages render it, and **a deployment that has not set it says
so in as many words** rather than showing a plausible blank. That is the half
worth defending: a page that quietly says nothing looks finished.

Six more things a reader is entitled to and was not being told: the lawful basis
for each thing stored, who else sees it, whether any of it leaves the Union, how
long it is kept, the rights that can be exercised, and the right to complain to
the Data Protection Inspectorate. The recipients section is generated from the
deployment's own configuration rather than described in the abstract, so a
reader is told which companies specifically, and whether they are in Estonia or
not. A page that says "whichever AI provider this installation is configured
with" answers the question in form only.

The one genuinely Estonian detail, as opposed to the European ones: the age at
which somebody can agree to this for themselves is 13 here, which the page now
states rather than leaving to a reader's assumption about 16.

### Two promises the app was not keeping

Both were found by reading the page against the code, which is the only way
either would have been found.

**"Delete everything" did not.** `deleteMyAccount` emptied every table this app
owns, in one transaction, and left the identity behind: the email address, the
Google subject id and the sign-in history live in Supabase Auth, not in our
schema. There was no route to remove them and nothing on screen admitting it.
An email address is personal data wherever it is stored. The button now erases
the auth user too, and where the deployment holds no key that can, it says which
part is left and who to ask instead of reporting a success it did not achieve.

**"Nothing is held back from it" held back half.** The export was five tables.
Settings, the conversations with Anu, the level checks, the starred words and
the badges were all absent, and two of those cannot be reconstructed from
anything: a sitting of the level check is a measurement of a moment, and a
tutor conversation is the learner's own writing. All five are exported now, and
all five restore, so the file is a real backup as well as an Article 20 copy.
The invariant behind it reads the owner-scoped models out of the schema rather
than a list somebody typed, so a new table is a failure until a person decides
about it. `UsageEvent` is the one deliberate exclusion and the page names it:
it is the deployment's spending record, not the learner's work.

### A question asked on every render, for ever

`enrichFromEkilex` had no way to record that Ekilex had nothing to say, so it
did not, so the next render asked again. Two round trips to a free academic
service per view of a word that was never in Ekilex, against a 2,500ms deadline
that could hold the page for all of it. The seed learned this exact lesson
expensively, and the live path had the same bug with a symptom nobody looks
for: a cost rather than an absence.

`Lexeme.lookupMissAt` records it, and is deliberately not `fetchedAt`, which
the exam pool reads as a ranking. Details are in `docs/15-performance.md`.

### The offline fault two sessions found at once

This pass also found `smoke-offline` failing on a real bug: the worker never
serves the navigation that installs it, so the page cache was empty for exactly
the person the fallback exists for. Another session found it in the same week
and landed the better fix, which caches whatever window is open rather than a
list of routes written in advance. The version written here was deleted rather
than left beside it, keeping only the one clause it carried that the other had
no reason to: the shell is warmed one URL at a time, because `addAll` is atomic
and `/offline` is in that batch. `docs/15-performance.md` has the measurement,
and the invariant is what the surviving fix did not come with.

### Known limitations, stated plainly

1. **A deployment can still run unnamed.** Nothing refuses to boot without an
   operator, and nothing should: a local single-learner install has no third
   party to inform, and a hard failure would push somebody towards a fake value.
   The pages say the field is empty, which is the strongest honest move.
2. **Where Supabase hosts a project is not readable from here.** The region is
   chosen when the project is created, so the recipients list says it depends on
   how the installation was set up rather than guessing at a continent.
3. **A provider's own terms are outside this promise, and the page says so.**
   Some free tiers are free because the provider reserves the right to read what
   goes through them. The app can name who it sends to; it cannot bind them.
4. **The miss marker is a per-word day, not a shared negative cache.** A word
   nobody looks at twice never benefits from it, which is correct and worth
   naming: it makes the second view cheap, not the first.

## 16. Multiple choice was every recognition card, not the hard ones

`withChoices` in `app/(app)/review/page.tsx` attached four English options to
every `RECOGNITION` card a session held that was not brand new, and `askFor`
routes to a pick whenever options exist. Neither of the two review modes
overrides that: `"type"` applies only to `TYPEABLE`, which excludes recognition
because its answer is free English. So half of every deck, the `et → en` half,
was never once asked with the answer off the screen. `docs/07-srs.md` §2 calls
recognition "passive vocabulary" and §14 above says options are for cards a
learner has not met, and the code had quietly widened that to all of them.

Recognising a gloss among four is a much weaker memory than producing it, and
FSRS does not know which one it just measured: a card graded Good on a pick is
scheduled as if the word were recalled. The schedule was built on the easier of
the two memories for the more common direction, which is the one failure mode a
spaced-repetition app cannot see from inside itself.

Options are now attached only while a card is still being learned.
`isStillLearning` in `lib/srs/scheduler.ts` reads FSRS's own state rather than
a bare integer at the call site, and covers three of the four states: New and
Learning because the memory is not formed yet, Relearning because a card that
has just lapsed is back in that position by definition. A card in Review gets
the plain question and the learner grades themselves, which is what the flip
card was always for.

### What this does not change

1. **A new card still leads with its answer.** That is the `intro` shape and it
   is the reason options existed at all: asking for a word never shown is a
   guessing game (§14).
2. **Recognition is still not typeable.** The answer is English prose, and
   marking "to help" against "help" would fail people for a synonym. That is
   the same reason `GOVERNMENT` is excluded from `TYPEABLE`.
3. **The form drills still show the gloss.** Cloze, case-form, government and
   the `gap`, `case` and `govern` lesson steps print the lemma and its meaning
   before the answer, deliberately: they ask for a *form*, and testing the
   vocabulary at the same time measures neither. `lib/srs/cards.ts` says so at
   the line that builds the hint.

## 17. The eleventh pass: named the way it is taught

The domain model had been right since it was written and the screens had not
been reading it. `cases.ts` has carried the Estonian name and the question word
for every case from the beginning; `morph.ts` has carried `olevik` and
`lihtminevik` for as long as there has been a paradigm table. Every screen led
with the other column. A case was headed "Inessive" with `seesütlev` in small
italics under it, a flashcard asked for "tuba → inessive" and put the question
in the hint, the reference called `lihtminevik` "the imperfect", which is a
Latin category this language does not have, and the placement check offered
somebody in their first week "Inessive, Elative, Allative" as multiple choice.

None of that is how Estonian is taught anywhere. A course, a school textbook
and the state examination name a case by its Estonian name and, more often, by
the question it answers, and they name the verb by four axes kept apart, of
which only two are tenses the verb inflects for. An app whose whole argument is
that it fits alongside a course was teaching a private vocabulary that a course
does not use.

### What changed

The hierarchy is flipped rather than a name deleted: the Estonian term and the
question lead, and the English name stays as a labelled cross-reference, because
this app is written in English and an English reference grammar has to stay
usable. `lib/estonian/terms.ts` is the one table of what a point is called, and
it is deliberately partial, holding nothing for a point where a class has no
settled term. The grammar reference is regrouped by what kind of word is doing
the work, with the four verb axes stated at the top instead of a flat list
headed by English tense names. Three hand-typed English label tables, in
`search.ts`, `app/actions.ts` and the minimal-pairs page, collapsed into one
derived `formName()` in `morph.ts`, so `toas` resolves as "seesütlev (inessive)
of tuba" in all three at once. Anu is told to name a point the same way, beside
the instruction that already asked her to use both names.

### Known limitations, stated plainly

1. **Cards already in a deck keep the front they were built with.** `Card.front`
   is stored, so an existing conjugation card still reads "present · ma" until
   it is regenerated. Rewriting stored fronts in a migration would edit a card
   somebody has a scheduling history against, for a cosmetic gain.
2. **The topic ids are unchanged, so `/grammar/topic/imperfect` still says
   `imperfect` in the URL.** The id is a key that 83 syllabus entries point at
   and that any bookmark holds. Renaming it buys a slug and risks the course.
3. **A term nobody says is worse than an English one.** Roughly a third of the
   grammar points have no entry, because a settled classroom term for "irony" or
   "register" is not something this repository can invent, and `grammarTerm()`
   returning nothing is the honest answer. Those points keep their English
   description.
4. **The English column headings over the tables stay English.** "Case",
   "Singular", "Answers" are labels on a table of Estonian, not names of
   grammatical categories, and translating them would be decoration.


## 18. The twelfth pass: what to do when the app is wrong

The dictionary is assembled rather than typed, which is what keeps invented
Estonian out of it and is not the same thing as being right. Ekilex may have no
entry for a word somebody is holding on a page in front of them; a Wiktionary
sense order may put an everyday meaning under a later etymology; a mark is a
string comparison against a form the dictionary vouches for, and it cannot know
the dictionary is the thing that is wrong. Every one of those ended the same
way: a sentence, a back button, and the one person who knew what was actually
wrong with nowhere to put it.

### What was added

**A report from wherever the failure is.** `components/SuggestFix.tsx` mounts
beside the dead end rather than under a contact page, on a search that found
nothing, on a dictionary entry, on an answer marked wrong, on a word off a
photographed page that nothing vouched for, on a grammar reference, on a mock
paper's marking, on a failed import, on Anu failing to answer, on the error
boundary and on a link that led nowhere. It sends the screen and what the app
had just said along with the report, because a correction without the thing it
corrects is a sentence out of context. The note is optional: pressing the button
on that screen is already the useful half.

**A queue built for the volume rather than for a demo.** `/admin/suggestions`
shows one line per thing reported, ordered by how many people reported it,
filtered by what a reviewer would do about it: dictionary, marking, teaching,
faults. Each line carries what the entry says now beside what is proposed, so a
decision does not need a second tab. Accepting acts on the whole group.

**One click that is a real write.** Four of the eight categories carry a
machine-applicable proposal, and accepting one goes through
`lib/dict/upsert.ts`, the same function the hand-edit path uses: principal parts
only, an Ekilex paradigm never touched, provenance never relabelled. An example
sentence can be removed and never rewritten. Nothing under `lib/suggestions/`
can reach a model.

**And the learner is told what happened.** `/suggestions` lists what they sent,
its outcome and the reviewer's words. A report that vanishes is a report nobody
sends twice.

### Things this pass refused to do

1. **Route every dictionary edit through review.** A learner can still correct
   an entry by hand, attributed, exactly as before. That is the right tool for a
   typo in front of you, and taking it away would slow down the correction that
   is most likely to be right in order to moderate the one least likely to be.
   The queue is the channel for a judgement somebody should look at, and the two
   sit side by side on the entry.
2. **Let the app decide which reports are duplicates of each other.** Grouping
   is mechanical and blunt: the entry, or the screen and the message with digits
   flattened. Anything cleverer would merge two reports about different words on
   a similarity score nobody could audit from the queue.
3. **Invent a reviewer.** With sign-in configured and `ADMIN_EMAILS` unset,
   nobody is an admin and the queue says so. Falling back to the first account,
   or to anybody signed in, would turn an open sign-up into an open dictionary.
4. **Reply to people.** A reviewer can leave a note and the sender sees it. There
   is no thread, no email, and no promise about how long any of it takes, because
   this app cannot keep one.

### Known limitations, stated plainly

1. **An accepted correction does not rewrite existing cards.** Nobody's deck is
   touched by a review decision, on the same argument the hand-edit path makes
   about strangers' data. A learner who already holds a card built from the old
   gloss keeps it until they rebuild it.
2. **A report cannot be sent offline.** Grades queue in the outbox and these do
   not: a suggestion is not a fact with a timestamp that can be replayed, it is a
   message, and one silently held for a week is worse than one that says it did
   not send.
3. **The queue has no full-text search.** It has status, category, grouping and
   a pager. At the volume this was built for that is enough to work through, and
   searching notes is a feature to add when somebody actually needs to find one.
4. **A reviewer is trusted completely.** Accepting writes to the shared
   dictionary with no second pair of eyes and no undo beyond editing the entry
   back. The list is meant to be short enough to read aloud, which is why it is
   exact addresses and why there is no way to grant it from inside the app.
