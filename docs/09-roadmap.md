# Implementation Roadmap

> **Where this stands.** Phases 0–5 shipped, plus a later pass that added the learning path, typed
> answers, the practice modes, XP/quests/progress and offline review. `13-mvp-status.md` §6 is the
> current state; this file is kept as the plan the build actually followed.

v4.0's four phases put two impossible iframes ahead of the SRS engine and bundled the riskiest work
into one overloaded phase with no de-risking. This roadmap front-loads the unknowns and orders the
rest by value delivered.

**Definition of done, every phase:** feature acceptance criteria met (`01-product-spec.md`), tests
written and passing, no TypeScript errors, no console errors, states from `08` §4 implemented,
keyboard-operable, and the phase demoed against a real study session.

---

## Phase 0 — De-risk (2–3 days)

The phase v4.0 does not have, and the reason its plan would have failed in week three.

| Task | Output |
|---|---|
| **Request the Ekilex API key** | Submitted day one — human turnaround is not under our control and blocks Phase 2 |
| Spike: Ekilex API contract | A real response for `raamat`, `tuba`, `lugema`, `tulema` saved as fixtures; confirm paradigm data yields all five principal parts for both nouns and verbs |
| Spike: TartuNLP TTS | Fetch and play a `.wav` end to end; measure latency; confirm cache strategy |
| Scaffold | Next.js 15 + TS strict + Tailwind + shadcn + Prisma + Vitest + Playwright + CI |
| Seed fixture | ~500 A1–B1 lexemes committed, so all later work is unblocked if the key is delayed |

**Exit:** we know the Ekilex response shape from real data, audio plays, CI is green on an empty app.
**Gate:** if Ekilex data cannot supply all five noun principal parts, that is discovered here — in
week one, with the plan intact — not in Phase 2 with a dictionary UI already built on the assumption.

---

## Phase 1 — Shell, Today, Tasks (1 week)

| Task | Notes |
|---|---|
| App shell: sidebar, routing, theme, command palette | All eight routes exist, placeholders allowed |
| Prisma schema + first migration | Full schema from `04-data-model.md` |
| `lib/estonian/` domain core | Cases, principal parts, gradation, derivation — **100% unit tested**, no UI |
| Tasks CRUD with tags, week, due date, filtering | v4.0 Feature 1, complete |
| Today view | Due tasks, streak, empty states (no cards yet) |
| Diacritic input bar | Available everywhere from day one |

**Exit:** tasks are genuinely usable for the current class week. The domain core is tested and ready
for Phase 2 to consume.

> Building `lib/estonian/` in Phase 1 with no UI attached is deliberate. It is the hardest and
> highest-risk code in the project; it must not be written in a hurry behind a dictionary deadline.

---

## Phase 2 — Dictionary + Anu (2 weeks)

| Task | Notes |
|---|---|
| Ekilex client, mapper, cache | Behind `/api/dictionary/*`; key server-side |
| Dictionary search + entry UI | Five principal parts, gradation badge, derived case table marked derived |
| TTS proxy + cache + player | TartuNLP, content-addressed, pre-warm on add |
| Anu chat, streaming, prompt caching | `06-anu-tutor.md` in full |
| Preset chips incl. object-case and gradation | Context-aware |
| Usage ledger + budget cap + cost meter | Before heavy use, not after the first bill |
| Anu eval suite | ~40 questions, run before prompt changes |

**Exit:** search `tuba`, see the full correct paradigm with gradation flagged, hear it, ask Anu why
`toa` loses the `b`, and get a correct explanation citing the pattern. Key absent from the client
bundle, verified in CI.

---

## Phase 3 — Flashcards, imports, export (2 weeks)

The SRS moves ahead of Calendar because it is where the learning actually happens.

| Task | Notes |
|---|---|
| FSRS integration, card generation | `ts-fsrs`; the seven card types |
| Review session UI | Keyboard-first, audio, undo, session summary |
| `+ Add to Deck` everywhere | Dictionary, examples, Anu, selection |
| AI provenance badges + enrich flow | ADR-005 enforced in the UI |
| Generic paste importer | TSV/CSV/JSON/lines, preview, dedupe, Ekilex enrichment |
| **Export: JSON + Anki** | Ships here, not deferred |
| Today wired to due cards | The loop closes |

**Exit:** a full daily loop — Today shows due cards, review runs entirely from the keyboard offline,
new words arrive from dictionary/Anu/paste, and everything exports.

---

## Phase 4 — Calendar, progress, voice spike (1.5 weeks)

| Task | Notes |
|---|---|
| iCal subscription + sync + per-feed errors | Read-only |
| Month/week calendar with tasks and review load | |
| Progress dashboard + **weak-case heatmap** | Click a weak case → filtered drill |
| **Spike: Estonian STT (2 days, timeboxed)** | Ships only if it works; otherwise the pronunciation self-check fallback |
| Speakly link-out + import preset | Honest scope (ADR-006) |

**Exit:** class schedule visible next to due work; the heatmap has changed a study decision.

---

## Phase 5 — Durability and polish (1 week)

| Task | Notes |
|---|---|
| Offline: service worker, cached shell, queued writes | Review already works offline; this makes the shell match |
| Automated local backups + restore, tested | Restore is tested, or it is not a backup |
| FSRS parameter optimisation from review history | Needs ~1 000 reviews |
| Performance pass | Search < 100 ms cached; review flip < 16 ms |
| Full a11y audit against `08` §5 | |
| Optional: Postgres/Supabase migration path | Only if remote access is wanted (see `12-open-questions.md`) |

---

## Summary and sequencing rationale

| Phase | Focus | Duration |
|---|---|---|
| 0 | De-risk + scaffold | 2–3 days |
| 1 | Shell, Today, Tasks, domain core | 1 week |
| 2 | Dictionary + Anu | 2 weeks |
| 3 | Flashcards + imports + export | 2 weeks |
| 4 | Calendar + progress + voice spike | 1.5 weeks |
| 5 | Offline, backup, tuning, a11y | 1 week |
| | **Total** | **≈ 8 weeks** |

Three ordering decisions worth stating:

1. **Unknowns first.** Everything that depends on someone else's server is probed in Phase 0, when a
   surprise costs a day instead of a phase.
2. **The domain core before anything renders it.** The hardest code is written and tested in
   isolation, not under UI deadline pressure.
3. **The SRS before the calendar.** v4.0 had it the other way round. The calendar is convenience; the
   SRS is the product.

Each phase is independently useful. Stopping after Phase 3 still leaves a genuinely valuable tool.
