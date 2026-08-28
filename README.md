# Estonian Learning Dashboard

A single-page workspace for an English speaker learning Estonian in a structured class: tasks,
calendar, dictionary, AI tutor, and spaced-repetition flashcards in one place, so studying does not
mean juggling six browser tabs.

> **Status: planning complete, no code yet.** This repository currently contains the specification
> and implementation plan. Building starts at Phase 0 in [`docs/09-roadmap.md`](docs/09-roadmap.md).

## Start here

| If you want to… | Read |
|---|---|
| Know what was wrong with the original spec and why this one differs | [`docs/00-audit-v4.md`](docs/00-audit-v4.md) |
| Know what we are building | [`docs/01-product-spec.md`](docs/01-product-spec.md) |
| Understand the Estonian model at the core | [`docs/02-estonian-domain.md`](docs/02-estonian-domain.md) |
| Start building | [`docs/09-roadmap.md`](docs/09-roadmap.md) |
| Answer the questions blocking decisions | [`docs/12-open-questions.md`](docs/12-open-questions.md) |

## Full document set

| Doc | Contents |
|---|---|
| [`00-audit-v4.md`](docs/00-audit-v4.md) | Audit of spec v4.0: blocking defects, gaps, fixes, disposition of every original requirement |
| [`01-product-spec.md`](docs/01-product-spec.md) | v5.0 spec: features with acceptance criteria, non-goals, success criteria |
| [`02-estonian-domain.md`](docs/02-estonian-domain.md) | Principal parts, gradation, object case, verb government, provenance |
| [`03-architecture.md`](docs/03-architecture.md) | Stack, security posture, directory layout, failure modes, ADRs 001–006 |
| [`04-data-model.md`](docs/04-data-model.md) | Complete Prisma schema |
| [`05-integrations.md`](docs/05-integrations.md) | Ekilex, TartuNLP TTS, Speakly, iCal, Anthropic — verified facts and contracts |
| [`06-anu-tutor.md`](docs/06-anu-tutor.md) | Persona, prompts, caching, cost model, budget cap, evals, security |
| [`07-srs.md`](docs/07-srs.md) | FSRS, seven Estonian card types, review UX, analytics, export |
| [`08-ux-ia-a11y.md`](docs/08-ux-ia-a11y.md) | IA, keyboard model, Estonian input, states, WCAG 2.2 AA |
| [`09-roadmap.md`](docs/09-roadmap.md) | Phases 0–5, ~8 weeks, with definitions of done |
| [`10-testing-quality.md`](docs/10-testing-quality.md) | Test strategy, CI, security checks, data-safety checks |
| [`11-risks-decisions.md`](docs/11-risks-decisions.md) | Risk register, decision index, what would change the plan |
| [`12-open-questions.md`](docs/12-open-questions.md) | Decisions needing input, each with a default |

## What changed from v4.0, in one table

| v4.0 | v5.0 | Why |
|---|---|---|
| Embed Sõnaveeb in an iframe | Native UI on the Ekilex REST API | `X-Frame-Options: DENY` — verified. The frame cannot render |
| Embed Speakly in an iframe | Link out + generic paste importer | No public API; app hosts return 502; ToS exposure |
| Web Speech API for Estonian audio | TartuNLP neural TTS, cached | No dependable `et-EE` browser voice; failure is silent |
| 3 noun cases, 2 verb infinitives | 5 noun + 5 verb principal parts, plus gradation | Three forms cannot express an Estonian paradigm |
| — | Object case, verb government | The two hardest things for an English speaker, absent from v4.0 |
| "Leitner / SM-2" | FSRS via `ts-fsrs` | Fewer reviews for the same retention; tunable |
| `claude-3-5-sonnet` | `claude-opus-5` + caching + budget cap | Stale model ID; no cost or key-safety story |
| "Supabase or SQLite" | SQLite now, Postgres-portable schema | An undecided database blocks everything downstream |
| Six tabs | Today view as the front door | A dashboard needs to answer "what now" |
| No tests, no security, no a11y, no export | All specified | — |

## Stack

Next.js 15 (App Router) · TypeScript strict · Tailwind v4 · shadcn/ui · lucide-react · Prisma +
SQLite · `ts-fsrs` · `ical.js` · Anthropic `claude-opus-5` · Vitest + Playwright

## Data sources and attribution

- Dictionary data from **Ekilex** / Institute of the Estonian Language — **CC BY 4.0**. Attribution
  is a condition of use and is displayed in the application UI, not only here.
- Speech synthesis from **TartuNLP**, University of Tartu (MIT).
