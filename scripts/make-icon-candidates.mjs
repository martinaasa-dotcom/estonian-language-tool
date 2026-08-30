#!/usr/bin/env node
/**
 * Draws the app icon candidates into design/icons/.
 *
 * A script rather than ten hand-typed files because half of these are geometry:
 * the folk star and the cornflower are polar coordinates, and a petal placed by
 * eye is a petal that is two degrees out from its neighbour.
 *
 * Every candidate is judged at 20px as well as at 512, which is where most of
 * the first drafts died: a cornflower with twelve petals is a smudge on a home
 * screen, and a swallow with solid triangular wings is an aeroplane.
 *
 *   node scripts/make-icon-candidates.mjs
 */
import { writeFileSync } from "node:fs";

const P = (r, deg) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [32 + r * Math.cos(a), 32 + r * Math.sin(a)];
};
const f = (n) => Math.round(n * 100) / 100;
const pt = ([x, y]) => `${f(x)} ${f(y)}`;

/* The app's own tokens, plus the flag's blue where the flag is the point. */
const C = {
  accent: "#7a6bf0",
  accentDeep: "#4b3fc4",
  ink: "#241f35",
  ground: "#fbf9ff",
  white: "#ffffff",
  sky: "#2b93d8",
  mint: "#1fb894",
  butter: "#f0b429",
  flagBlue: "#0072ce",
  flagBlueDeep: "#00539a",
  flagBlack: "#14131c",
  rule: "#cfc7ea",
};

const wrap = (bg, body, rx = 14) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" rx="${rx}" fill="${bg}"/>
${body.trim().split("\n").map((l) => "  " + l.trimEnd().trimStart()).join("\n")}
</svg>
`;

/* 1. Kodukatus. The ring is the o, the roof above it is its tilde, and the roof
      is a roof: kodukeel is the language of the house. */
const kodukatus = wrap(
  C.ink,
  `<path d="M11 27 L32 8 L53 27" fill="none" stroke="${C.accent}" stroke-width="6"
        stroke-linecap="round" stroke-linejoin="round"/>
   <circle cx="32" cy="42" r="12" fill="none" stroke="${C.white}" stroke-width="6.5"/>`,
);

/* 2. Kaheksakand. The eight-pointed star that runs down every woven belt in the
      country, and the one folk motif a stranger still reads as a mark. */
function star(points, outer, inner) {
  const v = [];
  for (let i = 0; i < points * 2; i += 1) {
    v.push(P(i % 2 ? inner : outer, (i * 180) / points));
  }
  return `M${v.map(pt).join(" L")} Z`;
}
const kaheksakand = wrap(
  C.ground,
  `<path d="${star(8, 26, 13)}" fill="${C.accentDeep}"/>
   <path d="${star(8, 12, 5.5)}" fill="${C.ground}"/>`,
);

/* 3. Lipp. Blue, black and white in the flag's own order, set as three bars that
      lengthen downward, which is also what a course looks like. */
const lipp = wrap(
  C.ground,
  `<rect x="13" y="15" width="23" height="9" rx="4.5" fill="${C.flagBlue}"/>
   <rect x="13" y="27.5" width="33" height="9" rx="4.5" fill="${C.flagBlack}"/>
   <rect x="13" y="40" width="43" height="9" rx="4.5" fill="${C.white}" stroke="${C.rule}" stroke-width="1.5"/>`,
);

/* 4. Tilde. One diacritic, at full size, doing the whole job. Nobody mistakes it
      for anybody else's language. */
const tilde = wrap(
  C.accentDeep,
  `<path d="M12 38 C18 25 26 25 32 32 C38 39 46 39 52 26" fill="none" stroke="${C.white}"
        stroke-width="8" stroke-linecap="round"/>`,
);

/* 5. Suitsupääsuke. The national bird, in profile with one wing raised, because
      every top-down bird silhouette in the world is an aeroplane. */
const paasuke = wrap(
  C.sky,
  `<g transform="translate(4.8,9.9) scale(0.85)">
   <path d="M3 31.5 L9.5 28 C10.5 22.5 15 19.5 21 20.5 C29 21.5 37 26.5 43 32 L61 25 L51 35 L60 48
            L40 39 C28.5 39 15 36 9.5 34.5 C6 33.5 3.5 32.5 3 31.5 Z" fill="${C.white}"/>
   <path d="M27 20 C33 12 42 6.5 54 4 C48 13.5 41 21 34 27.5 Z" fill="${C.white}"/>
   <circle cx="14.5" cy="26.5" r="2.2" fill="${C.sky}"/>
   </g>`,
);

/* 6. Rukkilill. The national flower, six frilled petals rather than twelve thin
      ones, and the flower the palette was already named after. */
function cornflower(petals, r0, r1) {
  const out = [];
  for (let i = 0; i < petals; i += 1) {
    const a = (i * 360) / petals;
    out.push(
      `M${pt(P(r0, a - 20))} Q${pt(P(r0 + 9, a - 25))} ${pt(P(r1 - 1, a - 11))}` +
        ` L${pt(P(r1 - 7, a - 5.5))} L${pt(P(r1, a))} L${pt(P(r1 - 7, a + 5.5))} L${pt(P(r1 - 1, a + 11))}` +
        ` Q${pt(P(r0 + 9, a + 25))} ${pt(P(r0, a + 20))} Z`,
    );
  }
  return out;
}
const rukkilill = wrap(
  C.ground,
  `${cornflower(6, 8.5, 27).map((d) => `<path d="${d}" fill="${C.accent}"/>`).join("\n   ")}
   <circle cx="32" cy="32" r="8" fill="${C.accentDeep}"/>`,
);

/* 7. Laulukaar. The song festival shell, which is the arch a whole country
      stands under to sing in a language this small. */
const laulukaar = wrap(
  C.flagBlueDeep,
  `<path d="M2 48 C2 24 15 12 32 12 C49 12 62 24 62 48 L48 48 C48 32 41 24 32 24
            C23 24 16 32 16 48 Z" fill="${C.white}"/>
   <rect x="9" y="53" width="46" height="4.5" rx="2.25" fill="${C.white}"/>`,
);

/* 8. Kirivöö. The belt the star came off, one band of it, large enough to survive
      a home screen. */
function diamonds(y, size, count, fill) {
  const out = [];
  const step = 64 / count;
  for (let i = 0; i < count; i += 1) {
    const cx = step * (i + 0.5);
    out.push(
      `<path d="M${f(cx)} ${f(y - size)} L${f(cx + size)} ${f(y)} L${f(cx)} ${f(y + size)} L${f(cx - size)} ${f(y)} Z" fill="${fill}"/>`,
    );
  }
  return out.join("\n   ");
}
const kirivoo = wrap(
  C.white,
  `${diamonds(32, 13, 3, C.flagBlue)}
   ${diamonds(32, 5.5, 3, C.white)}
   <rect x="0" y="9" width="64" height="5" fill="${C.flagBlue}"/>
   <rect x="0" y="50" width="64" height="5" fill="${C.flagBlue}"/>`,
);

/* 9. Vanalinn. Oleviste's spire over two gables: the shape on every postcard, and
      the only skyline in the Baltic nobody has to caption. */
const vanalinn = wrap(
  C.flagBlueDeep,
  `<path d="M11 42 L18 33 L25 42 L25 57 L11 57 Z" fill="${C.sky}"/>
   <path d="M39 42 L46 33 L53 42 L53 57 L39 57 Z" fill="${C.sky}"/>
   <path d="M32 4 L40 32 L24 32 Z" fill="${C.white}"/>
   <rect x="24.5" y="32" width="15" height="25" fill="${C.white}"/>`,
);

/* 10. Õ. The letter, set as a ring under its own tilde, at full height. */
const oMonogramm = wrap(
  C.flagBlue,
  `<path d="M18 17 C22 10.5 27 10.5 32 15 C37 19.5 42 19.5 46 13" fill="none" stroke="${C.white}"
        stroke-width="5.5" stroke-linecap="round"/>
   <ellipse cx="32" cy="41.5" rx="18" ry="15.5" fill="none" stroke="${C.white}" stroke-width="8"/>`,
);

const CANDIDATES = [
  ["01-kodukatus", kodukatus],
  ["02-kaheksakand", kaheksakand],
  ["03-lipp", lipp],
  ["04-tilde", tilde],
  ["05-paasuke", paasuke],
  ["06-rukkilill", rukkilill],
  ["07-laulukaar", laulukaar],
  ["08-kirivoo", kirivoo],
  ["09-vanalinn", vanalinn],
  ["10-o-monogramm", oMonogramm],
];

for (const [name, svg] of CANDIDATES) {
  const file = `design/icons/${name}.svg`;
  writeFileSync(file, svg);
  console.log(`${file}  ${svg.length} bytes`);
}
