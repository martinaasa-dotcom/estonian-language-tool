# Testing and Quality

v4.0 has no testing strategy (audit C7), which makes "it works" unfalsifiable. This is the plan for
knowing.

## 1. What deserves tests, and what does not

Effort is not spread evenly. It goes where a bug is both likely and expensive:

| Area | Priority | Why |
|---|---|---|
| `lib/estonian/` | **Highest: 100% coverage** | Wrong morphology is silently taught and then rehearsed by the SRS |
| FSRS scheduling | **High** | A scheduling bug corrupts months of review history |
| Ekilex mapper | **High** | The single boundary to an external contract we do not control |
| Import parsers | Medium | Bad input is the normal case, not the exception |
| API routes | Medium | Secret handling, error paths |
| UI components | Low to medium | Covered mostly by E2E |
| Layout, styling | None | Reviewed visually |

## 2. Unit tests (Vitest)

`lib/estonian/` is pure functions over plain data with no React, Next.js or database dependency, and
deliberately so, which is what lets it be tested exhaustively and fast.

```ts
describe("derived cases", () => {
  it("builds the ten regular cases from the genitive stem", () => {
    const d = deriveCases({ genSg: "raamatu" });
    expect(d.INESSIVE).toBe("raamatus");
    expect(d.COMITATIVE).toBe("raamatuga");
    expect(d.TERMINATIVE).toBe("raamatuni");
  });
});

describe("gradation", () => {
  it.each([
    ["tuba",   "toa",     "QUALITATIVE", "b : ∅"],
    ["sepp",   "sepa",    "QUALITATIVE", "pp : p"],
    ["lukk",   "luku",    "QUALITATIVE", "kk : k"],
    ["kaup",   "kauba",   "QUALITATIVE", "p : b" ],
    ["raamat", "raamatu", "NONE",        null    ],
  ])("classifies %s : %s", (nom, gen, type, note) => {
    const g = classifyGradation(nom, gen);
    expect(g.type).toBe(type);
    if (note) expect(g.note).toContain(note);
  });
});
```

A **golden-set test** pins ~100 hand-verified lexemes (the seed fixture) against every form they are
expected to have. It is the regression net for every future change to the domain core.

## 3. Contract tests

The Ekilex mapper is tested against **recorded fixtures** from real API responses, so CI needs no
network and no API key:

```ts
it("extracts all five noun principal parts from the Ekilex response", () => {
  const lexeme = mapEkilexWord(fixtures.tuba);
  expect(lexeme.forms.find(f => f.formType === "PART_PL")?.value).toBe("tube");
  expect(lexeme.forms.filter(f => f.isPrincipal)).toHaveLength(5);
});
```

A separate `test:live` suite hits the real API. It is **not in CI**. It runs on demand and is the
early-warning system for upstream drift. When it fails, one file changes.

## 4. E2E tests (Playwright)

Six journeys, each mapping to a feature's acceptance criteria:

1. Create a tagged task with a due date → reload → still there → filter finds it.
2. Search a word → see five principal parts + gradation badge → play audio → add to deck.
3. Ask Anu a grammar question → response streams → add a suggested word → AI badge present.
4. Complete a 20-card review **using only the keyboard** → summary correct → scheduling persisted.
5. Paste 20 lines → preview → dedupe flags a known word → confirm → cards exist.
6. Add an iCal feed → events render → remove feed → events gone, others untouched.

Journey 4 is the load-bearing one: it is the daily path.

## 5. Security checks in CI

Non-negotiable, automated, and failing the build:

```bash
# No API key may appear in any client-shipped asset
grep -rE "sk-ant-|EKILEX_API_KEY" .next/static/ && exit 1

# No secret may be exposed via a NEXT_PUBLIC_ variable
grep -rE "NEXT_PUBLIC_.*(KEY|SECRET|TOKEN)" .env* && exit 1
```

This is the automated form of the rule in `03-architecture.md` §2. A documented rule that nothing
enforces is a rule that gets broken during a late-night refactor.

## 6. Data safety checks

The review log is the irreplaceable asset:

- Every Prisma migration is tested against a seeded database with review history, and asserts the
  history survives.
- An automatic snapshot is taken before any migration runs.
- **Restore is tested, not just backup.** An untested backup is a hypothesis.
- **The suite that tests it is the most dangerous file in the repository**, because the only honest
  way to test a restore is to delete everything first. `scripts/test-restore.mjs` therefore refuses
  to run unless `DATABASE_URL` looks local (`--force` overrides, deliberately awkwardly), and writes
  the export to `.backups/` *before* deleting anything. A crash between the delete and the restore
  (a dev server hiccup is enough, and has happened) leaves a file that Settings → Restore
  takes as it stands, instead of an empty review log.

## 7. CI pipeline

On every push: typecheck (`tsc --noEmit`) → lint → unit → contract → build → security grep → E2E
against the built app.

## 8. Manual QA checklist per phase

Things automation will not catch:

- [ ] Estonian characters render correctly in every font weight and size
- [ ] Audio plays on macOS Safari, Chrome and Firefox
- [ ] Dark mode has no contrast failures
- [ ] Keyboard-only navigation reaches every action
- [ ] Airplane mode: Today, Tasks and Flashcards still work
- [ ] Screen reader announces streaming tutor output and review grading
- [ ] A real study session was completed with the build
