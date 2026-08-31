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

## Round six: the abstract pivot

Five rounds branded around three things and only three: the country's symbols, the letter and the
number, and the landscape. Round six drops all of them and brands around what the app does to a
person over a year. Ten in `design/icons/round6/`, drawn by `node scripts/make-icon-round6.mjs`,
flat throughout.

Aastarongad (a cut log, one ring a year), Kontuur (contour lines), Tempel (the state stamp, since
the examination is why people come), Malu (a form dissolving at one edge, which is the forgetting
curve the scheduler exists to fight), Syvis (a core drilled out and read downward), Suur Vanker
(the Plough), Rada (a route across open ground), Solmed (a knot tied for each thing counted), Kuu
faasid (the same face differently lit, coming back), and Prisma (one form goes in, fourteen come
out, which is the single sentence that explains Estonian to somebody who has never met a case).

## Round seven: animals

Ten in `design/icons/round7/`, drawn by `node scripts/make-icon-round7.mjs`.

Estonia's list is short and three of it are unusually good for a mark. The **lendorav**, the
Siberian flying squirrel, survives in the European Union in this country and Finland and nowhere
else. The **ilves** has one of the densest lynx populations in Europe here. And there are around
nine hundred brown bears, also among the densest.

**The risk is the whole reason this exercise started.** The mark being replaced is a face and it
reads as an app for toddlers; a cute animal is one step from exactly that. So every face here is
geometric and none of them smiles: round eyes, no mouth, no brows, no blush. Three carry no face at
all, to make the cost of the face visible rather than arguable.

| # | Animal | Reads as |
|---|---|---|
| 06g | **Karu** | reads instantly, clearest at every size |
| 06i | **Viigerhyljes** | reads instantly |
| 06e | **Ilves, korvad** | the most brand-like: tufts, two flat eyes, no glint |
| 06d | **Ilves** | reads as a lynx, once the tufts and ruff are drawn hard |
| 06f | **Ilves, istumas** | reads as a lynx |
| 06h | **Siil** | reads instantly |
| 06j | **Suitsupaasuke** | reads as a bird |
| 06a | **Lendorav** | reads as a panda |
| 06b | **Lendorav, libisemas** | does not read |
| 06c | **Lendorav, ilma naota** | does not read |

**The lendorav is the best story and the worst drawing.** It is the most Estonian animal available
and it would not read: face on it is a panda, gliding it is a blob, and with the eyes removed it is
nothing at all. The third one is kept deliberately, as the measure of what the face is doing.

**The lynx needed its tufts.** The first attempt was a tabby. Long ear tufts and a flared cheek
ruff are the only two things separating a lynx from a house cat, so both are drawn hard.

The wolf, national animal since 2018, is absent. It was drawn three times in round one and read as
a cat, then a fox, then a leaf.

## Round eight: on the palette

Review kept three animals, the bear, the seal and the hedgehog, and asked for the hedgehog to be
drawn differently. Twelve in `design/icons/round8/`, drawn by `node scripts/make-icon-round8.mjs`.

**Every colour comes out of `app/globals.css` and nowhere else.** The animal is `--accent`, which
the design system calls the app's own voice, and the field is `--ink` or `--ground`, with
`--accent-soft` and `--accent-deep` as the secondary tones. A mark is one hue at three depths
rather than a palette of its own. The first pass used an invented `#4b3fc4` for the deep tone; the
real `--accent-deep` is `#5b4bd6` and that is what ships.

**The one place the palette pushes back.** The five hues carry fixed meanings: mint is recalled,
peach is missed, butter is nearly, sky is easy, blush is Anu. An icon is not a chip and not a tile,
so nothing here breaks a rule, but a seal on a sky field still borrows a colour that means
something six screens away. The accent is the only hue whose meaning is simply "this app", so every
mark leads with it and `07k` is labelled as the exception.

| # | Mark | Reads as |
|---|---|---|
| 07a | **Siil, kerra** | the strongest of the set: curled, geometric before it is an animal |
| 07e | Siil, kerra, hele | the same drawing on the ground |
| 07c | Siil, teravad | the side view with the scruff taken out |
| 07b | Siil, eest | workable; the first pass gave it a jaw the width of its head |
| 07d | Siil, ilma naota | a sunrise |
| 07f-h | Karu | three arrangements of the same three tokens |
| 07i-l | Hyljes | four, of which the pale seal on solid accent is the most finished |

**Curled is the answer for the hedgehog.** It is the shape the animal is famous for, it holds at
20px where the side view softens, and the snout is load-bearing rather than decorative: without it
the ring of spines reads as a sun.

**07d is a finding rather than a candidate.** Take the face off the hedgehog and it stops being an
animal and becomes a sunrise. It is kept because it measures exactly what the face is doing across
both animal rounds.

## Round nine: the bear kept, with a flower and a bird

Review kept the karu, so it is polished here rather than replaced. Twelve in `design/icons/round9/`,
drawn by `node scripts/make-icon-round9.mjs`. Every hex is a token out of `app/globals.css`.

**Sinilill and rukkilill are two different plants**, and the request named one while the reference
showed the other, so both are drawn. **Rukkilill** is the cornflower, Centaurea cyanus, national
flower since 1968 and the plant this app's palette is already named after: `globals.css` opens by
calling the scheme "rukkilill sunrise", built around the cornflower "rather than the flag rendered
literally". **Sinilill** is Hepatica nobilis, the liverleaf, a protected spring flower and the
emblem of Estonian nature conservation. The cornflower has the stronger claim and the harder
silhouette.

**What "cuter" meant, item by item**, since it is a set of decisions rather than a mood: the head is
wider than it is tall, the ears are smaller and set into it rather than balanced on top, the muzzle
sits lower, the nose is a rounded wedge instead of an oval, and the eyes carry a glint. The default
has no mouth. One variant does, and it is labelled, because a curve under a nose is the exact
grammar of the mark this whole exercise is replacing. `08e` drops the glint, which is most of the
distance between an animal and a toy.

**The cornflower took two attempts.** Thin florets with a second ring inside them is a snowflake.
Wide trumpet florets that nearly touch, notched into points, around a solid centre, is a cornflower.

**The swallow reuses round one's profile rather than starting again.** Drawn from above a barn
swallow is an aeroplane, which was proved three times; in profile it read on the first attempt. Only
the colour, the rust throat and the pale underside are new. The throat is `--peach`, the palette's
one warm hue, which happens to be the right colour for the bird, and without it the silhouette is
just a dark bird.

**`08f` is a lockup rather than an icon.** Bear plus cornflower is the most branded thing in nine
rounds and the busiest; at 20px the bloom is a smudge. It belongs on a splash screen or a store
listing, not a home screen.

## Round ten: the name, and the bear inside it

Nine rounds drew the country, the language, the landscape and the animals, and not one of them drew
the name. Sixteen in `design/icons/round10/`, from `node scripts/make-icon-round10.mjs`. Every hex is
a token out of `app/globals.css` and nothing else.

**Kodukeel is a compound, and the second half is the pun the whole app is named on.** *Kodu* is
home. *Keel* is a tongue, a language, and the string of an instrument, all at once, and the compound
is what a mother tongue is called here: the language spoken at home. Ten marks are built on that,
one reading each, and the good ones carry both halves in a single figure rather than setting a house
next to a symbol for speech.

`10a` is a kannel, which is a soundbox shaped like a gable with strings across it. `10b` is the
house with a tail on it, so the home is the thing speaking. `10c` is a string stretched between two
posts and pulled up into a peak, where the roof and the string are one line. `10d` is the literal
reading, language living inside the home. `10e` is the hearth, a flame being a tongue in Estonian
as in English. `10f` puts the tilde on the roof. `10g` is the threshold. `10h` gives round one's
surviving roof the other half of the name. `10i` draws the whole thing in one unbroken stroke,
because the compound is one word. `10j` is `10b` inverted, the speech being the field and the home
inside it.

**Three misread the same way and the cause was one thing.** `10a` and `10d` both came back as a
document, because a house with horizontal lines in it is a note whatever the lines are meant to be.
`10d` keeps that reading, since a note is not a bad thing for a language app to be, and its lines are
ragged with a short last one so it commits to being text. `10a` had to stop being it: a nut down one
side and a bridge slanting across the strings is what makes a set of parallel lines an instrument
rather than a paragraph. It is the same lesson as the furrows in round five, where parallel was a
barcode and converging was a field.

**A bubble drawn wider than the tile is not a bubble.** `10j` and `10n` both had one running off both
edges, which crops to a band, and the launcher mask then took what was left. Both are inset now. It
is worth writing down because the tile is 64 wide and a bubble wants to be wide, so the shape argues
for exactly the thing that breaks it.

**`10f` is the second attempt at that slot and the first is cut.** A house with a speech bubble
beside it is two objects in a 64 box, which has failed every time it has been tried in this
project, and the circular mask removed the bubble outright. What replaced it uses the tilde, the one
thing that survived round one on the argument that it reads as Estonian without reading as anybody's
masthead, and as a roof ridge it is three things in one line: the diacritic, a string seen side on,
and the roof. That took two attempts of its own. **Filling the wave hid it**, because a silhouette
whose top edge undulates is a blob: there is no second edge to read the undulation against. Stroking
the tilde across a flat-topped body fixed it and broke something else, since a pale square with a
dark square in the middle of it is a save icon, so the door is narrow and runs to the floor.

**`10g` was a chapel** until the arch came out of it. An arched opening over a plinth is a nave or a
bank; a plain doorway with the line clear of the wall is a threshold. It is also the one mark here
carrying only half the name, and it is in the set as the plainest thing the name can mean.

**The risk on `10e` does not go away.** A flame inside a house is a hearth or it is a house fire, and
which one a person sees is not something the drawing can settle. Shrinking the flame and sitting it
on the floor moves it toward hearth. It is a candidate with a caveat rather than a solved mark.

### The bear

Review kept the karu across two rounds and picked the variant with a mouth, so **every bear here has
one**, which reverses the default set in round nine. That default was a caution rather than a
finding: a curve under a nose is the grammar of the mark being replaced. Having now seen both, the
mouth is what makes this bear read as an animal somebody drew rather than as a geometric exercise.
The caution still stands for whatever ships, and it is answered by everything around the mouth: no
brows, no blush, and a head sitting inside a piece of architecture rather than floating on a
coloured tile.

`10k` and `10l` put it under a roof, light ground and dark. The eaves come down past the ears rather
than clearing them, because round one's roof floated above its own mark with nothing tying the two
together and read as a chevron over a doughnut. `10m` puts it inside the house rather than under it,
clipped to the doorway, so it is a thing seen through an opening rather than a sticker on a tile.
`10n` makes the bear the thing being said. `10p` is the bear saying it, with the home as the shape
of the word.

**`10o` is the tightest fusion in the round**: the roof has no eaves of its own, because the ears are
where it ends. It took a second pass. Drawn short it was a paper hat sitting on the head; wider and
lower it visibly runs into the ears, which is the entire point of the mark and the only thing that
makes it different from `10k`.

**`10p` needed the bubble to stop being two shapes.** A house drawn inside a bubble at that size is a
blob inside a blob. The bubble *is* the house, which is one shape, and its tail lands on the bear's
ear, which is where a tail should land. It is still the busiest bear here and the first to go at
20px.

Still nothing adopted.
