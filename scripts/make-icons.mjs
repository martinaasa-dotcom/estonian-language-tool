#!/usr/bin/env node
/**
 * Rasterises the app icon into the PNG sizes a web app manifest needs.
 *
 * Committed as a script rather than run by hand so the icons can be regenerated
 * when the mark changes, and so nobody has to guess what produced them.
 *
 * The maskable variant is a separate drawing, not a resize: Android crops a
 * maskable icon to whatever shape the launcher uses, so the mark has to sit
 * inside the 80% safe zone with the background bleeding to the edges.
 *
 * Nothing references the three files this writes: app/manifest.ts lists the two
 * SVGs and not these PNGs, and grep finds no other reader. They are regenerated
 * rather than left showing a mark the app no longer uses, but if PNG icons are
 * wanted in the manifest they have to be added to it, and if they are not
 * wanted these three and this script can go.
 *
 *   node scripts/make-icons.mjs
 */
import { writeFileSync } from "node:fs";
import { launchChromium } from "./lib/browser.mjs";

/*
  One definition of the mark, shared by both drawings below.

  This used to be a serif õ on #3E6BA8, a blue that appears nowhere in the
  palette, while the favicon and the manifest showed a face and the iOS icon
  showed a third thing again. The glyph is gone: these are the same drawing as
  app/icon.svg and public/app-icon-maskable.svg, so there is one mark rather
  than three that drift.
*/
const GRADIENT = `<linearGradient id="g" gradientUnits="userSpaceOnUse" x1="12" y1="6" x2="52" y2="58">
      <stop offset="0%" stop-color="#7a6bf0"/>
      <stop offset="100%" stop-color="#e2559a"/>
    </linearGradient>`;

const FACE = `<circle cx="32" cy="40" r="18" fill="url(#g)"/>
    <path d="M21 11.65q5.5 -6.5 11 0t11 0" fill="none" stroke="url(#g)"
          stroke-width="4.2" stroke-linecap="round"/>
    <circle cx="26" cy="37" r="2.9" fill="#ffffff"/>
    <circle cx="38" cy="37" r="2.9" fill="#ffffff"/>
    <path d="M26.6 45.4c1.9 3.2 8.9 3.2 10.8 0" fill="none" stroke="#ffffff"
          stroke-width="2.6" stroke-linecap="round"/>`;

const standard = (size) => `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">
    <defs>${GRADIENT}</defs>
    <rect width="64" height="64" rx="14" fill="#fbf9ff"/>
    ${FACE}
  </svg>`;

/*
  Full-bleed background, mark scaled into the centre 80%.

  Android guarantees only a circle of 80% the icon's width, a radius of 25.6 in
  a 64 unit box. At full size the chin sits at 26.0 and the tilde's crest at
  25.7, so neither is cut off and both are shaved by a couple of tenths on a
  circular mask. 0.8 puts every extreme about five units inside instead, and the
  background bleeds to the edge because the rounded tile's corners are
  transparent and a mask wider than that radius would show through them.
*/
const maskable = (size) => `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">
    <defs>${GRADIENT}</defs>
    <rect width="64" height="64" fill="#fbf9ff"/>
    <g transform="translate(6.4 6.43) scale(0.8)">${FACE}</g>
  </svg>`;

const TARGETS = [
  { file: "public/icon-192.png", size: 192, svg: standard },
  { file: "public/icon-512.png", size: 512, svg: standard },
  { file: "public/icon-maskable.png", size: 512, svg: maskable },
];

const browser = await launchChromium();
const page = await browser.newPage();

for (const { file, size, svg } of TARGETS) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0">${svg(size)}</body>`,
    { waitUntil: "load" },
  );
  const buffer = await page.screenshot({ omitBackground: true });
  writeFileSync(file, buffer);
  console.log(`${file}  ${size}×${size}  ${(buffer.length / 1024).toFixed(1)} kB`);
}

await browser.close();
