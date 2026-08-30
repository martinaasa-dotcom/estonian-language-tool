#!/usr/bin/env node
/**
 * Draws the app icon candidates into design/icons/.
 *
 * A script rather than hand-typed files because several of these are geometry,
 * and a notch or a string placed by eye is one that is two degrees out from its
 * neighbour.
 *
 * Every candidate is judged at 20px as well as at 512, which is where most of
 * the first drafts died: a cornflower with twelve petals is a smudge on a home
 * screen, and a swallow with solid triangular wings is an aeroplane.
 *
 * Numbers are stable identifiers rather than positions, so the gaps are real.
 * The first round proposed 01 to 10 and four survived it; 11 to 20 are the
 * second round. The reason each of the six went is in the README.
 *
 *   node scripts/make-icon-candidates.mjs
 */
import { writeFileSync } from "node:fs";

const f = (n) => Math.round(n * 100) / 100;

/*
  The app's own tokens, plus the flag's blue where the flag is the point and two
  material colours where the subject is a material: limestone is not a violet
  and rye is not a blue. The README says which candidates leave the palette.
*/
const C = {
  accent: "#7a6bf0",
  accentDeep: "#4b3fc4",
  ink: "#241f35",
  ground: "#fbf9ff",
  white: "#ffffff",
  sky: "#2b93d8",
  flagBlue: "#0072ce",
  flagBlueDeep: "#00539a",
  rye: "#e0a02c",
  stone: "#efe6d3",
  night: "#161a2e",
};

const wrap = (bg, body, rx = 14) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" rx="${rx}" fill="${bg}"/>
${body.trim().split("\n").map((l) => "  " + l.trim()).join("\n")}
</svg>
`;

/* ---------------------------------------------------------------- round one */

/* 01. Kodukatus. The ring is the o, the roof above it is its tilde, and the roof
       is a roof: kodukeel is the language of the house. */
const kodukatus = wrap(
  C.ink,
  `<path d="M11 27 L32 8 L53 27" fill="none" stroke="${C.accent}" stroke-width="6"
        stroke-linecap="round" stroke-linejoin="round"/>
   <circle cx="32" cy="42" r="12" fill="none" stroke="${C.white}" stroke-width="6.5"/>`,
);

/* 04. Tilde. One diacritic at full size doing the whole job, and the half of õ
       that Õhtuleht's masthead does not own. */
const tilde = wrap(
  C.accentDeep,
  `<path d="M12 38 C18 25 26 25 32 32 C38 39 46 39 52 26" fill="none" stroke="${C.white}"
        stroke-width="8" stroke-linecap="round"/>`,
);

/* 05. Suitsupääsuke. The national bird, in profile with one wing raised, because
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

/* 07. Laulukaar. The song festival shell: the arch a whole country stands under
       to sing in a language this small. */
const laulukaar = wrap(
  C.flagBlueDeep,
  `<path d="M2 48 C2 24 15 12 32 12 C49 12 62 24 62 48 L48 48 C48 32 41 24 32 24
            C23 24 16 32 16 48 Z" fill="${C.white}"/>
   <rect x="9" y="53" width="46" height="4.5" rx="2.25" fill="${C.white}"/>`,
);

/* ---------------------------------------------------------------- round two */

/* 11. Kolm väldet. Estonian holds a sound at three lengths and means three
       different words by it, which is the one thing about this language no
       other language's app could put on its icon. Laid along a line rather than
       stacked: stacked and centred, three bars of growing width are a child's
       ring tower, which is the exact thing this whole exercise is escaping. */
const valted = wrap(
  C.ink,
  [[9, 7], [23, 14], [42, 24]]
    .map(([x, w]) => `<rect x="${x}" y="26.5" width="${w}" height="11" rx="5.5" fill="${C.accent}"/>`)
    .join("\n   "),
);

/* 12. Neliteist. Fourteen cases, which is the fact every learner meets first and
       the thing this app is organised around. */
const neliteist = wrap(
  C.accentDeep,
  `<path d="M13 24 L20 17.5 L20 47" fill="none" stroke="${C.white}" stroke-width="7"
        stroke-linecap="round" stroke-linejoin="round"/>
   <path d="M44 17.5 L32 38 L52 38" fill="none" stroke="${C.white}" stroke-width="7"
        stroke-linecap="round" stroke-linejoin="round"/>
   <path d="M44 17.5 L44 47" fill="none" stroke="${C.white}" stroke-width="7"
        stroke-linecap="round"/>`,
);

/* 13. Klint. The Baltic limestone escarpment: the country's northern edge is a
       cliff of stacked strata, and paekivi is the national stone. The top edge
       and the face are stepped because limestone breaks in blocks, and because
       a plain rectangle ruled with horizontal lines is a document. */
const klint = wrap(
  C.night,
  `<rect x="0" y="45" width="64" height="19" fill="${C.sky}"/>
   <path d="M0 25 L9 23 L13 18 L29 17 L33 20 L44 19 L44 47 L0 47 Z" fill="${C.stone}"/>
   <path d="M0 25 L9 23 L13 18 L29 17 L33 20 L44 19 L44 22 L33 23 L29 20 L13 21 L9 26 L0 28 Z"
         fill="${C.white}"/>
   <path d="M47 41 L52 38 L57 41 L57 47 L47 47 Z" fill="${C.stone}"/>`,
);

/* 14. Rukis. The rye this country eats daily, and the plant the national flower
       is named after: rukkilill is the flower that grows in the rye. */
const rukis = wrap(
  C.ink,
  `<rect x="30.5" y="26" width="3" height="30" rx="1.5" fill="${C.rye}"/>
   ${[24, 32, 40, 48]
     .map((y, i) => {
       const r = 6.8 - i * 0.35;
       return `<ellipse cx="24.5" cy="${y}" rx="${f(r)}" ry="3.4" transform="rotate(-32 24.5 ${y})" fill="${C.rye}"/>
   <ellipse cx="39.5" cy="${y}" rx="${f(r)}" ry="3.4" transform="rotate(32 39.5 ${y})" fill="${C.rye}"/>`;
     })
     .join("\n   ")}
   <path d="M32 24 L32 8 M27 22 L22 9 M37 22 L42 9" stroke="${C.rye}" stroke-width="2.2"
         stroke-linecap="round" fill="none"/>`,
);

/* 15. Rändrahn. Estonia has the densest concentration of large glacial erratics
       in Europe and protects them by name, so a boulder sitting where the ice
       left it is a national monument here and a rock anywhere else.

       This slot held the wolf, national animal since 2018, through three
       redraws: a front-on mask read as a cat, a broader skull with shorter ears
       read as a fox, and the howling profile read as a leaf. A silhouette that
       needs a caption is not an app icon, so it went rather than getting a
       fourth attempt. */
const randrahn = wrap(
  C.night,
  `<path d="M6 48 C5 41 7 34 12 29 L21 20 L36 17.5 C44 19.5 51 26 54 35
            C56 40 56.5 45 56 48 Z" fill="${C.stone}"/>
   <rect x="2" y="48" width="60" height="2.6" rx="1.3" fill="${C.stone}" opacity="0.55"/>`,
);

/* 16. Kaali. The meteorite crater on Saaremaa, the youngest large impact in
       Europe and the place the old songs say the sun fell. The rim is uneven and
       the lake sits well off centre, because a circle inside a circle is a
       camera lens. */
const kaali = wrap(
  C.night,
  `<path d="M33 6 C44 6 52 12 56 21 C60 30 57 42 49 49 C41 56 29 58 21 54
            C11 49 5 40 6 30 C7 19 15 9 26 6.8 C28.3 6.3 30.7 6 33 6 Z" fill="${C.stone}"/>
   <path d="M37 21 C46 21 51 28 51 35.5 C51 43 44 49 36 49 C28 49 21 43 21 35.5
            C21 28 28 21 37 21 Z" fill="${C.sky}"/>
   <path d="M47 16 L57 9 L62 19 L50 24 Z" fill="${C.night}"/>`,
);

/* 17. Kannel. Vanemuine's instrument, and the pun the app is named on: keel is a
       tongue, a language and the string of an instrument at once. The strings
       shorten toward the narrow end, which is what makes it a kannel and not a
       box. */
const kannel = wrap(
  C.flagBlueDeep,
  (() => {
    const x0 = 6, x1 = 58, yL = 42, yR = 24;
    const topAt = (x) => yL + ((yR - yL) * (x - x0)) / (x1 - x0);
    const strings = [45, 41, 37, 33, 29].map((y) => {
      // Where the sloping top edge crosses this string's height.
      const cross = y >= yL ? x0 : x0 + ((yL - y) * (x1 - x0)) / (yL - yR);
      const from = Math.max(x0 + 4, cross + 4);
      return `<rect x="${f(from)}" y="${y - 1.1}" width="${f(x1 - 4 - from)}" height="2.2" rx="1.1" fill="${C.flagBlueDeep}"/>`;
    });
    return `<path d="M${x0} 50 L${x1} 50 L${x1} ${yR} L${x0} ${yL} Z" fill="${C.white}"/>
   ${strings.join("\n   ")}
   <circle cx="20" cy="${f(topAt(20) + 5.5)}" r="0" fill="none"/>`;
  })(),
);

/* 18. Sõnajalg. The fern that midsummer says flowers once a year and nobody has
       ever seen, drawn as the crozier before it opens. It replaced a set of
       islands that read as bacteria, and a freehand outline of the country,
       which is not a thing to get slightly wrong on an Estonian app. */
function spiral(cx, cy, r0, r1, turns, startDeg, steps = 160) {
  const pts = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const a = ((startDeg + turns * 360 * t) * Math.PI) / 180;
    const r = r0 + (r1 - r0) * t;
    pts.push(`${f(cx + r * Math.cos(a))} ${f(cy + r * Math.sin(a))}`);
  }
  return `M${pts.join(" L")}`;
}
function taperedSpiral(cx, cy, r0, r1, turns, startDeg, h0, h1, steps = 200) {
  const outer = [];
  const inner = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const a = ((startDeg + turns * 360 * t) * Math.PI) / 180;
    const r = r0 + (r1 - r0) * t;
    const h = h0 + (h1 - h0) * t;
    outer.push(`${f(cx + (r + h) * Math.cos(a))} ${f(cy + (r + h) * Math.sin(a))}`);
    inner.push(`${f(cx + (r - h) * Math.cos(a))} ${f(cy + (r - h) * Math.sin(a))}`);
  }
  return `M${outer.join(" L")} L${inner.reverse().join(" L")} Z`;
}
const sonajalg = wrap(
  C.ink,
  `<path d="M30.1 43.5 L28.6 51.8 L26 60 L36 60 Z" fill="${C.white}"/>
   <path d="${taperedSpiral(33, 27, 21, 3.6, 1.85, 100, 4.2, 1.3)}" fill="${C.white}"/>`,
);

/* 19. Kask. Birch bark: the lenticels are lens shaped and never line up, which
       is the whole of the pattern. Few and large, because six rows of small ones
       is a swarm of insects. */
const kask = wrap(
  C.ground,
  `${[10, 21.5, 33, 44.5, 56].map((y) => `<rect x="0" y="${y}" width="64" height="1.2" fill="${C.ink}" opacity="0.14"/>`).join("\n   ")}
   ${[
     [[8, 15], [30, 19]],
     [[14, 24], [45, 13]],
     [[6, 17], [29, 26]],
     [[18, 21], [45, 14]],
   ]
     .map((row, i) =>
       row
         .map(([x, w]) => { const y = 15 + i * 11.5; return `<path d="M${x} ${y} Q${f(x + w / 2)} ${y - 3.6} ${x + w} ${y} Q${f(x + w / 2)} ${y + 3.6} ${x} ${y} Z" fill="${C.ink}"/>`; })
         .join("\n   "),
     )
     .join("\n   ")}`,
);

/* 20. Vana Toomas. The guard who has stood on the town hall spire since 1530 and
       is the one weathervane in the country with a name. */
const vanaToomas = wrap(
  C.flagBlue,
  `<path d="M26 17 L32 3 L38 17 Z" fill="${C.white}"/>
   <circle cx="32" cy="21" r="5.2" fill="${C.white}"/>
   <path d="M25.5 27 L38.5 27 L42 51 L22 51 Z" fill="${C.white}"/>
   <rect x="38" y="30" width="9" height="3.2" rx="1.6" fill="${C.white}"/>
   <rect x="45.5" y="9" width="3.4" height="42" rx="1.7" fill="${C.white}"/>
   <path d="M45.5 9 L49 9 L49 13 C54 13 57 16 57 20 L49 21 L49 25 L45.5 25 Z" fill="${C.white}"/>
   <rect x="17" y="52.5" width="30" height="4.5" rx="2.25" fill="${C.white}"/>`,
);

const CANDIDATES = [
  ["01-kodukatus", kodukatus],
  ["04-tilde", tilde],
  ["05-paasuke", paasuke],
  ["07-laulukaar", laulukaar],
  ["11-valted", valted],
  ["12-neliteist", neliteist],
  ["13-klint", klint],
  ["14-rukis", rukis],
  ["15-randrahn", randrahn],
  ["16-kaali", kaali],
  ["17-kannel", kannel],
  ["18-sonajalg", sonajalg],
  ["19-kask", kask],
  ["20-vana-toomas", vanaToomas],
];

for (const [name, svg] of CANDIDATES) {
  const file = `design/icons/${name}.svg`;
  writeFileSync(file, svg);
  console.log(`${file}  ${svg.length} bytes`);
}
