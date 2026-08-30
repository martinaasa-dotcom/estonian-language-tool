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

/* 01a. Tihedam. The original's idea with the gap closed and both strokes brought
      to one weight, so it reads as one mark rather than as a chevron above a
      doughnut. */
const tihedam = wrap(
  C.ink,
  `${roof(12, 26, 9, 6.5, C.accent)}
   <circle cx="32" cy="41" r="12.5" fill="none" stroke="${C.white}" stroke-width="6.5"/>`,
);

/* 01d. Pööratud. The same mark on the accent rather than on the ink, since violet
      is what the rest of this app is painted with. */
const pooratud = wrap(
  C.accentDeep,
  `${roof(12, 26, 9, 6.5, C.white)}
   <circle cx="32" cy="41" r="12.5" fill="none" stroke="${C.white}" stroke-width="6.5"/>`,
);

const VARIANTS = [
  ["01a-tihedam", tihedam],
  ["01d-pooratud", pooratud],
];

for (const [name, svg] of VARIANTS) {
  const file = `design/icons/kodukatus/${name}.svg`;
  writeFileSync(file, svg);
  console.log(`${file}  ${svg.length} bytes`);
}
