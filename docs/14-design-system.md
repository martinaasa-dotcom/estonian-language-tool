# Design System — "rukkilill sunrise"

The visual language the app was rebuilt on in 2026-08. It replaces the birch-and-cornflower
neutral scheme described in `08-ux-ia-a11y.md` §6; everything that document says about
*behaviour* — the four states, the keyboard model, the diacritic bar — still holds.

## 1. Why it looks like this

The app is opened by one person, alone, most days, usually tired, usually in the evening. Two
things follow from that:

**It has to be warm before it is impressive.** A grammar drill that looks like a tax form is a
drill you stop opening. So: pastels, round corners, a mascot, and a small physical response to
every press.

**Colour has to mean something.** Warmth costs nothing until colour stops carrying information.
So the palette is disciplined: a mostly-white ground, five hues with fixed meanings, and a wash
of pastel light behind everything so the ground never reads as grey.

| Hue | Token | Means |
|---|---|---|
| Cornflower / violet | `--accent` | the app's voice, the primary action, "this is yours" |
| Mint | `--mint` / `--good` | recalled, goal met, known |
| Butter | `--butter` / `--hard` | nearly, timed, a warning that isn't a failure |
| Peach | `--peach` / `--again` | missed, overdue, destructive |
| Sky | `--sky` / `--easy` | easy, new, reference material |
| Blush | `--blush` | Anu, the tutor — the one part of the app that talks back |

Grading colours are aliases (`--again` → `--peach`), so the rating scale and the rest of the UI
can never drift apart.

Two uses of colour, and only one of them carries meaning:

- **A chip's hue is a claim.** `again` on a chip says "this is not authoritative" — it is what
  every AI-written translation wears, in the dictionary, in Anu's replies, on the grammar pages
  and in dictation. `hard` says "there is an irregularity here to learn", which is what gradation
  notes and the memorised principal parts wear. Reach for a hue on a chip only when you mean the
  thing that hue means.
- **A tile in a set of tiles is just telling itself apart from its neighbours.** The four figures
  in a session summary, and the practice modes on Today, cycle the palette so they can be scanned
  — XP is blush there because it is the fifth tile, not because Anu is involved.

### Every hue has an ink

The five hues are chosen to read as *colour* at full strength — a bar, a ring, a
dot, a filled button. Set as **text on their own 8% tint** they land around
2.5:1, which is decoration pretending to be a label. So each hue also has an
ink: the same colour walked down until it clears 4.5:1 on its own tint.

| Use | Token |
|---|---|
| A bar, ring, dot, or filled surface | `--mint`, `--peach`, `--butter`, `--sky`, `--blush`, `--accent` |
| Text or a meaningful icon on that hue's tint | `--mint-ink`, `--peach-ink`, `--butter-ink`, `--sky-ink`, `--blush-ink`, **`--accent-deep`** |
| Text on the *solid* accent | `--accent-ink` (white) |

The accent is the trap: `--accent-ink` was already the white that sits on the
solid button, so the accent's *tint* ink is `--accent-deep`. Anything building a
token name from a tone must go through `toneInk()` in `components/ui.tsx`, or it
paints white text on a pale lilac tile.

The grading aliases follow: `--good-ink`, `--hard-ink`, `--again-ink`,
`--easy-ink`. In dark mode each ink is the hue itself — the dark tints are deep
enough that the hue already clears 7:1 on them.

`--ink-3` is picked against every surface in the system rather than against
white: 4.59:1 on the softest tint and better everywhere else, so a caption stays
legible on a pastel tile.

Both gradients are pinned to contrast too. `.grad-accent` carries white text, so
every stop clears 4.5:1 against white; `.grad-text` *is* the text, so every stop
clears 4.5:1 against the page. The previous ramp ran 4.05 → 3.46 → 3.50, which
made the app's most-pressed button its least legible surface.

`.grad-accent` also runs *horizontally*, at 90deg. A tilted ramp reaches a
different point at the top and the bottom of a fully round cap, so on a pill it
leaves a fleck of the far end's hue at the near end: at 112deg the primary
button carried a little pink on its left edge and a little blue on its right.
The vertical spread is set by the element's height, so no angle short of
horizontal avoids it on something short and wide. `.grad-text` keeps its tilt,
being clipped to letterforms that have no caps to discolour.

## 2. Tokens

Defined twice in `app/globals.css`, deliberately:

- in `@theme`, so Tailwind utilities (`bg-mint`, `text-ink-2`) exist;
- in `:root`, so the inline `style` props the views use can read them.

The `:root` copy is the one that flips for dark mode, in all three states the theme can be in:
system-light (bare `:root`), system-dark (`prefers-color-scheme` guarded by
`:root:not([data-theme="light"])`), and explicitly chosen (`:root[data-theme="…"]`).

Shape: `--r-sm` 10px, `--r` 16px, `--r-lg` 22px, `--r-xl` 30px. Buttons, chips and pills are
fully round. Tailwind's own radius names are remapped onto those four in `@theme`, so a stray
`rounded-md` lands on 10px instead of inventing a 6px corner. The single exception is the heatmap
cell: at 10px square, a token radius rounds it into a dot and the grid stops reading as a calendar.

Shadows are violet-tinted rather than grey (`--shadow-sm/-/-lg`), plus `--shadow-accent` for the
one gradient button.

## 3. Type

- **Fraunces** (`.est`) — headings, numbers that matter, and every Estonian word in the app.
- **Plus Jakarta Sans** — the interface around it.

**Eleven steps, and nothing between them.** The app previously used twenty-eight distinct sizes —
13px and 13.5px and 14px appearing inside one card, each chosen once and never compared with the
others. A reader does not see half a pixel; they see a page that will not settle.

| Step | px | Job |
|---|---|---|
| `text-2xs` | 11.5 | micro-label: uppercase, tracked, sparingly. **The floor** |
| `text-xs` | 12.5 | captions, meta, provenance |
| `text-sm` | 13.5 | secondary body, dense UI |
| `text-base` | 15 | body |
| `text-md` | 17 | lead paragraphs, card titles |
| `text-lg` | 19 | section headings |
| `text-xl` | 22 | card headline |
| `text-2xl` | 27 | the number a screen is about |
| `text-3xl` | 32 | page title |
| `text-4xl` | 40 | display |
| `text-5xl` / `6xl` | 52 / 68 | landing hero |

11.5px is a floor, not a suggestion: below it an uppercase label stops being readable on a phone
held at arm's length in the evening, which is when this app is actually used. `.label-xs` sits on
that floor. The one thing off the scale is the step numeral behind the landing page's how-it-works
cards — that is ornament, not type.

Both are loaded with `latin-ext`, which is not optional: without it `õ ä ö ü š ž` fall back to a
different face mid-word. The font variables are attached to `<html>`, not `<body>`, because
`--font-serif` is declared on `:root` and references them — a custom property is substituted
where it is declared, so the face has to be in scope there.

## 4. Motion

Small, physical, and never blocking:

- `.lift` — cards that are themselves a link rise 3px on hover.
- `.press` — every button dips on `:active`. This is most of what makes the app feel responsive.
- `.transition-ui` — the shared transition, with its properties named. Never `transition-all`:
  that animates `outline-width` too, so a focus ring fades in over 200ms and a keyboard user
  watches it arrive.
- `.fade-up`, `.pop-in` — entrances for content that has just arrived (a flipped card, a summary).
- `.float` — the mascot and the landing page's decorative letters.
- `.reveal` — the landing page's scroll-driven section reveal, done with CSS scroll timelines so
  no content is ever hidden behind a script; browsers without them get the finished state.

`prefers-reduced-motion: reduce` flattens all of it, and switches `.reveal` off outright — a
scroll-driven animation has no duration to shorten, so it needs removing rather than shrinking.

## 5. Components

`components/ui.tsx` holds the primitives: `Page`, `Card` (with pastel `tone`s), `SectionTitle`,
`Chip`, `Empty`, `Stat`, `StatTile`, `Ring`, `Meter`, `Note`, `Skeleton`, `Wash`. `components/Button.tsx` has one gradient
variant (`primary`) and four quiet ones; one loud action per screen.

`components/brand.tsx` holds **Õ**, the mascot: Estonian's most recognisable letter is already a
round face with a squiggle on top, so the mascot is that letter taken literally. It appears in
the rail, in every empty state, at the end of a session, and on the landing page. It is a
component rather than an asset so it inherits the theme and can change mood.

## 6. Routing and the landing page

Two route groups:

- `app/(app)/` — the signed-in shell: rail, floating mobile bar, pastel wash.
- `app/(chromeless)/` — `/welcome`, `/sign-in` and `/start` (first-run setup), which own the
  whole screen and get none of that chrome. Being in this group is what decides it: the rail is
  rendered by `(app)/layout.tsx` and never has a path list to keep in sync.

`/welcome` is public (see `middleware.ts`) and is the front door for a signed-out visitor
arriving at `/`. Every Estonian form on it is read from the real dictionary and run through
`buildCaseTable()` — the same function the app uses. Nothing on that page is a mock-up, and no
Estonian form on it was typed into marketing copy by hand. If the database is unreachable it
falls back to principal parts copied verbatim from the checked seed set, and shows no derived
forms at all.

## 7. What has not changed

- Every view still implements the four states from `08-ux-ia-a11y.md` §4.
- Every interactive element is still keyboard-reachable, with a visible focus ring — now 2.5px,
  offset 3px.
- Estonian text still carries `lang="et"`, and every Estonian input still has the diacritic bar.
- No Estonian morphology is generated anywhere, including in decoration.

## 8. Session screens

Every practice mode — review, sprint, match, listening, sentences, speaking, dictation — wears the
same chrome, because they are the same activity seen from different angles and a learner should not
have to re-learn the frame:

- a top row of **close · progress · counter**: an `X` back to Today in a round hover target, a
  gradient-filled progress bar with `role="progressbar"`, and the number left in an accent pill;
- one **card** at `--r-xl` with `--shadow-lg`, split into a labelled header strip, the question
  area (`aria-live="polite"`), and a footer holding the only action;
- a **summary** on the way out: the mascot cheering, then `StatTile`s, then the two or three
  places worth going next.

Nothing about that is decoration. The counter is what stops a session feeling endless, the single
footer action is what makes the next keystroke obvious, and the summary is where an achievement
toast has somewhere to land.

## 9. Screens brought into the system

The pastel rebuild and the teaching-in-context pass (`13-mvp-status.md` §7) were built in
parallel and merged. The screens that arrived from the second of those — classes, the sentence
builder, speaking, the paradigm tables, example sentences, the install prompt — were restyled
onto the primitives above rather than kept as they were: token radii instead of hand-rolled ones,
`Card` tones instead of bordered boxes, `StatTile` summaries, and `press`/`lift` on anything that
can be clicked.

One rule came out of that merge and is worth keeping: **a flex or grid item that holds text needs
`min-w-0`**. Without it the item refuses to shrink below its own content, and a single long task
title widens the whole page on a phone. The mobile sweep in `scripts/` checks for exactly this —
no horizontal overflow at 390px on any route.

## 10. Paper

`@media print` lives in `app/globals.css`, not on the one page that prints, because it is true of
every page: the rail, the mobile bar, the pastel wash and anything marked `no-print` come off, and
`page-break` starts a new sheet. A worksheet printed with a navigation rail down the side is not a
worksheet.

Two classes are the whole contract: `no-print` on screen-only controls, `page-break` where a new
sheet begins. `avoid-break` keeps an exercise from splitting across a page.
