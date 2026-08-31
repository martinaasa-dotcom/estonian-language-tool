#!/usr/bin/env node
/**
 * A fourth round, into design/icons/round4/.
 *
 * The first three rounds were the same drawing three times: a flat geometric
 * pictogram, one or two elements, on a solid rounded tile, in the app's violet.
 * Every variation happened inside that frame, which is why they converged and
 * why more of them was not going to help.
 *
 * So this round changes the frame rather than the mark. Gradients, glow, depth,
 * paper, texture, type set as image, and colours the app does not currently
 * own. None of these is a roof, a ring or a numeral. Some will be wrong for an
 * app icon and that is the point of drawing ten.
 *
 *   node scripts/make-icon-round4.mjs
 */
import { writeFileSync } from "node:fs";

const f = (n) => Math.round(n * 100) / 100;

const svg = (body, defs = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <clipPath id="tile"><rect width="64" height="64" rx="14"/></clipPath>
${defs.trim() ? defs.trim().split("\n").map((l) => "    " + l.trim()).join("\n") + "\n" : ""}  </defs>
  <g clip-path="url(#tile)">
${body.trim().split("\n").map((l) => "    " + l.trim()).join("\n")}
  </g>
</svg>
`;

/* 1. Aken. A lit window on a dark street. The design notes say this app is
      opened by one person, alone, most evenings, usually tired; kodukeel is the
      language of the house. This is the only mark in four rounds that draws the
      person rather than the subject. */
const aken = svg(
  `<rect width="64" height="64" fill="url(#night)"/>
   <circle cx="32" cy="31" r="26" fill="url(#glow)"/>
   <rect x="20" y="15" width="24" height="31" rx="2.5" fill="url(#pane)"/>
   <rect x="31" y="15" width="2" height="31" fill="#0d1128" opacity="0.85"/>
   <rect x="20" y="28.5" width="24" height="2" fill="#0d1128" opacity="0.85"/>
   <rect x="17.5" y="46" width="29" height="3" rx="1.5" fill="#ffd489" opacity="0.5"/>`,
  `<linearGradient id="night" x1="0" y1="0" x2="0" y2="1">
     <stop offset="0%" stop-color="#0a0e24"/><stop offset="100%" stop-color="#181e42"/>
   </linearGradient>
   <radialGradient id="glow">
     <stop offset="0%" stop-color="#ffc978" stop-opacity="0.45"/>
     <stop offset="100%" stop-color="#ffc978" stop-opacity="0"/>
   </radialGradient>
   <linearGradient id="pane" x1="0" y1="0" x2="0" y2="1">
     <stop offset="0%" stop-color="#ffe6b4"/><stop offset="100%" stop-color="#ffb44f"/>
   </linearGradient>`,
);

/* 2. Horisont. The flag as the country reads it rather than as three bars: blue
      is the sky, black is the soil, white is the snow. Same three colours, same
      order, and not a flag. */
const horisont = svg(
  `<rect width="64" height="64" fill="url(#land)"/>
   <circle cx="44" cy="20" r="6.5" fill="#fff3d0" opacity="0.9"/>`,
  `<linearGradient id="land" x1="0" y1="0" x2="0" y2="1">
     <stop offset="0%" stop-color="#5aa2e8"/>
     <stop offset="30%" stop-color="#2f6cc4"/>
     <stop offset="44%" stop-color="#123a7a"/>
     <stop offset="50%" stop-color="#101018"/>
     <stop offset="70%" stop-color="#191922"/>
     <stop offset="74%" stop-color="#dfe4ee"/>
     <stop offset="100%" stop-color="#ffffff"/>
   </linearGradient>`,
);

/* 3. Sõlm. Two rings actually woven, one over and one under, rather than
      overlapped and left flat. The crossing is the whole mark. */
const solm = svg(
  `<rect width="64" height="64" fill="#141527"/>
   <circle cx="25" cy="32" r="14.5" fill="none" stroke="#f5b02e" stroke-width="6"/>
   <circle cx="39" cy="32" r="14.5" fill="none" stroke="#ffffff" stroke-width="6"/>
   <g clip-path="url(#over)">
     <circle cx="25" cy="32" r="14.5" fill="none" stroke="#f5b02e" stroke-width="6"/>
   </g>`,
  `<clipPath id="over"><rect x="24" y="12" width="18" height="20"/></clipPath>`,
);

/* 4. Laine. Repetition drawn as repetition: arcs going out from a point off the
      corner, at the intervals a card actually comes back at. */
const laine = svg(
  `<rect width="64" height="64" fill="#0f1b2e"/>
   ${[10, 18, 27, 38, 51].map((r, i) =>
     `<circle cx="10" cy="54" r="${r}" fill="none" stroke="#4fd6c8" stroke-width="${f(4.5 - i * 0.55)}"
        opacity="${f(1 - i * 0.14)}"/>`).join("\n   ")}
   <circle cx="10" cy="54" r="3.5" fill="#4fd6c8"/>`,
);

/* 5. Tomme. The o drawn by hand instead of by compass: one ink ring on paper,
      thick where the nib pressed and open where it lifted. Everything in four
      rounds has been ruler-drawn and this is the one that is not. */
function taper(pts, w0, w1) {
  const top = [];
  const bot = [];
  for (let i = 0; i < pts.length; i += 1) {
    const t = i / (pts.length - 1);
    const w = (w0 + (w1 - w0) * t) / 2;
    const [x, y] = pts[i];
    const [px, py] = pts[Math.min(i + 1, pts.length - 1)];
    const [qx, qy] = pts[Math.max(i - 1, 0)];
    const dx = px - qx;
    const dy = py - qy;
    const len = Math.hypot(dx, dy) || 1;
    top.push(`${f(x + (-dy / len) * w)} ${f(y + (dx / len) * w)}`);
    bot.push(`${f(x - (-dy / len) * w)} ${f(y - (dx / len) * w)}`);
  }
  return `M${top.join(" L")} L${bot.reverse().join(" L")} Z`;
}
const ring = [];
for (let i = 0; i <= 90; i += 1) {
  const t = i / 90;
  const a = (-100 + 335 * t) * (Math.PI / 180);
  const r = 20.5 + Math.sin(t * 5) * 0.9;
  ring.push([32 + r * Math.cos(a) * 1.04, 33 + r * Math.sin(a)]);
}
const tomme = svg(
  `<rect width="64" height="64" fill="#efe6d4"/>
   <path d="${taper(ring, 3, 10.5)}" fill="#171a1f"/>`,
);

/* 6. Täht. Type as the image rather than as a label: one letterform at four
      times the size the tile can hold, cropped by it. */
const taht = svg(
  `<rect width="64" height="64" fill="#e8452f"/>
   <rect x="10" y="-6" width="12" height="76" fill="#fff8f0"/>
   <path d="M60 8 L22 36" stroke="#fff8f0" stroke-width="12"/>
   <path d="M26 32 L62 66" stroke="#fff8f0" stroke-width="12"/>`,
);

/* 7. Kiri. A page of a writing system seen from too far to read, which is what
      Estonian looks like on the first day. */
let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const kiri = svg(
  `<rect width="64" height="64" fill="#f2ece0"/>
   ${Array.from({ length: 4 }, (_, row) => {
     const y = 11 + row * 13;
     let x = 7 + rnd() * 3;
     const marks = [];
     while (x < 55) {
       const w = 5 + rnd() * 13;
       marks.push(`<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="5.5" rx="2.75" fill="#1b1b22"/>`);
       x += w + 4 + rnd() * 3;
     }
     return marks.join("\n   ");
   }).join("\n   ")}`,
);

/* 8. Kihid. Three planes of coloured glass laid over each other, so the colour
      comes from the overlaps rather than from a fill. */
const kihid = svg(
  `<rect width="64" height="64" fill="#0d0f1c"/>
   <g style="mix-blend-mode:screen">
     <circle cx="24" cy="25" r="18" fill="#4b6bff" opacity="0.85"/>
     <circle cx="41" cy="27" r="18" fill="#f0407a" opacity="0.8"/>
     <circle cx="32" cy="41" r="18" fill="#31d6a8" opacity="0.75"/>
   </g>`,
);

/* 9. Vahe. The mark is the gap: a solid field split once, and the space between
      the halves is the only thing drawn. */
const vahe = svg(
  `<rect width="64" height="64" fill="#12121a"/>
   <path d="M20 -2 L34 -2 L44 66 L30 66 Z" fill="#f2f0ea"/>`,
);

/* 10. Orb. No drawing at all, only light: a soft sphere lit from one side. The
       shape every mark in the first three rounds was trying to be, without any
       of the edges. */
const orb = svg(
  `<rect width="64" height="64" fill="url(#deep)"/>
   <circle cx="32" cy="32" r="21" fill="url(#ball)"/>
   <ellipse cx="26" cy="24" rx="9" ry="6.5" fill="#ffffff" opacity="0.28"/>`,
  `<linearGradient id="deep" x1="0" y1="0" x2="1" y2="1">
     <stop offset="0%" stop-color="#141033"/><stop offset="100%" stop-color="#2a1147"/>
   </linearGradient>
   <radialGradient id="ball" cx="0.35" cy="0.28" r="0.85">
     <stop offset="0%" stop-color="#a8e8ff"/>
     <stop offset="42%" stop-color="#6b5cf0"/>
     <stop offset="100%" stop-color="#2a1b6b"/>
   </radialGradient>`,
);

/* 11. Uks. The window's companion: a door left ajar with the light coming out
       of it, seen from the street. Same idea, warmer, and a doorway is a shape
       nothing else in any round has been. */
const uks = svg(
  `<rect width="64" height="64" fill="url(#dark)"/>
   <circle cx="38" cy="36" r="27" fill="url(#spill)"/>
   <path d="M18 8 L46 14 L46 58 L18 58 Z" fill="#0e1020"/>
   <path d="M30 14 L46 17 L46 58 L30 58 Z" fill="url(#doorlight)"/>
   <circle cx="33" cy="38" r="1.8" fill="#5a4520"/>`,
  `<linearGradient id="dark" x1="0" y1="0" x2="0" y2="1">
     <stop offset="0%" stop-color="#0a0c1c"/><stop offset="100%" stop-color="#171a35"/>
   </linearGradient>
   <radialGradient id="spill">
     <stop offset="0%" stop-color="#ffbf6a" stop-opacity="0.4"/>
     <stop offset="100%" stop-color="#ffbf6a" stop-opacity="0"/>
   </radialGradient>
   <linearGradient id="doorlight" x1="0" y1="0" x2="1" y2="0">
     <stop offset="0%" stop-color="#ffd591"/><stop offset="100%" stop-color="#ff9f2e"/>
   </linearGradient>`,
);

/* 12. Kolm silmust. The weave taken to three, in the flag's own colours, so the
       one thing carrying the country is the palette rather than a picture. */
const kolmSilmust = svg(
  `<rect width="64" height="64" fill="#f4f2ec"/>
   <circle cx="32" cy="24" r="13" fill="none" stroke="#0072ce" stroke-width="5.5"/>
   <circle cx="22" cy="40" r="13" fill="none" stroke="#14131c" stroke-width="5.5"/>
   <circle cx="42" cy="40" r="13" fill="none" stroke="#0072ce" stroke-width="5.5"/>
   <g clip-path="url(#w1)">
     <circle cx="32" cy="24" r="13" fill="none" stroke="#0072ce" stroke-width="5.5"/>
   </g>
   <g clip-path="url(#w2)">
     <circle cx="22" cy="40" r="13" fill="none" stroke="#14131c" stroke-width="5.5"/>
   </g>`,
  `<clipPath id="w1"><rect x="30" y="28" width="18" height="14"/></clipPath>
   <clipPath id="w2"><rect x="26" y="42" width="14" height="16"/></clipPath>`,
);

/* 13. Täht, sinisel. The cropped letterform again on the flag's blue rather than
       on a red the app has no claim to. */
const tahtSinisel = svg(
  `<rect width="64" height="64" fill="#0059a8"/>
   <rect x="10" y="-6" width="12" height="76" fill="#f4f8ff"/>
   <path d="M60 8 L22 36" stroke="#f4f8ff" stroke-width="12"/>
   <path d="M26 32 L62 66" stroke="#f4f8ff" stroke-width="12"/>`,
);

const ROUND4 = [
  ["03a-aken", aken],
  ["03b-horisont", horisont],
  ["03c-solm", solm],
  ["03d-laine", laine],
  ["03e-tomme", tomme],
  ["03f-taht", taht],
  ["03g-kiri", kiri],
  ["03h-kihid", kihid],
  ["03i-vahe", vahe],
  ["03j-orb", orb],
  ["03k-uks", uks],
  ["03l-kolm-silmust", kolmSilmust],
  ["03m-taht-sinisel", tahtSinisel],
];

for (const [name, out] of ROUND4) {
  const file = `design/icons/round4/${name}.svg`;
  writeFileSync(file, out);
  console.log(`${file}  ${out.length} bytes`);
}
