/*
  NOTHING A READER SEES MAY CONTAIN AN EM DASH OR AN EN DASH.

  Not a style preference. A dash used as a clause break is the single loudest
  tell that a sentence was generated rather than written, and every screen in
  this app is one person explaining Estonian to another. Anu's own prose was
  already covered: `lib/tutor/humanize.ts` runs over everything the model
  writes on its way to the learner, and the system prompt asks for none.
  Hand-written copy had no guard at all, which is exactly where they had all
  collected.

  It walks the whole of `app/`, `lib/` and `components/` rather than a list of
  screens somebody remembered to keep up to date, because a rule that only
  holds where it was last checked is a rule that decays. `ALLOWED` below is
  the exceptions, and every one of them is a place where the character is
  data rather than copy: something matched against, something stripped out,
  something parsed. Adding to it means arguing that a reader still cannot see
  it. It is not a place to park copy that has not been fixed yet, and the last
  test here is what keeps that true.
*/
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const EM = "—";
const EN = "–";

/** Files allowed to contain a dash, and why. */
const ALLOWED = new Map<string, string>([
  [
    "lib/tutor/humanize.ts",
    "Defines the characters it strips out of model output. Removing them here removes the stripper.",
  ],
  [
    "lib/tutor/prompt.ts",
    "Names the character in the Voice rules so the model knows which one is banned.",
  ],
]);

/**
 * Strip a trailing `//` comment without cutting inside a string.
 *
 * A naive `indexOf("//")` eats the rest of any line holding a URL, which would
 * quietly hide real copy from this check rather than fail on it.
 */
function stripTrailingComment(line: string): string {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i]!;
    if (quote) {
      if (c === "\\") i += 1;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      continue;
    }
    if (c === "/" && line[i + 1] === "/") return line.slice(0, i);
  }
  return line;
}

/**
 * Lines a reader could see: not `//`, not a block comment, not `{/* *\/}`.
 *
 * Comments are for whoever maintains this and may punctuate however they
 * like. The rule is about the product, not the source.
 */
function readerFacingLines(file: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  let inBlock = false;
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((raw, i) => {
      const trimmed = raw.trim();
      if (inBlock) {
        if (trimmed.includes("*/")) inBlock = false;
        return;
      }
      if (trimmed.startsWith("/*") || trimmed.startsWith("{/*")) {
        if (!trimmed.includes("*/")) inBlock = true;
        return;
      }
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
      out.push({ line: i + 1, text: stripTrailingComment(raw) });
    });
  return out;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    // Test files are exempt on purpose: no test renders to anybody, so a dash
    // in one is source. Excluding them is also what lets this file, which has
    // to name the character, stay out of the exception list. `.itest.ts` is
    // the database-backed half of the same suite and is exempt for the same
    // reason, not because it was easier than fixing one.
    else if (/\.(ts|tsx)$/.test(entry) && !/\.i?test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const FILES = ["app", "components", "lib"].flatMap(sourceFiles);

function offenders(character: string): string[] {
  return FILES.filter((f) => !ALLOWED.has(f)).flatMap((f) =>
    readerFacingLines(f)
      .filter((l) => l.text.includes(character))
      .map((l) => `${f}:${l.line}: ${l.text.trim()}`),
  );
}

describe("copy reads as a person wrote it", () => {
  it("finds the source tree it is supposed to be checking", () => {
    expect(FILES.length).toBeGreaterThan(100);
    expect(FILES).toContain("components/Sidebar.tsx");
    expect(FILES).toContain("app/(chromeless)/welcome/page.tsx");
  });

  it("has no em dash a reader could see", () => {
    expect(offenders(EM)).toEqual([]);
  });

  it("has no en dash a reader could see", () => {
    expect(offenders(EN)).toEqual([]);
  });

  /*
    The README is the other page a stranger reads before the app, and the
    landing page's own copy is drawn from it in spirit if not in code.
  */
  it("has none in the README either", () => {
    const bad = readerFacingLines("README.md")
      .filter((l) => l.text.includes(EM) || l.text.includes(EN))
      .map((l) => `README.md:${l.line}: ${l.text.trim()}`);
    expect(bad).toEqual([]);
  });

  /*
    Keeps the exception list honest. An entry naming a file that no longer
    contains a dash is an entry that has become a parking space, and the next
    person to need one will add theirs beside it.
  */
  it("has no stale exception", () => {
    const stale = [...ALLOWED.keys()].filter((file) => {
      const source = readFileSync(file, "utf8");
      return !source.includes(EM) && !source.includes(EN);
    });
    expect(stale).toEqual([]);
  });
});

/*
  The other half of the rule, and the half that bit twice while it was being
  applied.

  Some code has to *read* a dash: a pasted word list separated by one, a
  dictated Ekilex sentence with one standing on its own, a stored translation
  whose placeholder used to be one. A sweep that cannot tell those from copy
  rewrites them, and the damage is silent: a word list stops splitting, a
  stray dash becomes a word the learner has to type, every old placeholder
  starts looking like a translation somebody chose. Both were rewritten once
  before this test existed.

  So they are written with escapes, which keeps them out of the sweep's way
  and out of the exception list, and this asserts they still read all three
  characters rather than that a particular regex is spelled a particular way.
*/
describe("the code that reads a dash still reads every one of them", () => {
  it("splits a pasted word list on any dash somebody typed", async () => {
    const source = readFileSync("app/(app)/settings/ImportPanel.tsx", "utf8");
    const pattern = source.match(/const DASH_SEPARATED = (\/.+\/);/)?.[1];
    expect(pattern, "DASH_SEPARATED is gone or renamed").toBeTruthy();
    const separator = new RegExp(pattern!.slice(1, -1));
    for (const dash of [EM, EN, "-"]) {
      expect(`tuba ${dash} room`.split(separator)).toEqual(["tuba", "room"]);
    }
    expect(separator.test("tuba, room")).toBe(false);
  });

  it("cuts a stored government string at any dash the dictionary carries", async () => {
    const { parseGovernment } = await import("@/lib/estonian/government");
    for (const dash of [EM, EN, "-"]) {
      const parsed = parseGovernment(`Partitive ${dash} aitan sind (I help you)`);
      expect(parsed?.caseKey, `a ${dash} separator stopped parsing`).toBe("PARTITIVE");
      expect(parsed?.example).toBe("aitan sind");
      expect(parsed?.gloss).toBe("I help you");
    }
  });

  it("strips a dash off a word before checking the learner used the form", async () => {
    const { checkForm } = await import("@/lib/estonian/writing");
    // Without the dash in the punctuation class the token stays "toas-see",
    // the whole-word match fails, and a correct sentence is marked wrong.
    const task = { targetForm: "toas" } as Parameters<typeof checkForm>[1];
    for (const dash of [EM, EN]) {
      expect(checkForm(`Ma olen toas${dash}see on hea`, task, []).used).toBe(true);
    }
  });

  it("strips a dash standing on its own out of a dictated sentence", async () => {
    const { dictationWords } = await import("@/lib/estonian/dictation");
    // A dash between two words is punctuation, not something to type back.
    for (const dash of [EM, EN]) {
      expect(dictationWords(`Tere ${dash} kuidas läheb`)).toEqual(["Tere", "kuidas", "läheb"]);
    }
  });
});

describe("no brochure words on the pages a stranger reads first", () => {
  /*
    Same argument as the dash: one of these on a public surface is how a
    product starts sounding generated. Anu is told not to use them; this is
    the hand-written side.
  */
  it("says the plain thing", () => {
    const brochure =
      /\b(delve|testament to|groundbreaking|seamless|cutting-edge|harness|unlock your|empower|elevate your|in today's fast-paced|a wide range of)\b/i;
    const publicCopy = [
      "app/(chromeless)/welcome/page.tsx",
      "app/(chromeless)/sign-in/page.tsx",
      "app/(chromeless)/start/WelcomeWizard.tsx",
      "app/layout.tsx",
      "app/manifest.ts",
      "README.md",
    ];
    const bad = publicCopy.flatMap((f) =>
      readerFacingLines(f)
        .filter((l) => brochure.test(l.text))
        .map((l) => `${f}:${l.line}: ${l.text.trim()}`),
    );
    expect(bad).toEqual([]);
  });
});
