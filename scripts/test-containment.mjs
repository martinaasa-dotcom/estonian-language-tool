#!/usr/bin/env node
/**
 * Text and icons stay inside the boxes they were drawn into, measured.
 *
 * Every other rule in this repository about the shape of a page is about the
 * page as a whole: the root declares no overflow, the document cannot be
 * dragged sideways, a target clears 44px. None of them can see the fault this
 * suite is named after, because it happens *inside* a card that is itself the
 * right size. A word runs over the border and onto the ground behind it; a
 * label meets an icon in a flex row and squeezes the icon into an oval; a
 * count reaches three digits and paints outside the circle it was centred in.
 * The page never scrolls sideways for any of that, so `test-mobile.mjs` reads
 * a clean pass and the screen looks broken.
 *
 * THREE FAULTS, AND EACH IS A DIFFERENT MISTAKE.
 *
 *   1. Something is CUT OFF. It sits inside an ancestor that clips, and part
 *      of it is past the clip: the reader is missing text and has no way to
 *      reach it. A scroller is not this fault — being able to scroll to the
 *      rest is the way out, which is why an ancestor that scrolls on an axis
 *      ends the search on that axis rather than counting as a clip.
 *
 *   2. Something BLEEDS OVER a boundary that is drawn. The nearest ancestor
 *      that paints a border or a fill is the box a reader sees, and ink
 *      outside its padding box is ink on the wrong side of a line somebody
 *      drew. Nothing clips it, so nothing is lost; it just reads as broken.
 *
 *   3. An ICON IS DEFORMED. A lucide icon is a square with `width` and
 *      `height` attributes on it, and a flex row squeezes it whenever the
 *      text beside it is longer than the row. `svg.lucide { flex: none }` in
 *      app/globals.css is the one rule that stops that, and this is what says
 *      the rule is still doing its job on a real page.
 *
 * AND THEN THE SAME THREE WITH NOTHING TO BREAK ON, WHICH IS THE HALF THAT
 * MATTERS. A page that holds today's words is not a page that holds text: a
 * row fits because the gloss it happens to carry has three spaces in it, and
 * a browser will break a line at a space whether or not anybody thought about
 * it. So every run of text is swapped for a run of letters OF THE SAME LENGTH
 * with no space and no hyphen anywhere in it, and the same three questions are
 * asked again.
 *
 * SAME LENGTH IS THE WHOLE DISCIPLINE OF IT. A stress test that hands every
 * element a forty-character word is unfalsifiable: a ring whose middle says
 * "42%" will fail it, and there is no markup that would pass. Same length asks
 * the question the language actually poses. Estonian compounds: "raamatukogu",
 * "sünnipäevakingitus", a unit title that is one word where the English is
 * four. The gloss "gymnasium, secondary school" fits a card today because of
 * its commas, and the compound of the same width has to fit it too. Anything
 * that fails this is a box sized by the accident of where the spaces fell.
 *
 * Needs the server running and a deck with something in it:
 *   npm run demo && npm run dev
 *   node scripts/test-containment.mjs
 */
import { launchChromium } from "./lib/browser.mjs";
import { baseUrl, suite } from "./lib/checks.mjs";

const B = baseUrl();

/**
 * The narrowest phone anybody still holds, and a desktop. Both, because the
 * two faults live at opposite ends: a word runs out of a card when the card is
 * narrow, and a fixed-width rail runs out of room when the window is wide
 * enough for the rail to exist at all.
 */
const WIDTHS = [360, 1280];

/**
 * A spread of the screens where text arrives from somewhere other than a
 * designer: the dictionary and the review modes carry Estonian, the progress
 * and class screens carry names people typed, and the exam and grammar pages
 * are the densest layouts in the app.
 */
const ROUTES = [
  "/",
  "/dictionary?q=tuba",
  "/review",
  "/review/write",
  "/review/cloze",
  "/review/dictation",
  "/review/pairs",
  "/words",
  "/practice",
  "/progress",
  "/grammar",
  "/grammar/partitive",
  "/learn",
  "/learn/kodu",
  "/learn/kodu/worksheet",
  "/week",
  "/tasks",
  "/settings",
  "/exam",
  "/assess",
  "/guide",
  "/class",
  "/suggestions",
];

/*
  Floor: 192. Twenty-three routes at two widths is forty-six passes, plus the
  examination paper at each width, and every pass reports four things: cut
  off, bled over, deformed, and then the same three again with every word
  turned into one with nothing to break on. Raise this when you add a route;
  never lower it to make a run go green.
*/
const { check, done } = suite("Containment", { floor: 192 });

const browser = await launchChromium();

/**
 * Everything this measures, in one function, because it runs in the page.
 *
 * With `stress` set it first rewrites every run of text into one of the same
 * length that cannot break. All of them change together and the page is
 * measured once, rather than one element at a time, which would be a reflow
 * each on a page with several hundred of them. Every one is put back before
 * this returns, so the two passes over a page are independent.
 */
function survey({ stress }) {
  const EPS = 1.5;
  const originals = [];

  const shown = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    if (parseFloat(cs.opacity) < 0.02) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0.5 || r.height > 0.5;
  };

  const named = (el) => {
    const cls = String(el.getAttribute("class") || "").split(/\s+/).filter(Boolean).slice(0, 2).join(".");
    const text = (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 22);
    return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""}${text ? ` "${text}"` : ""}`;
  };

  /*
    Elements carrying their own words, every lucide icon, and everything that
    arrives with a width of its own.

    That third group is here because it is the one thing neither of the CSS
    rules above can save: a replaced element is laid out from its own content
    and no wrapping rule reaches it. `<input type="file">` is the example that
    put it on this list, at 336px inside a 278px card.
  */
  const SIZED = "img, video, canvas, iframe, input, select, textarea";
  const textLeaves = [];
  const icons = [];
  const sized = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  for (let el = walker.currentNode; el; el = walker.nextNode()) {
    if (el.tagName === "SCRIPT" || el.tagName === "STYLE" || el.tagName === "NOSCRIPT") continue;
    if (el instanceof SVGElement) {
      if (el.tagName === "svg" && el.classList.contains("lucide")) icons.push(el);
      continue;
    }
    if (el.matches(SIZED)) sized.push(el);
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
    if (own) textLeaves.push(el);
  }

  if (stress) {
    /*
      The same run of text, the same number of characters, and nothing in it a
      browser will break on by itself: no space, no hyphen, no soft hyphen.
      The letters cycle through the alphabet rather than repeating one, so the
      run is about as wide as ordinary prose of that length rather than a wall
      of the widest glyph in the font.

      The whitespace on each end is kept, because it is doing layout: the
      arrow between a word and its translation is a text node whose spaces are
      the gap either side of it.
    */
    const ALPHABET = "abcdefghijklmnopqrstuvwxyz";
    const unbreakable = (run) =>
      [...run].map((_, i) => (i === 0 ? ALPHABET[0].toUpperCase() : ALPHABET[i % ALPHABET.length])).join("");

    for (const el of textLeaves) {
      for (const node of el.childNodes) {
        if (node.nodeType !== 3 || !node.textContent.trim()) continue;
        const [, before, run, after] = node.textContent.match(/^(\s*)([\s\S]*?)(\s*)$/);
        originals.push([node, node.textContent]);
        node.textContent = before + unbreakable(run) + after;
      }
    }
    // One forced layout, so everything below reads the stressed page.
    void document.documentElement.scrollWidth;
  }

  const overflowOn = (cs, axis) => (axis === "x" ? cs.overflowX : cs.overflowY);

  const hides = (cs, axis) => ["hidden", "clip"].includes(overflowOn(cs, axis));
  const scrolls = (cs, axis) => ["auto", "scroll"].includes(overflowOn(cs, axis));

  /**
   * The nearest ancestor that cuts this element off on an axis, or null.
   *
   * Three things end the search without being a fault, and each is a way out
   * rather than a loss. An ancestor that SCROLLS on the axis puts the rest of
   * the content one gesture away. An ancestor that ELIDES on the axis has said
   * in CSS that it is cutting the line short and drawing an ellipsis where it
   * did, which is a decision rather than an accident: `truncate` is how a deck
   * row keeps a long translation to one line. And `body` ends it because the
   * page's own sideways clip is what `test-mobile.mjs` measures, and reporting
   * the same pixel twice in different words helps nobody.
   */
  const clipperOf = (el, axis) => {
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (scrolls(cs, axis)) return null;
      if (axis === "x" && cs.textOverflow.startsWith("ellipsis")) return null;
      if (hides(cs, axis)) return n;
    }
    return null;
  };

  /**
   * The nearest ancestor a reader can actually see the edge of: one that
   * paints a border or a fill. That is the box the ink belongs inside.
   *
   * Anything that clips or scrolls on the way up ends the search first,
   * because ink a clip has already taken away is not ink on the wrong side of
   * a line. Skipping that step is what had this suite reporting a translation
   * inside a `truncate` as 78px outside its own row, when what a reader saw
   * there was an ellipsis.
   */
  const boxOf = (el) => {
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (["x", "y"].some((a) => scrolls(cs, a) || hides(cs, a))) return null;
      const bordered = ["Top", "Right", "Bottom", "Left"].some(
        (s) => cs[`border${s}Style`] !== "none" && parseFloat(cs[`border${s}Width`]) > 0,
      );
      const filled = cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent";
      if (bordered || filled) return n;
    }
    return null;
  };

  /** How far outside `box`'s padding box `el` reaches, in px, on the given axes. */
  const overshoot = (el, box, axes) => {
    const r = el.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    const cs = getComputedStyle(box);
    const edge = {
      left: b.left + parseFloat(cs.borderLeftWidth),
      right: b.right - parseFloat(cs.borderRightWidth),
      top: b.top + parseFloat(cs.borderTopWidth),
      bottom: b.bottom - parseFloat(cs.borderBottomWidth),
    };
    let out = 0;
    if (axes.includes("x")) out = Math.max(out, edge.left - r.left, r.right - edge.right);
    if (axes.includes("y")) out = Math.max(out, edge.top - r.top, r.bottom - edge.bottom);
    return out;
  };

  const cut = [];
  const bled = [];
  const deformed = [];

  /*
    An absolutely positioned element was put where it is on purpose — a corner
    badge, a floating action, a decorative wash — so its own placement is not
    this suite's business. Its descendants still are, and they are reached
    anyway, because skipping an element is not skipping the walk.
  */
  const placed = (el) => ["absolute", "fixed"].includes(getComputedStyle(el).position);

  for (const el of [...textLeaves, ...icons, ...sized]) {
    if (!shown(el) || placed(el)) continue;

    for (const axis of ["x", "y"]) {
      const clip = clipperOf(el, axis);
      if (!clip) continue;
      const over = overshoot(el, clip, [axis]);
      if (over > EPS) cut.push(`${named(el)} ${Math.round(over)}px past ${named(clip)}`);
    }

    const box = boxOf(el);
    if (box) {
      const over = overshoot(el, box, ["x", "y"]);
      if (over > EPS) bled.push(`${named(el)} ${Math.round(over)}px outside ${named(box)}`);
    }
  }

  for (const svg of icons) {
    if (!shown(svg)) continue;
    const want = { w: parseFloat(svg.getAttribute("width")), h: parseFloat(svg.getAttribute("height")) };
    if (!Number.isFinite(want.w) || !Number.isFinite(want.h)) continue;
    const r = svg.getBoundingClientRect();
    if (Math.abs(r.width - want.w) > 1 || Math.abs(r.height - want.h) > 1) {
      deformed.push(`${named(svg)} drawn ${Math.round(r.width)}x${Math.round(r.height)}, declared ${want.w}x${want.h}`);
    }
  }

  const doc = document.documentElement;
  const sideways = Math.round(doc.scrollWidth - doc.clientWidth);

  for (const [node, text] of originals) node.textContent = text;

  // Deduplicated: one broken row in a list of forty is one fault, not forty.
  const first = (list) => [...new Set(list)].slice(0, 3).join(" · ");
  return {
    cut: [...new Set(cut)].length,
    bled: [...new Set(bled)].length,
    deformed: [...new Set(deformed)].length,
    sideways,
    say: { cut: first(cut), bled: first(bled), deformed: first(deformed) },
    counted: textLeaves.length + icons.length + sized.length,
  };
}

for (const width of WIDTHS) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    hasTouch: width < 768,
    isMobile: width < 768,
    // The animations are what would otherwise be measured: `pop-in` scales a
    // card past its own box for 450ms, and a suite that races that reports a
    // different answer every run.
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();

  for (const route of ROUTES) {
    await page.goto(`${B}${route}`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(250);

    const at = `${route} at ${width}`;
    const rest = await page.evaluate(survey, { stress: false });
    /*
      `counted` rides along on the first check rather than getting one of its
      own. A route that rendered an error boundary has a heading and a button
      on it and passes all four of these on the strength of having almost
      nothing to look at, which is the failure `scripts/lib/checks.mjs` exists
      for arriving one level further in: the block ran, it just ran over an
      empty page. Twenty-five, against a measured minimum of 31 on
      `/review/pairs`, which is the thinnest screen in the list.
    */
    check(
      `nothing is cut off on ${at}`,
      rest.cut === 0 && rest.counted >= 25,
      rest.cut > 0 ? rest.say.cut : `only ${rest.counted} things on the page to look at`,
    );
    check(`nothing bleeds over a border on ${at}`, rest.bled === 0, rest.say.bled);
    check(`no icon is deformed on ${at}`, rest.deformed === 0, rest.say.deformed);

    const hard = await page.evaluate(survey, { stress: true });
    check(
      `the same words with nothing to break on stay in their boxes on ${at}`,
      hard.cut === 0 && hard.bled === 0 && hard.deformed === 0 && hard.sideways <= 0,
      [hard.say.cut, hard.say.bled, hard.say.deformed, hard.sideways > 0 ? `${hard.sideways}px sideways` : ""]
        .filter(Boolean).join(" · "),
    );
  }

  /*
    And the examination paper, which is not in the list above because it takes
    a click to reach and is worth the extra load anyway. It is the densest
    screen in the app and the one that has already produced this fault twice:
    a diacritic bar a pixel wider than a phone has room for, and a chip
    carrying a dictionary gloss ("gymnasium, secondary school, high school")
    that would not wrap, at 404px of unbreakable line inside a 350px card.
    Both were found on a device rather than by a check, which is the argument
    for the check.
  */
  const paper = await ctx.newPage();
  await paper.goto(`${B}/exam/A2?seed=containment`, { waitUntil: "networkidle", timeout: 60000 });
  await paper.getByRole("button", { name: "Start the clock" }).click();
  await paper.waitForTimeout(700);

  const sat = await paper.evaluate(survey, { stress: false });
  check(`nothing is cut off on the A2 paper at ${width}`, sat.cut === 0, sat.say.cut);
  check(`nothing bleeds over a border on the A2 paper at ${width}`, sat.bled === 0, sat.say.bled);
  check(`no icon is deformed on the A2 paper at ${width}`, sat.deformed === 0, sat.say.deformed);

  const strained = await paper.evaluate(survey, { stress: true });
  check(
    `the same words with nothing to break on stay in their boxes on the A2 paper at ${width}`,
    strained.cut === 0 && strained.bled === 0 && strained.deformed === 0 && strained.sideways <= 0,
    [strained.say.cut, strained.say.bled, strained.say.deformed,
     strained.sideways > 0 ? `${strained.sideways}px sideways` : ""].filter(Boolean).join(" · "),
  );
  await paper.close();

  await ctx.close();
}

await browser.close();

done();
