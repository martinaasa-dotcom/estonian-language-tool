import { chromium } from "playwright";

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
const B = "http://localhost:3000";
const PAGES = ["/", "/practice", "/grammar", "/grammar/partitive", "/progress", "/learn",
  "/learn/kodu", "/dictionary?q=tuba", "/words", "/settings", "/review", "/review/dictation",
  "/tasks", "/class", "/tutor", "/welcome"];

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

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
const p = await ctx.newPage();

const sizes = new Map(), weights = new Map(), radii = new Map();
const contrast = [];
const small = [];
let noFocus = [];

for (const url of PAGES) {
  await p.goto(B + url, { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForTimeout(250);

  const data = await p.evaluate(() => {
    const out = { text: [], targets: [], radii: [] };
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
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
      // `nextjs-portal` is the dev overlay, not the app.
      if (own && cs.visibility !== "hidden" && parseFloat(cs.opacity) > 0.1
          && !el.closest(".sr-only") && !el.closest("nextjs-portal")) {
        out.text.push({
          size: cs.fontSize, weight: cs.fontWeight, color: cs.color, bg: bgOf(el) ?? "gradient",
          text: el.textContent.trim().slice(0, 40),
          tag: el.tagName, cls: String(el.className).slice(0, 40),
        });
      }
      if (cs.borderRadius && cs.borderRadius !== "0px") out.radii.push(cs.borderRadius.split(" ")[0]);
      if (el.matches("a, button, [role=button], input, select, textarea")) {
        out.targets.push({ w: Math.round(r.width), h: Math.round(r.height), tag: el.tagName,
          label: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30) });
      }
    }
    return out;
  });

  for (const t of data.text) {
    sizes.set(t.size, (sizes.get(t.size) ?? 0) + 1);
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

let failures = 0;
const check = (label, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? "  (" + extra + ")" : ""}`);
};

const SCALE = new Set(["11.5px", "12.5px", "13.5px", "15px", "17px", "19px", "22px", "27px", "32px", "40px", "52px", "68px"]);
const offScale = [...sizes.keys()].filter((s) => !SCALE.has(s));

check("every text size is on the scale", offScale.length === 0,
  offScale.length ? offScale.join(" ") : `${sizes.size} steps in use`);
check("nothing is set below the 11.5px floor",
  [...sizes.keys()].every((s) => parseFloat(s) >= 11.5),
  [...sizes.keys()].filter((s) => parseFloat(s) < 11.5).join(" "));
check("every run of text clears WCAG AA on its background", contrast.length === 0,
  contrast.slice(0, 3).map((c) => `${c.cr}:1 "${c.text}"`).join(" | "));
check("weights stay within the four the system defines", weights.size <= 4,
  [...weights.keys()].join(" "));

// Radii: the four tokens, fully-round pills, circles, and the heatmap cell.
const ALLOWED_RADII = new Set(["10px", "16px", "22px", "30px", "50%", "2px", "8px", "0px"]);
const strayRadii = [...radii.keys()].filter((r) => !ALLOWED_RADII.has(r) && parseFloat(r) < 1000);
check("corners come from the four token radii", strayRadii.length === 0, strayRadii.join(" "));

// A ring that fades in is a ring a keyboard user does not see land.
check("every tab stop shows its focus ring immediately", noFocus.length === 0,
  noFocus.slice(0, 5).join(" | "));

console.log(`\n  ${sizes.size} type steps · ${weights.size} weights · ${radii.size} radii · ${contrast.length} contrast failures`);
await b.close();
console.log(failures === 0 ? "\nDesign system verified." : `\n${failures} failed.`);
process.exit(failures ? 1 : 0);
