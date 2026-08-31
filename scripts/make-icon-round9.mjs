#!/usr/bin/env node
/**
 * A ninth round, into design/icons/round9/.
 *
 * Review kept the bear, so it is polished here rather than replaced, and given
 * the flower and the bird to stand beside.
 *
 * A naming note worth getting right, because the two are different plants.
 * **Rukkilill** is the cornflower, Centaurea cyanus, the national flower since
 * 1968 and the thing this app's palette is already named after: "rukkilill
 * sunrise", in app/globals.css. **Sinilill** is Hepatica nobilis, the liverleaf,
 * a protected spring flower and the emblem of Estonian nature conservation.
 * Both are here. The cornflower has the stronger claim and the harder silhouette:
 * eight trumpet florets splayed out, each notched into points at the tip, which
 * is what stops it being a daisy.
 *
 * The swallow reuses the profile from round one rather than starting again. A
 * barn swallow drawn from above is an aeroplane and that was proved three times;
 * in profile it read on the first attempt, so that geometry is kept and only the
 * colour and the throat are new.
 *
 * Every colour is a token out of app/globals.css. The swallow's rust throat is
 * `--peach`, which is the one warm hue in the palette and happens to be the
 * right colour for the bird.
 *
 *   node scripts/make-icon-round9.mjs
 */
import { writeFileSync } from "node:fs";

const f = (n) => Math.round(n * 100) / 100;
const rad = (d) => (d * Math.PI) / 180;
const P = (r, deg, cx = 32, cy = 32) => [
  f(cx + r * Math.cos(rad(deg - 90))),
  f(cy + r * Math.sin(rad(deg - 90))),
];
const pt = ([x, y]) => `${x} ${y}`;

const C = {
  accent: "#7a6bf0",
  accentDeep: "#5b4bd6",
  accentSoft: "#ece9ff",
  ink: "#241f35",
  ground: "#fbf9ff",
  raised: "#f4f1fe",
  peach: "#ef6f52",
  butter: "#cf9114",
  sky: "#2b93d8",
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

/* ------------------------------------------------------------------- karu */

/*
  The polish, item by item, since "cuter" is a set of decisions rather than a
  mood: the head is wider than it is tall, the ears are smaller and set into it
  rather than balanced on top, the muzzle sits low, and the eyes carry a glint.
  No mouth on the default, because a curve under a nose is the exact grammar of
  the mark this whole exercise is replacing. One variant has one, labelled.
*/
const karu = (bg, coat, snout, eye, { mouth = false, glint = true } = {}) =>
  wrap(
    bg,
    `<circle cx="14" cy="19" r="9.5" fill="${coat}"/>
   <circle cx="50" cy="19" r="9.5" fill="${coat}"/>
   <circle cx="14" cy="19" r="4.6" fill="${snout}"/>
   <circle cx="50" cy="19" r="4.6" fill="${snout}"/>
   <ellipse cx="32" cy="36" rx="23.5" ry="20.5" fill="${coat}"/>
   <ellipse cx="32" cy="45.5" rx="12.5" ry="9" fill="${snout}"/>
   <circle cx="23" cy="33" r="4.9" fill="${eye}"/>
   <circle cx="41" cy="33" r="4.9" fill="${eye}"/>
   ${glint ? `<circle cx="24.7" cy="31.3" r="1.7" fill="${C.ground}"/>
   <circle cx="42.7" cy="31.3" r="1.7" fill="${C.ground}"/>` : ""}
   <path d="M27.4 41.6 Q32 38.2 36.6 41.6 Q36.6 45.6 32 46.6 Q27.4 45.6 27.4 41.6 Z" fill="${eye}"/>` +
      (mouth
        ? `\n   <path d="M32 46.6 L32 48.6 M32 48.6 Q28.4 51.6 25.6 48.4 M32 48.6 Q35.6 51.6 38.4 48.4"
         fill="none" stroke="${eye}" stroke-width="1.9" stroke-linecap="round"/>`
        : ""),
  );

/* ------------------------------------------------------------------ lilled */

/* Eight trumpet florets, each notched into points, which is the whole
   difference between a cornflower and a daisy. */
function rukkilill(cx, cy, r0, r1, petals, fill) {
  const out = [];
  const half = 360 / petals / 2 - 2;
  for (let i = 0; i < petals; i += 1) {
    const a = (i * 360) / petals;
    out.push(
      `<path d="M${pt(P(r0, a - half, cx, cy))}` +
        ` L${pt(P(r1 - 3, a - half * 0.62, cx, cy))} L${pt(P(r1 - 6.5, a - half * 0.42, cx, cy))}` +
        ` L${pt(P(r1, a - half * 0.2, cx, cy))} L${pt(P(r1 - 6.5, a, cx, cy))}` +
        ` L${pt(P(r1, a + half * 0.2, cx, cy))} L${pt(P(r1 - 6.5, a + half * 0.42, cx, cy))}` +
        ` L${pt(P(r1 - 3, a + half * 0.62, cx, cy))} L${pt(P(r0, a + half, cx, cy))} Z" fill="${fill}"/>`,
    );
  }
  return out.join("\n   ");
}

/* Rounded oval petals, far simpler, which is what a hepatica actually is. */
function sinilill(cx, cy, r0, r1, petals, fill) {
  const out = [];
  for (let i = 0; i < petals; i += 1) {
    const a = (i * 360) / petals;
    out.push(
      `<path d="M${pt(P(r0, a - 16, cx, cy))} Q${pt(P(r1 * 0.72, a - 24, cx, cy))} ${pt(P(r1, a, cx, cy))}` +
        ` Q${pt(P(r1 * 0.72, a + 24, cx, cy))} ${pt(P(r0, a + 16, cx, cy))} Z" fill="${fill}"/>`,
    );
  }
  return out.join("\n   ");
}

/* ---------------------------------------------------------------- pääsuke */

/* Round one's profile, kept because it is the one that read. Only the colour,
   the rust throat and the white underside are new. */
const swallow = (bg, body, throat, belly, eyeHole) =>
  wrap(
    bg,
    `<g transform="translate(4.8,9.9) scale(0.85)">
     <path d="M3 31.5 L9.5 28 C10.5 22.5 15 19.5 21 20.5 C29 21.5 37 26.5 43 32 L61 25 L51 35 L60 48
              L40 39 C28.5 39 15 36 9.5 34.5 C6 33.5 3.5 32.5 3 31.5 Z" fill="${body}"/>
     <path d="M9.5 30 C11 25.5 15 22.5 20.5 23.5 C24 24.2 27.5 26 31 28.4
              C25 31 17 31.6 9.5 30 Z" fill="${throat}"/>
     <path d="M12 33.6 C18 34.8 26 35.2 33 34.4 L40 38 C29 38.6 18 36.6 12 33.6 Z" fill="${belly}"/>
     <path d="M27 20 C33 12 42 6.5 54 4 C48 13.5 41 21 34 27.5 Z" fill="${body}"/>
     <circle cx="14.5" cy="26.5" r="2.2" fill="${eyeHole}"/>
   </g>`,
  );

const ROUND9 = [
  /* The keeper, polished. */
  ["08a-karu", karu(C.ink, C.accent, C.accentSoft, C.ink)],
  ["08b-karu-hele", karu(C.ground, C.accent, C.accentSoft, C.ink)],
  ["08c-karu-toonid", karu(C.accentSoft, C.accentDeep, C.accentSoft, C.ink)],
  /* Labelled: this one has a mouth, which is the grammar being escaped. */
  ["08d-karu-suuga", karu(C.ink, C.accent, C.accentSoft, C.ink, { mouth: true })],
  ["08e-karu-vaikne", karu(C.ink, C.accent, C.accentSoft, C.ink, { glint: false })],

  /* The bear with the national flower, which is the most branded thing here. */
  ["08f-karu-rukkilillega", wrap(
    C.ink,
    `<circle cx="14" cy="19" r="9.5" fill="${C.accent}"/>
   <circle cx="50" cy="19" r="9.5" fill="${C.accent}"/>
   <circle cx="14" cy="19" r="4.6" fill="${C.accentSoft}"/>
   <circle cx="50" cy="19" r="4.6" fill="${C.accentSoft}"/>
   <ellipse cx="32" cy="36" rx="23.5" ry="20.5" fill="${C.accent}"/>
   <ellipse cx="32" cy="45.5" rx="12.5" ry="9" fill="${C.accentSoft}"/>
   <circle cx="23" cy="33" r="4.9" fill="${C.ink}"/>
   <circle cx="41" cy="33" r="4.9" fill="${C.ink}"/>
   <circle cx="24.7" cy="31.3" r="1.7" fill="${C.ground}"/>
   <circle cx="42.7" cy="31.3" r="1.7" fill="${C.ground}"/>
   <path d="M27.4 41.6 Q32 38.2 36.6 41.6 Q36.6 45.6 32 46.6 Q27.4 45.6 27.4 41.6 Z" fill="${C.ink}"/>
   ${rukkilill(50, 17, 4, 12, 8, C.accentSoft)}
   <circle cx="50" cy="17" r="4.4" fill="${C.accentDeep}"/>
   <circle cx="50" cy="17" r="2" fill="${C.accentSoft}"/>`,
  )],

  /* The flowers. */
  ["08g-rukkilill", wrap(
    C.ink,
    `${rukkilill(32, 32, 8, 26, 8, C.accent)}
   <circle cx="32" cy="32" r="9.5" fill="${C.accentDeep}"/>
   <circle cx="32" cy="32" r="4.5" fill="${C.accent}"/>`,
  )],
  ["08h-rukkilill-hele", wrap(
    C.ground,
    `${rukkilill(32, 32, 8, 26, 8, C.accent)}
   <circle cx="32" cy="32" r="9.5" fill="${C.accentDeep}"/>
   <circle cx="32" cy="32" r="4.5" fill="${C.accentSoft}"/>`,
  )],
  ["08i-rukkilill-mark", wrap(
    C.accent,
    `<circle cx="32" cy="32" r="26" fill="none" stroke="${C.accentSoft}" stroke-width="3"/>
   ${rukkilill(32, 32, 6.5, 20.5, 8, C.accentSoft)}
   <circle cx="32" cy="32" r="7.5" fill="${C.accent}"/>
   <circle cx="32" cy="32" r="3.4" fill="${C.accentSoft}"/>`,
  )],
  ["08j-sinilill", wrap(
    C.ink,
    `${sinilill(32, 32, 5, 25, 7, C.accent)}
   <circle cx="32" cy="32" r="7" fill="${C.accentSoft}"/>
   ${Array.from({ length: 8 }, (_, i) => {
     const [x, y] = P(4.6, (i * 360) / 8, 32, 32);
     return `<circle cx="${x}" cy="${y}" r="1.5" fill="${C.accentDeep}"/>`;
   }).join("\n   ")}`,
  )],

  /* The bird. */
  ["08k-paasuke", swallow(C.ground, C.accentDeep, C.peach, C.accentSoft, C.ground)],
  ["08l-paasuke-mark", swallow(C.accent, C.ground, C.peach, C.accentSoft, C.accent)],
];

for (const [name, out] of ROUND9) {
  const file = `design/icons/round9/${name}.svg`;
  writeFileSync(file, out);
  console.log(`${file}  ${out.length} bytes`);
}
