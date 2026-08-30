#!/usr/bin/env node
/**
 * A third round of marks, into design/icons/round3/.
 *
 * Review has now kept three: 01a Tihedam and 01d Pööratud, which are the roof
 * over the o drawn cleanly on the ink and on the accent, and 12 Neliteist, the
 * numeral. What it turned down says as much as what it kept. The house drawn
 * whole was too close to the home icon every app already has; the letterform
 * modulation was too quiet to see; and pairing the house with the number made
 * one mark too many out of two that each worked alone.
 *
 * So the direction is bolder rather than fussier: solid shapes, negative space,
 * and two elements at most. Every mark below is one of the three kept ideas
 * pushed somewhere it has not been, and colour is swappable on all of them.
 *
 *   node scripts/make-icon-round3.mjs
 */
import { writeFileSync } from "node:fs";

const C = {
  accent: "#7a6bf0",
  accentDeep: "#4b3fc4",
  ink: "#241f35",
  white: "#ffffff",
};

const wrap = (bg, body, rx = 14) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" rx="${rx}" fill="${bg}"/>
${body.trim().split("\n").map((l) => "  " + l.trim()).join("\n")}
</svg>
`;

/* The numeral, as one function, so the badge and the cut-out cannot drift. */
const fourteen = (colour, w = 5.5, top = 22, bottom = 44) => {
  const mid = top + (bottom - top) * 0.62;
  // Shifted left by 2.5: the two glyphs span 19.5 to 49.5 about their own
  // strokes, so drawn at their nominal x they sit two and a half units right
  // of the disc they are meant to be centred in.
  return `<g transform="translate(-2.5,0)">
   <path d="M22 ${top + 4} L27.5 ${top} L27.5 ${bottom}" fill="none" stroke="${colour}"
        stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>
   <path d="M43 ${top} L34.5 ${mid} L47 ${mid}" fill="none" stroke="${colour}"
        stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>
   <path d="M43 ${top} L43 ${bottom}" fill="none" stroke="${colour}"
        stroke-width="${w}" stroke-linecap="round"/>
   </g>`;
};

/* a. Täidetud. The roof as a solid gable rather than a stroke, which gives the
      mark a weight the two thin strokes never had. */
const taidetud = wrap(
  C.ink,
  `<path d="M32 7 L56 27 L47.5 27 L32 15.5 L16.5 27 L8 27 Z" fill="${C.accent}"/>
   <circle cx="32" cy="42" r="12.5" fill="none" stroke="${C.white}" stroke-width="7"/>`,
);

/* e. Kolmnurk. The roof taken to its limit: one filled gable with the o as the
      hole in it. Two shapes, no strokes, nothing to lose at any size. */
const kolmnurk = wrap(
  C.ink,
  `<path d="M32 12 L53 47 L11 47 Z" fill="${C.accent}" stroke="${C.accent}" stroke-width="10"
         stroke-linejoin="round"/>
   <circle cx="32" cy="37" r="9.5" fill="${C.ink}"/>`,
);

/* g. Märk. The numeral as a badge, which is what a level or a count wants to be. */
const mark14 = wrap(
  C.accentDeep,
  `<circle cx="32" cy="32" r="24" fill="none" stroke="${C.white}" stroke-width="4.5"/>
   ${fourteen(C.white, 5, 21, 43)}`,
);

/* h. Negatiiv. The numeral cut out of a disc instead of drawn on the tile. */
const negatiiv = wrap(
  C.ink,
  `<circle cx="32" cy="32" r="25" fill="${C.accent}"/>
   ${fourteen(C.ink, 5.5, 20, 44)}`,
);

/* i. K. The initial as a geometric monogram under its own tilde: Estonian
      without reaching for the letterform a newspaper already owns. */
const kMonogramm = wrap(
  C.accentDeep,
  `<path d="M16 15 C20 9 25 9 29 14 C33 19 38 19 42 12" fill="none" stroke="${C.white}"
         stroke-width="5.5" stroke-linecap="round"/>
   <path d="M21 24 L21 55" fill="none" stroke="${C.white}" stroke-width="7" stroke-linecap="round"/>
   <path d="M45 24 L24 39.5" fill="none" stroke="${C.white}" stroke-width="7" stroke-linecap="round"/>
   <path d="M24 39.5 L46 55" fill="none" stroke="${C.white}" stroke-width="7" stroke-linecap="round"/>`,
);

/* k. Kolmnurk, ringiga. The same gable with the o left as a ring rather than a
      hole, so the letter is still a letter. */
const kolmnurkRing = wrap(
  C.ink,
  `<path d="M32 12 L53 47 L11 47 Z" fill="${C.accent}" stroke="${C.accent}" stroke-width="10"
         stroke-linejoin="round"/>
   <circle cx="32" cy="37" r="9" fill="none" stroke="${C.ink}" stroke-width="5.5"/>`,
);

/* l. K katusega. The monogram under a roof instead of a tilde, since the roof is
      the half of this idea the review kept twice. */
const kKatusega = wrap(
  C.ink,
  `<path d="M17 19 L32 8 L47 19" fill="none" stroke="${C.accent}" stroke-width="6"
         stroke-linecap="round" stroke-linejoin="round"/>
   <path d="M21 27 L21 56" fill="none" stroke="${C.white}" stroke-width="7" stroke-linecap="round"/>
   <path d="M45 27 L24 41" fill="none" stroke="${C.white}" stroke-width="7" stroke-linecap="round"/>
   <path d="M24 41 L46 56" fill="none" stroke="${C.white}" stroke-width="7" stroke-linecap="round"/>`,
);

/* m. Täidetud, aktsendil. The solid gable on the violet the app is painted with,
      which is the colour swap the review kept last time. */
const taidetudAktsendil = wrap(
  C.accentDeep,
  `<path d="M32 7 L56 27 L47.5 27 L32 15.5 L16.5 27 L8 27 Z" fill="${C.white}"/>
   <circle cx="32" cy="42" r="12.5" fill="none" stroke="${C.white}" stroke-width="7"/>`,
);

/* n. Ruut. The numeral in the app's own corner radius rather than in a circle,
      so the badge matches every card in the interface. */
const ruut14 = wrap(
  C.accentDeep,
  `<rect x="9" y="9" width="46" height="46" rx="13" fill="none" stroke="${C.white}" stroke-width="4.5"/>
   ${fourteen(C.white, 5, 21, 43)}`,
);

const ROUND3 = [
  ["02a-taidetud", taidetud],
  ["02b-taidetud-aktsendil", taidetudAktsendil],
  ["02c-kolmnurk", kolmnurk],
  ["02d-kolmnurk-ringiga", kolmnurkRing],
  ["02e-mark-14", mark14],
  ["02f-ruut-14", ruut14],
  ["02g-negatiiv", negatiiv],
  ["02h-k-monogramm", kMonogramm],
  ["02i-k-katusega", kKatusega],
];

for (const [name, svg] of ROUND3) {
  const file = `design/icons/round3/${name}.svg`;
  writeFileSync(file, svg);
  console.log(`${file}  ${svg.length} bytes`);
}
