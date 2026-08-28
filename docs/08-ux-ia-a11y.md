# UX, Information Architecture and Accessibility

v4.0 specified "sidebar navigation with tabs" and nothing else — no default view, no keyboard model,
no empty states, no accessibility, and no answer to the daily friction of typing `õäöü` on a US
keyboard.

## 1. Information architecture

```
Sidebar
├── Today          ← default route
├── Tasks
├── Dictionary
├── Anu            (tutor)
├── Flashcards
├── Calendar
├── Imports
└── Progress
                   Settings (bottom)
```

**Today is the default route**, not Tasks. This is the fix for audit gap D2: a dashboard whose front
door is a list of tabs makes the user decide what to do before they have done anything. Today answers
"what now" — due cards, due tasks, next class, one button to start.

## 2. Cross-cutting interactions

**`+ Add to Deck` is everywhere.** Dictionary entry, individual example, Anu message, import row,
selected text. Same component, same confirmation, provenance recorded. This is the interaction that
makes the dashboard more than six tabs in a trench coat.

**Command palette (`Cmd/Ctrl-K`).** Search a word, jump to a tab, start a review, add a task, ask
Anu. For a power tool used daily by one person, the palette is faster than any navigation.

**Global keyboard map:**

| Key | Action |
|---|---|
| `Cmd/Ctrl-K` | Command palette |
| `g` then `t` / `d` / `a` / `f` / `c` | Go to Tasks / Dictionary / Anu / Flashcards / Calendar |
| `/` | Focus search |
| `n` | New task (context-dependent) |
| `?` | Keyboard shortcut help |

Review-session keys are in `07-srs.md` §3. Undo (`u`) is specified there but is not in
the MVP — see `13-mvp-status.md` §4.

## 3. Estonian text input (audit C9)

A daily friction point v4.0 does not mention. Typing `õ ä ö ü š ž` on a US layout is slow, and a
learner will avoid features that require it.

Three affordances, all of them:

1. **A diacritic bar** under every Estonian text input: `õ ä ö ü š ž` as click-to-insert buttons.
2. **Long-press / repeat-key expansion**: pressing `o` twice quickly inserts `õ`. Configurable,
   off by default.
3. **Diacritic-insensitive search**: typing `sona` finds `sõna`; `raamat` matches regardless.
   Implemented as a normalised search column so it is a real index lookup, not a scan.

Answer checking in review is **diacritic-strict by default** — `sona` is not `sõna` and accepting it
teaches the wrong spelling — with a "close, check the diacritics" hint rather than a bare wrong mark.

## 4. States

Every view specifies four states. v4.0 specified none (audit C6).

| View | Empty | Loading | Error | Offline |
|---|---|---|---|---|
| Today | "Nothing due — add words or review ahead" + actions | Skeleton tiles | Section-level, others render | Fully functional |
| Dictionary | Search prompt + recent searches | Skeleton entry | "Ekilex unavailable — showing cached" | Cached entries open |
| Flashcards | "No cards yet" + import/dictionary links | Instant (local) | — | Fully functional |
| Anu | Persona intro + chips | Streaming cursor | Typed error + retry, message preserved | "Anu needs a connection" |
| Calendar | "Add a feed" | Skeleton grid | Per-feed error row | Cached events |
| Imports | Paste area with format examples | Parse progress | Row-level errors, partial import allowed | Works — parsing is local |

## 5. Accessibility (audit C8)

Target **WCAG 2.2 AA**. Not aspiration — this app is used for an hour a day.

- **Full keyboard operation.** Every action reachable without a mouse; visible focus rings; logical
  tab order; no keyboard traps.
- **Screen reader.** Semantic landmarks, labelled controls, `aria-live="polite"` on streaming tutor
  responses and on review grading feedback.
- **Contrast** ≥ 4.5:1 for text, ≥ 3:1 for UI boundaries, verified in both themes.
- **Never colour alone.** Card difficulty, provenance badges and gradation types all carry an icon
  or text label as well as a colour.
- **`prefers-reduced-motion`** respected — card flip animations become instant.
- **Text scaling** to 200% without loss of function.
- **Audio never required.** Listening cards always offer a text alternative.

## 6. Visual design

> Superseded in detail by `14-design-system.md` (2026-08). The principles below still hold; the
> palette, type and shape they are implemented with now live there.

- Light and dark themes, following the OS by default.
- One accent colour; grammatical case colour-coding is **consistent app-wide** — the same case is the
  same colour in the dictionary table, the heatmap and the flashcards. Learners build spatial memory
  off this, so it must never drift between views.
- Estonian text in a font with proper `õ ä ö ü` rendering; forms in a slightly larger size than UI
  chrome, since they are the content.
- Density: comfortable in Dictionary and Anu, compact in Tasks and Progress.

## 7. Responsive

Desktop-first — the stated use case is a laptop at a desk. But:

- Sidebar collapses to a bottom bar under 768 px.
- **Review must be fully usable on a phone**, with large tap targets replacing the number keys. Ten
  minutes of reviews on a bus is a real use case even when authoring is not.
- Dictionary tables scroll horizontally inside their own container; the page body never scrolls
  sideways.
