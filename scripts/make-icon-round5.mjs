#!/usr/bin/env node
/**
 * A fifth round, into design/icons/round5/. Flat, and flat everywhere.
 *
 * Round four's horizon and its page of writing were the two that landed, and
 * the gradient underneath the first one was the thing wrong with it. So nothing
 * here has a gradient, a glow or a soft edge: every fill is one flat colour,
 * which is also what the three marks still standing from earlier rounds are
 * made of.
 *
 * Two directions carried forward and worked properly. The flag read as a
 * landscape rather than as a flag, in hard bands. And a page of Estonian seen
 * from too far to read, which is the one thing in five rounds that draws what
 * using this app is actually like.
 *
 *   node scripts/make-icon-round5.mjs
 */
import { writeFileSync } from "node:fs";

const f = (n) => Math.round(n * 100) / 100;

const C = {
  sky: "#2f7fd4",
  skyDeep: "#123b78",
  night: "#0d1a33",
  soil: "#14131c",
  snow: "#f4f6fb",
  sun: "#f3e6c0",
  paper: "#f1ebdf",
  ink: "#1b1b22",
  accent: "#7a6bf0",
  flagBlue: "#0072ce",
};

const wrap = (body, rx = 14) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs><clipPath id="t"><rect width="64" height="64" rx="${rx}"/></clipPath></defs>
  <g clip-path="url(#t)">
${body.trim().split("\n").map((l) => "    " + l.trim()).join("\n")}
  </g>
</svg>
`;

/* Rows of marks at the rhythm of a language you cannot read yet. Deterministic,
   because a mark that redraws differently each run is not a mark. */
function page(seedStart, rows, y0, gap, h, colour, opts = {}) {
  let seed = seedStart;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const out = [];
  for (let row = 0; row < rows; row += 1) {
    const y = y0 + row * gap;
    let x = 7 + rnd() * 3;
    while (x < 55) {
      const w = (opts.min ?? 4) + rnd() * (opts.range ?? 12);
      const lit = opts.pick ? opts.pick(row, out.length) : false;
      const width = lit && opts.pickWidth ? opts.pickWidth : w;
      out.push(`<rect x="${f(x)}" y="${f(y)}" width="${f(width)}" height="${h}" rx="${f(h / 2)}" fill="${lit ? opts.pickFill : colour}"/>`);
      x += width + 3.5 + rnd() * 3;
    }
  }
  return out.join("\n   ");
}

/* a. Horisont. The flag as the country explains it: blue is the sky, black is
      the soil, white is the snow. Same colours, same order, hard bands, and the
      proportions of a landscape rather than of a flag. */
const horisont = wrap(
  `<rect width="64" height="30" fill="${C.sky}"/>
   <rect y="30" width="64" height="13" fill="${C.soil}"/>
   <rect y="43" width="64" height="21" fill="${C.snow}"/>
   <circle cx="44" cy="16" r="7" fill="${C.sun}"/>`,
);

/* b. Horisont, öö. The same country in the half of the year it is actually
      dark, which is the half this app gets opened in. */
const horisontOo = wrap(
  `<rect width="64" height="32" fill="${C.night}"/>
   <rect y="32" width="64" height="11" fill="${C.soil}"/>
   <rect y="43" width="64" height="21" fill="${C.snow}"/>
   <circle cx="45" cy="15" r="6" fill="${C.snow}"/>
   <circle cx="42" cy="13" r="6" fill="${C.night}"/>`,
);

/* c. Väli. The soil down to a line, so the mark is sky and snow with the earth
      between them. The furthest from a flag the three colours will go. */
const vali = wrap(
  `<rect width="64" height="36" fill="${C.sky}"/>
   <rect y="36" width="64" height="4" fill="${C.soil}"/>
   <rect y="40" width="64" height="24" fill="${C.snow}"/>`,
);

/* d. Kiri. A page of Estonian seen from too far to read, which is what the
      language looks like on the first day. */
const kiri = wrap(
  `<rect width="64" height="64" fill="${C.paper}"/>
   ${page(7, 4, 11, 13, 5.5, C.ink)}`,
);

/* e. Kiri, tume. The same page at the hour it is usually read. */
const kiriTume = wrap(
  `<rect width="64" height="64" fill="${C.ink}"/>
   ${page(7, 4, 11, 13, 5.5, C.paper)}`,
);

/* f. Üks sõna. The same page with one word lit. Five rounds of drawing the
      language and this is the first that draws learning it. */
const yksSona = wrap(
  `<rect width="64" height="64" fill="${C.paper}"/>
   ${page(7, 4, 11, 13, 5.5, "#c9c3b4", { pick: (row, i) => i === 6, pickFill: C.accent, pickWidth: 17 })}`,
);

/* g. Lehekülg. The rows go pale down the page: what has been read, and what has
      not, in the one shape a learner sees every day. */
const lehekylg = wrap(
  `<rect width="64" height="64" fill="${C.paper}"/>
   ${[0, 1, 2, 3].map((row) =>
     page(7 + row, 1, 11 + row * 13, 13, 5.5, C.ink).replace(/fill="[^"]+"/g, `fill="${C.ink}" opacity="${f(1 - row * 0.27)}"`),
   ).join("\n   ")}`,
);

/* h. Tabel. Fourteen cells, one of them filled: the paradigm this whole course
      is organised around, drawn as the table it is. */
const tabel = wrap(
  `<rect width="64" height="64" fill="${C.ink}"/>
   ${Array.from({ length: 14 }, (_, i) => {
     const col = i % 5;
     const row = Math.floor(i / 5);
     return `<rect x="${f(6 + col * 11)}" y="${f(13 + row * 14)}" width="9" height="11" rx="2.5"
        fill="${i === 7 ? C.accent : "#3a3550"}"/>`;
   }).join("\n   ")}`,
);

/* i. Kaldu. The three colours pitched off the horizontal, so the mark moves and
      stops being a flag entirely. */
const kaldu = wrap(
  `<rect width="64" height="64" fill="${C.flagBlue}"/>
   <path d="M-10 44 L74 20 L74 34 L-10 58 Z" fill="${C.soil}"/>
   <path d="M-10 58 L74 34 L74 74 L-10 74 Z" fill="${C.snow}"/>`,
);

/* j. Vagu. A ploughed field from where you stand in it. Furrows and lines of
      text are the same picture, which is the joke the word kiri has been making
      all along: it means writing and it means pattern. Converging rather than
      parallel, because parallel stripes are a barcode. */
const vagu = wrap(
  `<rect width="64" height="64" fill="${C.sky}"/>
   <rect y="22" width="64" height="42" fill="${C.paper}"/>
   ${Array.from({ length: 9 }, (_, i) => {
     const x = -26 + i * 14.5;
     return `<path d="M32 22 L${f(x)} 64 L${f(x + 7)} 64 Z" fill="${C.ink}"/>`;
   }).join("\n   ")}`,
);

const ROUND5 = [
  ["04a-horisont", horisont],
  ["04b-horisont-oo", horisontOo],
  ["04c-vali", vali],
  ["04d-kiri", kiri],
  ["04e-kiri-tume", kiriTume],
  ["04f-yks-sona", yksSona],
  ["04g-lehekylg", lehekylg],
  ["04h-tabel", tabel],
  ["04i-kaldu", kaldu],
  ["04j-vagu", vagu],
];

for (const [name, out] of ROUND5) {
  const file = `design/icons/round5/${name}.svg`;
  writeFileSync(file, out);
  console.log(`${file}  ${out.length} bytes`);
}
