import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
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

/** Every source file under a directory, recursively. */
function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...filesUnder(path));
    else if (/\.tsx?$/.test(entry)) out.push(path);
  }
  return out;
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

  it("does not list a destination that lives inside another one", () => {
    /*
      Three of these. Anu is a button in the corner of every screen, the week
      leads the Tasks page, and scanning is how you get words into the
      dictionary. Each stays in the table so the command palette finds it, and
      none earns a row in a column read top to bottom.
    */
    const railed = PLACES.flatMap((s) => s.items.map((i) => i.href));
    for (const item of DESTINATIONS.filter((d) => d.within)) {
      expect(railed, `${item.href} is reached from elsewhere and is in the rail too`)
        .not.toContain(item.href);
      expect(LISTED.map((d) => d.href)).not.toContain(item.href);
    }
    expect(DESTINATIONS.some((d) => d.within), "nothing lives inside anything").toBe(true);
  });

  it("says where each of those is reached from", () => {
    // A blank here is the next reader having to go and find out, which is how
    // one quietly becomes unreachable.
    for (const item of DESTINATIONS.filter((d) => d.within)) {
      expect(item.within?.length ?? 0, `${item.href} does not say where it is reached from`)
        .toBeGreaterThan(0);
    }
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
    // Where you stand on the course and how far along it you are turned out to
    // be one question rather than two sections, so the mock exam is under the
    // course it measures.
    expect(sectionOf("/exam/b1")?.id).toBe("course");
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

  it("offers a round on the menu and reaches a drill from what it drills", () => {
    // `targeted` is described in modes.ts as "what you open when you already
    // know what is going wrong", and all five of them used to sit on a menu
    // under a heading saying so, which is a list of answers to a question the
    // learner has not been asked. A round is offered; a drill is reached.
    for (const mode of PRACTICE_MODES) {
      expect(Boolean(mode.within), `${mode.href} is ${mode.group} and does not match its group`)
        .toBe(mode.group === "targeted");
    }
    expect(TARGETED_MODES.length).toBeGreaterThan(0);
  });

  it("puts each drill on a page that really does link to it", () => {
    /*
      The half of the rule a table cannot state. Moving a drill off the menu is
      only an improvement if the page it names actually offers it; a `within`
      nobody wired up makes the mode unreachable except through the palette,
      which is worse than the menu it left.

      Asserted against the route's own directory rather than one file, because
      a page splits into a client component as often as not: the dictionary's
      offer lives in DictionaryClient.tsx and the drill for a case in the
      grammar folder's own page.
    */
    for (const mode of TARGETED_MODES) {
      const home = mode.within!.split("/").filter(Boolean)[0]!;
      const dir = join("app/(app)", home);
      expect(existsSync(dir), `${mode.href} says it is reached from ${mode.within}, which is not a route`)
        .toBe(true);
      const linked = filesUnder(dir).some((f) => readFileSync(f, "utf8").includes(mode.href));
      expect(linked, `${mode.href} is reached from ${mode.within} and nothing there links to it`)
        .toBe(true);
    }
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
