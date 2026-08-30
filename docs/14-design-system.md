# Design System: "rukkilill sunrise"

The visual language the app was rebuilt on in 2026-08. It replaces the birch-and-cornflower
neutral scheme described in `08-ux-ia-a11y.md` §6; everything that document says about
*behaviour* (the four states, the keyboard model, the diacritic bar) still holds.

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
| Blush | `--blush` | Anu, the tutor, the one part of the app that talks back |

Grading colours are aliases (`--again` → `--peach`), so the rating scale and the rest of the UI
can never drift apart.

Two uses of colour, and only one of them carries meaning:

- **A chip's hue is a claim.** `again` on a chip says "this is not authoritative", and it is what
  every AI-written translation wears, in the dictionary, in Anu's replies, on the grammar pages
  and in dictation. `hard` says "there is an irregularity here to learn", which is what gradation
  notes and the memorised principal parts wear. Reach for a hue on a chip only when you mean the
  thing that hue means.
- **A tile in a set of tiles is just telling itself apart from its neighbours.** The four figures
  in a session summary, and the practice modes on Today, cycle the palette so they can be scanned
  apart. XP is blush there because it is the fifth tile, not because Anu is involved.

### Every hue has an ink

The five hues are chosen to read as *colour* at full strength: a bar, a ring, a
dot, a filled button. Set as **text on their own 8% tint** they land around
2.5:1, which is decoration pretending to be a label. So each hue also has an
ink: the same colour walked down until it clears 4.5:1 on its own tint.

| Use | Token |
|---|---|
| A bar, ring, dot, or filled surface | `--mint`, `--peach`, `--butter`, `--sky`, `--blush`, `--accent` |
| Text or a meaningful icon on that hue's tint | `--mint-ink`, `--peach-ink`, `--butter-ink`, `--sky-ink`, `--blush-ink`, **`--accent-deep`** |
| Text on the *solid* accent | `--accent-ink` (white) |
| Text on the *solid* mint | `--on-mint` (near-black, the same in both themes) |

Mint is the other half of that trap and did not have its own answer until a
contrast pass found the hole: the tick inside a reviewed day on Today's week
strip was `--surface`, which is white on `#1fb894` at 2.52:1. `--mint-ink` is
the ink on mint's *tint* and is no use on the solid fill, so `--on-mint` is the
one for that, and it is a single value in both themes rather than a light and a
dark, because both mints are light enough for it: 7.40:1 on `#1fb894` and
11.70:1 on the dark theme's `#5fe3bc`. It is written out rather than
`var(--ink)`, which inverts with the theme and would take the tick with it.

The accent is the trap: `--accent-ink` was already the white that sits on the
solid button, so the accent's *tint* ink is `--accent-deep`. Anything building a
token name from a tone must go through `toneInk()` in `components/ui.tsx`, or it
paints white text on a pale lilac tile.

The grading aliases follow: `--good-ink`, `--hard-ink`, `--again-ink`,
`--easy-ink`. In dark mode each ink is the hue itself, since the dark tints are deep
enough that the hue already clears 7:1 on them.

`--ink-3` is picked against every surface in the system rather than against
white: 5.26:1 on the softest tint and better everywhere else, so a caption stays
legible on a pastel tile.

It was two steps lighter than that, and the correction came from the one thing
"every surface" did not cover. The navigation rail is drawn over `.wash`, a
blurred pastel blob rather than a named background, so the wordmark's subtitle
and the rail's own controls sat at 4.36 on every signed-in screen. The wash is
a surface too, whatever the token list says.

**And a fade is never applied to a box that holds words.** `opacity` on a
container multiplies through everything inside it, which is how a locked unit
on the course page ended up explaining itself at 2.63:1: the sentence saying
"you can still open it" was the least readable thing on that screen, on every
locked row of a 73-unit course. The badge shelf and the grammar reference had
the same shape. A state that means "not yet" has a border, an icon and a
sentence to say so with; where a fade genuinely helps, it goes on the icon,
which carries no words.

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

- **Fraunces** (`.est`): headings, numbers that matter, and every Estonian word in the app.
- **Plus Jakarta Sans**: the interface around it.

**Eleven steps, and nothing between them.** The app previously used twenty-eight distinct sizes,
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
cards. That is ornament, not type.

Both are loaded with `latin-ext`, which is not optional: without it `õ ä ö ü š ž` fall back to a
different face mid-word. The font variables are attached to `<html>`, not `<body>`, because
`--font-serif` is declared on `:root` and references them, and a custom property is substituted
where it is declared, so the face has to be in scope there.

### Text stays in its box

Four declarations in `app/globals.css`, and between them they are the reason no screen here has a
word sitting on the ground behind a card.

- **`overflow-wrap: anywhere`, inherited from the body.** A word that will not fit breaks.
  `anywhere` rather than `break-word` because only `anywhere` counts towards min-content, which is
  what a flex or grid item's automatic minimum is: with `break-word` one long word is a floor under
  the whole row and the row leaves the card having broken nothing. Estonian is why this is not
  academic. The dictionary holds compounds past twenty characters and the row holding one is three
  or four columns wide on a phone.
- **`table { overflow-wrap: break-word }` is the single exemption.** A paradigm is read by
  comparing forms down a column, so a form split across two lines has to be reassembled before it
  can be compared. The table pays for that with a scroller of its own, which every table in the app
  sits in and `scripts/test-invariants.ts` checks.
- **`svg.lucide { flex: none }`.** An icon is a square and a flex item with no `flex` of its own
  both shrinks and grows: measured with the rule off, `lucide-eye-off` was drawn 0x15 in a deck row
  and `lucide-sun` 28x16 in the rail. `shrink-0` was on about a fifth of the icons in the app,
  which is what a rule kept by remembering looks like from the inside.
- **`img, video, canvas, iframe, input, select, textarea { max-width: 100% }`.** The one thing
  wrapping cannot reach: a replaced element brings its own width. Settings' backup picker is an
  `<input type="file">`, laid out at 336px from its button label and room for a filename, and it
  was in a 278px card on a 360px phone.

`scripts/test-containment.mjs` is the half that measures rectangles: every text-bearing element,
every icon and everything with a width of its own, across every route the app has at 360, 768 and
1280, in the dark as well as the light, in the states a route does not arrive in, and on the three
screens that need a row made before they can be visited. Four questions each time, of which the
fourth is whether anything is drawn on top of anything else. Then the same four again with every
run of text swapped for one of the same length with no space or hyphen in it. Same length is the
discipline: a stress test that hands every element a forty-character word is unfalsifiable, since a
ring whose middle says "42%" fails it and no markup would pass. Same length asks what the language
actually asks.

768 earns its place: it is the width at which the rail appears, so the content column is narrower
there than at any other width the app is used at, and every fault this suite has found since it
started measuring three widths has been at that one.

## 4. Motion

Small, physical, and never blocking:

- `.lift`: cards that are themselves a link rise 3px on hover.
- `.press`: every button dips on `:active`. This is most of what makes the app feel responsive.
- `.transition-ui`: the shared transition, with its properties named. Never `transition-all`:
  that animates `outline-width` too, so a focus ring fades in over 200ms and a keyboard user
  watches it arrive.
- `.fade-up`, `.pop-in`: entrances for content that has just arrived (a flipped card, a summary).
- `.float`: the mascot and the landing page's decorative letters.
- `.reveal`: the landing page's scroll-driven section reveal, done with CSS scroll timelines so
  no content is ever hidden behind a script; browsers without them get the finished state.

`prefers-reduced-motion: reduce` flattens all of it, and switches `.reveal` off outright, because a
scroll-driven animation has no duration to shorten, so it needs removing rather than shrinking.

## 5. Components

`components/ui.tsx` holds the primitives: `Page`, `Card` (with pastel `tone`s), `SectionTitle`,
`Chip`, `Empty`, `Stat`, `StatTile`, `Ring`, `Meter`, `Note`, `Skeleton`, `Wash`. `components/Button.tsx` has one gradient
variant (`primary`) and four quiet ones; one loud action per screen.

`components/Choice.tsx` is the one answer to "pick one of these" and "pick any of these":
`ChoiceGroup` plus `ChoiceChip` (a pill) or `ChoiceCard` (an answer with a line under it). It
exists because there was no primitive for it and every screen that asked invented one, two of the
three wrongly. The worst was a bare `<button>` wrapped round a `<Chip>`: a chip is the app's
*label*, so the control had no border, no shadow and no hover, and eight of them under a heading
read as a legend rather than as a form. Chosen was `--raised` swapped for `--accent-soft`, two
percent of lightness apart on the dark theme, which is a distinction carried by hue alone on the
one screen where the distinction *is* the answer. And every option carried `aria-pressed`, so a
set of mutually exclusive answers announced as that many unrelated switches and cost that many
tab stops.

Three things follow, and each has an invariant:

- **A group knows what kind of question it is.** `select="one"` is a real radio group: one tab
  stop, arrow keys between the options, "3 of 8". `select="many"` is toggle buttons, which is
  what `aria-pressed` actually means. The roving tab stop is settled from the DOM, because only
  the group knows whether *any* option is chosen and first run always starts with none.
- **Chosen inverts rather than tints, on a pill.** A luminance change survives both themes and
  anybody who cannot separate the two hues. A card keeps the tint, because its second line is
  `--ink-3` and a solid fill would swallow it, so it doubles its rule and shows a tick instead.
- **The states are CSS, not a `style` prop.** `.choice-btn` plus the two `[data-on]` rules in
  `globals.css`. An inline style beats a stylesheet, so a component that paints its resting
  background inline can never define a hover. That is the mechanism that made the missing hover
  unfixable in place, rather than a detail, and it is why `.choice-btn` is shared with the
  multiple-choice answers rather than copied: two sessions found the same cause the same day, and
  main's fix reached it through a custom property, which is the more precise of the two.

**A hover makes a control more present, never less.** `.choice-btn` (a bordered box: its tone comes
in through `--choice-border`/`--choice-bg` so the hover can actually win) and `.tap-tint` (a bare
row or icon button: a raised tint arrives under the pointer) replaced
`transition-opacity hover:opacity-80` on twenty-odd controls. Fading a
thing under the cursor is the one hover the rest of this interface uses for nothing else, because
dimming is exactly how every disabled control here is drawn: the strongest signal a mouse got on
those screens was the control appearing to switch off. A link may still fade, and a `<button>`
drawn as underlined text is a link wearing the right element.

`components/brand.tsx` holds **Õ**, the mascot: Estonian's most recognisable letter is already a
round face with a squiggle on top, so the mascot is that letter taken literally. It appears in
the rail, in every empty state, at the end of a session, and on the landing page. It is a
component rather than an asset so it inherits the theme and can change mood.

## 6. Routing and the landing page

Two route groups:

- `app/(app)/`: the signed-in shell, with rail, floating mobile bar, pastel wash.
- `app/(chromeless)/`: `/welcome`, `/sign-in` and `/start` (first-run setup), which own the
  whole screen and get none of that chrome. Being in this group is what decides it: the rail is
  rendered by `(app)/layout.tsx` and never has a path list to keep in sync.

`/welcome` is public (see `middleware.ts`) and is the front door for a signed-out visitor
arriving at `/`. Every Estonian form on it is read from the real dictionary and run through
`buildCaseTable()`, the same function the app uses. Nothing on that page is a mock-up, and no
Estonian form on it was typed into marketing copy by hand. If the database is unreachable it
falls back to principal parts copied verbatim from the checked seed set, and shows no derived
forms at all.

## 7. What has not changed

- Every view still implements the four states from `08-ux-ia-a11y.md` §4.
- Every interactive element is still keyboard-reachable, with a visible focus ring, now 2.5px,
  offset 3px.
- Estonian text still carries `lang="et"`, and every Estonian input still has the letter bar,
  on a desktop and for a learner who has not turned it off.
- No Estonian morphology is generated anywhere, including in decoration.

## 8. Session screens

Every practice mode (review, sprint, match, listening, sentences, speaking, dictation) wears the
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
parallel and merged. The screens that arrived from the second of those (classes, the sentence
builder, speaking, the paradigm tables, example sentences, the install prompt) were restyled
onto the primitives above rather than kept as they were: token radii instead of hand-rolled ones,
`Card` tones instead of bordered boxes, `StatTile` summaries, and `press`/`lift` on anything that
can be clicked.

One rule came out of that merge and is worth keeping: **a flex or grid item that holds text needs
`min-w-0`**. Without it the item refuses to shrink below its own content, and a single long task
title widens the whole page on a phone. The mobile sweep in `scripts/` checks for exactly this,
no horizontal overflow at 390px on any route.

## 10. Paper

`@media print` lives in `app/globals.css`, not on the one page that prints, because it is true of
every page: the rail, the mobile bar, the pastel wash and anything marked `no-print` come off, and
`page-break` starts a new sheet. A worksheet printed with a navigation rail down the side is not a
worksheet.

Two classes are the whole contract: `no-print` on screen-only controls, `page-break` where a new
sheet begins. `avoid-break` keeps an exercise from splitting across a page.

## 11. Restraint, and who it is for

Everything above is about what a thing looks like. This section is about how much of it there is,
which turned out to be the harder half.

The feedback was that the app overwhelms somebody just getting started, and it was fair on every
screen a stranger meets first. Today rendered eleven panels to everybody. The landing page ran to
ten sections before the sign-up button at the bottom. First run asked ten questions across eight
screens. The practice hub laid out thirteen modes in one flat grid, each with a two-sentence
paragraph. The desktop rail listed fifteen destinations with no grouping. None of that was wrong,
and all of it was true and useful to somebody. There was simply too much of it before the decision.

Three moves, and they are the ones to reach for again.

**Stage it.** `lib/ux/disclosure.ts` is the one table of what a screen leads with, keyed on how far
the learner has actually got. A figure computed from an empty log is not information, it is
furniture: a streak of nought, a ring at nought percent, a word of the day drawn at random from a
dictionary nobody has opened. Hold those back until they say something, and never hold back the way
in. Each stage is a superset of the one before, because a panel that appears and then disappears
reads as a fault.

**Group it.** Thirteen practice modes in one grid make the reader do the sorting. The daily loop,
the quick rounds, the five that work a named weakness and the mock paper are four groups that answer
"what should I do with the next five minutes" by their headings alone, which is what the page
claimed to do and was not doing. Same on the rail: four destinations that are the app, and the other
eleven behind one disclosure that opens itself whenever the current page is inside it.

**Fold it, do not cut it.** The comparison table on the landing page is eight checkable claims
against three real products, three of them ticks for somebody else, and deleting it to save scroll
would have been the cheapest kind of tidying: it is the block that makes the rest checkable. It is
behind its own summary now. The same applies to the walkthrough's tour, which is `/guide`, and to
the plan's working, which is on `/assess`. Nothing that was true stopped being said; it stopped
being said in the way of somebody who has not decided yet.

What none of this licenses is hiding a thing because a screen looks busy. The test is whether the
panel can say anything yet to the person in front of it. Where the answer is yes, it stays.

## 12. Voice

Everything above is what the app looks like. This is what it sounds like, and it is part of the
design system for the same reason type and colour are: it is a property of every screen, decided
once, and a screen that gets it wrong is off-system even when every token in it is right.

The standard is **warm, kind, concise, and unmistakably a person**. `docs/18-voice.md` is the full
version with worked before-and-after examples, and it is the one to read before writing a sentence
anybody will see. The short version:

**Warmth is attention, not enthusiasm.** `Six days in a row` is warmer than `Amazing work!`
because
it is about the learner and required us to have been looking. Praise adjectives and exclamation
marks are the cheap substitute and read as such.

**Kindness is where the news is bad**, which is most of the copy on any screen worth designing: the
wrong answer, the empty deck, the search that found nothing, the paper that did not pass. Say the
true thing plainly, then say what to do next. Never soften a correction into vagueness, because a
learner left unsure whether they were wrong will rehearse the error.

**Concise has no word count.** Cut anything that restates the heading, anything explaining why we
are telling them, and any sentence that exists to round the paragraph off.

**Never sound generated.** `lib/copy/voice.ts` is the one table: no em dash or en dash, no stock
openers (`It's important to note that`, `Moreover`, `In conclusion`), no inflated shapes
(`not just a rule, but a pattern`), no brochure vocabulary (`delve`, `leverage`, `seamless`, `empower`,
`embark on`, `your journey`, `a plethora of`, `whether you're a beginner or`), and no emoji. It is swept over every
reader-facing line of `app/`, `lib/`, `components/` and the README, and Anu is given the same rules
from the same table.

Two of these bind the visual system directly. **Emoji are banned because there is already an icon
system**: data that drives UI carries a lucide icon name and `components/icons.tsx` is the only
place one becomes a component, so an emoji in a heading is a second icon set with no tokens behind
it. The check is narrow on purpose, since the arrow in "Estonian to English", the return key in a
keyboard hint and the tick on the week strip are typographic glyphs in one colour doing a job no
word does as well. And **an empty cell is `NO_VALUE`**, which is "n/a" from `lib/copy/values.ts`,
never a typed dash: in a paradigm table a bare hyphen reads as a one-character form, and beside a
percentage as a minus sign whose digits failed to load.
