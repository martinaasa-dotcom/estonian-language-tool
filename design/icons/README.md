# App icon candidates

Ten replacements for the mark the app currently ships. Run
`node scripts/make-icon-candidates.mjs` to redraw them.

## Why replace it

There are three marks in the tree and they do not agree with each other:
`app/icon.svg` and `public/app-icon.svg` are a face on a violet gradient, `app/apple-icon.tsx`
is an õ on the same gradient, and `scripts/make-icons.mjs` writes an õ on a flat blue that
appears nowhere else in the palette. So the favicon, the iOS home screen and the Android
manifest each show a different thing.

The face is the bigger problem. Two dots and a smile is the visual grammar of a toddler app,
and nothing in it says Estonian: swap the palette and it fits a mood tracker. This is an app
for somebody sitting a state examination.

Every candidate below is drawn from something the language or the country actually owns, and
every one is checked at 20px as well as at 512, which is where the first drafts died.

## The ten

| # | Name | What it is | Reads at 20px |
|---|---|---|---|
| 01 | **Kodukatus** | The ring is the o, the roof above it is its tilde, and the roof is a roof. Kodukeel is the language of the house. | Yes |
| 02 | **Kaheksakand** | The eight-pointed star off every woven belt in the country, and the one folk motif a stranger still reads as a mark. | Yes |
| 03 | **Lipp** | Blue, black and white in the flag's own order, set as three bars that lengthen downward, which is also what a course looks like. | Yes |
| 04 | **Tilde** | One diacritic at full size doing the whole job. Nobody mistakes õ's tilde for anybody else's language. | Yes, best of the set |
| 05 | **Suitsupääsuke** | The national bird, in profile with one wing raised. Drawn from above it is an aeroplane, which cost three attempts. | Yes |
| 06 | **Rukkilill** | The national flower, six frilled petals. The palette is already named after it. | Softens to a dot |
| 07 | **Laulukaar** | The song festival shell: the arch a whole country stands under to sing in a language this small. | Yes |
| 08 | **Kirivöö** | The belt the star came off, one band of it. | No, goes to mush |
| 09 | **Vanalinn** | Oleviste's spire over two gables, the shape on every postcard. | Weakly, a white blob |
| 10 | **Õ** | The letter, set as a ring under its own tilde, at full height. | Yes |

## Notes on choosing

**04 and 10 are the two that survive everything.** The tilde alone is the most confident and the
least literal; the full õ is the most legible as "this is an Estonian app" to somebody who has
never seen the app before. If one mark has to carry the favicon, both apple and manifest icons
and a 20px browser tab, it is one of those two.

**01 is the only one that says what the app is called.** Kodukeel means the language spoken at
home, and nothing else here reaches for the name.

**08 and 09 are the two to be honest about.** The belt band is beautiful at 512 and unreadable
on a home screen; the spire is a white shape at tab size. Either would need a simplified small
variant, which means two drawings and the drift that comes with them.

**Colour.** 01, 02, 04 and 06 stay inside the app's own palette (`--accent`, `--accent-deep`,
`--ink`, `--ground`). 03, 07, 08, 09 and 10 reach for the flag's blue, which is outside the
design system: adopting one of those means either adding the hue to the palette deliberately or
recolouring the mark onto the cornflower. 05 uses `--sky`, which the system already has.

## If one is chosen

It has to land in four places at once, because that is what is wrong today:

1. `app/icon.svg` (the favicon)
2. `public/app-icon.svg` (the manifest, both `any` and `maskable`)
3. `app/apple-icon.tsx` (the iOS home screen, drawn rather than referenced)
4. `scripts/make-icons.mjs` (the PNG sizes, including the maskable variant whose glyph has to
   sit inside the middle 80% because Android crops it)

A maskable variant is a separate drawing, not a resize. 02, 06 and 08 bleed to the edges and
would lose their outer points to a circular launcher mask.
