#!/usr/bin/env node
/**
 * Rasterises the app icon into the PNG sizes a web app manifest needs.
 *
 * Committed as a script rather than run by hand so the icons can be regenerated
 * when the mark changes, and so nobody has to guess what produced them.
 *
 * The maskable variant is a separate drawing, not a resize: Android crops a
 * maskable icon to whatever shape the launcher uses, so the glyph has to sit
 * inside the 80% safe zone with the background bleeding to the edges.
 *
 *   node scripts/make-icons.mjs
 */
import { existsSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

/**
 * Prefer a Chromium the environment already provides. Playwright only finds a
 * build matching its own pinned revision, so on a machine with a different one
 * installed the default launch fails even though a perfectly good browser is
 * sitting there.
 */
const SYSTEM_CHROMIUM = [
  "/opt/pw-browsers/chromium/chrome-linux/chrome",
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
].find((path) => existsSync(path));

const BLUE = "#3E6BA8";

const standard = (size) => `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">
    <rect width="64" height="64" rx="14" fill="${BLUE}"/>
    <text x="32" y="45" font-family="Georgia, serif" font-size="40" font-weight="700"
          fill="#ffffff" text-anchor="middle">õ</text>
  </svg>`;

/** Full-bleed background, glyph scaled into the centre 80%. */
const maskable = (size) => `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">
    <rect width="64" height="64" fill="${BLUE}"/>
    <text x="32" y="43" font-family="Georgia, serif" font-size="32" font-weight="700"
          fill="#ffffff" text-anchor="middle">õ</text>
  </svg>`;

const TARGETS = [
  { file: "public/icon-192.png", size: 192, svg: standard },
  { file: "public/icon-512.png", size: 512, svg: standard },
  { file: "public/icon-maskable.png", size: 512, svg: maskable },
];

const browser = await chromium.launch(
  SYSTEM_CHROMIUM ? { executablePath: SYSTEM_CHROMIUM } : {},
);
const page = await browser.newPage();

for (const { file, size, svg } of TARGETS) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0">${svg(size)}</body>`,
    { waitUntil: "load" },
  );
  // Georgia may not be installed; give the fallback a moment to settle so the
  // glyph is rendered rather than captured mid-swap.
  await page.evaluate(() => document.fonts.ready);
  const buffer = await page.screenshot({ omitBackground: true });
  writeFileSync(file, buffer);
  console.log(`${file}  ${size}×${size}  ${(buffer.length / 1024).toFixed(1)} kB`);
}

await browser.close();
