#!/usr/bin/env node
/**
 * Variants of candidate 01, the roof over the o, into design/icons/kodukatus/.
 *
 * 01 and 12 are the two that survived review, and 01 is the one worth adjusting:
 * the concept is right and the drawing was generic. The mark has to carry two
 * things at once that no other candidate does. Kodukeel is the language spoken
 * at the house, so the roof is a roof; and the ring under it is the o of
 * kodukeel wearing its own tilde, which is the roof again.
 *
 * What the original got wrong is proportion rather than idea: the roof floats
 * clear of the ring with nothing tying them together, so at a glance it is a
 * chevron above a doughnut rather than one mark. Every variant below closes
 * that gap in a different way, and the last three ask what the roof should sit
 * over at all.
 *
 *   node scripts/make-kodukatus-variants.mjs
 */
import { writeFileSync } from "node:fs";


const C = {
  accent: "#7a6bf0",
  accentDeep: "#4b3fc4",
  ink: "#241f35",
  ground: "#fbf9ff",
  white: "#ffffff",
};

const wrap = (bg, body, rx = 14) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" rx="${rx}" fill="${bg}"/>
${body.trim().split("\n").map((l) => "  " + l.trim()).join("\n")}
</svg>
`;

const roof = (x0, yEave, yPeak, w, colour) =>
  `<path d="M${x0} ${yEave} L32 ${yPeak} L${64 - x0} ${yEave}" fill="none" stroke="${colour}"
        stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

/* a. Tihedam. The original's idea with the gap closed and both strokes brought
      to one weight, so it reads as one mark rather than as a chevron above a
      doughnut. */
const tihedam = wrap(
  C.ink,
  `${roof(12, 26, 9, 6.5, C.accent)}
   <circle cx="32" cy="41" r="12.5" fill="none" stroke="${C.white}" stroke-width="6.5"/>`,
);

/* c. Kirjatäht. The ring given a letter's modulation, thick at the sides and
      thin at the top and bottom, so it reads as an o and not as a ring. */
const kirjataht = wrap(
  C.ink,
  `${roof(12, 26, 9, 6.5, C.accent)}
   <path d="M32 27.5 C40 27.5 46 33.5 46 41 C46 48.5 40 54.5 32 54.5 C24 54.5 18 48.5 18 41
            C18 33.5 24 27.5 32 27.5 Z
            M32 33 C27.5 33 24.5 36.5 24.5 41 C24.5 45.5 27.5 49 32 49 C36.5 49 39.5 45.5 39.5 41
            C39.5 36.5 36.5 33 32 33 Z"
         fill="${C.white}" fill-rule="evenodd"/>`,
);

/* d. Aken. The house drawn whole with the o as the round window in the gable.
      The most literal reading of the name. */
const aken = wrap(
  C.ink,
  `<path d="M10 28 L32 9 L54 28 L54 55 L10 55 Z" fill="none" stroke="${C.accent}"
        stroke-width="5.5" stroke-linejoin="round"/>
   <circle cx="32" cy="36.5" r="7.5" fill="none" stroke="${C.white}" stroke-width="5"/>`,
);

/* e. Pööratud. The same mark on the accent rather than on the ink, since violet
      is what the rest of this app is painted with. */
const pooratud = wrap(
  C.accentDeep,
  `${roof(12, 26, 9, 6.5, C.white)}
   <circle cx="32" cy="41" r="12.5" fill="none" stroke="${C.white}" stroke-width="6.5"/>`,
);

/* g. Maja ja neliteist. The two candidates the review kept, in one mark: the
      house of the name with the number the course is built on inside it. The
      roof has eaves so it is a house rather than an arrow over a figure. */
const majaJa14 = wrap(
  C.ink,
  `<path d="M5 30 L32 8 L59 30 L59 54 L5 54 Z" fill="${C.accent}"/>
   <path d="M20 40 L26 35.5 L26 51" fill="none" stroke="${C.ink}" stroke-width="5.5"
         stroke-linecap="round" stroke-linejoin="round"/>
   <path d="M45 35.5 L35.5 48 L49 48" fill="none" stroke="${C.ink}" stroke-width="5.5"
         stroke-linecap="round" stroke-linejoin="round"/>
   <path d="M45 35.5 L45 51" fill="none" stroke="${C.ink}" stroke-width="5.5" stroke-linecap="round"/>`,
);

/* h. Katus neljateistkümnel. The same pairing the other way round: the roof of
      the name sitting on the number rather than round it. */
const katusJa14 = wrap(
  C.accentDeep,
  `<path d="M9 24 L32 8 L55 24" fill="none" stroke="${C.white}" stroke-width="6"
        stroke-linecap="round" stroke-linejoin="round"/>
   <rect x="7" y="24" width="50" height="5" rx="2.5" fill="${C.white}"/>
   <path d="M18 42 L24 37.5 L24 55" fill="none" stroke="${C.white}" stroke-width="5.5"
         stroke-linecap="round" stroke-linejoin="round"/>
   <path d="M43 37.5 L34 51 L48 51" fill="none" stroke="${C.white}" stroke-width="5.5"
         stroke-linecap="round" stroke-linejoin="round"/>
   <path d="M43 37.5 L43 55" fill="none" stroke="${C.white}" stroke-width="5.5" stroke-linecap="round"/>`,
);

const VARIANTS = [
  ["01a-tihedam", tihedam],
  ["01b-kirjataht", kirjataht],
  ["01c-aken", aken],
  ["01d-pooratud", pooratud],
  ["01e-maja-ja-14", majaJa14],
  ["01f-katus-ja-14", katusJa14],
];

for (const [name, svg] of VARIANTS) {
  const file = `design/icons/kodukatus/${name}.svg`;
  writeFileSync(file, svg);
  console.log(`${file}  ${svg.length} bytes`);
}
