#!/usr/bin/env node
/**
 * A seventh round, into design/icons/round7/. Animals.
 *
 * Estonia's own list is short and two of it are unusually good for a mark. The
 * lendorav, the Siberian flying squirrel, survives in the European Union in
 * this country and Finland and nowhere else, and it is built out of exactly the
 * things a mark wants: one round head, two round ears and two enormous eyes.
 * The ilves has one of the densest populations in Europe here, and its ear
 * tufts are a silhouette nothing else owns.
 *
 * One thing to be careful of, because it is the reason this whole exercise
 * started. The mark being replaced is a face, and it reads as an app for
 * toddlers. An animal can go the same way in one step. So the faces here are
 * geometric and none of them smiles: round eyes, no mouth, no blush, no
 * eyebrows. Three of the ten carry no face at all, to show what the same idea
 * costs and buys.
 *
 * The wolf is not here. It was tried three times in an earlier round, read as a
 * cat, then a fox, then a leaf, and nothing about being asked again would make
 * a wolf silhouette legible at 20px.
 *
 *   node scripts/make-icon-round7.mjs
 */
import { writeFileSync } from "node:fs";

const C = {
  cream: "#f4ecdd",
  ink: "#241f35",
  night: "#141a2b",
  squirrel: "#9aa3b8",
  squirrelDark: "#5c6480",
  lynx: "#d18b4a",
  lynxDark: "#8a5322",
  bear: "#7a5236",
  hog: "#8a7a63",
  seal: "#dfe6ee",
  sky: "#2b93d8",
  swallow: "#1f2a44",
  accent: "#7a6bf0",
  white: "#ffffff",
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

/* Two round eyes, and nothing else. No mouth, no brows, no cheeks: that is the
   whole distance between a cute animal and the mark this is replacing. */
const eyes = (lx, rx, y, r, fill, glint = true) =>
  `<circle cx="${lx}" cy="${y}" r="${r}" fill="${fill}"/>
   <circle cx="${rx}" cy="${y}" r="${r}" fill="${fill}"/>` +
  (glint
    ? `\n   <circle cx="${lx + r * 0.32}" cy="${y - r * 0.34}" r="${r * 0.3}" fill="#ffffff"/>
   <circle cx="${rx + r * 0.32}" cy="${y - r * 0.34}" r="${r * 0.3}" fill="#ffffff"/>`
    : "");

/* a. Lendorav, näoga. The one animal the European Union has here and in Finland
      and nowhere else, and the eyes are two thirds of the drawing already. */
const lendoravNagu = wrap(
  C.cream,
  `<path d="M32 10 C20 10 9 19 9 32 C9 46 19 56 32 56 C45 56 55 46 55 32 C55 19 44 10 32 10 Z"
         fill="${C.squirrel}"/>
   <circle cx="15" cy="16" r="7.5" fill="${C.squirrel}"/>
   <circle cx="49" cy="16" r="7.5" fill="${C.squirrel}"/>
   <circle cx="15" cy="16" r="3.6" fill="${C.squirrelDark}"/>
   <circle cx="49" cy="16" r="3.6" fill="${C.squirrelDark}"/>
   ${eyes(23, 41, 33, 8, C.ink)}
   <path d="M32 44 L28 40 L36 40 Z" fill="${C.squirrelDark}"/>`,
);

/* b. Lendorav, libisemas. Seen from below crossing a gap between two trees,
      which is the only time anybody sees one. The membrane stretched between
      wrist and ankle is the whole animal; without it this is a hippopotamus,
      which is what the first attempt was. */
const glideBody = `<path d="M32 23 C21 23 11 26 6 31 C3 35 5 39 9 41 L17 45 C22 47.5 27 48.5 32 48.5
            C37 48.5 42 47.5 47 45 L55 41 C59 39 61 35 58 31 C53 26 43 23 32 23 Z"/>
   <circle cx="6.5" cy="30" r="3.6"/>
   <circle cx="57.5" cy="30" r="3.6"/>
   <circle cx="16" cy="46" r="3.6"/>
   <circle cx="48" cy="46" r="3.6"/>
   <ellipse cx="32" cy="56" rx="9.5" ry="6"/>
   <circle cx="32" cy="16" r="8.5"/>
   <circle cx="25" cy="9.5" r="4.2"/>
   <circle cx="39" cy="9.5" r="4.2"/>`;
const lendoravGlide = wrap(
  C.night,
  `<g fill="${C.squirrel}">${glideBody}</g>
   ${eyes(27, 37, 16, 4.2, C.ink)}`,
);

/* c. Lendorav, ilma näota. The same glide with the eyes taken out, so what the
      face costs and buys is visible rather than argued about. */
const lendoravVaikne = wrap(
  C.cream,
  `<g fill="${C.squirrelDark}">${glideBody}</g>`,
);

/* d. Ilves, näoga. One of the densest lynx populations in Europe is here. The
      long ear tufts and the flared cheek ruff are the only two things keeping
      this off a house cat, so both are drawn hard. */
const ilvesNagu = wrap(
  C.cream,
  `<path d="M20 3 L23 15 L18.5 14 Z" fill="${C.lynxDark}"/>
   <path d="M44 3 L41 15 L45.5 14 Z" fill="${C.lynxDark}"/>
   <path d="M13 24 L20 7 L28 18 Z" fill="${C.lynx}"/>
   <path d="M51 24 L44 7 L36 18 Z" fill="${C.lynx}"/>
   <path d="M14 25 C14 16 22 11 32 11 C42 11 50 16 50 25 C50 31 48 35 45 38
            L54 42 L45 43 L50 49 L38 46 C36 47.5 34 48 32 48 C30 48 28 47.5 26 46
            L14 49 L19 43 L10 42 L19 38 C16 35 14 31 14 25 Z" fill="${C.lynx}"/>
   ${eyes(24, 40, 27, 6.2, C.ink)}
   <path d="M32 37 L28 33 L36 33 Z" fill="${C.lynxDark}"/>`,
);

/* e. Ilves, kõrvad. Reduced until only the tufts and two eyes are left, which
      is as far as this goes before it stops being a lynx and starts being a cat. */
const ilvesKorvad = wrap(
  C.ink,
  `<path d="M19 4 L22 16 L17 15 Z" fill="${C.lynx}"/>
   <path d="M45 4 L42 16 L47 15 Z" fill="${C.lynx}"/>
   <path d="M15 26 L21 8 L29 20 Z" fill="${C.lynx}"/>
   <path d="M49 26 L43 8 L35 20 Z" fill="${C.lynx}"/>
   <path d="M32 17 C43 17 51 25 51 35 C51 42 47 47 42 50 L48 54 L37 52
            C35 52.5 33.5 52.7 32 52.7 C30.5 52.7 29 52.5 27 52 L16 54 L22 50
            C17 47 13 42 13 35 C13 25 21 17 32 17 Z" fill="${C.lynx}"/>
   ${eyes(24, 40, 33, 5.4, C.ink, false)}`,
);

/* f. Ilves, istumas. A whole animal rather than a head, at the proportions a
      young one actually has: the head is most of it. */
const ilvesIstub = wrap(
  C.cream,
  `<path d="M40 52 C40 44 46 40 52 42 C57 44 58 50 56 56 L38 56 Z" fill="${C.lynxDark}"/>
   <path d="M22 34 C22 26 42 26 42 34 L46 56 L18 56 Z" fill="${C.lynx}"/>
   <path d="M13 22 L15 8 L23 18 Z" fill="${C.lynxDark}"/>
   <path d="M43 22 L41 8 L33 18 Z" fill="${C.lynxDark}"/>
   <ellipse cx="28" cy="24" rx="17" ry="15" fill="${C.lynx}"/>
   ${eyes(21, 35, 23, 4.8, C.ink)}
   <path d="M28 32 L25 28.5 L31 28.5 Z" fill="${C.lynxDark}"/>`,
);

/* g. Karu. Around nine hundred brown bears here, which is among the densest in
      Europe, and a bear reduces to three circles. */
const karu = wrap(
  C.cream,
  `<circle cx="15" cy="16" r="9" fill="${C.bear}"/>
   <circle cx="49" cy="16" r="9" fill="${C.bear}"/>
   <circle cx="15" cy="16" r="4.2" fill="#4d3220"/>
   <circle cx="49" cy="16" r="4.2" fill="#4d3220"/>
   <ellipse cx="32" cy="35" rx="23" ry="21" fill="${C.bear}"/>
   <ellipse cx="32" cy="43" rx="11" ry="8.5" fill="#c9a382"/>
   ${eyes(23, 41, 30, 4.4, C.ink)}
   <ellipse cx="32" cy="39" rx="4" ry="3" fill="#3a2617"/>`,
);

/* h. Siil. Not rare and not national, but the animal every Estonian child is
      read a book about, and a dome of spines is a mark before it is a hedgehog. */
const siil = wrap(
  C.cream,
  `${Array.from({ length: 13 }, (_, i) => {
    const a = Math.PI + (i * Math.PI) / 12;
    const cx = 36 + 25 * Math.cos(a);
    const cy = 42 + 25 * Math.sin(a);
    return `<path d="M${(36 + 17 * Math.cos(a)).toFixed(1)} ${(42 + 17 * Math.sin(a)).toFixed(1)}
        L${cx.toFixed(1)} ${cy.toFixed(1)} L${(36 + 17 * Math.cos(a + 0.22)).toFixed(1)} ${(42 + 17 * Math.sin(a + 0.22)).toFixed(1)} Z"
        fill="${C.hog}"/>`;
  }).join("\n   ")}
   <path d="M36 25 C48 25 55 32 55 42 L17 42 C17 32 24 25 36 25 Z" fill="${C.hog}"/>
   <path d="M17 42 C17 34 21 29 27 27 L14 33 L6 40 C8 42 12 42 17 42 Z" fill="#c2ac8e"/>
   <circle cx="9" cy="38" r="2.6" fill="${C.ink}"/>
   <circle cx="20" cy="34" r="3.2" fill="${C.ink}"/>
   <circle cx="21" cy="33" r="1" fill="#ffffff"/>`,
);

/* i. Viigerhüljes. The Baltic ringed seal breeds on the ice off Estonia's own
      islands, and a seal pup is a circle with two eyes in it. */
const hyljes = wrap(
  C.sky,
  `<ellipse cx="32" cy="38" rx="24" ry="21" fill="${C.seal}"/>
   <path d="M10 46 C4 48 2 54 6 57 C10 59 15 55 15 50 Z" fill="${C.seal}"/>
   <path d="M54 46 C60 48 62 54 58 57 C54 59 49 55 49 50 Z" fill="${C.seal}"/>
   ${eyes(23, 41, 34, 5.4, C.ink)}
   <ellipse cx="32" cy="44" rx="3.6" ry="2.8" fill="#7d8896"/>
   <path d="M20 47 L11 45 M20 49 L11 50 M44 47 L53 45 M44 49 L53 50"
         stroke="#9aa6b4" stroke-width="1.4" stroke-linecap="round"/>`,
);

/* j. Suitsupääsuke. The national bird since 1960, drawn round rather than in
      profile: the same animal an earlier round put on a wire. */
const paasuke = wrap(
  C.cream,
  `<path d="M32 46 L18 60 L32 54 L46 60 Z" fill="${C.swallow}"/>
   <ellipse cx="32" cy="34" rx="19" ry="18" fill="${C.swallow}"/>
   <path d="M13 30 C4 32 2 40 8 44 C13 47 19 43 20 38 Z" fill="${C.swallow}"/>
   <path d="M51 30 C60 32 62 40 56 44 C51 47 45 43 44 38 Z" fill="${C.swallow}"/>
   <path d="M32 43 C28 43 25.5 41 25 38.5 C28 39.5 36 39.5 39 38.5 C38.5 41 36 43 32 43 Z" fill="#b8442f"/>
   ${eyes(25, 39, 29, 4.4, C.white, false)}
   <circle cx="25" cy="29" r="2" fill="${C.ink}"/>
   <circle cx="39" cy="29" r="2" fill="${C.ink}"/>
   <path d="M32 34 L28.5 31 L35.5 31 Z" fill="#e8a33f"/>`,
);

const ROUND7 = [
  ["06a-lendorav-nagu", lendoravNagu],
  ["06b-lendorav-libisemas", lendoravGlide],
  ["06c-lendorav-naota", lendoravVaikne],
  ["06d-ilves-nagu", ilvesNagu],
  ["06e-ilves-korvad", ilvesKorvad],
  ["06f-ilves-istub", ilvesIstub],
  ["06g-karu", karu],
  ["06h-siil", siil],
  ["06i-viigerhyljes", hyljes],
  ["06j-suitsupaasuke", paasuke],
];

for (const [name, out] of ROUND7) {
  const file = `design/icons/round7/${name}.svg`;
  writeFileSync(file, out);
  console.log(`${file}  ${out.length} bytes`);
}
