# External Integrations

Every claim marked **VERIFIED** was probed against the live service on 2026-08-28. v4.0 asserted
three integrations that do not work as described; this document records what is actually true and
what we do instead.

---

## 1. Ekilex / Sõnaveeb: dictionary data

### 1.1 Naming (audit E2)

v4.0 calls the product "Sõnastik". *Sõnastik* is the ordinary Estonian noun for "dictionary". The
actual products:

- **Ekilex**: the Institute of the Estonian Language's lexicographic database and its REST API.
  This is what we integrate with.
- **Sõnaveeb**: the public web portal rendering Ekilex data. This is what the learner already uses
  in a browser tab; we are replacing that tab.

### 1.2 Verified facts

| Fact | Evidence |
|---|---|
| Cannot be iframed | `curl -sSI https://sonaveeb.ee/` → `X-Frame-Options: DENY`. Same on `ekilex.ee`. **VERIFIED** |
| API requires a key | `GET https://ekilex.ee/api/word/search/raamat` → **403** unauthenticated. **VERIFIED** |
| Key source | Issued from the API section of an Ekilex account profile |
| Data model | A word has one or more sets of *forms* (their JSON calls a set by the linguist's word), each carrying orthographic representations, transcriptions and sound-file links, which is exactly the shape our principal-parts model needs |
| Licence | Ekilex standard licence is **CC BY 4.0**: attribution is a *condition*, not a courtesy |

### 1.3 Consequences for the build

1. **The iframe feature is deleted.** ADR-001.
2. **Getting the key is a Phase 0 blocker**, started on day one, because turnaround is human and not
   under our control. Phases 1-2 must be buildable without it.
3. **Server-side only.** The key lives in a Route Handler; it never appears in a client bundle.
4. **Attribution ships in the UI**, not just in a licence file: a visible "Dictionary data from
   Ekilex / Institute of the Estonian Language, CC BY 4.0" credit on every entry view.

### 1.4 Being a good citizen of a free academic API

No published rate limit means we impose our own rather than discover theirs:

- **Cache-first.** Never call Ekilex for a lexeme already stored and fresh.
- **Long TTL.** Dictionary entries change on the scale of months. TTL 30 days; stale entries are
  served immediately and refreshed in the background.
- **Debounced search.** 300 ms on keystroke; no request per character.
- **Client-side concurrency cap** of 2, with exponential backoff on 429/5xx.
- **Seed set.** ~500 common A1-B1 lexemes fetched once and committed as a fixture, so development,
  tests and demos never touch the network.

### 1.5 Mapping Ekilex → our model

`lib/ekilex/mapper.ts` is the only place that knows Ekilex's shape. It:
- picks the retrieved forms corresponding to our ten principal-part `FormType`s,
- classifies gradation by comparing the nominative and genitive stems, producing the
  `gradationNote` (e.g. `b : ∅`),
- flattens senses and translations,
- returns a typed `Lexeme` with `provenance: EKILEX`.

Because it is the single boundary, an Ekilex API change breaks one file with one contract test, not
the whole app. A **recorded-fixture contract test** runs in CI without network; a separate
`test:live` suite (not in CI) re-validates the real API on demand and is the early warning for drift.

---

## 2. TartuNLP: text-to-speech (replaces the Web Speech API)

### 2.1 Why not the Web Speech API (audit A4)

`speechSynthesis` only has an Estonian voice if the user's OS ships one. Typical macOS and Windows
installs do not. The failure is silent: `getVoices()` returns a list without `et-EE`, and the app
either says nothing or reads Estonian text in an English voice. For a feature whose stated purpose is
pronouncing *õ, ä, ö, ü*, that is a total failure, and it is invisible in testing on a machine that
happens to have the voice.

### 2.2 The verified alternative

University of Tartu NLP group, free, MIT-licensed, no API key. **VERIFIED live.**

```
GET  https://api.tartunlp.ai/text-to-speech/v2      → available speakers
POST https://api.tartunlp.ai/text-to-speech/v2
     { "text": "raamat", "speaker": "mari", "speed": 1.0 }
     → audio/wav
```

| Parameter | Constraint |
|---|---|
| `text` | required, max 10 000 characters |
| `speaker` | required, case-insensitive |
| `speed` | 0.5 to 2.0, default 1.0 |

Confirmed Estonian speakers: `albert`, `indrek`, `kalev`, `kylli`, `lee`, `liivika`, `luukas`,
`mari`, `meelis`, `peeter`, `tambet`, `vesta` (plus `sulev`, `hella` for Võro).
Errors: `422` unprocessable, `408` timeout. Terms of service:
`https://www.tartunlp.ai/andmekaitsetingimused`.

### 2.3 How we use it

- **Proxied** through `/api/tts`, never called from the browser, so we control caching and rate.
- **Cached forever**, content-addressed on `sha256(text + speaker + speed)`, stored as `.wav` under
  `.data/audio/`. A word's pronunciation does not change; we fetch each one exactly once.
- **Pre-warmed** on card creation, so review sessions never wait on the network. This is what makes
  offline review with audio possible.
- **Speaker configurable** in settings, defaulting to `mari`.
- **Slow-repeat control** at `speed: 0.6` for hearing gradation and quantity distinctions, directly
  useful given that Q2/Q3 are not distinguished in spelling (`02-estonian-domain.md` §1.4).
- **Fallback chain:** cache → TartuNLP → Web Speech (if an `et` voice exists) → hide the control.
  Never render a play button that does nothing.

### 2.4 Speech-to-text: unproven, spike required (audit A5)

v4.0 promises microphone input to Anu. Browser `SpeechRecognition` does not dependably support
Estonian, and the TartuNLP speech-to-text path did not resolve on probe. This is a **Phase 4
timeboxed spike (2 days)**, not a committed Phase 2 feature.

If the spike fails, the fallback is *pronunciation self-check*: record via `MediaRecorder`, play back
against the reference TartuNLP clip, self-grade. No recognition required, and it is genuinely useful
practice for quantity and gradation contrasts.

---

## 3. Speakly: link out, do not embed

### 3.1 Findings (audit A3)

- No public API and no published vocabulary export format.
- The marketing site frames, but the application does not live there; every app host probed
  (`app.`, `my.`, `web.`, `learn.speakly.me`) returned **502** unauthenticated. The app talks to
  `api.v4.speakly.me`, undocumented.
- Embedding a paid third-party product in your own dashboard is a terms-of-service question first.

v4.0's "import parser to send new Speakly vocabulary to your queue" assumes an export that has not
been shown to exist.

### 3.2 What we do instead (ADR-006)

- **Link out** to Speakly in a new tab. Honest, works today, no ToS exposure.
- **A generic importer** (`01-product-spec.md` §3.6) that accepts *any* pasted vocabulary: TSV, CSV,
  JSON, `word – translation` lines, or free text passed through Anu for structuring.
- Optional **Ekilex enrichment** to fill in principal parts on import.

The learner gets the actual outcome, Speakly words in the deck, with none of the fragility. If
Speakly ever publishes an API, it becomes one more parser behind the same interface.

---

## 4. Calendar: read-only iCal subscription

- `ical.js` (2.2.1, **VERIFIED** on npm), RFC 5545.
- Server-side fetch and parse of user-supplied `.ics` URLs; events persisted to `CalendarEvent`.
- **Read-only.** No OAuth, no Google Calendar API, no write scope. An iCal URL is a bearer secret,
  stored server-side, never rendered into client HTML.
- Sync on demand and on app start, at most hourly per feed.
- Recurrence (`RRULE`) expanded for a rolling ±90-day window; unbounded recurrences are capped.
- Per-feed `lastError` surfaced in the UI so one broken feed cannot take down the calendar.

---

## 5. Anthropic API

Full treatment in `06-anu-tutor.md`. Integration-level facts:

- `claude-opus-5` (v4.0's `claude-3-5-sonnet` is not a current model identifier, audit C2).
- `@anthropic-ai/sdk`, **server-side only**, streaming, adaptive thinking.
- `cache_control` breakpoint on the static Estonian system prompt.
- Every response's `usage` is written to `Message` and `UsageDay`, so spend is measured rather than estimated.

---

## 6. Integration risk summary

| Integration | Verified? | Risk | Mitigation |
|---|---|---|---|
| Ekilex API | Key requirement verified; contract not yet exercised with a key | **High**: Phase 2 blocker | Start key request day one; seed fixture unblocks development; mapper isolated behind one contract test |
| TartuNLP TTS | Fully verified live | Low | Cache forever; Web Speech fallback |
| TartuNLP STT | **Not verified** | Medium | Timeboxed spike; self-check fallback |
| Speakly | Verified as *not* integrable | Low (descoped) | Generic importer |
| iCal | Standard format, library verified | Low | Per-feed error isolation |
| Anthropic | Well documented | Low | Budget cap, typed errors |
