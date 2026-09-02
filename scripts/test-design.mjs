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
  "/learn/kodu", "/dictionary?q=tuba", "/words", "/words/mastery", "/settings", "/review",
  "/review/dictation", "/class", "/tutor", "/scan", "/welcome", "/funding"];

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

// Floor: 13, measured in the state CI seeds. A thinner database reads as short.
const { check, done } = suite("Design system", { floor: 15 });

const SCALE = new Set(["11.5px", "12.5px", "13.5px", "15px", "17px", "19px", "22px", "27px", "32px", "40px", "52px", "68px", "88px"]);
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
  pointer is not a state a page arrives in: it draws the marker's own card
  behind the row and writes the row in the ink the marked row wears, and
  neither of those readings exists until a pointer is on it. So it is hovered
  here, in both themes, and measured against the pane actually behind the
  words rather than against the page.
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

/*
  THE LANDING PAGE'S FOUR LETTERS TOUCH THE CARD, AND NOTHING THE CARD SAYS.

  õ, ä, ö and ü are tucked over the case explorer's four sides, one to a side,
  which is the whole of what makes them read as placed rather than scattered.
  They used to hang off the hero's flashcard; that card went when the page was
  cut to five screens, and they moved to the only object left big enough to
  carry them, which is also the one whose contents are the letters themselves.

  Nothing else can see any of this. They are absolutely positioned, so
  test-containment skips them by design, and a square that misses the card is
  drawn exactly as correctly as one that meets it.

  WHAT THEY MAY NOT TOUCH IS ANYTHING THE CARD SAYS, and that is a wider rule
  than the one it replaces. On the flashcard it was a single named pill in the
  footer. Here the card is a table of Estonian forms whose row count changes
  when the reader presses a chip, so the check is against every run of text and
  every control inside it, and against the glyphs rather than the boxes: a
  heading's box spans its whole column, so a box comparison reports a letter
  sitting quietly in the padding as if it were drawn over the words. Measured
  with `Range.getClientRects`, which bounds the ink.

  It earned itself immediately. The first placement put õ over "Try a word" at
  every width and ä and ü over a form and a case name at 640, where the card
  stacks into one column and brings its content out to both edges. None of it
  was visible in a screenshot at 1280.

  READ ACROSS THE WHOLE WANDER rather than where the letters happen to rest.
  Each drifts on its own clock, so there is no single frame that is the worst
  for all four, and a resting position with three pixels of clearance is not a
  placement that holds. Every letter is stepped through twelve frames of its
  own cycle and measured at each, which is also what keeps the wander honest: a
  letter given a generous keyframe leaves the card, or lands on a word, at some
  frame the eye would have to be quick to catch.

  Three widths, because the offsets change at `sm` and because the card is a
  different shape below `md`: 707px tall and single-column at 640, about 440
  and two columns above it.
*/
const adrift = [], onInk = [], clipped = [], sides = [];
for (const width of [640, 768, 1280]) {
  await p.setViewportSize({ width, height: 1000 });
  await p.goto(`${B}/welcome`, { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForTimeout(200);
  for (let frame = 0; frame < 12; frame++) {
    const seen = await p.evaluate((frac) => {
      const card = document.querySelector("#cases .overflow-hidden.rounded-\\[var\\(--r-xl\\)\\]");
      const letters = [...document.querySelectorAll("#cases span.drift")];
      if (!card || letters.length === 0) return null;

      /* Hold every letter at the same fraction of its own cycle. The periods
         differ on purpose, so a shared delay would sample four different
         points and never the same one twice. */
      for (const el of letters) {
        const dur = parseFloat(getComputedStyle(el).animationDuration) || 9;
        el.style.animationDelay = `${-frac * dur}s`;
        el.style.animationPlayState = "paused";
      }

      const box = (e) => e.getBoundingClientRect();
      const over = (a, c) => ({
        x: Math.min(a.right, c.right) - Math.max(a.left, c.left),
        y: Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top),
      });

      // Every glyph run and every control the card holds.
      const ink = [];
      const walk = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (!/\S/.test(n.textContent)) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const q of range.getClientRects()) {
          if (q.width > 0 && q.height > 0) ink.push({ q, what: n.textContent.trim().slice(0, 20) });
        }
      }
      for (const c of card.querySelectorAll("button, a, input")) {
        ink.push({ q: box(c), what: `the ${c.textContent.trim().slice(0, 14)} control` });
      }

      const c = box(card);
      return letters.map((el) => {
        const a = box(el);
        const o = over(a, c);
        const hit = ink.find((i) => { const q = over(a, i.q); return q.x > 0 && q.y > 0; });
        /* Which side it hangs off, as the one edge it reaches past. A letter
           drawn wholly inside the card overlaps it perfectly and hangs off
           nothing, which is not "tucked over an edge" and is why the side is
           read rather than the overlap alone. */
        const out = { top: c.top - a.top, bottom: a.bottom - c.bottom, left: c.left - a.left, right: a.right - c.right };
        const outside = Object.entries(out).filter(([, v]) => v > 1).map(([k]) => k);
        return {
          ch: el.textContent.trim(),
          touches: Math.round(Math.min(o.x, o.y)),
          side: outside.length === 1 ? outside[0] : outside.join("+") || "none",
          on: hit ? hit.what : null,
          past: Math.round(a.left < 0 ? -a.left : Math.max(0, a.right - innerWidth)),
        };
      });
    }, frame / 12);

    if (seen === null || seen.length !== 4) {
      adrift.push(`${width}: expected four letters around the card, found ${seen?.length ?? "no card"}`);
      break;
    }
    for (const l of seen) {
      if (l.touches < 4) adrift.push(`${width} f${frame}: ${l.ch} misses the card by ${-l.touches}px`);
      if (l.on) onInk.push(`${width} f${frame}: ${l.ch} over ${l.on}`);
      if (l.past > 1) clipped.push(`${width} f${frame}: ${l.ch} ${l.past}px past the edge`);
    }
    if (frame === 0) {
      const taken = seen.map((l) => l.side);
      if (new Set(taken).size !== 4 || taken.includes("none")) {
        sides.push(`${width}: ${seen.map((l) => `${l.ch}=${l.side}`).join(" ")}`);
      }
    }
  }
}
await p.setViewportSize({ width: 1280, height: 1000 });

check("every landing letter is tucked over an edge of the card", adrift.length === 0,
  adrift.slice(0, 4).join(" | "));
/* One to a side is the placement rule, not a description of where they sit.
   Three on one edge and one adrift is what this looked like before it was a
   rule, and every letter overlapping the card cannot tell the difference. */
check("the four letters take one side each", sides.length === 0, sides.join(" | "));
check("no landing letter is drawn on anything the card says", onInk.length === 0,
  onInk.slice(0, 4).join(" | "));
check("no landing letter is clipped by the edge of the page", clipped.length === 0,
  clipped.slice(0, 4).join(" | "));
/*
  THE SLANT SURVIVES THE ANIMATION BEING TAKEN AWAY, which is the only form of
  this question worth asking.

  It used to be asked by reading `rotate` off a letter mid-wander and failing on
  exactly 0. That can never fire. The wander rocks each letter by `--drift-turn`
  about its declared angle, so a letter that has lost its slant entirely reads
  0.22deg at one frame and -1.32deg at another, and never the 0 the check was
  watching for. Measured that way here, with `--float-tilt` deliberately deleted
  from one letter: four passes, no failure, on a page where a quarter of the
  ornament was broken.

  So the animation is actually stopped, the way a reader who asked for less
  motion stops it. `prefers-reduced-motion` shortens every animation in this app
  to 0.01ms with no fill, so whatever is left is what the element declares for
  itself, which is the whole reason the slant is a `rotate` property rather than
  a keyframe.
*/
await p.emulateMedia({ reducedMotion: "reduce" });
await p.goto(`${B}/welcome`, { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(200);
const unslanted = await p.evaluate(() =>
  [...document.querySelectorAll("#cases span.drift")]
    .filter((el) => {
      const r = getComputedStyle(el).rotate;
      return !r || r === "none" || Math.abs(parseFloat(r)) < 1;
    })
    .map((el) => el.textContent.trim()));
await p.emulateMedia({ reducedMotion: null });

check("every landing letter keeps its slant with the motion turned off",
  unslanted.length === 0, unslanted.join(" "));

/*
  THE HERO'S ARITHMETIC AGAINST THE NAV IT IS SUBTRACTING.

  `.hero-screen` is `100svh` less `--landing-nav` less `--hero-peek`, and the
  first of those is a typed constant standing in for something drawn on screen,
  which is the shape that drifts: raise the nav's padding or put a taller
  control in the pill and the hero is that much too long, so the peek it leaves
  under itself closes up and the page reads as ending at the fold again. The
  nav is the same height at every width this app is drawn at, because the pill
  is sized by the button in it rather than by anything that reflows, so one
  measurement is the whole check. A pixel of slack for a fractional layout.

  And the peek is checked by what it is for rather than by its number: the
  section under the hero has to have started by the fold, and its heading has
  to still be arriving at it. A hero that ends exactly at the bottom of the
  window is a page that looks like it has nothing after it, which is the fault
  this band exists to prevent, and a band wide enough to fit that whole section
  in is the opposite fault, two openings competing on one screen.
*/
const heroFit = [];
/*
  The last two are the boundary of the display step, one pixel apart, because a
  rule taken on two axes is a rule with a corner and the corner is where it is
  wrong. 88px of headline over a 19px paragraph needs both the width for its
  longest line and the height for the column: measured, 740 leaves 64px over
  the headline and 739 has to fall back or the hero takes its own peek band
  under the fold. Asserting the size at 1000x740 and 1000x739 is asserting that
  the height half of the condition is really there, which a check at one
  comfortable desktop size cannot see.
*/
for (const [width, height, display] of [
  [390, 844, "52px"], [768, 1024, "88px"], [1024, 600, "68px"], [1280, 800, "88px"],
  [1512, 982, "88px"], [1920, 1080, "88px"], [1000, 740, "88px"], [1000, 739, "68px"],
]) {
  await p.setViewportSize({ width, height });
  await p.goto(`${B}/welcome`, { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForTimeout(200);
  const seen = await p.evaluate(() => {
    const bottom = (el) => Math.round(el.getBoundingClientRect().bottom);
    const top = (el) => Math.round(el.getBoundingClientRect().top);
    const nav = document.querySelector("header nav");
    const cases = document.querySelector("#cases");
    const hero = document.querySelector(".hero-screen");
    const h1 = hero.querySelector("h1");
    const declared = getComputedStyle(hero).getPropertyValue("--landing-nav");
    return {
      navBottom: bottom(nav),
      declared: Math.round(parseFloat(declared)),
      casesTop: top(cases),
      headingTop: top(cases.querySelector("h2")),
      display: getComputedStyle(h1).fontSize,
      headlineTop: top(h1),
      fold: window.innerHeight,
    };
  });
  const at = `${width}x${height}`;
  if (seen.display !== display) {
    heroFit.push(`${at} the headline is ${seen.display}, not the ${display} this window has room for`);
  }
  if (seen.headlineTop - seen.navBottom < 32) {
    heroFit.push(`${at} the headline is ${seen.headlineTop - seen.navBottom}px under the nav, which is not air`);
  }
  if (Math.abs(seen.navBottom - seen.declared) > 1) {
    heroFit.push(`${at} nav is ${seen.navBottom}px, --landing-nav says ${seen.declared}px`);
  }
  if (seen.casesTop >= seen.fold) heroFit.push(`${at} nothing of the next section shows above the fold`);
  if (seen.headingTop <= seen.fold - 120) heroFit.push(`${at} the next section's heading is ${seen.fold - seen.headingTop}px above the fold, which is a second opening rather than a peek`);
}

check("the hero fills the window and leaves the next section starting in it",
  heroFit.length === 0, heroFit.join(" | "));

console.log(`\n  ${sizes.size} type steps · ${weights.size} weights · ${radii.size} radii · ${contrast.length} contrast failures`);
await b.close();
done();
