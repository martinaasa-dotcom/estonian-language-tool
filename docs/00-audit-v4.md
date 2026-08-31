# Audit of Specification v4.0

**Audited artefact:** `estonian_learning_dashboard_spec_v4.pdf` (Gemini-authored, 5 sections).
**Repository state at audit time:** empty. No commits, no source files, no configuration. The
specification document is the entire project, so this audit is a document audit, not a code audit.

**Method.** Every external dependency the spec relies on was probed directly rather than assumed.
Where a claim is marked **VERIFIED** below, it was checked against the live service on 2026-08-28.

**Headline result.** The spec is a good *feature wish-list* and a poor *engineering plan*. Three of
its load-bearing mechanisms cannot work as written (they are not "hard", they are blocked by other
people's servers) and the linguistic model at its core is too shallow to teach Estonian. Fixing
these is not a matter of polish; it changes the architecture.

---

## A. Blocking defects

These make the feature impossible as specified. Each has a fix.

### A1. Sõnaveeb cannot be embedded in an iframe: VERIFIED

The spec's Feature 3 is built on "Embedded view of the **Sõnastik** dictionary interface". The
dictionary refuses to be framed:

```
$ curl -sSI https://sonaveeb.ee/   → X-Frame-Options: DENY
$ curl -sSI https://ekilex.ee/     → X-Frame-Options: DENY
```

`X-Frame-Options: DENY` is enforced by the browser. There is no flag, proxy trick, or sandbox
attribute that makes this render. The tab would be permanently blank. Roughly a third of the spec's
value proposition ("remove tab-switching") rests on this.

**Fix.** Drop the iframe. Consume the **Ekilex REST API** server-side and render a native dictionary
UI. This is strictly better than the iframe would have been: we get structured data we can pipe into
flashcards, instead of pixels we cannot touch. See `05-integrations.md`.

### A2. Ekilex requires an API key, and the spec never mentions one: VERIFIED

```
$ curl -s -o /dev/null -w "%{http_code}" https://ekilex.ee/api/word/search/raamat  → 403
```

The API is key-gated (key issued from an Ekilex account profile page). The spec budgets no time for
obtaining it, no server route to hold it, and no handling for the case where it is not yet granted.

**Fix.** Treat key acquisition as a **Phase 0 blocker started on day one** (human turnaround, not
engineering time). All Ekilex calls go through a Next.js Route Handler so the key stays server-side.
Ship a seeded offline word set so Phase 1-2 development is not blocked while the key is pending.

### A3. Speakly cannot be embedded either, and has no public API

The marketing site (`speakly.me`) frames fine, but it is a marketing site. The application lives
behind `api.v4.speakly.me` and every app host probed (`app.`, `my.`, `web.`, `learn.`) returns
502 to an unauthenticated request. There is no published API, no documented vocabulary export, and
embedding a paid third-party product inside your own dashboard is a terms-of-service question before
it is an engineering one.

The spec's "Import parser tool to send new Speakly vocabulary straight to your flashcard queue"
assumes an export format that has not been shown to exist.

**Fix.** Demote Speakly from a pillar to an optional convenience. Ship a **generic paste-and-parse
importer** (accepts pasted lines, TSV, CSV, JSON) that works with Speakly, Quizlet, a class handout,
or anything else. Link out to Speakly in a new tab rather than framing it. This gives the user the
actual benefit (words land in the deck) without depending on a service that has not agreed to it.

### A4. Browser TTS for Estonian is not dependable: VERIFIED alternative found

The spec assigns all audio to the Web Speech API. Estonian voice availability under
`speechSynthesis` depends entirely on the user's OS having an `et-EE` voice installed; on a typical
macOS or Windows machine there is none, and `getVoices()` silently returns a list without Estonian.
The failure mode is not an error. It is silence, or worse, an English voice reading Estonian text.
For a tool whose selling point includes pronouncing *õ, ä, ö, ü*, that is a total failure.

**A better option exists and is live.** TartuNLP (University of Tartu NLP group) publishes a free
neural Estonian TTS API:

```
POST https://api.tartunlp.ai/text-to-speech/v2
{ "text": "raamat", "speaker": "mari", "speed": 1.0 }   → audio/wav
```
14 Estonian speakers (`mari`, `tambet`, `kalev`, `liivika`, …), 10 000-character limit, MIT-licensed,
no API key required. Verified returning a live speaker list.

**Fix.** TartuNLP as the primary voice, proxied server-side and cached to disk (pronunciation of a
given word never changes, so cache it forever). Web Speech API as a degraded fallback only.

### A5. Speech-to-text for Estonian is asserted, not established

"Voice Assistant: Microphone input for speaking queries directly to Anu" assumes browser
`SpeechRecognition` handles Estonian. Chrome's recognition language list does not dependably include
Estonian, and the TartuNLP speech-to-text path did not resolve on probe.

**Fix.** Move STT behind a **timeboxed Phase 4 spike**. Do not promise it in an early phase. If the
spike fails, the honest fallback is typed input plus *pronunciation self-check*: record, play back
against the reference TTS clip, self-score. That is pedagogically useful even without recognition.

---

## B. The linguistic model is too shallow to teach Estonian

This is the deepest problem and the least visible one. The spec treats Estonian as English with
extra endings. It is not.

### B1. "3 core base noun cases" is the right instinct, wrongly framed

Nominative / genitive / partitive are not "3 of the 14 cases you display". They are the
**principal parts** (*põhivormid*): the unpredictable forms you must memorise because the other
eleven are *derived* from them. That distinction is the entire reason the feature exists, and the
spec does not state it.

Concretely: from the **genitive** stem you regularly form the inessive, elative, allative, adessive,
ablative, translative, terminative, essive, abessive and comitative. Learn `raamatu`, and ten cases
follow. This should be taught explicitly by the UI, not buried.

### B2. Three principal parts are not enough: five are needed

Two more forms are unpredictable and cannot be derived:
- **Partitive plural** (`raamatuid`): highly irregular, needed constantly.
- **Short illative / additive** (`majja` vs long `majasse`): exists for some words only.

A tool that shows three forms will confidently teach an incomplete set of them.

### B3. Consonant gradation (*astmevaheldus*) is absent, and it is the actual difficulty

`sepp : sepa`, `tuba : toa`, `lugema : loen`. The strong/weak grade alternation, qualitative
(*laadivaheldus*) and quantitative (*vältevaheldus*), is *why* principal parts must be memorised. A dictionary feature that displays forms without ever naming the pattern
teaches the user nothing transferable. Gradation type is the single highest-value thing to surface,
tag, and drill.

### B4. Verb coverage is wrong: two infinitives are insufficient

"ma- / da- infinitives" cannot generate a conjugation. Estonian pedagogy uses **five** principal
parts: `lugema` (ma-inf), `lugeda` (da-inf), `loen` (present 1sg), `lugesin` (past 1sg),
`loetud` (tud-participle). Note that `loen` shows the weak grade, unguessable from `lugema`.

### B5. The two hardest things for an English speaker are not mentioned at all

- **Object case (total vs partial object).** `Lugesin raamatut` = "I was reading the book";
  `Lugesin raamatu läbi` = "I read the book (through)". Aspect encoded as case. This is the number
  one persistent error for English speakers and deserves first-class treatment in the tutor and a
  dedicated drill type.
- **Verb government (*rektsioon*).** `aitama` takes the partitive; `helistama` takes the allative
  (`helistan sulle`); `mulle meeldib` inverts the English subject. Unlearnable by analogy; must be
  stored per-verb and drilled.

**Fix.** A first-class Estonian domain model (`02-estonian-domain.md`) that all other features
consume. This is the app's actual moat. Any competent developer can build a tab bar; the value is in
modelling the language correctly.

---

## C. Architecture, security and operations: largely absent

| # | Gap | Consequence | Fix |
|---|---|---|---|
| C1 | No mention of where the Anthropic API key lives | A naive build calls Claude from a client component and leaks the key to anyone who opens devtools | All AI traffic through a server Route Handler; key server-only; documented in `03-architecture.md` |
| C2 | Model ID `claude-3-5-sonnet` is stale | Not a current model identifier | `claude-opus-5`, adaptive thinking, streaming, prompt caching on the grammar system prompt |
| C3 | No data model | Six features sharing an undefined schema; the flashcard bridge has nothing to write into | Full Prisma schema, `04-data-model.md` |
| C4 | "Supabase **or** SQLite" left undecided | Two incompatible deployment stories; blocks every downstream decision | Decide: SQLite + Prisma locally, Postgres-portable schema, documented migration path (ADR-002) |
| C5 | No cost control on the AI tutor | An unbounded chat loop against a metered API | Token budget, per-day spend cap, cached system prompt, usage meter in UI (`06-anu-tutor.md`) |
| C6 | No error, empty, loading or offline states | Every integration can fail; none has a defined behaviour | Per-integration degradation table (`05-integrations.md`) |
| C7 | No testing strategy, no CI | "It works" is unfalsifiable | `10-testing-quality.md` |
| C8 | No accessibility, no keyboard model | An SRS app used daily is unusable without keyboard review | `08-ux-ia-a11y.md` |
| C9 | No Estonian input affordance | Typing `õäöü` on a US keyboard is a daily friction point | Diacritic input helper, spec'd in `08` |
| C10 | No export or backup | Months of review history trapped in an undocumented local DB | JSON + Anki-compatible export from Phase 3 |
| C11 | No rate-limit or caching policy for Ekilex | A free academic API hammered by a dev loop | Server-side cache-first, documented in `05` |
| C12 | No licensing/attribution note | Ekilex data is CC BY 4.0, and attribution is a **condition of use** | Attribution requirement recorded in `05` and `11` |

---

## D. Product and pedagogy: the app is six tabs, not a learning system

| # | Gap | Fix |
|---|---|---|
| D1 | No notion of the learner's level | CEFR level on the profile; map to the Estonian state exam (*tasemeeksam*) A2/B1/B2 structure |
| D2 | No "what should I do right now" | A **Today** view as the default route: due reviews, due tasks, next class, which is the app's actual front door |
| D3 | No progress or analytics | Retention curve, weak-case heatmap, vocabulary growth (`01-product-spec.md`) |
| D4 | No connection between features | Tasks, dictionary, tutor and cards are six silos. The unifying object is the **word**, and everything should link back to a lexeme |
| D5 | Flashcards have one implicit card type | Estonian needs several: recognition, production, case-form cloze, gradation, verb government (`07-srs.md`) |
| D6 | "Leitner / SM-2" is ambiguous and dated | **FSRS** via `ts-fsrs` (MIT, v5.4.1, verified on npm): better retention per review, actively maintained |
| D7 | No success criteria anywhere | Acceptance criteria per feature, definition of done per phase (`09-roadmap.md`) |

---

## E. Internal inconsistencies in the document itself

1. **Feature numbering contradicts itself.** §3 lists Calendar as *Feature 2* and Sõnastik as
   *Feature 3*; §5 lists Sõnastik as *Feature 2* and drops Calendar from the feature list entirely
   while still listing it as a tab. Six features in §3, five in §5.
2. **Terminology.** *Sõnastik* is the ordinary Estonian noun for "dictionary". The products are
   **Sõnaveeb** (the public portal) and **Ekilex** (the lexicographic database and API behind it).
   The spec uses "Sõnastik" as a proper noun throughout, which will send an implementer to the wrong
   place. Renamed to **Ekilex/Sõnaveeb** in v5.
3. **Phasing contradicts priority.** Calendar is "Feature 2" but lands in Phase 4. The SRS engine,
   the feature that actually produces learning, lands in Phase 3, behind two embedded iframes that
   cannot work.
4. **Phase 3 is overloaded.** Speakly embed + two import parsers + full SM-2 + TTS in one phase,
   with no de-risking spike before it.
5. **"Offline caching" and "browser extension" appear once, in a Phase 4 table cell**, with no
   requirements attached. A browser extension is a separate product with its own build, review and
   store process. It is not a table cell.

---

## F. What v4.0 got right

Worth keeping explicitly, so the rewrite does not lose it:

- **The core insight is correct and valuable.** A single workspace that removes tab-switching during
  study is a real problem worth solving, and the six chosen surfaces are the right six.
- **Principal parts as a headline feature** is genuinely the right thing to centre a beginner tool
  on, even if the spec under-specifies it.
- **The flashcard bridge**, one click from anything (dictionary hit, tutor example, import) into
  the deck, is the correct unifying interaction. v5 promotes it from a feature bullet to the
  app's central design principle.
- **A named tutor persona** with preset prompt chips is good UX instinct: it lowers the blank-page
  cost of asking a grammar question mid-study.
- The tech stack is broadly sound; only the model ID and the database ambiguity needed correction.

---

## G. Disposition of every v4.0 requirement

| v4.0 requirement | Verdict | Where it goes in v5 |
|---|---|---|
| Task manager with skill tags + week filter | **Keep**, extend with due dates & task↔word links | Phase 1 |
| Calendar with iCal feeds | **Keep**, move earlier, read-only subscribe | Phase 4 |
| Embedded Sõnastik iframe | **Cannot work (A1)**, replaced | Native UI on Ekilex API, Phase 2 |
| 3 noun cases + 2 verb infinitives | **Deepen** to 5 noun principal parts + 5 verb principal parts + gradation | Phase 2 |
| Sõnaveeb favourites JSON import | **Unfounded (A3)**, generalised | Generic paste importer, Phase 3 |
| TTS for vowels via Web Speech API | **Replace (A4)** | TartuNLP + cache, Phase 2 |
| AI tutor "Anu" + prompt chips | **Keep**, harden (key, cost, caching, evals) | Phase 2 |
| Voice input to Anu | **Unproven (A5)**, spike first | Phase 4 spike |
| `+ Add to Deck` from Anu output | **Keep**, promoted to core principle | Phase 3 |
| Speakly iframe | **Cannot verify (A3)**, link out instead | Phase 4 optional |
| Speakly import parser | **Generalise** to any pasted text | Phase 3 |
| SM-2 / Leitner SRS | **Upgrade** to FSRS, add card types | Phase 3 |
| Offline caching | **Keep**, specify properly | Phase 5 |
| Browser extension | **Defer**, separate product | Post-v1, out of scope |
