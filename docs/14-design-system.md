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

## 2. Tokens

Defined twice in `app/globals.css`, deliberately:

- in `@theme`, so Tailwind utilities (`bg-mint`, `text-ink-2`) exist;
- in `:root`, so the inline `style` props the views use can read them.

The `:root` copy is the one that flips for dark mode, in all three states the theme can be in:
system-light (bare `:root`), system-dark (`prefers-color-scheme` guarded by
`:root:not([data-theme="light"])`), and explicitly chosen (`:root[data-theme="…"]`).

Shape: `--r-sm` 10px, `--r` 16px, `--r-lg` 22px, `--r-xl` 30px. Buttons, chips and pills are
fully round. Shadows are violet-tinted rather than grey (`--shadow-sm/-/-lg`), plus
`--shadow-accent` for the one gradient button.

## 3. Type

- **Fraunces** (`.est`) — headings, numbers that matter, and every Estonian word in the app.
- **Plus Jakarta Sans** — the interface around it.

Both are loaded with `latin-ext`, which is not optional: without it `õ ä ö ü š ž` fall back to a
different face mid-word. The font variables are attached to `<html>`, not `<body>`, because
`--font-serif` is declared on `:root` and references them — a custom property is substituted
where it is declared, so the face has to be in scope there.

## 4. Motion

Small, physical, and never blocking:

- `.lift` — cards that are themselves a link rise 3px on hover.
- `.press` — every button dips on `:active`. This is most of what makes the app feel responsive.
- `.fade-up`, `.pop-in` — entrances for content that has just arrived (a flipped card, a summary).
- `.float` — the mascot and the landing page's decorative letters.
- `.reveal` — the landing page's scroll-driven section reveal, done with CSS scroll timelines so
  no content is ever hidden behind a script; browsers without them get the finished state.

`prefers-reduced-motion: reduce` flattens all of it, and switches `.reveal` off outright — a
scroll-driven animation has no duration to shorten, so it needs removing rather than shrinking.

## 5. Components

`components/ui.tsx` holds the primitives: `Page`, `Card` (with pastel `tone`s), `SectionTitle`,
`Chip`, `Empty`, `Stat`, `StatTile`, `Meter`, `Wash`. `components/Button.tsx` has one gradient
variant (`primary`) and four quiet ones; one loud action per screen.

`components/brand.tsx` holds **Õ**, the mascot: Estonian's most recognisable letter is already a
round face with a squiggle on top, so the mascot is that letter taken literally. It appears in
the rail, in every empty state, at the end of a session, and on the landing page. It is a
component rather than an asset so it inherits the theme and can change mood.

## 6. Routing and the landing page

Two route groups:

- `app/(app)/` — the signed-in shell: rail, floating mobile bar, pastel wash.
- `app/(marketing)/` — `/welcome` and `/sign-in`, which get none of that chrome.

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
