#!/usr/bin/env node
/**
 * A tenth round, into design/icons/round10/.
 *
 * Nine rounds drew the country, the language, the landscape and the animals.
 * None of them drew the name. **Kodukeel** is a compound of *kodu*, home, and
 * *keel*, and *keel* is the word this whole app is named on: it is a tongue, a
 * language, and the string of an instrument, all at once. The compound means
 * the language spoken at home, which is what a mother tongue is called here.
 *
 * So the first ten marks are the name. Each one is built on one reading of it,
 * and the good ones carry both halves in a single figure rather than stacking a
 * house on top of a symbol for speech.
 *
 * The last six put the bear into it. Review kept the karu across two rounds and
 * picked the variant with a mouth, so every bear here has one, which reverses
 * the default set in round nine. That default was a caution rather than a
 * finding: a curve under a nose is the grammar of the mark being replaced, and
 * having now seen both, the mouth is what makes this bear read as an animal
 * somebody drew rather than a geometric exercise. The caution stands for the
 * *shipped* mark and is answered by everything around the mouth: the eyes have
 * no brows, the face has no blush, and the head sits inside a piece of
 * architecture rather than floating on a coloured tile.
 *
 * Every colour is a token out of app/globals.css and nothing else.
 *
 *   node scripts/make-icon-round10.mjs
 */
import { writeFileSync } from "node:fs";

const C = {
  accent: "#7a6bf0",
  accentDeep: "#5b4bd6",
  accentSoft: "#ece9ff",
  ink: "#241f35",
  ground: "#fbf9ff",
  peach: "#ef6f52",
};

const wrap = (bg, body, defs = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs><clipPath id="t"><rect width="64" height="64" rx="14"/></clipPath>${defs}</defs>
  <g clip-path="url(#t)">
    <rect width="64" height="64" fill="${bg}"/>
${body.trim().split("\n").map((l) => "    " + l.trim()).join("\n")}
  </g>
</svg>
`;

/*
  Round three worked out that a gable with sharp corners reads as a warning
  sign. Stroking a filled path in its own colour with a round join is how every
  corner in this round gets softened at once, which keeps the path itself
  readable as the shape it is rather than as a list of arc commands.
*/
const soft = (d, fill, w = 4) =>
  `<path d="${d}" fill="${fill}" stroke="${fill}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>`;

const line = (d, stroke, w) =>
  `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

/* The one house every mark in this round is built on, so that a set meant to be
   compared varies in one thing at a time. */
const HOUSE = "M12 27 L32 9 L52 27 L52 53 L12 53 Z";

/* ------------------------------------------------------------------- karu */

/* Round nine's bear, unchanged in its proportions. Split into the ears and the
   rest so that a mark can put the ears somewhere else, which is what the roof
   made of ears needs. */
const ears = (coat, snout, ex = 14, ey = 19, er = 9.5) =>
  [ex, 64 - ex].map((x) =>
    `<circle cx="${x}" cy="${ey}" r="${er}" fill="${coat}"/>
   <circle cx="${x}" cy="${ey}" r="${(er * 4.6) / 9.5}" fill="${snout}"/>`).join("\n   ");

const face = (coat, snout, eye, { mouth = true, glint = true } = {}) =>
  `<ellipse cx="32" cy="36" rx="23.5" ry="20.5" fill="${coat}"/>
   <ellipse cx="32" cy="45.5" rx="12.5" ry="9" fill="${snout}"/>
   <circle cx="23" cy="33" r="4.9" fill="${eye}"/>
   <circle cx="41" cy="33" r="4.9" fill="${eye}"/>
   ${glint ? `<circle cx="24.7" cy="31.3" r="1.7" fill="${C.ground}"/>
   <circle cx="42.7" cy="31.3" r="1.7" fill="${C.ground}"/>` : ""}
   <path d="M27.4 41.6 Q32 38.2 36.6 41.6 Q36.6 45.6 32 46.6 Q27.4 45.6 27.4 41.6 Z" fill="${eye}"/>` +
  (mouth
    ? `\n   <path d="M32 46.6 L32 48.6 M32 48.6 Q28.4 51.6 25.6 48.4 M32 48.6 Q35.6 51.6 38.4 48.4"
         fill="none" stroke="${eye}" stroke-width="1.9" stroke-linecap="round"/>`
    : "");

const karu = (coat, snout, eye, o) => `${ears(coat, snout)}\n   ${face(coat, snout, eye, o)}`;

/* The bear is drawn at 64 and every mark that frames it needs it smaller, so
   the placement is one function rather than a transform typed six times. */
const karuAt = (s, dx, dy, coat, snout, eye, o) =>
  `<g transform="translate(${dx},${dy}) scale(${s})">${karu(coat, snout, eye, o)}</g>`;

/* ---------------------------------------------------------------- the ten */

const ROUND10 = [
  /* kodu as a box, keel as the strings across it. A kannel's soundbox is a
     gable already, and the vent in the gable is the o of kodu and the sound
     hole at once. This is the pun the app is named on, drawn. */
  ["10a-kannel", wrap(
    C.accent,
    `${soft(HOUSE, C.accentSoft)}
   <circle cx="32" cy="20" r="4.2" fill="${C.accent}"/>
   ${line("M17 31 L17 51", C.accentDeep, 3)}
   ${line("M17 34 L47 34", C.accentDeep, 2.4)}
   ${line("M17 39 L44 39", C.accentDeep, 2.4)}
   ${line("M17 44 L41 44", C.accentDeep, 2.4)}
   ${line("M17 49 L38 49", C.accentDeep, 2.4)}
   ${line("M48 32 L37 51", C.accentDeep, 3)}`,
  )],

  /* The same house with a tail on it, so the home is the thing that is
     speaking. One outline, not a house beside a bubble. */
  ["10b-konekodu", wrap(
    C.accent,
    soft("M12 25 L32 7 L52 25 L52 47 L30 47 L15 57 L22 47 L12 47 Z", C.accentSoft),
  )],

  /* A string stretched between two posts and pulled up into a peak. The roof
     and the string are one line: pluck the language and you get the house.
     The posts are load-bearing rather than decorative, the way the eaves were
     in round three, because without them the peak is an arrow. */
  ["10c-nopitud-keel", wrap(
    C.ink,
    `${line("M0 41 L8 41 L32 19 L56 41 L64 41", C.accent, 5)}
   ${line("M8 32 L8 50", C.accentSoft, 4.5)}
   ${line("M56 32 L56 50", C.accentSoft, 4.5)}`,
  )],

  /* The most literal reading there is: language living inside the home. The
     lines are ragged and the last one is short, which is what stops a set of
     bars reading as the strings in 10a. */
  ["10d-sonad-kodus", wrap(
    C.ink,
    `${soft(HOUSE, C.accent)}
   ${line("M19 35 L45 35", C.accentSoft, 2.8)}
   ${line("M19 41 L43 41", C.accentSoft, 2.8)}
   ${line("M19 47 L34 47", C.accentSoft, 2.8)}`,
  )],

  /* The hearth. A flame is a tongue in English and in Estonian alike, and the
     hearth is what made a house a home before any of the rest of it. */
  ["10e-kolle", wrap(
    C.accent,
    `${soft(HOUSE, C.accentSoft)}
   <path d="M30.5 32 C 33 36.5, 37.5 38.5, 38.5 43 C 40 48, 36.5 53, 32 53
            C 27.5 53, 24 48, 25.5 43 C 26.4 40.3, 28.5 39, 29.5 36.6
            C 30.1 38.7, 31 38.4, 30.5 32 Z" fill="${C.accent}"/>
   <path d="M32 41.5 C 33.9 44, 35 45.6, 35 47.4 C 35 49.9, 33.6 51.4, 32 51.4
            C 30.4 51.4, 29 49.9, 29 47.4 C 29 45.6, 30.1 44, 32 41.5 Z" fill="${C.peach}"/>`,
  )],

  /* The tilde as the ridge of the roof. It is the diacritic, a string seen
     side on, and the roof, in one line. This replaces a house with a speech
     bubble beside it, which was cut: two objects in a 64 box has failed every
     time it has been tried here, and the launcher mask removed the bubble. */
  ["10f-tildekatus", wrap(
    C.ink,
`${soft("M17 31 L47 31 L47 55 L17 55 Z", C.accentSoft)}
   <rect x="28" y="40" width="8" height="15" rx="2" fill="${C.ink}"/>
   ${line("M5 27 C 11 14, 23 14, 31 24 C 39 34, 49 34, 59 21", C.accent, 7)}`,
  )],

  /* The threshold. A doorway cut clean out of the field, and the sill running
     out past the house on both sides, which is a sill and a stretched string
     depending on which half of the name you are reading. */
  ["10g-lavi", wrap(
    C.accent,
    `${soft("M10 26 L32 6 L54 26 L54 47 L10 47 Z", C.ground)}
   ${line("M2 56 L62 56", C.accentSoft, 3.6)}
   <rect x="26" y="33" width="12" height="14" rx="2" fill="${C.accent}"/>`,
  )],

  /* The roof that survived every round, given the other half of the name: a
     string under it, dipped where a finger has just left it. */
  ["10h-katus-keelega", wrap(
    C.ground,
    `${line("M9 32 L32 12 L55 32", C.accent, 6.5)}
   ${line("M14 43 L14 51", C.accentDeep, 3.5)}
   ${line("M50 43 L50 51", C.accentDeep, 3.5)}
   ${line("M14 47 Q32 55 50 47", C.accentDeep, 3.5)}`,
  )],

  /* One unbroken stroke: up out of the tail, round the house, and back along
     the floor. The compound is one word, so the mark is one line. */
  ["10i-uhe-joonega", wrap(
    C.accentDeep,
    line("M12 59 L22 49 L22 29 L37 14 L52 29 L52 49 L24 49", C.accentSoft, 5),
  )],

  /* The inverse of 10b, to see which way round it wants to be: the speech is
     the field and the home is inside it. */
  ["10j-kodu-mullis", wrap(
    C.accent,
    `<path d="M16 8 h32 a11 11 0 0 1 11 11 v16 a11 11 0 0 1 -11 11 h-18
             l-13 10 3.5 -10 h-4.5 a11 11 0 0 1 -11 -11 v-16 a11 11 0 0 1 11 -11 Z"
         fill="${C.accentSoft}"/>
   ${soft("M21 28 L32 17 L43 28 L43 41 L21 41 Z", C.accent, 3)}`,
  )],

  /* ----------------------------------------------------------- the bear */

  /* Under a roof. The eaves come down past the ears rather than clearing them,
     because round one's roof floated above its own mark with nothing tying the
     two together and read as a chevron over a doughnut. */
  ["10k-karu-katuse-all", wrap(
    C.ink,
    `${line("M6 30 L32 12 L58 30", C.accentSoft, 6)}
   ${karuAt(0.7, 9.6, 17.5, C.accent, C.accentSoft, C.ink)}`,
  )],
  ["10l-karu-katuse-all-hele", wrap(
    C.ground,
    `${line("M6 30 L32 12 L58 30", C.accentDeep, 6)}
   ${karuAt(0.7, 9.6, 17.5, C.accent, C.accentSoft, C.ink)}`,
  )],

  /* Inside the house rather than under it. The bear is clipped to the doorway,
     so it is a thing seen through an opening rather than a sticker on a tile. */
  ["10m-karu-majas", wrap(
    C.accent,
    `${soft("M9 27 L32 5 L55 27 L55 58 L9 58 Z", C.accentSoft)}
   <g clip-path="url(#h)">${karuAt(0.68, 9.6, 17.58, C.accent, C.accentSoft, C.ink)}</g>`,
    `<clipPath id="h"><path d="M9 27 L32 5 L55 27 L55 58 L9 58 Z"/></clipPath>`,
  )],

  /* The bear is the thing being said. */
  ["10n-karu-konemull", wrap(
    C.accent,
    `<path d="M15 6 h34 a10 10 0 0 1 10 10 v22 a10 10 0 0 1 -10 10 h-19
             l-12 10 3 -10 h-6 a10 10 0 0 1 -10 -10 v-22 a10 10 0 0 1 10 -10 Z"
         fill="${C.accentSoft}"/>
   ${karuAt(0.66, 10.88, 5.7, C.accent, C.accentSoft, C.ink)}`,
  )],

  /* The tightest fusion in the round: the roof has no eaves of its own, because
     the ears are where it ends. */
  ["10o-karu-korvad-katus", wrap(
    C.ink,
    `${line("M10 24 L32 3 L54 24", C.accentSoft, 6)}
   ${karu(C.accent, C.accentSoft, C.ink)}`,
  )],

  /* And the bear saying it, with the home as the shape of the word. */
  ["10p-karu-jutuga", wrap(
    C.ground,
    `${karuAt(0.78, 3, 15.93, C.accent, C.accentSoft, C.ink)}
   <g transform="translate(36.96,1.06) scale(0.42)">
     ${soft("M12 25 L32 7 L52 25 L52 47 L30 47 L15 57 L22 47 L12 47 Z", C.accentDeep, 9)}
   </g>`,
  )],
];

for (const [name, out] of ROUND10) {
  const file = `design/icons/round10/${name}.svg`;
  writeFileSync(file, out);
  console.log(`${file}  ${out.length} bytes`);
}
