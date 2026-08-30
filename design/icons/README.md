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

## Shortlist

Review has kept three: **01a Tihedam** and **01d Pooratud**, the roof over the o drawn cleanly on
the ink and on the violet, and **12 Neliteist**, the numeral. The two live in
`design/icons/kodukatus/`, drawn by `node scripts/make-kodukatus-variants.mjs`.

Four other Kodukatus adjustments were drawn and turned down. The house drawn whole was too close
to the home icon every app already has; giving the ring a letter's modulation was too quiet to
see; and the two that paired the house with the number made one mark too many out of two that
each worked alone. Two more never got that far: a ring of fourteen radial ticks read as a loading
spinner, and roof and ring joined into one closed figure read as a water droplet.

## Round three

Nine bolder marks in `design/icons/round3/`, drawn by `node scripts/make-icon-round3.mjs`. The
direction follows from what round two turned down: solid shapes, negative space, two elements at
most, and no more literal illustration.

| # | Name | What it is | Round mask |
|---|---|---|---|
| 02a | **Taidetud** | the roof as a solid gable rather than a stroke | survives |
| 02b | **Taidetud, aktsendil** | the same gable on the violet | survives |
| 02c | **Kolmnurk** | one filled gable with the o as the hole in it | trims |
| 02d | **Kolmnurk, ringiga** | the same gable with the o left as a ring | trims |
| 02e | **Mark** | the numeral as a circular badge | survives |
| 02f | **Ruut** | the numeral in the app's own corner radius | trims |
| 02g | **Negatiiv** | the numeral cut out of a disc | survives |
| 02h | **K** | the initial as a geometric monogram under its own tilde | trims |
| 02i | **K katusega** | the monogram under a roof instead of a tilde | trims |

Four were cut mid-round for reading as something else: a disc with a roof groove was a beetle, the
kept mark knocked out of a disc went muddy where the two strokes met, a ring opening to let the
roof drop in was a power button, and the tile split diagonally read as a torn corner.

The gable's corners are rounded on purpose. Sharp ones make a warning sign.

**02g is the strongest of the three numeral treatments**: cutting the figure out of a disc rather
than setting it on the tile gives it an edge to sit against, and it comes through a launcher mask
whole. **02h is the only mark here that is not a variation on something already seen**, and the
only one that would also work as a wordmark's initial.

## Round four

The first three rounds were the same drawing three times: a flat geometric pictogram, one or two
elements, on a solid rounded tile, in the app's violet. Every variation happened inside that frame,
which is why they converged.

Round four changes the frame instead of the mark. Thirteen in `design/icons/round4/`, drawn by
`node scripts/make-icon-round4.mjs`. No roof, no ring, no numeral, no K, and no violet on four of
them.

| # | Name | Made of | What it is |
|---|---|---|---|
| 03a | **Aken** | depth | a lit window on a dark street |
| 03k | **Uks** | depth | a door left ajar with the light coming out |
| 03b | **Horisont** | atmosphere | the flag as sky, soil and snow rather than as three bars |
| 03e | **Tomme** | material | the o drawn with a nib on paper, not with a compass |
| 03l | **Kolm silmust** | craft | three rings woven over and under, in the flag's colours |
| 03c | **Solm** | craft | the same weave with two rings, warmer |
| 03m | **Taht, sinisel** | type | one letterform four times too big for the tile, cropped by it |
| 03f | **Taht** | type | the same crop on a red the app has no claim to |
| 03i | **Vahe** | negative space | a solid field split once, the gap being the mark |
| 03d | **Laine** | rhythm | arcs going out at the intervals a card comes back at |
| 03g | **Kiri** | texture | a writing system seen from too far to read |
| 03h | **Kihid** | light | three planes of coloured glass, colour from the overlaps |
| 03j | **Orb** | light | no drawing at all, only a sphere lit from one side |

Three were reworked mid-round. The ink stroke was a swoosh with a stray dot beside it and became a
hand-drawn ring. The writing texture was seven rows of small marks and read as a keyboard, so it is
four rows of large ones. The split had three paths fighting each other and is one clean slanted gap.

**The four worth arguing for.** 03a and 03k are the only marks in four rounds that draw the reader
rather than the language, and the app's own design notes describe exactly that person: one person,
alone, most evenings, usually tired. 03e is the only candidate at any point that looks made by a
hand rather than by a script. 03l is the only one that would survive being embroidered, printed in
one colour, or cut in vinyl. 03b is how the flag is actually explained to Estonian children.

**The cost is real and worth naming.** Nine of the thirteen are not flat fills and four leave the
violet entirely. Adopting one means widening the design system rather than picking from it, and a
gradient mark needs its maskable variant checked separately because the launcher crops to a circle.

## Round five

The horizon and the page of writing were the two of round four that landed, and the gradient
underneath the first one was what was wrong with it. Round four had reached for depth because three
rounds of flat pictograms had converged, and that was the wrong lever: the problem was the subject
matter, not the finish.

So round five keeps the subjects and drops the rendering. Ten in `design/icons/round5/`, drawn by
`node scripts/make-icon-round5.mjs`, and there is not a gradient, a glow or a soft edge among them.

| # | Name | About | What it is |
|---|---|---|---|
| 04a | **Horisont** | landscape | the flag as sky, soil and snow, in hard bands |
| 04b | **Horisont, oo** | landscape | the same country in the half of the year it is dark |
| 04c | **Vali** | landscape | the soil down to a line between sky and snow |
| 04i | **Kaldu** | landscape | the three colours pitched off the horizontal |
| 04j | **Vagu** | landscape | a ploughed field from where you stand in it |
| 04d | **Kiri** | the page | Estonian seen from too far to read |
| 04e | **Kiri, tume** | the page | the same page at the hour it is usually read |
| 04f | **Uks sona** | the page | the same page with one word lit |
| 04g | **Lehekulg** | the page | the rows go pale down the page: read, and not yet |
| 04h | **Tabel** | the system | fourteen cells, one filled |

Three were reworked before they were shown. The lit word was too narrow to read as a word. The
fourteen cells were too small to count. And the furrows were parallel, which is a barcode; converging,
they are a field.

**04f is the one worth arguing hardest for.** Five rounds have drawn the language, the country and
the alphabet. This is the first that draws *learning* it, and the only mark in any round that could
not belong to some other app.

**04j gets to use both meanings of one word.** *Kiri* means writing and it means pattern, and a
ploughed field running away from you is a page of lines running away from you.
