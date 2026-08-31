#!/usr/bin/env node
/**
 * A sixth round, into design/icons/round6/. A pivot rather than another pass.
 *
 * Five rounds branded around three things and only three: the country's
 * symbols, the letter and the number, and the landscape. This round drops all
 * of them and goes looking somewhere else, at what the app does to a person
 * over a year rather than at what it teaches.
 *
 * Growth, terrain, officialdom, forgetting, sediment, navigation, a route, a
 * tally, a cycle, and refraction. No roof, no ring, no numeral, no flag, no
 * horizon, no page. Flat throughout, because the gradients were the thing
 * wrong with round four.
 *
 *   node scripts/make-icon-round6.mjs
 */
import { writeFileSync } from "node:fs";

const f = (n) => Math.round(n * 100) / 100;
const rad = (deg) => (deg * Math.PI) / 180;

const C = {
  timber: "#e5c9a0",
  timberInk: "#7a5230",
  map: "#eee9db",
  mapInk: "#2e4038",
  flagBlue: "#0072ce",
  ink: "#1c1b26",
  night: "#0e1526",
  paper: "#f1ebdf",
  bone: "#ddd3bd",
  accent: "#7a6bf0",
  white: "#ffffff",
  clay: "#8a6a44",
  slate: "#4a4a52",
  moss: "#3d5c46",
  gold: "#e8b53f",
};

const wrap = (body, rx = 14) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs><clipPath id="t"><rect width="64" height="64" rx="${rx}"/></clipPath></defs>
  <g clip-path="url(#t)">
${body.trim().split("\n").map((l) => "    " + l.trim()).join("\n")}
  </g>
</svg>
`;

/* A closed curve with a little wobble, so a ring reads as grown rather than
   compass-drawn. Deterministic in its arguments. */
function blob(cx, cy, r, wob, phase, squash = 1, steps = 72) {
  const pts = [];
  for (let i = 0; i < steps; i += 1) {
    const a = rad((i * 360) / steps);
    const rr = r + wob * (Math.sin(a * 3 + phase) + 0.55 * Math.sin(a * 5 - phase));
    pts.push(`${f(cx + rr * Math.cos(a) * squash)} ${f(cy + rr * Math.sin(a))}`);
  }
  return `M${pts.join(" L")} Z`;
}

/* 1. Aastarõngad. A cut log: one ring a year, tight where the year was hard.
      What this app is actually selling is a person a year from now. */
const aastarongad = wrap(
  `<rect width="64" height="64" fill="${C.timber}"/>
   ${[4.5, 8, 12, 15.5, 20, 25, 30, 36].map((r, i) =>
     `<path d="${blob(28, 35, r, 0.7, i * 1.3)}" fill="none" stroke="${C.timberInk}" stroke-width="${i === 5 ? 2.6 : 1.8}"/>`,
   ).join("\n   ")}
   <circle cx="28" cy="35" r="1.8" fill="${C.timberInk}"/>`,
);

/* 2. Kontuur. Contour lines: knowing a language is knowing where the ground
      rises, and a map says that without naming anything. */
const kontuur = wrap(
  `<rect width="64" height="64" fill="${C.map}"/>
   ${[7, 13, 19.5, 26, 33].map((r, i) =>
     `<path d="${blob(34 - i * 1.6, 30 + i * 1.2, r, 1.8, 2 + i * 0.9, 1.25)}" fill="none"
        stroke="${C.mapInk}" stroke-width="2.2"/>`,
   ).join("\n   ")}`,
);

/* 3. Tempel. The state examines this language at four levels and stamps the
      result. Nothing else in six rounds has drawn the reason people come. */
const tempel = wrap(
  `<rect width="64" height="64" fill="${C.paper}"/>
   ${Array.from({ length: 26 }, (_, i) => {
     const a = rad((i * 360) / 26);
     return `<circle cx="${f(32 + 24 * Math.cos(a))}" cy="${f(32 + 24 * Math.sin(a))}" r="3.4" fill="${C.flagBlue}"/>`;
   }).join("\n   ")}
   <circle cx="32" cy="32" r="24" fill="${C.flagBlue}"/>
   <circle cx="32" cy="32" r="17" fill="none" stroke="${C.paper}" stroke-width="2.4"/>
   <circle cx="32" cy="32" r="8" fill="${C.paper}"/>`,
);

/* 4. Mälu. A form dissolving at one edge: the forgetting curve, which is the
      thing the whole scheduler exists to fight, drawn once. */
const malu = wrap(
  `<rect width="64" height="64" fill="${C.ink}"/>
   <rect x="6" y="14" width="21" height="36" rx="3" fill="${C.accent}"/>
   ${(() => {
     const out = [];
     let seed = 11;
     const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
     for (let col = 0; col < 7; col += 1) {
       for (let row = 0; row < 6; row += 1) {
         if (rnd() < col * 0.15) continue;
         const s = f(5.6 - col * 0.5);
         out.push(`<rect x="${f(28 + col * 5.2)}" y="${f(14.5 + row * 6.2)}" width="${s}" height="${s}" rx="1.2" fill="${C.accent}"/>`);
       }
     }
     return out.join("\n   ");
   })()}`,
);

/* 5. Süvis. A core drilled out of the ground and read downward, which is how a
      vocabulary is built and the only honest picture of how long it takes. */
const syvis = wrap(
  `<rect width="64" height="64" fill="${C.ink}"/>
   <rect x="21" y="2" width="22" height="60" rx="4" fill="${C.bone}"/>
   ${[[2, 9, C.moss], [11, 8, C.clay], [19, 5, C.bone], [24, 11, C.slate], [35, 6, C.clay],
      [41, 9, C.timberInk], [50, 7, C.slate], [57, 5, C.moss]].map(([y, h, fill]) =>
     `<rect x="21" y="${y}" width="22" height="${h}" fill="${fill}"/>`,
   ).join("\n   ")}
   <rect x="21" y="2" width="22" height="60" rx="4" fill="none" stroke="${C.ink}" stroke-width="2.5"/>`,
);

/* 6. Suur Vanker. The Plough, which is what this sky is called here and what
      people steered by before there were maps of it. */
const suurVanker = wrap(
  (() => {
    const stars = [[13, 19, 3.2], [16, 32, 2.6], [27, 35, 2.4], [29, 25, 2.2],
                   [39, 22, 3], [48, 25, 2.4], [57, 34, 3.4]];
    const links = [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 6]];
    return `<rect width="64" height="64" fill="${C.night}"/>
   ${links.map(([a, b]) =>
     `<path d="M${stars[a][0]} ${stars[a][1]} L${stars[b][0]} ${stars[b][1]}" stroke="${C.white}"
        stroke-width="1.3" opacity="0.55"/>`).join("\n   ")}
   ${stars.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${C.white}"/>`).join("\n   ")}`;
  })(),
);

/* 7. Rada. A route across open ground, wide where you are standing and thin
      where you are going. The course, without a single step drawn. */
function ribbon(pts, w0, w1) {
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
const path = [];
for (let i = 0; i <= 60; i += 1) {
  const t = i / 60;
  path.push([32 + 15 * Math.sin(t * 3.4) * (1 - t), 66 - 60 * t]);
}
const rada = wrap(
  `<rect width="64" height="64" fill="${C.moss}"/>
   <path d="${ribbon(path, 20, 2.5)}" fill="${C.paper}"/>`,
);

/* 8. Sõlmed. A cord with a knot tied for each thing counted, which is how days
      were kept before anybody had a calendar to keep them in. */
const solmed = wrap(
  (() => {
    const knots = [];
    const cord = [];
    for (let i = 0; i <= 60; i += 1) {
      const t = i / 60;
      cord.push([2 + 60 * t, 20 + 22 * Math.sin(t * Math.PI)]);
    }
    for (const t of [0.14, 0.31, 0.48, 0.65, 0.82]) {
      const i = Math.round(t * 60);
      knots.push(`<ellipse cx="${f(cord[i][0])}" cy="${f(cord[i][1])}" rx="5" ry="4.2" fill="${C.paper}"/>`);
    }
    return `<rect width="64" height="64" fill="${C.ink}"/>
   <path d="${ribbon(cord, 3.4, 3.4)}" fill="${C.paper}"/>
   ${knots.join("\n   ")}`;
  })(),
);

/* 9. Kuu faasid. The same face, differently lit, coming back. A card returns on
      a schedule and so does the moon, and one of them people already trust. */
const kuuFaasid = wrap(
  `<rect width="64" height="64" fill="${C.night}"/>
   ${[[14, 0.25], [32, 0.6], [50, 1]].map(([cx, lit]) =>
     `<circle cx="${cx}" cy="32" r="9.5" fill="${C.gold}"/>
   <circle cx="${f(cx - 19 * lit + 9.5)}" cy="32" r="9.5" fill="${C.night}"/>`,
   ).join("\n   ")}
   <circle cx="50" cy="32" r="9.5" fill="${C.gold}"/>`,
);

/* 10. Prisma. One form goes in and fourteen come out, which is the single
       sentence that explains Estonian to somebody who has never met a case. */
const prisma = wrap(
  `<rect width="64" height="64" fill="${C.ink}"/>
   <path d="M32 12 L52 47 L12 47 Z" fill="${C.accent}" stroke="${C.accent}" stroke-width="7"
         stroke-linejoin="round"/>
   <path d="M0 30 L26 30" stroke="${C.white}" stroke-width="4" stroke-linecap="round"/>
   ${[-16, -8, 0, 8, 16, 24].map((dy, i) =>
     `<path d="M38 32 L64 ${f(32 + dy)}" stroke="${C.white}" stroke-width="2.6" stroke-linecap="round"
        opacity="${f(0.95 - i * 0.09)}"/>`).join("\n   ")}`,
);

const ROUND6 = [
  ["05a-aastarongad", aastarongad],
  ["05b-kontuur", kontuur],
  ["05c-tempel", tempel],
  ["05d-malu", malu],
  ["05e-syvis", syvis],
  ["05f-suur-vanker", suurVanker],
  ["05g-rada", rada],
  ["05h-solmed", solmed],
  ["05i-kuu-faasid", kuuFaasid],
  ["05j-prisma", prisma],
];

for (const [name, out] of ROUND6) {
  const file = `design/icons/round6/${name}.svg`;
  writeFileSync(file, out);
  console.log(`${file}  ${out.length} bytes`);
}
