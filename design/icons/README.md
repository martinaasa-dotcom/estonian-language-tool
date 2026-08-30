# App icon candidates

Fourteen marks in two rounds. Run `node scripts/make-icon-candidates.mjs` to redraw them.

Numbers are stable identifiers rather than positions, so the gaps in the sequence are real:
round one proposed 01 to 10 and four survived it, round two is 11 to 20.

## Why replace what we ship

There are three marks in the tree and they do not agree with each other:
`app/icon.svg` and `public/app-icon.svg` are a face on a violet gradient, `app/apple-icon.tsx`
is an õ on the same gradient, and `scripts/make-icons.mjs` writes an õ on a flat blue that
appears nowhere in the palette. So the favicon, the iOS home screen and the Android manifest
each show a different thing.

The face is the bigger problem. Two dots and a smile is the visual grammar of a toddler app,
and nothing in it says Estonian: swap the palette and it fits a mood tracker. This is an app
for somebody sitting a state examination.

## The four kept from round one

| # | Name | What it is |
|---|---|---|
| 01 | **Kodukatus** | The ring is the o, the roof above it is its tilde, and the roof is a roof. Kodukeel is the language of the house. |
| 04 | **Tilde** | One diacritic at full size doing the whole job, and the half of õ that Õhtuleht's masthead does not own. |
| 05 | **Suitsupääsuke** | The national bird, in profile with one wing raised. Drawn from above it is an aeroplane, which cost three attempts. |
| 07 | **Laulukaar** | The song festival shell: the arch a whole country stands under to sing in a language this small. |

## The six dropped, and why

**10 Õ went first and took a rule with it.** The letterform belongs to Õhtuleht. A national
newspaper's masthead is not a thing to build a second brand on, and no amount of redrawing
gets round it. What survives is 04, the tilde on its own, which reads as Estonian without
reading as anybody's masthead.

02 Kaheksakand, 03 Lipp, 06 Rukkilill, 08 Kirivöö and 09 Vanalinn were dropped on the same
judgement: they were good marks and there were better ones, and 08 and 09 were the two that
could not survive a 20px browser tab without a second drawing.

## The ten from round two

| # | Name | What it is | 20px |
|---|---|---|---|
| 11 | **Kolm väldet** | Estonian holds a sound at three lengths and means three different words by it. | Holds |
| 12 | **Neliteist** | Fourteen cases: the first fact every learner meets, and what this app is organised around. | Holds |
| 13 | **Klint** | The Baltic limestone escarpment. The country's northern edge is a cliff, and paekivi is the national stone. | Softens |
| 14 | **Rukis** | The rye this country eats daily, and the plant the national flower is named after. | Softens |
| 15 | **Rändrahn** | Estonia has Europe's densest concentration of large glacial erratics and protects them by name. | Holds |
| 16 | **Kaali** | The meteorite crater on Saaremaa, and the place the old songs say the sun fell. | Holds |
| 17 | **Kannel** | Vanemuine's instrument, and the pun the app is named on: *keel* is a tongue, a language and a string at once. | Softens |
| 18 | **Sõnajalg** | The fern midsummer says flowers once a year and nobody has seen, drawn as the crozier before it opens. | Holds |
| 19 | **Kask** | Birch bark: the lenticels are lens shaped and never line up. | Fails |
| 20 | **Vana Toomas** | The guard on the town hall spire since 1530, the one weathervane in the country with a name. | Fails |

## What the drawing cost

Four of these took more than one attempt, and the failures are the useful record:

- **11** was first drawn as three centred bars of growing width. That is a child's ring tower,
  which is the exact thing this exercise is escaping. Laid along a line it reads as duration.
- **13** was ruled with horizontal strata and became a stack of paper; ruled with vertical
  joints it became a colonnade. It is a silhouette now and nothing else.
- **15 was the wolf**, national animal since 2018, through three redraws: a front-on mask read
  as a cat, a broader skull with shorter ears read as a fox, and the howling profile read as a
  leaf. A silhouette that needs a caption is not an app icon, so it went rather than getting a
  fourth attempt.
- **18** replaced a group of islands that read as bacteria. A freehand outline of the country
  was considered and rejected: an inaccurate map of somebody's own country is worse on an
  Estonian app than no map at all.

## Notes on choosing

**04 and 12 survive everything.** The tilde is the most confident and the least literal. The
numeral is the most legible at every size in the set and says what the app is for, though it
says nothing about Estonian to somebody who has not opened it yet.

**01 is still the only one that says the name.** Kodukeel is the language spoken at home.

**17 is the best idea and not the best drawing.** *Keel* meaning tongue, language and string
at once is the pun the whole app is named on, and no other candidate carries an argument that
good. It reads as a kannel at 112px and as a wedge at 20.

**19 and 20 are the two to be honest about.** Birch bark is a texture rather than a mark and
goes to nothing on a home screen; Vana Toomas is a figure, and a figure at 20px is a blob.

**Colour.** 01, 04, 11, 12, 18 and 19 stay inside the app's own tokens. 05 uses `--sky`. 07, 17
and 20 reach for the flag's blue. 13, 14, 15 and 16 add a limestone and a rye gold, because
limestone is not a violet and rye is not a blue. Anything below the first group means either
adding the hue to the design system deliberately or recolouring the mark onto the cornflower.

## If one is chosen

It has to land in four places at once, because that is what is wrong today:

1. `app/icon.svg` (the favicon)
2. `public/app-icon.svg` (the manifest, both `any` and `maskable`)
3. `app/apple-icon.tsx` (the iOS home screen, drawn rather than referenced)
4. `scripts/make-icons.mjs` (the PNG sizes, including the maskable variant whose glyph has to
   sit inside the middle 80% because Android crops it)

A maskable variant is a separate drawing, not a resize. 13, 15, 16 and 19 bleed to the edges
and would lose their edges to a circular launcher mask.
