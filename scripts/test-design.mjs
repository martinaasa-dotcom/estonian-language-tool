import { launchChromium } from "./lib/browser.mjs";
import { baseUrl, suite } from "./lib/checks.mjs";

/**
 * The design system, checked rather than admired.
 *
 * Three things a pastel interface gets wrong quietly, and which no amount of
 * looking at it catches: text that sits below 4.5:1 on its own tile, a type
 * scale that has quietly grown to twenty-eight sizes, and a focus ring that
 * animates in because a `transition-all` swept up `outline-width`.
 *
 * Every number here was a real defect at some point — this file is the record
 * of what was fixed, and the thing that stops it coming back.
 */
const B = baseUrl();
const PAGES = ["/", "/practice", "/grammar", "/grammar/partitive", "/progress", "/learn",
  "/learn/kodu", "/dictionary?q=tuba", "/words", "/settings", "/review", "/review/dictation",
  "/tasks", "/class", "/tutor", "/scan", "/welcome"];

// sRGB relative luminance + WCAG contrast.
const lum = ([r, g, b]) => {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// Only plain rgb()/rgba() can be compared numerically. `color-mix`, `oklab`
// and gradients resolve to other syntaxes; guessing at their channels produced
// nonsense failures, so they are skipped and checked by eye instead.
const parse = (s) => {
  if (typeof s !== "string" || !/^rgba?\(/.test(s)) return [];
  return (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
};

const b = await launchChromium();
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
const p = await ctx.newPage();

const sizes = new Map(), weights = new Map(), radii = new Map();
/** Elements whose gradient is measured from a smaller box than it is painted into. */
const wrapped = new Set();
/** One example per text size, so an off-scale one says where to look. */
const where = new Map();
const contrast = [];
const small = [];
let noFocus = [];

for (const url of PAGES) {
  await p.goto(B + url, { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForTimeout(250);

  const data = await p.evaluate(() => {
    const out = { text: [], targets: [], radii: [], wrapped: [] };
    /*
      A gradient sized to one box and painted into a larger one wraps.

      The defaults disagree: `background-origin` is the padding box and
      `background-clip` is the border box, so on anything with a border the
      ramp is measured a pixel short at each end of where it is drawn, and the
      default `repeat` fills the difference from the tile next door. On the primary
      button that put the pink end of the ramp down the left edge and the blue
      end down the right, one pixel wide, on the two rounded caps where a flat
      colour shows most. It survived the fix that made the ramp horizontal,
      because it never had anything to do with the angle.

      Stated as the condition rather than as one button: measured smaller than
      painted, and repeating. Any of the three cleared makes it safe.
    */
    const wraps = (cs) => {
      if (!cs.backgroundImage || !/gradient/.test(cs.backgroundImage)) return false;
      if (cs.backgroundOrigin !== "padding-box") return false;
      if (!/border-box/.test(cs.backgroundClip)) return false;
      if (!cs.backgroundRepeat.split(/[ ,]+/).some((r) => r === "repeat" || r === "repeat-x")) return false;
      return ["Top", "Right", "Bottom", "Left"]
        .some((side) => parseFloat(cs[`border${side}Width`]) > 0);
    };
    const bgOf = (el) => {
      let n = el;
      while (n) {
        const cs = getComputedStyle(n);
        // A gradient defeats a single-colour comparison; those are checked by eye.
        if (cs.backgroundImage && cs.backgroundImage !== "none") return null;
        const bg = cs.backgroundColor;
        if (bg && !bg.startsWith("rgba(0, 0, 0, 0)") && bg !== "transparent") {
          // A translucent fill is a tint over whatever is behind it, not a
          // backdrop of its own — the kbd inside the primary button is white at
          // 22% over a gradient, and comparing against it reads as white on
          // white. Keep walking; the parent decides.
          const parts = bg.match(/[\d.]+/g) ?? [];
          const alpha = parts.length >= 4 ? Number(parts[3]) : 1;
          if (alpha >= 0.95) return bg;
        }
        n = n.parentElement;
      }
      return "rgb(255,255,255)";
    };
    for (const el of document.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      /*
        ONE CHARACTER IS STILL TEXT.

        This read `> 1`, so no single-character run was ever measured, and the
        one that mattered most was exactly that shape: the tick inside a
        reviewed day on Today's week strip, white on mint at 2.52:1, sitting in
        the app unseen by a suite whose whole job is finding that. Anything a
        reader reads is text, and "✓" is read.

        The exemption is `data-ornament` and it has to be argued for in the
        markup rather than inferred from a length. A step numeral set at 92px in
        a hue's own tint, behind a card that says the same thing in words, is
        decoration in the WCAG sense and would fail any threshold this check
        could set. `aria-hidden` cannot stand in for it: the tick carries
        `aria-hidden` too, because the day beside it is already spelled out for
        a screen reader, and it is still the thing a sighted reader looks at.
      */
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length >= 1);
      // `nextjs-portal` is the dev overlay, not the app.
      if (own && cs.visibility !== "hidden" && parseFloat(cs.opacity) > 0.1
          && !el.closest(".sr-only") && !el.closest("[data-ornament]")
          && !el.closest("nextjs-portal")) {
        out.text.push({
          size: cs.fontSize, weight: cs.fontWeight, color: cs.color, bg: bgOf(el) ?? "gradient",
          text: el.textContent.trim().slice(0, 40),
          tag: el.tagName, cls: String(el.className).slice(0, 40),
        });
      }
      if (cs.borderRadius && cs.borderRadius !== "0px") out.radii.push(cs.borderRadius.split(" ")[0]);
      if (wraps(cs)) {
        out.wrapped.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 30)}`);
      }
      if (el.matches("a, button, [role=button], input, select, textarea")) {
        out.targets.push({ w: Math.round(r.width), h: Math.round(r.height), tag: el.tagName,
          label: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30) });
      }
    }
    return out;
  });

  for (const t of data.text) {
    sizes.set(t.size, (sizes.get(t.size) ?? 0) + 1);
    if (!where.has(t.size)) where.set(t.size, `${url} "${t.text.slice(0, 28)}"`);
    weights.set(t.weight, (weights.get(t.weight) ?? 0) + 1);
    if (t.bg === "gradient") continue;
    const fg = parse(t.color), bg = parse(t.bg);
    if (fg.length === 3 && bg.length === 3) {
      const cr = ratio(fg, bg);
      const px = parseFloat(t.size);
      const large = px >= 24 || (px >= 18.66 && Number(t.weight) >= 700);
      const need = large ? 3 : 4.5;
      if (cr < need) contrast.push({ url, cr: cr.toFixed(2), need, size: t.size, weight: t.weight, text: t.text, cls: t.cls });
    }
    if (parseFloat(t.size) < 12) small.push({ url, size: t.size, text: t.text });
  }
  for (const r of data.radii) radii.set(r, (radii.get(r) ?? 0) + 1);
  for (const w of data.wrapped) wrapped.add(`${url} ${w}`);
}

// Focus rings, by actually tabbing: `:focus-visible` matches keyboard focus
// only, so calling .focus() reports a missing ring on every control.
for (const url of ["/", "/review", "/progress", "/words"]) {
  await p.goto(B + url, { waitUntil: "networkidle" });
  await p.waitForTimeout(200);
  for (let i = 0; i < 18; i++) {
    await p.keyboard.press("Tab");
    const info = await p.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      // The Next.js dev overlay is focusable and is not ours to style.
      if (el.tagName === "NEXTJS-PORTAL" || el.closest?.("nextjs-portal")) return null;
      const cs = getComputedStyle(el);
      const ring = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0;
      const shadow = cs.boxShadow && cs.boxShadow !== "none";
      return { ok: ring || shadow,
        label: (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 24) };
    });
    if (info && !info.ok) noFocus.push(`${url} → ${info.label}`);
  }
}
noFocus = [...new Set(noFocus)];

/*
  Nothing may be left faded once a page has run out of scroll.

  The scroll-driven reveal on the landing page ran `entry 0% cover 20%`, and a
  cover-based range needs scrolling that a page sitting at its own end does not
  have: at maximum scroll the final call to action measured opacity 0.51 and the
  three questions above it 0.72, 0.77 and 0.82. Every element in the last
  screenful was dimmed, permanently, on every visit. It looked like a colour
  choice, which is why nobody filed it.
*/
let faded = [];
for (const url of ["/welcome"]) {
  await p.goto(B + url, { waitUntil: "networkidle", timeout: 60000 });
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await p.waitForTimeout(900);
  faded = await p.evaluate((page) =>
    [...document.querySelectorAll(".reveal")]
      .map((el) => ({ o: Number(getComputedStyle(el).opacity), t: (el.textContent || "").trim().slice(0, 30) }))
      .filter((r) => r.o < 0.99)
      .map((r) => `${page} ${r.o.toFixed(2)} "${r.t}"`), url);
}

// Floor: 8, measured in the state CI seeds. A thinner database reads as short.
const { check, done } = suite("Design system", { floor: 9 });

const SCALE = new Set(["11.5px", "12.5px", "13.5px", "15px", "17px", "19px", "22px", "27px", "32px", "40px", "52px", "68px"]);
const offScale = [...sizes.keys()].filter((s) => !SCALE.has(s));

/*
  Name where, not just what. This reported `(14px)` and left whoever saw it to
  find which of a hundred and sixty pages had it, on which element. `where`
  carries the first page and the first line of text at each off-scale size,
  which is enough to grep for.
*/
check("every text size is on the scale", offScale.length === 0,
  offScale.length
    ? offScale.map((size) => `${size} ${where.get(size) ?? ""}`).join(" | ")
    : `${sizes.size} steps in use`);
check("nothing is set below the 11.5px floor",
  [...sizes.keys()].every((s) => parseFloat(s) >= 11.5),
  [...sizes.keys()].filter((s) => parseFloat(s) < 11.5).join(" "));
check("every run of text clears WCAG AA on its background", contrast.length === 0,
  /*
    Name where, not just what, for the same reason the type-scale check above
    does. This printed three ratios and the text, which for a run of five
    identical ticks is one clue repeated five times and no page to look on.
  */
  contrast.slice(0, 8).map((c) => `${c.url} ${c.cr}:1 "${c.text}" .${c.cls}`).join("\n      "));
check("weights stay within the four the system defines", weights.size <= 4,
  [...weights.keys()].join(" "));

// Radii: the four tokens, fully-round pills, circles, and the heatmap cell.
const ALLOWED_RADII = new Set(["10px", "16px", "22px", "30px", "50%", "2px", "8px", "0px"]);
const strayRadii = [...radii.keys()].filter((r) => !ALLOWED_RADII.has(r) && parseFloat(r) < 1000);
check("corners come from the four token radii", strayRadii.length === 0, strayRadii.join(" "));

check("nothing is left half-faded at the bottom of a page", faded.length === 0,
  faded.slice(0, 4).join(" | "));

// A ring that fades in is a ring a keyboard user does not see land.
check("every tab stop shows its focus ring immediately", noFocus.length === 0,
  noFocus.slice(0, 5).join(" | "));

check("no gradient wraps the wrong colour round its own edge", wrapped.size === 0,
  [...wrapped].slice(0, 4).join(" | "));

/*
  A HOVERED ROW IS A STATE NOTHING ELSE SWEEPS.

  The pass above walks pages as they arrive, and the rail's row under the
  pointer is not a state a page arrives in: it paints the accent's softest
  tint behind the row and writes the row in the accent's ink, and neither of
  those readings exists until a pointer is on it. So it is hovered here, in
  both themes, and measured against the pane actually behind the words
  rather than against the page.
*/
const hovered = [];
for (const theme of ["light", "dark"]) {
  await p.goto(`${B}/grammar`, { waitUntil: "networkidle" });
  await p.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
  await p.waitForTimeout(300);
  const row = p.locator('nav[aria-label="Main"] a[href="/progress"]').first();
  if ((await row.count()) === 0) continue;
  /*
    Park the pointer somewhere else first.

    The pane is placed on a pointer *move*, and Playwright's hover only moves
    the mouse if it is not already where it is going. On the second pass through
    this loop it is: the first pass left it on this very row, so no move was
    dispatched, no pane was drawn, and the dark theme was reported as having no
    hover state at all. The suite has been red on that one reading rather than
    on anything the app does.
  */
  await p.mouse.move(700, 700);
  await p.waitForTimeout(120);
  await row.hover();
  await p.waitForTimeout(350);
  const seen = await p.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Main"]');
    const cell = nav?.querySelector('a[href="/progress"]');
    const ghost = nav?.querySelector(".nav-ghost");
    if (!cell || !ghost) return null;
    return {
      ink: getComputedStyle(cell).color,
      pane: getComputedStyle(ghost).backgroundColor,
      shown: getComputedStyle(ghost).opacity !== "0",
    };
  });
  if (!seen || !seen.shown) {
    hovered.push(`${theme}: no pane under the pointer`);
    continue;
  }
  const cr = ratio(parse(seen.ink), parse(seen.pane));
  if (cr < 4.5) hovered.push(`${theme}: ${cr.toFixed(2)}:1, ${seen.ink} on ${seen.pane}`);
}
check("a hovered row is drawn, and its words clear AA on the pill behind them",
  hovered.length === 0, hovered.join(" | "));

console.log(`\n  ${sizes.size} type steps · ${weights.size} weights · ${radii.size} radii · ${contrast.length} contrast failures`);
await b.close();
done();
