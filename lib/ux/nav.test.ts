import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BAR, DESTINATIONS, isUnder, LISTED, PLACES, SECTIONS, sectionOf } from "./nav";
import { PRACTICE_MODES, QUICK_MODES, TARGETED_MODES } from "./modes";
import { ICONS } from "../../components/icons";

/** Every `page.tsx` under app/(app), as the route a learner would type. */
function routes(): Set<string> {
  const root = "app/(app)";
  const found = new Set<string>();
  const walk = (dir: string, url: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        // A dynamic segment is not a destination anybody navigates to by name.
        walk(path, entry.startsWith("[") ? `${url}/*` : `${url}/${entry}`);
      } else if (entry === "page.tsx") {
        found.add(url === "" ? "/" : url);
      }
    }
  };
  walk(root, "");
  return found;
}

describe("the navigation table", () => {
  it("names a route that exists for every destination", () => {
    const real = routes();
    for (const item of DESTINATIONS) {
      expect(real.has(item.href), `${item.href} is in the rail and is not a page`).toBe(true);
    }
  });

  it("names each destination once", () => {
    const hrefs = DESTINATIONS.map((d) => d.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("gives every destination a blurb, an icon and search words", () => {
    for (const item of DESTINATIONS) {
      expect(item.blurb.length, `${item.href} has no blurb`).toBeGreaterThan(0);
      expect(item.icon.length, `${item.href} has no icon`).toBeGreaterThan(0);
      expect(item.keywords.length, `${item.href} has no keywords`).toBeGreaterThan(0);
    }
  });

  it("puts four destinations in the phone bar", () => {
    // Five cells across a phone, and the fifth is how you reach everything
    // else. A fifth destination here silently costs the sheet its way in.
    expect(BAR).toHaveLength(4);
  });

  it("holds no empty section", () => {
    for (const section of SECTIONS) expect(section.items.length, section.id).toBeGreaterThan(0);
  });

  it("keeps the app's own settings out of the places a learner navigates by", () => {
    expect(PLACES.map((s) => s.id)).not.toContain("app");
    expect(SECTIONS.map((s) => s.id)).toContain("app");
  });

  it("does not list a destination that already has a button of its own", () => {
    /*
      Anu sits in the corner of every signed-in screen, so a rail row saying
      "Ask Anu" was a second door onto a room whose door is always open. She
      stays in the table because the command palette has to find /tutor, which
      the grammar pages and a review card link to with a question in the query
      string.
    */
    const railed = PLACES.flatMap((s) => s.items.map((i) => i.href));
    for (const item of DESTINATIONS.filter((d) => d.fab)) {
      expect(railed, `${item.href} carries its own button and is in the rail too`)
        .not.toContain(item.href);
      expect(LISTED.map((d) => d.href)).not.toContain(item.href);
    }
    expect(DESTINATIONS.some((d) => d.fab), "nothing claims a button of its own").toBe(true);
  });

  it("still reaches every destination through the table the palette reads", () => {
    // Whatever the rail leaves out, SECTIONS keeps, or ⌘K stops going anywhere.
    for (const item of DESTINATIONS) {
      expect(SECTIONS.flatMap((s) => s.items)).toContain(item);
    }
  });
});

describe("isUnder", () => {
  it("matches root exactly, or everything would be Today", () => {
    expect(isUnder("/", "/")).toBe(true);
    expect(isUnder("/", "/review")).toBe(false);
  });

  it("matches a subtree", () => {
    expect(isUnder("/review", "/review")).toBe(true);
    expect(isUnder("/review", "/review/sprint")).toBe(true);
    expect(isUnder("/learn", "/learn/greetings/lesson")).toBe(true);
  });

  it("does not match a sibling that merely starts the same", () => {
    // `/word` against `/words` was the shape that made this a function rather
    // than a `startsWith` at each call site.
    expect(isUnder("/word", "/words")).toBe(false);
    expect(isUnder("/class", "/classes")).toBe(false);
  });
});

describe("sectionOf", () => {
  it("finds the section a page lives in", () => {
    expect(sectionOf("/")?.id).toBe("daily");
    expect(sectionOf("/grammar/inessive")?.id).toBe("lookup");
    expect(sectionOf("/exam/b1")?.id).toBe("standing");
  });

  it("answers nothing for a page outside the rail", () => {
    expect(sectionOf("/placement")).toBeUndefined();
  });

  it("prefers the longest match", () => {
    // /review is in `daily` and /review/sprint is a practice mode rather than a
    // destination, so this is really a guard on the rule: the deepest href
    // wins, not whichever the table happens to list first.
    expect(sectionOf("/review/sprint")?.id).toBe("daily");
  });
});

describe("the practice modes", () => {
  it("names a route that exists for every mode", () => {
    const real = routes();
    for (const mode of PRACTICE_MODES) {
      expect(real.has(mode.href), `${mode.href} is offered and is not a page`).toBe(true);
    }
  });

  it("names each mode once", () => {
    const hrefs = PRACTICE_MODES.map((m) => m.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("gives the six quick rounds six different hues", () => {
    // Today lays them out as a grid of coloured tiles, and two modes sharing a
    // colour there reads as two of the same thing.
    expect(QUICK_MODES).toHaveLength(6);
    expect(new Set(QUICK_MODES.map((m) => m.tone)).size).toBe(6);
  });

  it("splits every mode into one of the two groups", () => {
    expect(QUICK_MODES.length + TARGETED_MODES.length).toBe(PRACTICE_MODES.length);
  });

  it("leads the quick rounds with the three that need only a deck", () => {
    // Today shows the first `practiceTiles(stage)` of these, so the order is
    // the promise that a beginner's three are not the ones needing a
    // microphone or a recorded sentence.
    expect(QUICK_MODES.slice(0, 3).map((m) => m.href)).toEqual([
      "/review/sprint", "/review/match", "/review/sentences",
    ]);
  });

  it("gives every mode a subtitle short enough for a tile", () => {
    for (const mode of PRACTICE_MODES) {
      expect(mode.subtitle.length, `${mode.href}: ${mode.subtitle}`).toBeLessThanOrEqual(24);
    }
  });
});

describe("the icon names both tables carry", () => {
  /*
    `icon()` falls back to a sparkle for a name it does not know, which keeps a
    typo from crashing a page and is exactly why nothing notices one. Two modes
    shipped with the placeholder on this branch before a screenshot caught
    them: `Puzzle` and `Ear` were being asked for and neither was registered.
    A name in a table is a promise that components/icons.tsx can resolve it.
  */
  it("resolves every one of them", () => {
    for (const item of DESTINATIONS) {
      expect(Object.hasOwn(ICONS, item.icon), `${item.href} asks for the unregistered icon ${item.icon}`)
        .toBe(true);
    }
    for (const mode of PRACTICE_MODES) {
      expect(Object.hasOwn(ICONS, mode.icon), `${mode.href} asks for the unregistered icon ${mode.icon}`)
        .toBe(true);
    }
  });
});
