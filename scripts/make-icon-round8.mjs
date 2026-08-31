#!/usr/bin/env node
/**
 * An eighth round, into design/icons/round8/. The three animals review kept,
 * put onto the app's own palette, and the hedgehog drawn again four ways.
 *
 * Every colour here comes from app/globals.css and nowhere else. The animal is
 * `--accent`, which the design system calls the app's own voice, and the field
 * is `--ink` or `--ground`. Secondary tones are `--accent-soft` and
 * `--accent-deep`, so a mark is one hue at three depths rather than a palette
 * of its own.
 *
 * One caution worth stating rather than burying. The five hues in this system
 * carry fixed meanings: mint is recalled, peach is missed, butter is nearly,
 * sky is easy, blush is Anu. An icon is not a chip and not a tile, so nothing
 * here breaks a rule, but a seal on a sky field is still borrowing a colour
 * that means something six screens away. The accent is the only hue whose
 * meaning is simply "this app", which is why every mark leads with it and the
 * two that do not are labelled.
 *
 *   node scripts/make-icon-round8.mjs
 */
import { writeFileSync } from "node:fs";

const f = (n) => Math.round(n * 100) / 100;
const rad = (d) => (d * Math.PI) / 180;

/* Straight out of app/globals.css. */
const C = {
  accent: "#7a6bf0",
  accentDeep: "#5b4bd6",
  accentSoft: "#ece9ff",
  ink: "#241f35",
  ground: "#fbf9ff",
  raised: "#f4f1fe",
  sky: "#2b93d8",
  skySoft: "#ddeffd",
  mint: "#1fb894",
};

const wrap = (bg, body, rx = 14) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs><clipPath id="t"><rect width="64" height="64" rx="${rx}"/></clipPath></defs>
  <g clip-path="url(#t)">
    <rect width="64" height="64" fill="${bg}"/>
${body.trim().split("\n").map((l) => "    " + l.trim()).join("\n")}
  </g>
</svg>
`;

const eyes = (lx, rx, y, r, fill) =>
  `<circle cx="${lx}" cy="${y}" r="${r}" fill="${fill}"/>
   <circle cx="${rx}" cy="${y}" r="${r}" fill="${fill}"/>`;

/* Spines as triangles on an arc. Short and dense reads as prickly; long and
   sparse reads as a sun, which is what the first hedgehog nearly was. */
function spines(cx, cy, r0, r1, from, to, count, fill, skip = () => false) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const a = from + ((to - from) * i) / (count - 1);
    if (skip(a)) continue;
    const w = (to - from) / count / 2.1;
    const ax = (deg, r) => `${f(cx + r * Math.cos(rad(deg)))} ${f(cy + r * Math.sin(rad(deg)))}`;
    out.push(`<path d="M${ax(a - w, r0)} L${ax(a, r1)} L${ax(a + w, r0)} Z" fill="${fill}"/>`);
  }
  return out.join("\n   ");
}

/* ------------------------------------------------ the hedgehog, four ways */

/* a. Kerra. Curled up, which is the shape a hedgehog is famous for and the only
      one that is a geometric mark before it is an animal. The snout breaks the
      ring so it cannot be read as a sun. */
const siilKerra = wrap(
  C.ink,
  `<circle cx="32" cy="32" r="21" fill="${C.accent}"/>
   ${spines(32, 32, 20, 27.5, 0, 350, 34, C.accent, (a) => a > 128 && a < 196)}
   <path d="M22 40 C17 46 11 50 4 51 C6 45 8 40 11 35 Z" fill="${C.accentSoft}"/>
   <circle cx="6" cy="49" r="2.6" fill="${C.ink}"/>
   <circle cx="19.5" cy="38.5" r="3.2" fill="${C.ink}"/>`,
);

/* b. Eest. Front on, so the spines are a crown and the face sits under them. */
const siilEest = wrap(
  C.ink,
  `${spines(32, 38, 19, 25.5, 190, 350, 15, C.accent)}
   <ellipse cx="32" cy="38" rx="19.5" ry="17.5" fill="${C.accent}"/>
   <ellipse cx="32" cy="48" rx="9" ry="6.5" fill="${C.accentSoft}"/>
   ${eyes(24, 36, 40, 4.2, C.ink)}
   <ellipse cx="32" cy="46" rx="3" ry="2.4" fill="${C.accentDeep}"/>`,
);

/* c. Teravad. The side view the last round drew, with the scruff taken out and
      the spines cut as clean triangles on one arc. */
const siilTeravad = wrap(
  C.ink,
  `${spines(37, 44, 17, 27, 186, 348, 15, C.accent)}
   <path d="M54 44 C54 34 47 27 37 27 C27 27 20 34 20 44 Z" fill="${C.accent}"/>
   <path d="M20 44 C20 37 23 32 28 29 L9 37 C6 38.5 6 42.5 9 44 Z" fill="${C.accentSoft}"/>
   <circle cx="9.5" cy="40.5" r="2.4" fill="${C.ink}"/>
   <circle cx="21" cy="36" r="3.2" fill="${C.ink}"/>
   <rect x="8" y="44" width="48" height="4" rx="2" fill="${C.accentDeep}"/>`,
);

/* d. Ilma näota. The same dome with the face removed. It is kept because of
      what it turned into rather than in spite of it: with no snout and no eye
      the spines stop being spines and the whole thing reads as a sunrise. That
      is the clearest measure in either animal round of what the face is
      actually doing, and it is a decent mark for something else entirely. */
const siilVaikne = wrap(
  C.ground,
  `${spines(32, 46, 20, 30, 184, 356, 17, C.accentDeep)}
   <path d="M52 46 C52 35 43 27 32 27 C21 27 12 35 12 46 Z" fill="${C.accentDeep}"/>
   <rect x="8" y="46" width="48" height="4.5" rx="2.25" fill="${C.accentDeep}"/>`,
);

/* ------------------------------------------------- bear and seal, recoloured */

const bear = (bg, coat, snout, eye) =>
  wrap(
    bg,
    `<circle cx="15" cy="16" r="9" fill="${coat}"/>
   <circle cx="49" cy="16" r="9" fill="${coat}"/>
   <circle cx="15" cy="16" r="4.2" fill="${snout}"/>
   <circle cx="49" cy="16" r="4.2" fill="${snout}"/>
   <ellipse cx="32" cy="35" rx="23" ry="21" fill="${coat}"/>
   <ellipse cx="32" cy="43" rx="11" ry="8.5" fill="${snout}"/>
   ${eyes(23, 41, 30, 4.4, eye)}
   <ellipse cx="32" cy="39" rx="4" ry="3" fill="${eye}"/>`,
  );

const seal = (bg, coat, detail, eye) =>
  wrap(
    bg,
    `<ellipse cx="32" cy="38" rx="24" ry="21" fill="${coat}"/>
   <path d="M10 46 C4 48 2 54 6 57 C10 59 15 55 15 50 Z" fill="${coat}"/>
   <path d="M54 46 C60 48 62 54 58 57 C54 59 49 55 49 50 Z" fill="${coat}"/>
   ${eyes(23, 41, 34, 5.4, eye)}
   <ellipse cx="32" cy="44" rx="3.6" ry="2.8" fill="${detail}"/>
   <path d="M20 47 L11 45 M20 49 L11 50 M44 47 L53 45 M44 49 L53 50"
         stroke="${detail}" stroke-width="1.4" stroke-linecap="round"/>`,
  );

const ROUND8 = [
  ["07a-siil-kerra", siilKerra],
  ["07b-siil-eest", siilEest],
  ["07c-siil-teravad", siilTeravad],
  ["07d-siil-ilma-naota", siilVaikne],
  ["07e-siil-kerra-hele", wrap(
    C.ground,
    `<circle cx="32" cy="32" r="21" fill="${C.accent}"/>
   ${spines(32, 32, 20, 27.5, 0, 350, 34, C.accent, (a) => a > 128 && a < 196)}
   <path d="M22 40 C17 46 11 50 4 51 C6 45 8 40 11 35 Z" fill="${C.accentDeep}"/>
   <circle cx="6" cy="49" r="2.6" fill="${C.ground}"/>
   <circle cx="19.5" cy="38.5" r="3.2" fill="${C.ink}"/>`,
  )],

  /* The bear on the ink, on the ground, and tone on tone. */
  ["07f-karu-ink", bear(C.ink, C.accent, C.accentSoft, C.ink)],
  ["07g-karu-ground", bear(C.ground, C.accent, C.accentSoft, C.ink)],
  ["07h-karu-toonid", bear(C.accentSoft, C.accentDeep, C.accentSoft, C.ink)],

  /* The seal pale on the accent, which is the closest the palette gets to an
     animal that is actually white. */
  ["07i-hyljes-accent", seal(C.accent, C.accentSoft, C.accent, C.ink)],
  ["07j-hyljes-ink", seal(C.ink, C.accent, C.accentDeep, C.ink)],
  /* Labelled: sky already means "easy, new, reference" six screens away. */
  ["07k-hyljes-sky", seal(C.sky, C.skySoft, C.sky, C.ink)],
  ["07l-hyljes-ground", seal(C.ground, C.accent, C.accentDeep, C.ink)],
];

for (const [name, out] of ROUND8) {
  const file = `design/icons/round8/${name}.svg`;
  writeFileSync(file, out);
  console.log(`${file}  ${out.length} bytes`);
}
