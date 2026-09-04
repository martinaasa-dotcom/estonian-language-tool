# MVP Status and Decisions

What was actually built, what was deliberately left out, and which planning decisions changed once
the answers to `12-open-questions.md` came back.

**§11 to §14 are the current state.** §1-5 describe the first MVP, §6 the pass that made it usable
by a stranger, §7 the pass that made it teach in context, §9 and §10 the teaching and diagnostic
layers, §11 the pass that measured the learner and stated what the app costs, §12 the pass that let
a photographed page become a set of words, §13 the mock state examination, and §14 the pass that
turned the path into a course covering A1 to C2. Those four were built at the same time against the
same main and landed one after another. Word counts in §1-7 are the numbers of their own time and
§14 supersedes them.

## 1. The answers, and what they changed

| Question | Answer | Effect |
|---|---|---|
| Q1 Local or hosted? | **Local only** at MVP time; **reversed 2026-08** to hosted (Vercel + Supabase), with Google sign-in. | ADR-002 confirmed for v1, superseded by ADR-011. Schema was already Postgres-portable, so this was a datasource swap, not a rebuild |
| Q2 Level? | Learner is at **B1-B2**, but the app should cover **A1-C2** | 2,271 of about 5,400 entries are B1 or above, including a C1 layer and the verb-government cases that trip up English speakers at that level. The model has no ceiling: C2 words drop in without a schema change |
| Q3 Digital class materials? | **None.** | The importer stayed generic and cheap. No time spent on a parser for a format that does not exist |
| Q4 Speakly? | Subscription exists, **not currently used**, "difficult to use" | Confirms ADR-006. Speakly has no public API (audit A3), so the paste importer handles it like any other source. Nothing Speakly-specific was built |
| Q5 AI budget? | **No cap, but free for now.** OpenRouter/OpenAI, and later "whatever works best" | ADR-004 reversed, see §2 |
| Q6 Browser extension? | **Gone.** | Confirmed out of scope |
| Q7 Other users? | **Reversed 2026-08**: real multi-user, Google sign-in via Supabase Auth | ADR-012. Cards/Tasks/Messages gained `ownerId` and are scoped per query; the dictionary (Lexeme/Form) stays shared, as anticipated |

## 2. ADR-004 reversed: provider-agnostic, not Anthropic-only

**Original decision:** `claude-opus-5` with adaptive thinking and prompt caching.

**What changed:** the requirement became "useful and free for now, and let me change my mind later".
Pinning one paid provider fails that.

**New decision.** `lib/tutor/provider.ts` speaks to whichever key is present:

| Key in `.env` | Used | Default model |
|---|---|---|
| `OPENROUTER_API_KEY` | OpenRouter (OpenAI-compatible) | `z-ai/glm-5.2:free`, genuinely free |
| `ANTHROPIC_API_KEY` | Anthropic Messages API | `claude-sonnet-5` |
| `OPENAI_API_KEY` | OpenAI | `gpt-4o-mini` |

All three stream. The Anthropic path keeps the `cache_control` breakpoint on the Estonian system
prompt, since that prompt is identical every turn. Nothing above the adapter knows which provider is
in play, so switching is a one-line `.env` change and a restart.

The daily spend cap from the original plan was dropped at MVP time: with a free model there is
nothing to cap, and a cap on an unmetered path is dead code.

**Added back, 2026-08.** The default model is a paid one and sign-up is open, so the unmetered path
became one stranger away from an unbounded invoice. `lib/usage` now meters every call (a burst
window, a per-user day, and a global day cap) and there is no way to switch it off. It fails
closed, and an unrecognised model prices at the dearest rate in the table rather than at zero,
because a cap that fails open is not a cap.

## 3. What is built

| Area | State |
|---|---|
| `lib/estonian/`: cases, principal parts, gradation, derivation | Complete, 56 unit tests |
| Dictionary: search, forms, gradation, audio | Complete. With an Ekilex key it reaches the full Estonian lexicon; without one it falls back to the built-in set, which two build pipelines grew to about 5,960 words |
| Ekilex integration: live lookup, every retrieved form, CEFR, verb government, Estonian definition | Complete. Seeded words are upgraded to the authoritative forms the first time they are viewed |
| English translations, layered: accepted → Wiktionary → AI → blank | Complete. Ekilex has no English on a reader key, so no single source suffices |
| Inflected-form search: `toas` finds `tuba` and explains that it is the inessive | Complete; matches stored principal parts and case endings on the singular and plural genitive stems |
| Built-in dictionary, about 5,960 entries and 34,500 stored forms | Grown twice over by two pipelines that turned out to be complements: 360 hand-checked entries, 1,248 fetched against the syllabus by `scripts/harvest-ekilex.ts` with authored English glosses, and the rest built by `scripts/expand-seed.ts` from Ekilex (forms and sentences) and Wiktionary (English). CEFR-tagged A1 to C2 (478 / 693 / 1,226 / 1,243 / 180 / 76, the rest ungraded by either source). 461 verbs carry government, up from 24, and 5,405 entries carry an attested Estonian sentence |
| Speech: TartuNLP, server-proxied, content-addressed cache | Complete and verified end to end. Now durable in object storage rather than per-instance; see §4b |
| Flashcards: FSRS, 5 card types, keyboard-only review, undo-by-requeue | Complete |
| Today: due counts, streak, tasks, weak-word pick | Complete |
| My words: deck management, filters, weak-case breakdown | Complete |
| Anu: streaming chat, prompt chips, vocabulary bridge with AI provenance | Complete; needs a key |
| Tasks: tagged, week, due dates | Complete |
| Import: paste TSV/CSV/dash/semicolon lines, with dedupe | Complete |
| Add a word by hand, with principal parts and auto-classified gradation | Complete |
| Edit an existing entry: corrections rewrite its cards' text but never its FSRS scheduling | Complete |
| Export: full JSON backup | Complete |
| Visual design: pastel system, mascot, light/dark | Rebuilt 2026-08; see `14-design-system.md` |
| Public landing page at `/welcome` | Complete. Its demo reads real dictionary data and derives cases with the app's own code |
| Restore from a backup: merge (safe, idempotent) or replace (guarded) | Complete, verified by a wipe-and-restore round trip |
| Weak-case drill: click a case in the heatmap to review just those cards | Complete |
| Light and dark themes, keyboard operation, mobile layout | Complete; verified on an iPhone 13 viewport, with no sideways scroll and 73×79px rating targets |
| Estonian text marked `lang="et"` so screen readers do not read it with English phonics | Complete |

## 4. What is deliberately not built

Each of these is a decision, not an omission.

- ~~Ekilex live search.~~ **Now built**. The key arrived, the response shape was read from real
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
| CI: typecheck, hermetic unit tests, integration tests on real Postgres, build, credential scan | Complete. The credential rule this file's rules section always claimed had no enforcement until now |
| Spend ledger: per-user burst, per-user day, global day cap | Complete, fails closed. An unrecognised model prices at the dearest known rate rather than zero |
| Sign-in allowlist, open by default | Complete. A quota, not a guest list, is what makes an open door safe |
| Offline review (PWA, outbox, ordered replay) | Complete, and the append-only log is what made it cheap |
| Durable audio cache in object storage | Complete. The previous `/tmp` path was per-instance and wiped on every cold start |
| Error reporting with redaction; error, global-error and not-found boundaries | Complete, no third-party script |
| Privacy and terms, written from the schema | Complete |
| **Writing**: free production, marked mechanically first and by AI second | Complete. The forms check runs before any model call and works with no key |
| **Grader output verified against the dictionary** | Complete, in `lib/tutor/verify.ts`. The prompt is a request, this is the check |
| **Verb government drill** | Complete, distractors drawn from the real distribution |
| **Minimal pairs** | Complete. Pairs are found in the dictionary, never authored |
| **Cloze from pasted reading** | Complete. The passage is not stored |
| **Diagnosis by error class** | Complete. Says nothing below eight reviews per group |
| **Leech clinic** | Complete. Classifies the failure shape and asks Anu a specific question |
| **Week as a spine** | Complete. `classWeek` now on Card as well as Task |

## 5. Known limitations, stated plainly

0. **Anu's Estonian depends entirely on the model.** Measured with `npm run eval:anu` against six
   grammar questions with known answers: `openai/gpt-4o` 6/6, `anthropic/claude-sonnet-5` 5/6,
   `openai/gpt-4o-mini` 5/6, but the mini model invented "Ma söön aitamat", which is not Estonian.
   Free models are rate-limited hard enough upstream that they cannot be evaluated reliably, let
   alone relied on. This is exactly why the model is never allowed to supply an inflected form.

1. **The built-in dictionary is about 5,960 words.** Built by `scripts/expand-seed.ts` from Ekilex and Wiktionary and by the course harvest, it works offline, but it is short of the full
   lexicon. Anything outside it can be added by hand: the add-word form takes principal parts and
   classifies gradation itself, so a hand-added word behaves exactly like a built-in one. An Ekilex
   key would close the gap properly.
2. **Gradation detection is orthographic.** Quantitative gradation (*vältevaheldus*) is a change in
   duration that Estonian spelling does not record, so it cannot be detected from text. The app only
   ever reports the qualitative kind, and says so rather than implying a word does not alternate.

   Partly answered rather than fixed: the minimal-pairs drill teaches the part of the contrast that
   *is* written (`maja` / `majja`, `pika` / `pikka`) through audio, which is the only channel that
   can carry it. It deliberately does not claim to teach the second-versus-third quantity
   distinction, where both spellings are identical, so speech synthesis is handed the same string and
   would say the same thing twice, so a drill built on it would be a lie.
3. **Plural oblique cases need a stored genitive plural.** Where it is missing the table shows a gap.
   `tuba : toa` yields `tubade`, not `toade`. It is not derivable, so it is not derived.
4. **Anu's Estonian is only as good as the model behind it.** The free model is decent, not
   authoritative. Everything it suggests is tagged `AI · verify`, and it never supplies a dictionary
   form, and that boundary is enforced in the data model, not just in the prompt.
5. **Editing a word does not regenerate its case-form cards.** Recognition and production cards
   follow a correction; a case-form card built from an old genitive keeps the old answer. Deleting
   and re-adding the card fixes it, and now costs nothing, since deleting a card no longer
   destroys its review history. Regenerating automatically would mean either losing the card's
   scheduling or silently changing what a card asks mid-schedule, and neither is obviously right.
6. ~~**A review needs the server.**~~ **Fixed in §6**. The app installs as a PWA and grades made
   offline are queued on the device and replayed with their real timestamps (ADR-015).


## 6. The second pass: usable by someone who is not you

The first MVP was complete for one learner who already knew what to study. Handing it to a stranger
exposed a different set of gaps: an empty deck with no obvious first move, self-graded flashcards, a
streak and nothing else to show for six weeks of work, and a promise about offline that the hosted
deployment had quietly broken. This pass closes those.

### What was added

| Area | What it is | Why it earns its place |
|---|---|---|
| **Onboarding** (`/welcome`) | Four steps (name, level, pace, starter units) ending in a real deck | An empty deck is where a new learner gives up. Setup now finishes with cards, not with a tour |
| **Learning path** (`/learn`) | 18 units, A1→C1, over the same dictionary. Rebuilt in §14 as `lib/collections/syllabus/`: 83 units, A1 to C2 | "Here are five thousand words, good luck" is not a course. Units are references, not copies, so nothing duplicates and a correction still lands everywhere |
| **Typed answers** | `lib/estonian/answer.ts` grades what you type, telling a dropped diacritic from a typo from a wrong word | Self-grading is the weakest part of a flashcard app. `sõda` is not `soda`, so a diacritic slip is called out by name rather than waved through or failed flat |
| **Multiple choice + first-look intros** | New cards lead with their answer; recognition cards can be asked as four options | Asking someone to produce a word they have never been shown is a guessing game |
| **Undo (`u`)** | Restores the card's previous FSRS state; the `Review` row stays | Specified in `07-srs.md`, unbuilt at MVP. The log is append-only, so what rewinds is the scheduling, which is derived, and not the history |
| **Match** (`/review/match`) | Eight pairs against the clock | The only mode that makes you scan a *set* of words at once |
| **Practice hub** (`/practice`) | Every mode with its live state, plus one-click drills for weak cases | Answers "what should I do with five minutes" instead of listing modes |
| **XP, levels, quests** | `lib/gamification/`: derived from the review log, never stored (ADR-014) | A streak alone says nothing about six weeks of work. Three quests a day, chosen deterministically from the date |
| **Progress** (`/progress`) | Six-month heatmap, 14-day forecast, accuracy trend, per-case accuracy, CEFR reach | The forecast in particular is what stops an SRS becoming an unsustainable pile |
| **Class leaderboard** | Opt-in, name chosen by the learner, weekly XP only | The one feature a class actually asks for. Off by default; no email or history is ever shared |
| **Offline PWA** | Manifest, service worker, and a localStorage grade queue (ADR-015) | Restores the standing rule that review works with no network |
| **Local mode** | No Supabase keys → one learner, no sign-in (ADR-013) | `npm run setup && npm run dev` is a complete installation again |
| **⌘K palette, skip link, loading/error/not-found routes, phone nav sheet** | n/a | The difference between a demo and something you use on a Tuesday |

### What this pass deliberately did *not* do

- **No new Estonian content was written.** Every word, form and example still comes from the seeded
  dictionary or Ekilex. The path references lemmas and `lib/collections/syllabus/syllabus.test.ts` fails if one
  does not exist, and an invented unit word would be an invented Estonian word by the back door.
- **No cloze or sentence-building mode.** It needs example sentences the dictionary does not carry
  for every word, and the honest source for those is Ekilex, not a model (ADR-005). Still shelved.
- **No speech-to-text.** Unverified for Estonian (audit A5). Unchanged.
- **No hearts, no lost streaks, no punishment mechanics.** Quests only add. The streak shield already
  covers the anxiety a study app is entitled to create.
- **No schema change.** Everything above rides on the existing tables plus the `Setting` key/value
  bag, which is why none of it needed a migration, and why a backup taken before this pass restores
  into it unchanged.

### Known limitations, still

1. **Match grades on recognition, not production.** A pair found among eight is easier than producing
   the word cold; it is recorded as Good, which is generous but not dishonest. Sprint has the same
   shape and always did.
2. ~~**The leaderboard is a whole-instance board, not per class.**~~ **Removed, 2026-08-31.** It
   was the right behaviour for one class on one school's copy and the wrong one everywhere else,
   and sign-up here is open, so what it actually drew was a table of strangers. Two faults, and
   only one of them was about privacy. It did not mean anything: past `BOARD_CANDIDATES` the top
   twenty was the top twenty of the first two thousand opted-in learners by owner id, because
   ranking the whole deployment is a tally of everybody, so who appeared was a fact about a uuid.
   And it was the one surface where a stranger chose what every other stranger read, with no
   report button on a leaderboard row and nobody named to review one. Class codes were the feature
   this was waiting for and they already exist, so the board is a class you joined, joining is the
   consent (ADR-019), and somebody studying alone is offered the way into a class rather than a
   table of usernames. The `leaderboardOptIn` setting went with it, since what it gated is gone.
3. **Undo trusts the client for the previous card state.** It is range-validated and can only ever be
   applied to a card the caller already owns, so the worst case is someone rewinding their own
   scheduling, which the button does anyway.
4. **The service worker keeps the app openable, not the data fresh.** A screen you have never opened
   while online shows the offline fallback. Review, the one path that has to work, does not depend on
   it: the queue does.


## 7. The third pass: teaching in context

§6 ended with a working daily loop and one obvious hole: every exercise asked about a word in
isolation. You could know all fourteen forms of `raamat` and still not know where it goes in a
sentence.

### What changed the picture

Ekilex's `/word/details` response carries **usages**, attested sentences recorded against each
meaning, `public`-flagged for display. That single fact is behind most of this pass: the app can
teach in context without writing a word of Estonian, because it only ever hides or reorders text a
lexicographer wrote (ADR-017).

| Area | What it is |
|---|---|
| **Example sentences** | Stored per word, shown on the entry with audio, translated one at a time on request and tagged `AI`. A learner can add one of their own from class |
| **Gap-fill cards** (`CLOZE`) | A form we hold, hidden inside a sentence Ekilex recorded. The lemma is the hint, so it asks for the *form*; the case it drills feeds the weak-case breakdown |
| **Sentence builder** (`/review/sentences`) | The word bank, over real Estonian. With a translation it is "say this in Estonian"; without one it shows the sentence, then scrambles it, and says which it is doing |
| **Speaking** (`/review/speaking`) | Shadowing: say it, then hear a native voice and your own recording back to back. No score, see below |
| **Classes** (`/class`) | A join code, a roster of effort, the group's weakest cases, and units set as homework into each student's own task list (ADR-019) |
| **Conjugation** | The verb's forms as a table (persons down, present/past/conditional across) plus a `CONJUGATION` card type over stored forms |
| **Share card** (`/api/share`) | A 1200×630 PNG of streak, cards known and XP, generated per request for the signed-in learner |
| **Install and remind** | Apple touch icon, safe-area insets, 16px inputs (iOS zoom), a one-time install prompt, and a daily reminder as a calendar file rather than a push subscription |
| **Anu: check a sentence** | A structured check that names the rule before the fix, and boxes the corrected sentence as the model's own work rather than letting it read as dictionary data |

### Things this pass refused to do

- **Score pronunciation.** No verified Estonian speech recogniser is available to this app,
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
   overwritable, but they are not a translator's work and the app does not claim otherwise.
3. **A class is per instance, not per school.** One deployment, many classes; there is no
   organisation layer, no roles beyond teacher and student, and no way to move a class between
   instances.
4. **Classes need sign-in.** In local mode there is one learner, so `/class` explains that rather
   than offering forms that could not work.
5. **Installable, but not in the App Store.** Kodukeel installs to a home screen as a PWA and works
   offline there. An actual App Store listing needs a native shell (Capacitor or similar) around
   this same web app, which is a packaging and review exercise rather than a rewrite, and it has not been
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
  with its own hue: six modes, six colours, no two the same.
- The screens listed in §7 were restyled onto `components/ui.tsx` (see `14-design-system.md` §9).
- Two responsive bugs the merge exposed were fixed rather than papered over: the Today hero packed
  three stat tiles and the goal ring onto one row at 390px, and a grid column without `min-w-0`
  let a long task title widen the page.

Verified after the merge: unit tests, `tsc --noEmit`, ESLint, all eight browser suites, and a
screenshot sweep of every route at 1280px and 390px with the console watched and horizontal
overflow asserted against.

## 9. The fourth pass: the teaching layer

Three passes built an app that tests. This one built the half that teaches, the parts a learner
reaches for when a flashcard has stopped helping, and the part a teacher reaches for when the
lesson is not on a screen at all.

| Area | What it is |
|---|---|
| **Grammar reference** (`/grammar`, `/grammar/[case]`) | One page per case: what it is for, where it turns up, the mistake an English speaker makes, and the case shown on real words with the provenance of every form. Linked from the dictionary's case table, the weak-case drills and the Progress breakdown |
| **Dictation** (`/review/dictation`) | Hear an attested sentence, write it down. Marked word by word (green for exact, butter for a word heard but misspelled, peach for one missed) so the learner sees *which* ending they lost |
| **Printable worksheet** (`/learn/[unitId]/worksheet`) | A unit as paper: vocabulary, gap-fills from attested sentences, a principal-parts table, and an answer key on its own sheet. The rail and the wash come off in print |
| **True retention** (on `/progress`) | Of the cards FSRS believed you had learned, how many came back, measured from `Review.stateBefore`, compared with the 90% the scheduler targets, and turned into one instruction |
| **Shortcut sheet** (`?`) | Every binding the app implements, grouped by where it works |

### Why the grammar page is allowed to exist

ADR-005 forbids the app from writing Estonian. A grammar reference is the obvious place to break
that rule by accident. One "for example, *majas*" and the page is presenting an unattested form
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
| **Sticking points** (on `/progress`) | The handful of cards that keep lapsing, one row per word, each saying what is wrong with it. Actions in order of what usually helps: the case explanation, the dictionary entry, and only then setting it aside, reversibly |
| **"Why?" on a revealed card** | A review card that has just shown its answer offers the grammar page for the case it drills, and Anu with the question already written |
| **Print from dark mode** | Fixed: the dark palette followed the page onto paper, so a teacher reading in dark mode printed white ink on white paper |
| **Two guards on the restore suite** | It refuses to run against a non-local database, and writes the export to disk before deleting anything |

### Why sticking points are named rather than scored

Anki's leech handling suspends a card after eight lapses. The instinct is right and the number is
wrong for a language course: by the eighth lapse the learner has spent twenty minutes on one word
and drawn a conclusion about themselves rather than about the card. So the threshold is four, and
the framing is diagnostic: a card that keeps lapsing after being learned is usually a grammar
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
   suspended one is gone on the next load. `Put it back` is offered while the page is open, and
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
| **Level check** (`/assess`) | Four skills, eighty questions, assembled out of the dictionary. Six reading and six writing at each level from A1 to C1, plus three listening and one spoken. Sized by simulation rather than by preference: the paper it replaced placed 43% of simulated learners correctly and put 57% below where they were, and this one places 72% to 98% depending on the level. Reading as meanings, sentences with a word taken out and recorded sentences to understand; listening as the same with nothing written down, plus dictation; writing as the same gap typed rather than chosen; speaking as shadowing. Take it whenever, as often as sensible |
| **A ladder that stops** | Questions climb the bands, a skill asks at most one band above the first it was not passed at, and nothing above one that came in under half. `lib/assessment/session.ts`, pure, so a test walks a whole sitting without a browser |
| **A level you can set** | Settings holds the level the app is going on, changeable by hand. Whichever of the measurement and the learner's own answer was stated later is the one it uses, and it decides where the course opens and which band review, practice and the dictionary draw words from |
| **A profile, not a number** | Per skill levels with the band breakdown, an overall that follows the weakest measured skill, and a stated confidence that names how few questions it came from |
| **Goals** | Why you are here, the level you want, the date you want it by, and how many days a week you will really practise. Asked at first run, editable in Settings for ever |
| **A timeline with sources** (`lib/assessment/plan.ts`) | Hours between two levels, how many of them the stated daily goal covers, and how many are left to find elsewhere. Ranges, with the published estimates they came from named |
| **First run, rewritten** | Four steps: name and keyboard, measure or estimate, why and how far with the plan live under it, the deck and the pace |

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

### And why it is about the learner rather than the average

Discouraging is not the same as one number for everybody, and for a while it was. The plan quoted
one table, assumed the same five found hours a week of somebody in Tartu with an Estonian partner
and somebody abroad with a textbook, built on a guessed level as though a paper had measured it,
and never read the review log its own header promised it would. A B1 speaker was told B2 was 300
to 350 hours off, further than A2 had been from B1. Four things each move a figure now, and the
screen says which.

- **The surcharge sits where the morphology is.** `CUMULATIVE_HOURS` is the published guided
  learning hours times a factor per step, peaking at A2 to B1 and dipping at B1 to B2, and the
  climb to C1 stays inside the FSI ratio. B1 to B2 is now 190 to 300 hours against A2 to B1 at
  280 to 380; a beginner to C1 is still 940 to 1 260.
- **A measured level is costed skill by skill, a guessed one is widened for the guess.** The mean
  of what each scored skill still has to cover, so B2 reading beside A1 listening is not a B1's
  distance; and half a band on the far end for a self-estimate, downward only.
- **The week already holds something.** Each reason carries the hours a week of Estonian it puts
  within reach; a goal carries none. The verdict gained `possible`, for the date that fits only if
  the Estonian around the learner is used.
- **After a fortnight, the pace is what they did.** `lib/stats/pace.ts` reads sittings off
  `Review.durationMs` and the timestamps over the last four weeks, and the plan is built on that
  rather than on the days they said.
- **And the rest of the app quotes the same person.** Today's countdown card and the exam hub
  print the plan's distance in the plan's own sentence (`distanceLine`), off the same projection.
  Today's "about N minutes" divided by six where the plan budgeted three; one figure now, and the
  learner's own cards a minute once the log has one. Anu is told whether the level was measured,
  which skills the check found, and what Estonian the learner already lives in.

### Known limitations, still

1. **The paper is marked in the browser.** It has to be: the answers are in it, feedback is
   immediate, and a round trip per question would be unusable on a train. Nothing is at stake in a
   forged result, it reaches no roster and no leaderboard, and the server still recomputes the level
   from the credits with `placement()` so a stale client cannot invent its own scale.
2. **The hours table is not measured on this app's learners.** It combines published CEFR guided
   hours with the FSI difficulty scale, both of which are about other people on other courses, and
   the per-step shape of the surcharge is a stated judgement over them. It is shown as a range with
   its sources named. What is the learner's own is their measured level, the Estonian their week
   already holds, and their pace off the log; the hours a level costs are still the published ones.
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
   production card and nothing else, because there are no forms to build a case-form card from.
   With an Ekilex key the row's "look this up again" button fetches the real ones; without one,
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
English (the one language this project is allowed to write) and Ekilex
supplies every Estonian character that follows: principal parts, CEFR level,
verb government, and attested sentences. A lemma in a unit is a *request*, not a
fact. If Ekilex does not know it, or knows it with forms that do not match
the part of speech asked for, it is dropped and reported. A misspelled or
imagined word cannot reach the dictionary; it can only fail to arrive, loudly.

The first run dropped 38, and every one was a real mistake: a genitive written
where a lemma belonged, a plurale tantum, a typo, and three nouns ending in `-ma`
that the part-of-speech heuristic had confidently called verbs.

### What is there now

| | Before | After |
|---|---|---|
| Units | 18 | 83 |
| Levels with real coverage | A1-B1 | A1-C2 |
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

### And one word given away next door

The same audit turned up a smaller version of it in dictation. The card header
carried a dictionary link for `task.lemma`, drawn whether or not the sentence
had been answered, directly above a chip reading "Write what you hear". That
lemma is a word *of the sentence being dictated*, so the exercise printed part
of its own answer. It is not the same as the form drills above: they hand over
the vocabulary because they are asking for a case ending instead, whereas
dictation is asking for the spelling of exactly those words.

The review session's own header carries the same link and is fine, which is
what made this easy to miss when the component was written: there the link is
the card's subject and the front of the card is already showing it. Here there
was no front to show it.

The link is worth keeping for after the answer, when looking the word up is the
natural next thing to do, so it is gated on the result rather than deleted.
`scripts/test-teaching.mjs` asserts both halves, because deleting it outright
would satisfy "not given away while typing" on its own and quietly cost the
learner something. Its floor moves up by two, to 45 after the pass below took it to 43, and
the no-sentences waiver 4 to 6.
The first of those two checks was watched to fail against the ungated header
before it was trusted.

Two findings from the same audit are recorded and not acted on. The minimal
pairs option list prints `formLabel of lemma, translation` under every choice
while the learner is discriminating a sound; the gloss is not the answer there,
so it leaks nothing the mode grades, but it is not doing any work either.
Sentence building carries the same header link as dictation, and it is
harmless: the tiles already show every word of the target sentence.

## 17. The eleventh pass: named the way it is taught

The domain model had been right since it was written and the screens had not
been reading it. `cases.ts` has carried the Estonian name and the question word
for every case from the beginning; `morph.ts` has carried `olevik` and
`lihtminevik` for as long as there has been a table of forms. Every screen led
with the other column. A case was headed "Inessive" with `seesütlev` in small
italics under it, a flashcard asked for "tuba → inessive" and put the question
in the hint, the reference called `lihtminevik` "the imperfect", which is a
Latin category this language does not have, and the placement check offered
somebody in their first week "Inessive, Elative, Allative" as multiple choice.

That last one turned out to have a second fault underneath the first, found by
somebody sitting the check rather than reading the code. Translating the options
into Estonian made them the names a class uses and left them names: the question
was still "which case is this", which is not a question any Estonian placement
test asks. It is gaps now, in sentences a lexicographer recorded, and the
Estonian names appear where they belong, in the explanation after an answer.
See ADR-020 amendment 1.

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

## 18. The twelfth pass: less of it, in front of the person who has just arrived

The report was one sentence: the site feels overwhelming for somebody just getting started. It was
right, and the interesting part is that no single screen was at fault. Every screen showed
everything the app can do, to everybody, from the first minute, because each one had decided that on
its own and every one of them had decided the same way.

**The rule, in one module.** `lib/ux/disclosure.ts` answers "how far in is this learner" from two
figures off the append-only review log, and holds a table of what each stage leads with. `arriving`
until a card has been graded, `starting` until roughly three days at the default goal, `settled`
after. On day one Today rendered eleven panels and ten of them were reporting on an empty log: a
streak of nought, a goal ring at nought percent, an XP bar at nought, a week strip of seven empty
circles, a task list nobody had filed anything in, and a "word to revisit, from your weakest cards"
picked at random because there were no weak cards. It now shows the greeting, the button into the
first review and the next unit on the path. Nothing is deleted for anybody: every withheld panel is
in the rail, in the palette and on its own page, and the unit tests assert each stage is a superset
of the one before, since a panel that appears and then vanishes reads as a bug rather than as
restraint. The invariant fails both on Today ceasing to ask the module and on anybody else inventing
a threshold of their own.

**First run: eight screens to four.** Every answer it collected it still collects. What went is the
spreading: four screens carrying one question each, a feature tour repeating the landing page,
and a plan whose six cited facts and essay on the source of the hours are now on `/assess` behind a
`compact` flag. Why, how far, by when and how often are one screen with the plan live underneath
them, which is a better argument for asking than a screen of answers followed by a screen of
consequences. The order that mattered still holds and the browser suite still drives it: limits
before any question, level before the plan, plan before a single word is chosen.

**The landing page: ten sections to six.** The four-tile source credit and the four-figure stat
panel are one line of evidence under the buttons, where they are a reason to believe the sentence
above them rather than a section to scroll. Two of those figures were also wrong, and are now read
from the course itself: it had said "eighteen units, A1 to C1" in three places since the course
became eighty-three units to C2. Eight feature cards became five, three of them having been saying
what the hero, the FAQ or each other already said, and one of them ("four ways to practise") having
been wrong since the third practice mode shipped. The comparison grid is folded behind its own
summary rather than removed, because it is the block that makes every other claim on the page
checkable.

**The rail and the practice hub.** Fifteen flat destinations became four and a disclosure that opens
itself whenever the current page is inside it and remembers being opened. Thirteen practice modes in
one grid became four groups, and the grouping is the answer to the question that page says it exists
to answer.

**The badge toasts.** Unbounded, and nothing retired one but a click on its own small X. The moment
that was worst was the moment it mattered most: the end of a first session, when the first review,
the first day, the quests and a level land together and five cards cover the column they were earned
on. Three at a time, the rest counted in one line, and they go away on their own.

### Found on the way, and fixed

`scripts/e2e.mjs` checked that the tutor screen is honest about its key state by looking for one of
three provider names. The chain has had five since Groq and Gemini joined `PROVIDER_KEY_ENV`, so on
any machine carrying either of those keys the page was correct, the check was stale, and the failure
read as a fault in the app. It matches the shape of the line now, which cannot fall behind a
provider list.

### Known limitations, stated plainly

1. **The thresholds are counts, not comprehension.** Forty-five reviews is three days at the default
   goal and a reasonable place to start drawing a retention chart. It is not evidence that anybody
   has understood anything, and it is not meant to be.
2. **A learner who imports a large deck on day one skips `arriving` the moment they grade a card.**
   That is the right answer for the common case and a slightly abrupt one for them: they meet the
   full dashboard in one step. Nothing is hidden from them that they cannot reach.
3. ~~**Settings is still a flat list of twelve sections.**~~ **Grouped in §19** under four plain
   headings once the list actually reached twelve. The original argument against grouping assumed
   the cost was navigational churn; adding a label above a cluster of existing sections, with no
   section moved out of view and no anchor broken, turned out not to carry that cost.

## 19. The thirteenth pass: a course honest about where it stops

§14 built a course to C2 and named the honest gap plainly: "1,266 words is a real course and not a
real vocabulary," and the C2 units themselves were the thinnest ten in the whole syllabus, existing
mostly to say that C2 is earned by living in the language rather than by finishing units. A course
whose last fifth is a well-written admission that it cannot teach what it claims to cover is not
a stronger course for having tried. It is cut here rather than left to keep failing gracefully.

The course now runs **A1 to C1**, 73 units, dropping the ten C2 units and the words only they
introduced. Everything that read the top of the level list, `EXAM_LEVELS`, `ExamLevel`, the mock
exam's own now-removed C2 paper, the placement ladder, the onboarding self-rating ladder, now stops
at C1 rather than quietly carrying a sixth rung nothing above it needs. `docs/16-exam.md` and
`README.md` are corrected along with the code; this file's own earlier sections are left as the
record of what was tried, per the rule at the top of this document about more than one session
working here at once, except where a passage would otherwise assert something false about the app
as it stands today.

**What this does not touch.** A dictionary entry can still carry a `C2` CEFR tag: that is Ekilex's
own grading of a word's real difficulty, sourced live, not a claim this app makes about its course.
`lib/estonian/types.ts`'s `CefrLevel` keeps all six bands for exactly that reason, and the add-word
form still offers C2 as an honest label for a word a person hand-adds. The distinction is the same
one ADR-005 draws everywhere else: Ekilex's own data is trusted as far as Ekilex vouches for it, and
this project does not add to it from memory. Nobody re-verified whether the ten deleted units'
vocabulary belongs in the general dictionary; it was seeded there already and stays, since removing
real, Ekilex-sourced words because their course unit was cut would be deleting correct data over an
unrelated decision.

**Settings, grouped.** The same pass grouped the twelve sections in `/settings` under four plain
headings, Study, Progress and sharing, Words and Anu, Device and data, and §18's limitation above is
struck rather than left standing. Every section keeps its own heading, its own anchor and its own
content in the same order as before; nothing is collapsed and nothing moved off the page, which is
the whole reason this is a landmark added rather than a restructure. The distinction from what §18
warned against: that entry was arguing against turning Settings into tabs or an accordion that would
hide a control behind a click, which is a real cost for a page nobody reaches through a menu. A label
above four sections is not that.

**ADR-019, amended.** The class boundary widened from "the group's weakest cases in aggregate" to
also carry each student's own weakest case, still a rolled-up percentage over that student's own
reviews and gated on a minimum review count, never a specific answer. `docs/03-architecture.md`
records the amendment against the original ADR rather than silently reversing it, and the join
screen's own consent copy names the new figure before anyone joins. The class-wide aggregate told a
teacher which case the room struggles with and nothing about who to help with it; the per-student
figure is the answer to the harder half of that question, in a room of twenty-five rather than one.

## 20. The fourteenth pass: what to do when the app is wrong

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
only, a form from Ekilex never touched, provenance never relabelled. An example
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

## 21. The fifteenth pass: the day a learner is actually having

An audit of what was still missing, run against a database, a browser and CI rather than against the
source alone. Six findings, all of them fixed here, and the shape they share is worth naming first:
every one lived in the gap between a rule this repository had written down and the place the rule was
actually enforced.

### The day boundary was the deployment's

`lib/time/day.ts` carried a header saying its days were "the learner's own calendar days, not UTC
ones" and a body reading `date.getFullYear()`, which is the day boundary of whichever process is
running. Every screen that leads with a day is rendered on the server, and on Vercel that server is
UTC, so the shortcut the file was written to forbid was being taken one layer down from where it
forbade it.

Not a rounding error. A learner in Tallinn who studied on Monday morning, at one in the morning on
Tuesday and again on Wednesday morning kept a three-day streak. Those sittings fall in two UTC days
with a hole between them: the app said 1, and with a shield banked it spent one bridging a Tuesday
they had not missed. Estonia is UTC+2/+3 and this app teaches Estonian, so that is the audience
rather than an edge case.

`dayClock(zone)` carries a zone; the free functions are the same thing bound to the running process,
which is correct in a browser and wrong on a server, so anything touching the database takes a clock.
The zone is whatever the learner's browser reports, written once by `components/TimeZoneSync.tsx` and
never asked for in a form. Threaded through the streak, the goal, the quests, the week strip, the
heatmap, the forecast, the trend, the study-hour line, the greeting, the share card, the class roster
(each student's own zone) and the two badges about the hour of the day, which had been awarding
"review before 7am" to somebody studying at nine.

Two faults found underneath it. A naive timestamp needs **two** `AT TIME ZONE`s, because Prisma maps
`DateTime` to `timestamp without time zone` and on a naive value one of them interprets rather than
converts; the single `AT TIME ZONE 'UTC'` it replaces was the same mistake wearing a disguise, since
its result is a `timestamptz` that `TO_CHAR` renders in the session's own zone. And the streak's
integration test kept a copy of that query beside the real one, which is exactly what goes stale
first: it would have gone on asserting UTC days were right while the app had stopped using them.

### Thirty-four routes shared one title, and eleven screens had no heading

With no `metadata` export Next falls back to the root layout's title, so /review, /settings,
/progress, the dictionary, the course and the exam were all called "Kodukeel. Estonian that finally
sticks". Two tabs side by side were indistinguishable and a bookmark said nothing about what had been
bookmarked. Every screen names itself now, and `title.template` adds the app's name so none of them
has to remember it.

Every review mode renders three or four screens from one component, and the empty and finished ones
each carried an `h1` while the round itself did not. That is why it survived: a run against an empty
deck saw a heading. It took two passes to find all eleven, which is the argument for the invariant
that reads the source rather than whichever branch a fixture rendered.

And three pages had no `main` at all: /privacy, /terms and first run, which sit outside both route
groups. Two are the public pages somebody reads when they have a question about their rights, and the
third is the first screen anybody meets.

The accessibility suite was fifteen routes of forty-five, grown a line at a time as features landed,
which is why none of this was visible. It runs every route now, at 247 checks rather than 62.

### CI ran eleven of seventeen browser suites

The workflow's own comment names this fault in one direction: "a suite added to that script alone is
a suite CI never runs". It had drifted the other way too, and nothing was counting. Five suites had
nothing watching them, `test-restore.mjs` among them, which guards the only failure in this app that
cannot be recovered from. A sixth, `test-anu.mjs`, was in no npm script either. The source of truth
is the filesystem now, and an exemption carries a written reason.

### Two caches with no ceiling, and two routes with none

The service worker kept every speech clip a device had ever played, and every hashed chunk of every
build it had ever seen, because the version that clears them is typed by hand. `lib/audio/clipCache.ts`
exists for exactly that shape one layer up. What it costs is not a slow app: a browser evicting an
origin's storage takes all of it, including `/offline`, which is the one entry with nothing behind
it. `/offline` now lives in a cache that is never trimmed and everything else has a count.

`/api/write` had no limiter and `/api/exam/write`, which is the same route with a different prompt,
has had one since it landed. `/api/restore` read a body of any size and handed it to `JSON.parse`
before anything counted the request.

### Known limitations, stated plainly

1. **A learner's zone is known one page load late.** The browser reports it on first render, so the
   very first Today a brand-new account sees is drawn on the deployment's clock. Nothing is stored
   wrong by it, since every figure is derived; the next render is right.
2. **The zone is the device's, not a setting.** Somebody who studies in Tallinn on a laptop still set
   to another country is counted in that country. Asking would be worse: the person who most needs
   this is the one who would never think to fill the field in.
3. **The service worker's caches are trimmed oldest-first, not least-recently-used.** The Cache API
   cannot record a read, and re-putting an entry on every hit would make a cache lookup a cache write
   on the busiest path in the app. It costs an occasional re-fetch of something old.
4. ~~**The accessibility suite is still the subset this project promised itself**, not axe.~~
   **It is axe now**, over every route in both themes, which found eight things the hand-rolled
   sweep could not: the sweep scoped to `main` and so never saw the navigation rail, and it read a
   colour's own alpha but not an `opacity` inherited from a parent. What that second blind spot hid
   was a locked course unit explaining itself at 2.63:1, on every locked row of a 73-unit course.
   Still not a screen reader: axe cannot tell you whether the reading order makes sense, whether a
   focus trap is escapable, or whether a label says the right thing.

### Found on the way, and fixed

**A fade never goes on a box that holds words.** `opacity` multiplies through everything inside it,
so a fade meaning "not yet" fades the sentence explaining why. Three places had it: the course
page's locked units, the badge shelf's unearned badges and the grammar reference's definition
labels. Each already says "not yet" three or four other ways, so the fade moves onto the icon.

**A list that announced itself as empty.** The landing page's three steps are an `<ol>` of `<li>`s
with a fade-in wrapper around each, and a `div` between an `ol` and its `li` means the list is not a
list.

**And the two findings this pass had left as the reader's call** turned out to have answers inside
the design system rather than decisions about it. The week strip's reviewed-day circle is mint at
2.52:1 against its card, which is the case `.choice-card[data-on]` already solved: where a fill
would swallow the contrast, double the rule instead. The leech clinic's failure strip told a failure
from a recall by hue with a tooltip as the fallback, which is the pairing the dictation drill's own
rule forbids; a failure is a taller mark now, and the count is visible rather than only announced.

## 22. The sixteenth pass: the label that was read from the wrong place

`docs/12-open-questions.md` Q8, answered. It was carrying a default of "leave it", on the grounds
that the glosses were right and this was wrong metadata rather than wrong teaching, and that was
true of the symptom and wrong about the cause.

### What was wrong

A word's English gloss and its part of speech are two facts about one definition line, and they
were read from two different places. The gloss is the first definition on the word's Wiktionary
page. The label was whichever of Wiktionary's four part-of-speech categories the seed builder drew
the candidate from first, which is a statement about the word having *some* sense of that kind
somewhere, and nouns are drawn first. So every word listed in two categories came out a noun:
`kallis`, `valge`, `sinine`, `noor`, `tark`, `vana`, `magus`, `lilla` and 53 others.

Nothing looked broken, which is why it survived a full gloss audit sitting right beside it. Every
wrong answer is a real part of speech spelled correctly, and an Estonian adjective declines exactly
like a noun, so the forms on the entry page were right and no screen contradicted itself. What it
reached was `lib/srs/cards.ts`, which prints the label as a card's hint, and every rule that filters
on `pos`: which practice modes a word is eligible for, and which words `lib/progress/caseExamples.ts`
is allowed to draw a noun case example from.

### The recommended fix was measured and was worse

Q8's own default was to prefer the more specific category, adjective over noun. Over the whole
dictionary that relabels 86 entries and breaks 25 of them, because a category is not a claim about
the sense being shipped. `lamp` is in the adjectives category for a colloquial sense meaning
"random", which is the exact sense the gloss audit had just finished removing from its answer side;
`pea` and `kama` are in the adverbs category; `mari`, `norm`, `seadus`, `kreem`, `kile` and `kogus`
would every one have been labelled against the gloss printed beside them. Reversing the category
order does not fix that, it moves it onto a different set of words.

### What was built

The page answers the question directly: every definition sits under a `===Noun===` or
`===Adjective===` heading. `extractEstonianEntries` returns each sense with its own heading, so the
two facts come out of one parse and cannot disagree, and `extractEstonianSenses` is now that
function with the headings dropped rather than a second reader of the same markup.
`lib/dict/pos.ts` is the one table of who answers what. Ekilex draws the verb line, because it is
the line Ekilex actually draws and the one that decides which principal parts a word has. The
heading decides among the nominals. The category survives only as a fallback for a page headed
`Participle` or `Postposition`, which are true things this app has no column for, and 7 entries
took it.

One asymmetry, in the sources rather than in the rule. The heading and the headword template
disagree on 13 pages of 5,363 and neither wins them all: `võimas` is headed `===Noun===` and
declared `{{et-adj|võimsa|võimsat|s=võimsaim}}`, while `üksik`, `lämbe` and `lämmi` are headed
`===Adjective===` and declared `{{et-noun}}`. All four are adjectives. `{{et-adj}}` carries a
comparative and a superlative, which only an adjective has; `{{et-noun}}` is the ordinary nominal
declension that an adjective shares, so an editor writing out the forms of `üksik` reaches for it
with nothing implied. One is a statement and the other is a shrug, so an adjective claim from
either source counts and a noun claim from the template alone does not.

`npm run audit:pos` is that pass kept, the sibling of `npm run audit:glosses`, sharing its page
cache so whichever runs second is free. **61 labels corrected**, 60 NOUN to ADJECTIVE and one
ADVERB to ADJECTIVE.

### Twelve words were in the dictionary twice

Found by running the reseed rather than by reading it. `pos` is half of `Lexeme`'s conflict key, so
a word the course harvest labels `ADJECTIVE` and the builder labelled `NOUN` never collided: it was
inserted twice, as two entries with two ids and two sets of cards, and nothing anywhere reported
it. `kallis`, `valge` and `noor` were among them. They are one entry each now, which is why
`SEED_SET_SIZE` went down by twelve without a word being dropped, and it is the only time that
number has ever fallen.

That same key is why `prisma/data/pos-corrections.json` exists. A deployment seeded before this
holds `kallis` as a NOUN, and a reseed looking for the ADJECTIVE finds no conflict and puts a
second one beside it, so the fix would have shipped the bug. `applyPosCorrections` repoints the
existing row first. Two things about when it runs were both found by testing rather than by
reasoning: it is before the early return `--only-if-empty` takes, for the same reason
`ensureSearchIndexes` is, since a correction only matters to a database that was already seeded
with the old label and that is exactly the case a normal deploy skips; and it is before the course
harvest is written, because run afterwards the harvest has already inserted its own correct
`kallis` and the guard against moving a row onto an occupied key then correctly declines, leaving
the duplicate in place.

It writes no content. The translation, forms, examples and provenance stay as they were, the row
keeps its id, and a card and its review history follow it. It never touches a row somebody edited by
hand, and never moves a row onto a key another row holds, because `hall` is legitimately both a noun
meaning "frost" and an adjective meaning "grey".

### What was deliberately not changed

`rõõmus` is headed `===Noun===` with `{{et-noun}}` under it and glossed "happy". Both signals agree
and both are wrong, so no rule separates it from a genuine noun, and writing one would be this
pipeline making the lexical judgement it does not get to make. It is the `kõrb` case in a new
column, and it is left for a person, which the dictionary is editable for. The course harvest
carries the correct adjective independently, so a learner meets the right one anyway.

The second option Q8 offered, letting a word carry more than one part of speech, was not needed and
is still available. It is still the truer model and still a schema change, and `hall` is the case
for it.

### And the course harvest, which turned out not to have the fault

Checked afterwards, because the same question is worth asking of the other file that carries a part
of speech. It does not have the fault, and the reason is structural rather than lucky.
`prisma/data/harvested.ts` is generated and its `pos` is a passthrough: `harvestWord` reads the
label off the syllabus entry and returns it untouched, so the label and the English gloss are
authored by the same person in the same line of `lib/collections/syllabus/`. The failure above needs
two sources that can disagree, and here there is one.

Checked rather than asserted, since "by construction" is a claim like any other. An authored gloss
has no heading it came from, so it is matched to the Wiktionary sense it describes and that sense's
heading is compared against the label. 673 of the 1,248 could be checked and none disagreed. The
other 575 have no Estonian Wiktionary entry or no sense matching the gloss, which is the same
silence the gloss review met, and it is reported rather than filled in. The one review list worth
printing came back empty: the 41 nominals whose lemma ends the way an Estonian adjective often does
are all `-mine` and `-nne` nominalisations, which are nouns.

That pass is kept inside `npm run audit:pos` and it reports without ever writing, because the file
is generated and a correction belongs in the syllabus. Nothing new asserts the link, because
`syllabus.test.ts` already keys the course's vocabulary on `lemma|pos` against the harvest alone: a
label changed in one file and not the other fails `npm test`, which was confirmed by changing one
and watching it fail. A second check of the same thing is how the first one rots.

## 23. The seventeenth pass: the verb, heard, and the table a class runs down

A pass over the whole app with one question, whether the Estonian on it is right at every point a
learner meets it, and one finding worth the section: it was, and it stopped early. Every seeded
verb held five principal parts and nothing else, so on a deployment without an Ekilex key, which is
the default one, `lugema` was `loen` and no other person. The dictionary entry printed the five
tiles and stopped, the `olevik` reference page explained the present tense in English and handed
over to the units, and a conjugation card for `olevik · ta` could not be built because there was
no `loeb` to put on it. A verb taught as one person is a verb taught as a noun.

### What changed

**The present tense, the negative, the conditional and the singular imperative are derived**, from
the stored first person, by `lib/estonian/conjugate.ts`. That is the one part of the Estonian verb
that genuinely is a suffix on a stored stem for every verb in the language but one, and it is the
same licence ADR-005 amendment 1 already gives the ten regular cases on the genitive. It was not
reasoned about: `npm run audit:verbs` derives every slot for every verb in the shipped dictionary
and compares it with every form Ekilex records for the same word, 797 verbs and thirteen slots
each, and it came back with no disagreement. The two exceptions the rule declines are the ones that
audit named, `olema` in the present (`on`) and `minema` in the imperative (`mine`). The simple past
is not derived and may not be, because `lugesin` goes to `luges` but `tahtsin` to `tahtis`, with
the grade changing on the way, so a seeded verb makes seven conjugation cards where an enriched one
makes eight. The dictionary entry prints the table under "worked out from loen" with the stored form
in bold, the four verb topic pages show the point on the learner's own verbs with a chip saying
which forms Ekilex recorded and which the rule supplied, and an attested form always answers first,
so the moment an entry is enriched the rule steps aside.

**A conjugation drill**, `/review/conjugation`. A conjugation card asks for one person of one verb,
which is the right shape for spaced repetition and the wrong shape for what a class does on a
Tuesday, which is run down the whole table out loud. This is that table, typed, the first person
given, the other five marked a cell at a time the way a typed review answer is: a dropped õ is
named as a dropped õ, a slipped key as a slip, a wrong form as wrong with the right one beside it.
The conditional joins from B1. It is reached from the `olevik` and `tingiv kõneviis` reference
pages rather than from the practice menu, for the reason every other targeted drill is, and a verb
already in the deck grades its card (ADR-016).

**A card reads itself aloud**, when a word is first met and when its answer appears, and the next
card's clip is fetched while this one is being answered so the play is instant. Speech had been a
button, so on the daily path a learner either clicked a speaker icon on every card or heard
nothing, in a language whose spelling only half records its length. **The voice is the learner's
to choose**: TartuNLP offers twelve Estonian voices, ten of which answer, the app had used one of them for everybody,
and a learner who has only ever heard one voice say a word has learned that voice rather than the
word. The state examination's listening part is read by more than one speaker. The list in
`lib/audio/voice.ts` is the allowlist the speech route checks a request against, so a value not on
it is answered with the default rather than passed to a third party as typed. The listening round
goes further and changes voice from word to word, naming the speaker after the answer, because a
round read entirely in one voice tests that voice. **A right or wrong
answer makes a short sound**, two notes up for a hit and one low note for a miss, made with the
browser's own oscillator so it costs no request and works offline. All three are settings, on by
default because a missing row has to read as the behaviour everybody had.

**Five faults in the grammar prose.** The past participle was said to decline when used as an
adjective, and the `nud`- and `tud`-participles are among the few words in the language that do not:
`väsinud` stays `väsinud` in front of a noun in any case. Adjective agreement was stated as
unconditional, and it stops at the genitive for the last four cases. The comparative page said
there was no word for "than", and there is. The time-expressions page put months and years in one
case, and months take the inessive where days, seasons and years take the adessive. And the numerals
page said "after two" where the partitive singular follows any number from two up.

### What this pass deliberately did not do

- **No verb form was written.** Every form on every new screen is either what Ekilex recorded or a
  regular ending on a stored first person, and the ending table lives in one module that an
  invariant holds to being the only one.
- **The past is still stored per verb.** A rule for the third person of the simple past was
  considered and is wrong for too many common verbs to be a rule.
- **No pronunciation is scored.** The voice setting changes who reads; it does not change what
  ADR-018 says about listening to a learner.

### Known limitations, stated plainly

1. **`olema` has no derived present, so on a keyless deployment its entry shows five forms and the
   conditional.** The one verb every sentence needs is the one the rule cannot reach, and its `on`
   arrives with the first Ekilex enrichment. A deployment with a key gets it the first time anybody
   opens the entry.
2. **The plural imperative and the impersonal are not derived.** Both are built on the `da`-stem,
   which changes vowel in ways a rule over the seed would have to guess at (`süüa` to `sööge`).
3. **Autoplay obeys the browser's own policy.** A page nobody has touched yet may not play sound, so
   the very first card of a session opened from a cold tab keeps its speaker button and waits for a
   press; every card after it reads itself.

### The words between the words

Found on the same pass, and the larger content gap: the course had fourteen A1 units of nouns,
verbs and adjectives and no unit for the words every sentence is made of. `kes`, `mis`, `millal`,
`täna`, `homme`, `peal`, `taga`, `mina`, `see`, `Eesti`, `september` and `november` were in neither
the course nor the built dictionary, and `sina` was in it labelled a noun. Six A1 units carry them
now, harvested from Ekilex like every other unit, with `PRONOUN` added as a part of speech and a
plural-only pronoun kept the way an adverb is. Re-running the harvest also showed that the ten C2
units cut in §19 would have taken their 170 words out of the seed the first time anybody ran it,
against what that section promised; `lib/collections/syllabus/retired.ts` keeps them as a request
list of their own. The built-in dictionary is 6,039 words.

## 24. The eighteenth pass: what was not learning, and who is asking

The second half of the same audit, with one question kept from the first: does every screen earn
its place for somebody trying to learn Estonian, and is what it tells them true.

### What went

- **The placement ladder, the homework list and the class week.** `/placement` was a second
  answer to the level check with nothing measured behind it; `/tasks` and `/week` were a to-do
  list and a calendar that a class can set but a learner alone never filled. Today keeps one card
  for work a teacher assigns, and the rest is gone with its routes, its nav rows, its fixtures
  and its checks. Four suite floors came down by exactly what the deleted screens counted, with
  the arithmetic written beside each.
- **The badge shelf from Settings.** Achievements and the streak shields are readings, so they
  sit under Vocabulary reach on Progress, read in the same batch as everything else on that page.
- **Three of the level check's four blocks of caveats.** The result screen ran to five thousand
  pixels on a phone. The duplicate caveat is gone and the sources and six cited facts sit behind
  one disclosure whose summary says what is inside.

### What was wrong

- **Signing out cleared one cookie.** The worker's page cache, the stashed review session, any
  queued grade and an unfinished exam paper stayed behind for the next person on the same
  machine. `lib/offline/forget.ts` removes all of it after the outbox has had its chance to
  drain, both sign-out paths go through it, and a different account appearing on the same
  browser clears what the last one left even when nobody signed out. `/privacy` says so.
- **Anu was told every learner was B1.** The chat posted the level from the client and the route
  believed it. `lib/progress/tutorContext.ts` reads the level, the weakest case over the shared
  six-month query and the open unit off the learner's own log, and `learnerNote` sends them in a
  block after the cached prompt. The prompt's case count was also off by one.
- **The word of the day printed `Kokakool.` under "in a sentence".** The shortest usage Ekilex
  recorded was one word with a full stop. Three words and the shape an exam sentence has to pass,
  or no sentence.
- **Names that did not match.** The rail said Learn over a page called The course; the sprint's
  tab spelt its own name differently from its heading; the exam's tab said state where its rail
  row did not; the manifest shortcut said Learning path. One name each.
- **Four pages asked in turn what they could have asked at once.** Review, the dictionary,
  Progress and My words each had one read waiting in front of others that did not need it. One
  round trip fewer on each.
- **Five letter bars on one conjugation table.** One now, under the table, typing into whichever
  field has focus.

### What was built

- **Today's headlines, readable.** The news feed was already fetched hourly for the dictionary's
  suggestion row and thrown away down to its words. A few headlines are kept whole on the
  dictionary landing, printed as the feed spelled them and attributed, with every word the
  dictionary vouches for at the scanned-page floor linked to its own headword and the rest left
  plain. Offered only when most of a headline can be opened; stored nowhere; asserted.
- **Motion where an answer lands or a number arrives.** A wrong answer shakes its verdict once
  and a right one pops, in review and in Match; rings and meters fill on arrival rather than
  appearing full; the week strip's ticks pop in one after another; and the letters a case or a
  person adds to a stem are lit on the landing demo and in the conjugation drill, lifting under a
  pointer on their own row. `prefers-reduced-motion` flattens all of it.

### Measured

- Every browser suite green against a production build on a fresh seed, in CI's order, after
  the cut. The load test's ten checks pass with the heavy fixture: the whole review log for the
  charts at 47ms p95, Today at 917ms p95 under eight concurrent readers on a local socket.
- `npm run eval:anu` with Anu's own prompt rather than a one-line stand-in: five of five
  answered correctly on the free chain, one refused by the model, which the script counts as
  nothing rather than as wrong.

### The dictionary, stated plainly

The built-in dictionary is 6,039 words and that is the whole of what Wiktionary's four Estonian
part-of-speech categories yield once proper nouns, multi-word entries and pages Ekilex cannot
answer for are dropped. More words come from the two live paths, a lookup with an Ekilex key and
a photographed page, and never from a model. The gloss and part-of-speech audits were clean over
all of it on 2026-08-31 and the weekly drift check asks again.

## 25. The nineteenth pass: a meaning in the language the learner thinks in

Four adversarial audits, run in parallel over the whole tree: the content a learner reads, the
security and performance of every route and action, the interface at phone and desktop widths, and
what the app could be that it is not. Every finding was verified against the code, against Ekilex
or in a browser before it was fixed, and the ones that turned out not to be faults were dropped
rather than "fixed".

### The largest thing that was missing

Most people learning Estonian in Estonia already speak Russian or Ukrainian, and this app could
only ever say that `kohv` is "coffee". That asks somebody to reach a word through the language they
are least sure of, and it is the single biggest thing standing between the app and the people it is
for.

Ekilex has the answer and has had it all along: the equivalents sit in `synonymLangGroups` on the
same response the forms and the sentences come from, written by the same lexicographers. 1,367 of
the 1,371 course words carry a Russian one and 1,165 a Ukrainian one, and the harvest already had
the response cached, so it cost no request. `tuba` is комната and кімната; `vasakul` is слева and
ліворуч.

ADR-005 is the reason this is worth having rather than an exception to it, and the rule is stronger
here than anywhere else in the app: these two columns hold a language neither the app nor the
person reviewing the code necessarily reads, so a wrong gloss would look exactly like a right one
and nobody here could tell. The files that may name the columns are a closed list, asserted. The
English never goes away either, because it is the one column every entry has, and a card that hid
it would be blank on the words Ekilex has no equivalent for.

### Words that were a different word

`scripts/harvest-ekilex.ts` returned on the first exact match whose forms fit and never looked at
the next. 87 of the course's words have more than one Ekilex homonym, and six came back wrong:
`kohus` taught as "court" with the forms and eight sentences of the moral duty, `kaste` as "sauce"
with the forms of dew, `iga` as "every" with the case table of age, and `pidama`, the one A1 verb a
learner needs for "ma pidin minema", with the past of the verb for keeping a farm. `WordSpec` takes
a fourth slot naming the word id, and the 31 lemmas that remain ambiguous are printed at the end of
the run with the ids to choose between.

### Promises the vocabulary could not keep

Three A1 units promised what their word lists could not deliver: numbers with no zero, no teens and
no tens; directions with no word for left, right or straight on; clothes by size with no word for
size and no trousers. Fifteen lemmas requested, fifteen confirmed by Ekilex, every one with
recorded sentences. `parem` was requested first and is the homonym fault again, made while fixing
it: Ekilex 213895 is the comparative of `hea`. Directions take the adverbs anyway.

### What the app was doing to the log

- **Meeting a word is not answering it.** The intro screen ended in `submit(3)`, so a card the
  learner had only read was graded Good in the append-only log and the scheduler set its first
  interval from a recall that never happened. A first meeting now teaches, writes nothing, and puts
  the card back five places on where the retrieval is the grade.
- **A card never answers the card before it.** 13 of 32 due cards sat beside a card of the same
  word on the demo deck, so answering one was reading the answer off the last.
- **A release gives back the call, not only the money.** A deployment with a rejected key still
  rationed its learners over answers nobody received.
- **A nominative -s that simply goes is an ending, not a grade.** 174 entries re-graded.

### Measured

- All 24 browser and integration suites green against a production build on a fresh seed, plus
  typecheck, lint, 1,594 unit tests and 163 invariants. Every new invariant was made to fail before
  it was left passing.
- 766 of 22,260 lesson questions carried a second right answer; 0 do now, with all 22,260 still
  asked.
- `a11y-check.mjs` was waiving four checks a run because its locator named four buttons the review
  screen no longer draws, and `smoke-offline.mjs` was revealing every card and grading none for the
  same reason: 312 checks and 0 waived, 15 of 15 with grades queued and drained.

### The dictionary, stated plainly

6,110 words in the seed, 1,405 of them the course harvest with attested sentences, Ekilex CEFR
levels and, for most, the Institute's Russian and Ukrainian. More words come from the two live
paths and never from a model.

## 26. The twentieth pass: what it costs, said out loud

A page at `/funding` saying what this app runs on, what each piece costs, who is paying for the
copy you are reading, and what money would change. Public, like `/privacy` and `/terms`, because
the readers most likely to want it have no account here.

### One list, so a new tool cannot go uncosted

`lib/funding/services.ts` is every piece of infrastructure, each carrying what it is, who runs it,
what a learner loses without it, the variable that switches it on, where its price came from, and
a function that says what it costs at a given size. `model.ts` maps over it; the page, the chart
and the ladder read it. Adding a tool is one entry.

That started as three lists, which is the fault worth recording: a catalogue in one module,
hand-written line functions in the cost model, and whatever the page had been told about. Nothing
fails when a line is missing from a total. It just comes out lower than the truth.

### Nothing anybody bills for is counted as free, and what is given is credited

The first version modelled a free tier for the host and one for the database and picked between
them by traffic. It described a deployment nobody runs and produced a page saying this app costs
nothing at a hundred learners. Every vendor is now on the plan a real deployment is on.

The second version overcorrected: it priced Ekilex, Wiktionary and TartuNLP at what the same thing
costs commercially and added it to the total. They are public institutions that decided this work
should be available and ask for nothing, and a shadow price turns that into a line on an invoice
nobody sent. A service is now charged, or inside another charge, or somebody else's to pay, or
given, and a given one is named with what it provides and its licence and appears in no total.
Where a commercial equivalent exists the page says what buying it would come to, as the size of the
gift rather than a charge.

Two lines were missing from the bill: transactional mail, and the tooling that writes the app.

### What the model found

- The floor is about $300 a month before a single learner arrives, and most of it does not move
  when they do.
- Speech is the fastest-growing thing on the page: at a hundred thousand learners, buying what
  TartuNLP gives would come to more than every billed line put together.
- What is given outgrows what is paid for at that size, which is worth knowing about a project this
  small.
- The per-learner curve was asserted three times before it was right. The first version claimed a
  smooth fall, failed twice, and both failures were the model telling the truth.

### Measured

- 26 MB for a freshly seeded database, of which 18 MB is 6,050 entries and 34,554 forms with their
  indexes; 300 bytes for a review row and 352 for a card, over 80,000 synthetic rows; 21 KB of
  compressed HTML for a median page and 102 KB of shared JavaScript once per build; about 35
  requests behind a page view, of which 11 to 15 reach the server on a warm cache; 188 KB for a
  2.1 second spoken phrase as the service sends it, which is 88 KB a second of uncompressed 32-bit
  audio, and 51 KB for the same three words as stored, trimmed and written as 16-bit.
- 184 invariants, eight of them new and every one made to fail before it was left passing. 1,634
  unit tests. The containment suite with `/funding` at three widths and in the dark, the
  accessibility suite with axe clean on it in both themes, and the design suite reporting no
  contrast failures with the page in its sweep.

## 27. The twenty-first pass: questions that answered themselves

Three merges over one afternoon, and one rule under most of them: **a question may not print its
own answer**. It was found on a flashcard, and by the end of the pass it had been found on five
screens, which is when a coincidence stops being one.

### The rule, and the five screens that broke it

A card nobody can get wrong is worse than no card. The scheduler reads every pass as a recall and
stretches the interval, so the slot is spent for ever, and the learner is told they knew something
they were shown.

- **The case card.** Estonian genuinely spells some cases like the nominative: `kallis` has the
  genitive `kalli`, so its seesütlev is `kalli` plus `s`, which is `kallis` again. 115 cards asked
  `kallis → milles? kus?` with `kallis` on the back.
- **The gap-fill hint.** 2,468 cards, 302 of them in the course, gave the lemma as the hint for a
  gap that wanted the lemma.
- **The gap itself.** `buildCloze` blanks one occurrence, so a sentence could leave the answer
  standing four words along. Fixed in `cloze.ts`, because the mock exam and the level check draw
  their gaps from the same function.
- **The crossword clue.** The clue is the English gloss beside the entry, and a few dozen Estonian
  words are spelled the same in English: `film` was clued as "film". 34 of 5,329.
- **The picture tile and the scene task and the target.** Three rounds that arrived in the same
  fortnight, each showing a word and asking for a case of it. Eight of the 1,980 scene tasks and
  122 of the 51,447 case slots Target can fill were the word again.

The test differs by screen, and the difference is the interesting part. A typed card accepts every
spelling, so **any** accepted spelling showing makes it free. A target draws one string and the
learner hits it, so the test is on **what is printed** rather than on what a marker would take.
`voodi` in the illative is refused on a target for what the target would say; a word whose long
form is drawn beside a short one spelled like the lemma is still worth asking.

### What the audit is, and what its floor could not see

`npm run audit:questions` builds every question the shipped dictionary can make and asks the one
thing no unit test can: is the answer already visible in what the learner is shown. **51,467
questions over six generators**, no database and no key, about ninety seconds, and a job in CI.
Four instances of one fault in an afternoon is a rule, and a rule found four times by hand will be
found a fifth time by a learner.

It disagreed with the rule written to fix the first three, which is the argument for it. The case
rule was written to skip a card only where *every* accepted spelling was the word in the question,
keeping seven where the lemma is one of two; that was wrong and had shipped.

**A single floor over six generators is a floor over the largest one.** The deck is 36,404 of those
51,467 questions, so the crossword at 5,295 or the scene game at 1,972 could stop producing
entirely and the total would still clear 40,000: the script would report a clean run having asked
nothing at all about either. Each section declares what it reaches and is held to four fifths of
it, printed beside the timings. The figures are measured rather than estimated, which the first
version proved by failing on a guess of 6,000 for a section that asks 2,500.

One section says out loud that it **samples** where the others are exhaustive. Target's builder
picks one of a word's eleven cases itself, so one call asks one of them, and with the guard removed
the audit reported 15 of the 122 rather than all of them. The rule in the round is total; the audit
is the backstop.

### A generator fix settles nothing already in a deck

The audit reads `prisma/data/expanded.json`, so it can say what the builder would write today and
nothing about the rows in somebody's deck. A deck made before the case fix still holds
`liblikas → milles? kus?`, and nothing in the app will ever take one out. `npm run audit:decks` is
the other half: it reports by default, names every card it would remove, and removes them with
`--write`. A command somebody runs rather than anything the app does on its own, because every row
it touches belongs to a learner. Removing rather than suspending, and the schema is what makes that
safe: `Review` has no foreign key to `Card` and carries its own `ownerId` and `lexemeId`, so the
history stays and only the unanswerable question goes.

### Three numbers the README had wrong about its own app

The first page anybody reads about this project was undercounting it on the three things it is
largest at: seventy-nine units against 82, seven practice modes against 18, five card types against
seven. The eleven missing modes were everything that had landed since it was last counted. Two more
claims were stale rather than short: a week view and a task list, both cut in §24.

The dictionary size was already held to the seed's own count; the other three are held the same way
now, in digits rather than in words, because a count nothing can read is a count nothing checks.
**The check earned itself within the hour**: a nineteenth mode landed while the branch was open,
and the number that had been right when it was written was wrong on the merge result with nothing
but the invariant to say so.

### And the page that says what this costs was stale the day it was written

`/funding` is measured on a stated day and prints the command that gets the same number again,
which is the whole reason a reader is asked to believe it. Its dictionary line was typed: **18 MB
for 6,050 entries and 34,554 forms**, while the seed it describes holds **6,102 and 38,577**, the
nominative plural having become a stored principal part in between. Re-measured against a freshly
dropped and seeded database it is **20 MB**, and the two counts now come from `SEED_SET_SIZE`,
which its own test proves against the files the seed loads.

`DICTIONARY_MB` feeds the storage line of the cost model as well as that sentence, so the stale
figure was not only a wrong number on a page. It made the projected bill lower than the truth,
which is the one direction that page exists not to be wrong in.

**And fixing it left a second copy**, which is the fault §26 recorded about this very file: the cost
model started as three lists and nothing failed when a line went missing from a total. Ekilex's
entry says what the Institute gives, in the same stale pair, so the page understated the gift by 52
entries and 4,023 forms. Both read the seed now, and a typed number next to the word "entries" or
"forms" anywhere under `lib/funding/` fails the invariant, because a third copy would go stale the
same way.

### Six things measured that were already right

Recorded rather than left unasked, because a check nobody has made fail once is a check nobody
knows the state of, and a sweep that finds nothing is worth the words when it says what it looked at.

- Every route addressed by a row id proves the row is the learner's, in the page and in its
  `generateMetadata` half, and so does every server action and every API route.
- The crossword compiles a grid on all 365 days at every level.
- Sõnad has between 196 and 467 six-letter words a level, and its guess list is the 154,995
  headwords of `KnownWord` rather than the answers.
- No board in 10,000 simulated picture rounds shows two tiles reading the same form.
- All 60 scenes are fillable, and a learner is offered between 10 and 50 of them by level.
- Example sentence coverage across the course is 98.3%.

### Measured

- 214 invariants, **21 of them added across these three merges**, and every one made to fail before
  it was left passing: main stood at 193 the moment the first of them opened. 1,966 unit tests over
  121 files, the integration suite against a real Postgres, and the twenty-one browser suites green
  against a freshly seeded database in CI's own order.
- 2,644 cards printed their own answer and now none does, re-asked the same way. 42 nominative
  plural disagreements against live Ekilex and now none. 90 of 288 readiness states contradicted
  the paper the learner had sat, and 802 of 3,125 vocabulary states ranked the levels the wrong way
  round; both are none.
- Reachable pictured nouns on the matching board, before and after, by level: 79 to 106, 79 to 176,
  47 to 173, 38 to 128, 31 to 58.

## 28. The twenty-second pass: learning a word, which is not the same as reviewing one

The daily row in the rail said Review, and what it opened was two jobs at once: the cards that were
due, and a trickle of words the learner had never seen, taught in among them. Reviewing is keeping a
memory alive and needs a schedule. Building one needs to be walked up. So the daily row is **Learn**,
and what is due belongs to Practice, where every other way of asking a word you already know already
lived.

### The three rungs

A word is met (the word, what it means, and an attested sentence with it in), then asked what it
means out of four ranked options, then put back into the sentence it was met in. Pass the gap and the
word moves to Practice; miss it and it drops to the rung below.

Five words at a time, and the batch size is also the gap a word waits before it comes round again, so
one lap is one round: you meet five words, meet four others, and are asked the first one back at the
point where you have to retrieve it rather than read it off the screen above. A first meeting still
writes nothing, which is the rule §21 arrived at.

### The rungs are the scheduler's, not a second progression

FSRS already keeps a card in Learning across two steps before it graduates and already sends a missed
card back to the first step. A ladder of our own beside that would be two answers to when a word is
known. So the rung is read off `state` and `learningSteps`, two columns `Card` has carried since the
scheduler was written, and nothing is stored:

| what happened | scheduler | rung |
| --- | --- | --- |
| never asked | New | meet it |
| answered right once | Learning, step 1 | put it in the sentence |
| answered right twice | Review | Practice's, from now on |
| missed at the gap | Learning, step 0 | back to the four options |
| nearly, at the gap | Learning, step 1 | the gap again |
| "I already know this one" | Review | Practice's, at about a week |

`ladder.test.ts` drives the real scheduler rather than asserting that table from memory. A change to
those defaults upstream would otherwise leave every rung passing and the ladder silently flat.

### One card per word

Every rung reads and writes the word's **recognition** card, because each rung asks the same question
at a greater depth and that is the one row in a deck that stands for "do you know this word". The
word's other cards are drills on a word you already know, and handing them to Practice is what "moves
to practice" means on the last screen.

### Neither screen teaches what the other one is teaching

The ladder puts its card ten minutes out between rungs, so a word being learned this evening is
technically due, and serving it in review as well would ask for it cold on the screen that does not
teach. The due read excludes the ladder's card while it is in learning; the unseen read excludes
every card of a word the ladder still has hold of. `deckSnapshot` draws the same line, so the number
on Today is the number the review queue will fill.

### What was found by driving it

- A wrong answer at the gap moved the word to the rung below, and the screen rendered from the
  ladder directly, so the correction was replaced by the next question in the same frame. The one
  moment worth stopping for was never drawn. The session now holds the rung it is *asking* at
  separately from where the word stands.
- The gap had no cue at all, which made it a memory test of which of five words this sentence
  belonged to. It says which word and never which spelling, through the review card's own fallback.
- Two nav destinations, the deck and the mock paper, claimed to be reached from Progress and neither
  was linked from it. Both are now, and the claim is asserted rather than described.

### Measured

- 215 invariants, five of them new and every one made to fail before it was left passing. 1,924
  unit tests. The containment suite over every route at three widths and in both themes, 1,160
  checks clean; axe clean on every screen; the phone, the offline queue and the nav marker all
  measured again after the bar changed.
- A round driven end to end in a browser: five meetings, five choices, five gaps, then the words
  that were produced moving to Practice and the ones that were not coming back at the rung below.

## 29. The twenty-third pass: the half of the language a horse is not in

Reported from review. A new word came up, `hobune`, and the card asked for it in the sisseütlev and
wanted `hobusesse`. The learner asked Anu about it in the same session and was told, correctly, that
the ending goes on a place noun and never on a person or an animal by themselves. The app had
contradicted its own tutor on a card it had built itself.

### The fault

Estonian has two sets of local cases and a word takes one. A room is somewhere you can be inside, so
`tuba` goes `toas`, `toast`, `tuppa`. A person or an animal is not, so a mother goes `emal`,
`emalt`, `emale`, and `emasse` is not a way of saying anything anybody says. Every course teaches
that pair in its first fortnight.

The app had one rule for it, `lib/estonian/place.ts`, written when the A1 country unit was found to
be drilling `Venemaas`. It tests the ending `-maa`, and an ending is all a spelling can tell you:
nothing about the letters in `hobune` says it is an animal. So every animate noun in the dictionary
was drilled on the inside trio, 2,441 case cards across the shipped dictionary, and a learner who
passed them had learned to say `ma annan raamatu õpetajasse`.

### Where the missing fact came from

Ekilex records a semantic type against each meaning, in the same `/word/details` the forms and the
sentences come from: `hobune` is `loom`, `õpetaja` is `in_elukutse`, `tuba` is `koht_hoone`. Both
the expansion and the course harvest have been fetching that response since the day they were
written and dropping the field on the floor, exactly as they dropped the 1,359 Estonian definitions
before them. `Lexeme.semanticTypes` holds the codes as the Institute spells them and
`lib/estonian/semantics.ts` is the only module that reads them. Nothing is generated and nothing is
Estonian this app wrote; ADR-005 is untouched.

The codes are written out rather than matched by prefix, which is a correction to the first version:
`in_rahvas_keel` is a language and opens like a person, and a prefix rule read `emakeel` as a being.
A word the Institute called both a being and a place (`politsei`, `grupp`) gets neither trio,
because both are ordinary Estonian for it and a card cannot ask which of two right answers a learner
meant. That is 26 words and the same answer `maa` already gets.

### Five more faults, found by looking

- **The question word.** A horse is a `kes`, and every card asked with the `mille-` series.
  `cases.ts` named the first three cases with both pronouns and the other eleven with one; the name
  is built from its parts now, so the two halves cannot disagree.
- **The place adverb.** `kus?` names the seesütlev *and* the alalütlev, so a card wanting one of a
  pair that printed it could be answered correctly and marked wrong. It stays in the case's name and
  is off the card.
- **`place.ts` reached two of eight generators.** The lesson planner, the writing exercise, the
  daily quest, the picture round and the scene description were all still asking `Saksamaa → milles?
  kus?` after the flashcards had been fixed.
- **The government card was asked of 110 nouns and adjectives.** `laps takes which case?` is a
  question worded as a fact the entry does not support. The exam builder filters to verbs and says
  in its own comment that the drill always has; this was the third builder.
- **81 gap-fills were built from things that are not sentences.** `naturalSentence` was the gate on
  four of eight doors. `Nii ____ on öelda, et ..` trails off; `Ta kannab tumedaid ____/teksasid.`
  leaves the answer standing beside the gap in its other spelling. The lesson planner was not
  calling `usableExamples` at all.

### Two more, found by looking from the other end

**A word with no singular was asked for singular cases.** Nineteen entries are headed by a plural
because that is the only number the word has, and Ekilex records the whole singular of the word
underneath, so `prillid → milles?` wanted `prillis`. It is `prillides`, and the entry's plural column
has said so all along. Eight are graded and ordinary: `prillid`, `teksad`, `käärid`, `jõulud`,
`aluspüksid`, `kõrvaklapid`, `päikeseprillid`, `lihavõtted`. 231 questions.

**A gloss described one word and the forms beside it another.** The built dictionary is a join on
the spelling and `expand-seed.ts` takes the first Ekilex homonym, which is the fault the course
harvest fixed with pins for its own 1,185 words and nothing checked for the other four thousand.
`kurk` shipped as "throat" with the forms of a cucumber, `maks` as "liver" with the forms of a tax,
`vaht` as "foam" with the forms of a guard. `npm run audit:homonyms` compares the dictionary's
principal parts with the ones the Wiktionary block that supplied the gloss declares: 96 of 4,681
nominals disagree, 88 of them Wiktionary's own slips. It reports and a person pins, because choosing
automatically was measured and moved `aste` off the word `astmevaheldus` is built on. Fifteen pinned.

**And the level check gave a free mark on a word spelled the same in both languages.** `moment`
against "moment". On a card that costs a deck slot; here it costs the placement.

### The column on the other half of the dictionary

Found only by running a real seed. The built dictionary has two writers: `LEXEME_COLUMNS` drives the
seed's bulk upsert and writes the 1,422 course words, and `prisma/expanded.ts` is a raw insert with
its own hand-written column list and writes the 4,612 the expansion adds. The new column went into
the first list, every check passed, and `politsei` came out of a fresh seed with no classification,
because it is not a course word. `columns.test.ts` reads the insert's own column list out of the
statement now.

### Measured

- 5,299 of 5,363 built entries carry a classification and 5,939 of 6,101 rows do after a seed; the
  rest are phrases and words the Institute types nothing on, which read as unknown and keep the
  behaviour they had.
- 2,441 case cards moved from the inside trio to the outside one or were withdrawn; 110 government
  cards, 95 case cards for words with no singular and 81 gap-fills went; the deck the shipped
  dictionary can build is 46,767 cards against 47,130.
- The mock exam still fills every task at every level, and the level check is unchanged at 74 items
  from a 100-word band.
- `npm run audit:sense` builds 74,074 questions and sentences and asks the five questions no unit
  test can. It was made to fail on each.
- 221 invariants, four of them new and every one made to fail before it was left passing. 2,021 unit
  tests, 187 integration tests against a real Postgres, and the browser suites driven against a real
  server in CI's own order.
- The scene game's floor in `audit-questions` came down from 1,972 to 1,409, which is the narrowing
  arriving where it should: the words with a picture are the ones a third of which are animals and
  people.

## 30. The twenty-fourth pass: how ready you actually are

Asked for directly. Not a vocabulary percentage sold as readiness, which is what most apps print
and what a learner discovers is worthless at the first counter, but an honest reading of which
real situations somebody could follow, take part in or lead, where each would go wrong, and what
they could already go and try.

### What was there

Every course unit carries a `canDo` claim and none had ever been checked. `Review.durationMs` had
been recorded on every answer since the scheduler was written and read by nothing. The exam hub had
an evidence tier and a ceiling on what a thin log may claim. The Situations design had mapped
encounters to units and named the machinery every conversation runs on.

### What was built

`lib/readiness/` is the arithmetic, pure and unit tested: a situation per unit, three rungs read
word by word, pace off correct typed answers, the cases and machinery an encounter leans on, the
ear off the level check, and a cap on the rung itself under thin evidence.
`lib/progress/readiness.ts` reads the log for it in five parallel reads and one lookup, and it may
only read. `/progress/readiness` is the list and `/progress/readiness/<unit>` the detail; Progress
carries the distribution and every unit page prints its own rung under its claim. Four invariants,
each made to fail once, and `docs/22-readiness.md` is the write-up.

### What building it turned up

Rows written before `Review.slot` existed, which on this deployment is most of them, read as
recognition under the safe rule, and the safe rule held a learner who had produced every word of a
unit at "follow it". The card the row points at still knows its type, so those rows take the
card's slot, exactly as mastery reads them. And the demo fixture, run on this, reports what a real
learner two months in would be told: eight situations they would be lost in, none they could lead
yet, and most of their words a month stale. That is a harder sentence than "74 percent recall",
and it is the one that is true.

## 31. The twenty-fifth pass: ready for the real thing

The brief was the purpose. Every learning app is built to keep a learner on the app, and the moment
integration turns on is a receptionist who talks too fast and switches to English; nothing in the
product rehearsed it and nothing counted it. `docs/22-real-life.md` is the argument, written for a
funder as much as for a contributor. This section is what was built and measured.

### What was built

- **Situations**, played. `docs/21-situations.md` had the design and Phase 0; Phase 1 landed on
  main from a second session the same day, and the copy this pass had built was deleted rather than
  merged beside it (CLAUDE.md, "two sessions built this module"). What this pass adds around it: a
  unit's page links to the scene that tests its claim, Anu is told which situation the learner last stalled in and on what, the situations screen
  says where the people are, and the rows are in the export, the erasure and a restore. ADR-025.
- **Hearing conditions.** One table of how people talk, applied in the browser: at speed, over café
  noise, down a phone line, from halfway through, and a different voice each time, widening as the
  word settles. Listening and dictation ask per card; minimal pairs rotates its reader and keeps the
  room quiet; the mock exam is untouched because the real paper is read in a studio.
- **Say it today.** An errand a day and one press to report it; Progress leads with what happened
  out there, beside §30's forecast of it; the research export carries the figure. ADR-027.
- **The brand.** "Ready for the real thing" replaces "Estonian that finally sticks" on the landing
  page, the manifest, sign-in and the README; the first-run limits line says the app rehearses the
  conversation and the people are out there; Practice carries Situations; Anu is told which
  situation the learner last stalled in and on what.

### Measured

- The gate, three times. 60 to 70 percent withheld before this pass; 54 percent with the encounter
  verbs in the course; 43.5 percent over 260 lines, 30 to 51 by scene, with the scenes declaring
  the units those verbs live in. The ranked list of withheld words is what found the second fix,
  and what it named next was the past participle and the polite imperative, forms no rule reaches,
  which the harvest stores per verb now, and a government check that withholds more than vouching
  does.
- `scripts/test-scene.mjs` plays the doctor's through keyless. The route smoke, the accessibility
  sweep and the containment suite pass over the new screens.
- One invariant new in this pass and made to fail once: the room a clip is heard in has one
  module and the exam may not use it. The errand table is held by its unit suite, which fails on
  an errand naming a word rather than a unit.

### What is honest

Nothing here scores pronunciation, marks a conversation with a model, or writes Estonian. The
switch-to-English figure is self-reported. The classroom has still not been piloted. And a keyless
deployment gets a shorter scene than a keyed one, said on the screen.

## 32. The twenty-sixth pass: what the log knew and nobody read

Not reported. It came out of reading a product brief against the code. The brief argued that a
language app should track more than right and wrong, response time and which forms a learner
confuses among the rest, and that the review algorithm should target the confusion rather than the
word. The comparison was that the app already collected the first and already computed the second,
and read neither.

### The fault

`Review.durationMs` had been written since the scheduler was built, by every timed round, carried
through the offline outbox and included in every backup. The plan began reading it as the length of
a sitting in the same week this was written (section 11); nothing read it as the time on one
answer, which is the reading that says something about a word rather than about an evening. No
chart, no scheduler input and no round that decides how hard to ask next had ever asked.

The second fact was computed twice. `markFlash` names the ending a learner reached for instead of
the one asked, so it can print "That is the seestütlev. This one wanted the seesütlev.", and
`markDescription` names it for a sentence. Both go through `whichCase`, which names a case only
where exactly one case is spelled that way, so it is a claim the dictionary stands behind. Then the
card went and the sentence went with it, and the fact lived for as long as it was on the screen.

Two smaller faults were beside them. The scene round asked a named word for a named case and told
the log nothing about either, so every one of its answers went down as being about whatever the
nearest card happened to be, which is the fault `Review.slot` was added to fix, in a round written
after the fix. And Match was dividing its round clock by the number of pairs and writing that into
a column meant for the time on one answer, which is a figure that survives a `> 0` filter while
measuring nothing.

### What landed

`Review.reachedSlot` holds the form that came back instead, written only where both sides are forms
and only where they differ, checked against the closed list on the way in like `slot` and more
narrowly. Both rounds that can name one now send it, the scene round sends the case it asked for as
well, and the offline path carries both. `lib/stats/answerTime.ts` reads the duration column as a median
over recalled, timed answers per slot and names the slots that are accurate and slow against the
learner's own pace; `lib/stats/confusions.ts` counts unordered pairs above a floor of two.
`components/NotAutomatic.tsx` draws both on Progress, under the cases panel, only where there is
something to say. Match writes zero.

And one bug this was not looking for. `OfflineProvider` mapped five named fields from the outbox
into the replay and dropped `slot`, so every grade the flash round took offline lost the one thing
its own comment says must survive a train. The invariant reads the field list off `PendingGrade`
and checks each name reaches the replay.

### What was measured

Every text node of the panel in both themes, with the design suite's own arithmetic: the worst is
4.68 and the slowest figure sits on butter at 5.31 light and 9.27 dark, which are the numbers
`docs/14-design-system.md` already records for that ink on that tint. axe finds nothing on
`/progress`. The eleven new assertions in `scripts/test-invariants.ts` were each made to fail on
the fault they guard, and one did not on the first attempt: the check for a round clock divided
into the duration column used a character class excluding `)`, which stopped at the paren inside
`Math.round(` and passed against the live bug. It excludes `;` now and fails on the real line.

The fixture had to be changed to reach any of it. `scripts/demo-data.ts` wrote a flat 4200 and no
slot, so the panel would never have rendered in any browser suite and every check behind it would
have waived itself for ever. The translative is right every time at 9.4 seconds against the
learner's own 3.8, and the inessive and elative are swapped six times.

### What it does not do

It reads and it shows. Nothing about which shape the flash round asks next, which card the queue
serves, or what the scheduler does with a slow correct answer has changed; a slow recall is still
a recall. Whether speed should move the rating, whether the confusion should generate the next
question, and whether a mission format should sit on top of any of it are the three decisions
still open from the brief, and each is a larger change than reading two columns.

## 33. The twenty-seventh pass: the other side's line, written before anybody played

Situations shipped in §30 of `docs/21-situations.md` with a ladder whose load-bearing rung was a
live model, and a keyless deployment therefore had a receptionist who could greet you and then say
nothing answerable. The MVP brief asked for the simplest possible mission, "a visual story where
language is the interaction", with no model at runtime. Both are one change: a fourth rung,
*scripted*, between the lexicographer and the live model.

`scripts/draft-lines.ts` drafts lines with the same chain and prompt the route uses, gates each one
with the same four checks, and writes the survivors into `lib/scenes/bank.ts` with the model and
the day. The diff is the review; a native speaker's later pass edits the same file and flips
`reviewed`, which the chip reads. `lib/scenes/scripted.ts` decides which beats may have one (none
that names a value the card draws per run) and reads the bank through that rule. The route tries
the two rungs that cost a comparison before it books a call, and the screen prints which answered.

**The first mission is the brief's own worked example**: `poodi-piima`, going to the shop for milk
with a friend on the phone. `pood` in three local cases and `piim` in the partitive, at A1, in
`sina`. Fourteen catalogue rules and the gate re-check hold it, and the bank test re-runs every
scripted row through the gate on every run of the suite.

**Two things were extracted rather than copied.** The eval script's chain, prompt and keyless
context builders moved to `scripts/lib/sceneDraft.ts`, shared with the drafter, because a
rejection rate measured with one prompt and a bank drafted with another is a rate for nothing. And
the design's own Phase 3 argument, that a banked line may never be a card answer, an exam answer or
a marking target, is an invariant now rather than a note, made to fail on each of its clauses.
