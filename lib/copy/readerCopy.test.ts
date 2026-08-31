/*
  NOTHING A READER SEES MAY SOUND LIKE IT WAS GENERATED.

  Not a style preference. Every screen in this app is one person explaining
  Estonian to another, and somebody using it is usually also sitting in a class
  or reading a textbook. A learner skims marketing. They do not skim a teacher,
  so the moment a panel starts sounding like a brochure it stops being read the
  way the thing beside it is read.

  This sweeps for the mechanical half of that: the dash used as a clause break,
  which is the loudest single tell there is, and every phrase and sentence
  shape in `lib/copy/voice.ts`. The dash rule came first and was the only one
  with a sweep behind it. The vocabulary rule existed in three places that did
  not agree, and the one covering hand-written copy covered six files out of
  four hundred, so a phrase Anu was forbidden from using was fine in the panel
  next to her. There is one table now and all three readers of it are here, in
  `lib/tutor/humanize.ts` and in `lib/tutor/prompt.ts`.

  It walks the whole of `app/`, `lib/` and `components/` rather than a list of
  screens somebody remembered to keep up to date, because a rule that only
  holds where it was last checked is a rule that decays. `ALLOWED` below is
  the exceptions, and every one of them is a place where the character or the
  phrase is data rather than copy: something matched against, something
  stripped out, something parsed. Adding to it means arguing that a reader
  still cannot see it. It is not a place to park copy that has not been fixed
  yet, and the stale-exception test is what keeps that true.

  WHAT THIS CANNOT SEE is whether a sentence is warm, and whether it is short
  enough. Those are the other half of the rule and they are a review standard
  written out with worked examples in `docs/18-voice.md`, because no regex
  tells kind from cold. What is here is the half a machine can hold.
*/
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { EM_DASH as EM, EMOJI, EN_DASH as EN, TELLS, findTells } from "./voice";

/**
 * Files allowed to break one of these rules, which rule, and why.
 *
 * Per rule rather than per file, because the two exemptions here are not the
 * same exemption: the table has to name the characters it strips, and the
 * standard has to name the phrases it bans and show the copy it exists to
 * prevent. Neither has any business carrying a dash it did not mean, and
 * `docs/18-voice.md` is swept for one like anything else.
 */
const ALLOWED = new Map<string, { rules: ("dash" | "tell")[]; why: string }>([
  [
    "lib/copy/voice.ts",
    {
      rules: ["dash", "tell"],
      why: "Is the table. It has to name every character and phrase it bans, and deleting them here deletes the rule.",
    },
  ],
  [
    "docs/18-voice.md",
    {
      rules: ["tell"],
      why: "Is the standard. It names every banned phrase and quotes the generated copy it exists to prevent.",
    },
  ],
]);

/** Whether a file is excused from one rule. */
function excused(file: string, rule: "dash" | "tell"): boolean {
  return ALLOWED.get(file)?.rules.includes(rule) ?? false;
}

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

function sourceFiles(dir: string, extensions = /\.(ts|tsx)$/): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full, extensions));
    // Test files are exempt on purpose: no test renders to anybody, so a dash
    // in one is source. Excluding them is also what lets this file, which has
    // to name the character, stay out of the exception list. `.itest.ts` is
    // the database-backed half of the same suite and is exempt for the same
    // reason, not because it was easier than fixing one.
    else if (extensions.test(entry) && !/\.i?test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

// `flatMap(sourceFiles)` would hand the array index in as the second argument,
// which is how a default parameter gets silently overridden with a number.
const FILES = ["app", "components", "lib"].flatMap((dir) => sourceFiles(dir));

/**
 * The prose of a markdown file.
 *
 * A fenced block and an inline code span are data, exactly as a string literal
 * is in the source tree: `docs/04-data-model.md` quotes the Prisma schema and
 * `docs/10-testing-quality.md` quotes the grep the secret scan runs, and
 * rewriting the punctuation inside either would be rewriting the thing being
 * quoted. It is also how a document names a banned phrase without using one,
 * which is what keeps the exemption list down to the one file that has to
 * *show* the copy rather than merely name it.
 */
function markdownProse(file: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  let fenced = false;
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((raw, i) => {
      if (/^\s*(```|~~~)/.test(raw)) {
        fenced = !fenced;
        return;
      }
      if (fenced) return;
      out.push({ line: i + 1, text: raw.replace(/`[^`]*`/g, " ") });
    });
  return out;
}

/**
 * Every page written for a reader rather than for a compiler.
 *
 * `docs/` was left out of this when the rule was first written, on the
 * argument that those pages are read by contributors rather than by learners.
 * That was true and it was not a reason: they are still somebody explaining
 * something to somebody, they are the first thing a new contributor reads, and
 * a project whose own documentation is written in the voice it forbids on
 * screen is teaching the next person which of its rules are real. There were
 * 388 dashes behind that argument, and three of them were the `NO_VALUE` fault
 * from the source tree wearing a different hat: an empty cell in a paradigm
 * table, in the four-states table and in the degradation table, each written as
 * a bare dash that a mechanical sweep would have turned into a comma.
 */
const MARKDOWN = ["CLAUDE.md", "README.md", ...sourceFiles("docs", /\.md$/)];

function offenders(character: string): string[] {
  return FILES.filter((f) => !excused(f, "dash")).flatMap((f) =>
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
    The README is the other page a stranger reads before the app, and `docs/`
    is what the next person to work here reads first. A project whose own
    documentation is written in the voice it forbids on screen has told that
    person which of its rules are real.
  */
  it("finds the documentation it is supposed to be checking", () => {
    expect(MARKDOWN).toContain("README.md");
    expect(MARKDOWN).toContain("CLAUDE.md");
    expect(MARKDOWN).toContain("docs/03-architecture.md");
    expect(MARKDOWN.length).toBeGreaterThan(15);
  });

  it("has no dash a reader could see in the README or the docs", () => {
    const bad = MARKDOWN.filter((f) => !excused(f, "dash")).flatMap((f) =>
      markdownProse(f)
        .filter((l) => l.text.includes(EM) || l.text.includes(EN))
        .map((l) => `${f}:${l.line}: ${l.text.trim().slice(0, 100)}`),
    );
    expect(bad).toEqual([]);
  });

  /*
    Keeps the exception list honest. An entry naming a file that no longer
    contains a dash is an entry that has become a parking space, and the next
    person to need one will add theirs beside it.
  */
  it("has no stale exception", () => {
    const stale = [...ALLOWED.entries()].filter(([file, { rules }]) => {
      const source = readFileSync(file, "utf8");
      const needsDash = source.includes(EM) || source.includes(EN);
      const needsTell = findTells(source).length > 0;
      return rules.some((r) => (r === "dash" ? !needsDash : !needsTell));
    });
    expect(stale.map(([f]) => f)).toEqual([]);
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

describe("nothing a reader sees is written in brochure", () => {
  /*
    Same argument as the dash, and now the same sweep. This used to run over
    six hand-listed public files, which is how a rule quietly narrows to the
    screens somebody happened to be looking at: the landing page was covered
    and the 73-unit course page, the exam briefing and every empty state were
    not. The table is `lib/copy/voice.ts` and Anu is asked for the same list,
    so what she may not say is what a panel may not say.
  */
  it("says the plain thing, on every screen", () => {
    const bad = FILES.filter((f) => !excused(f, "tell")).flatMap((f) =>
      readerFacingLines(f).flatMap((l) =>
        findTells(l.text).map((t) => `${f}:${l.line}: [${t.name}] ${l.text.trim().slice(0, 100)}`),
      ),
    );
    expect(bad).toEqual([]);
  });

  it("says the plain thing in the README and the docs too", () => {
    const bad = MARKDOWN.filter((f) => !excused(f, "tell")).flatMap((f) =>
      markdownProse(f).flatMap((l) =>
        findTells(l.text).map((t) => `${f}:${l.line}: [${t.name}] ${l.text.trim().slice(0, 100)}`),
      ),
    );
    expect(bad).toEqual([]);
  });

  /*
    An emoji at the head of a bullet is the visual form of the same tell, and
    it would be going around an icon system this app already has: data that
    drives UI carries a lucide icon name and `components/icons.tsx` is the only
    place one becomes a component. The pattern is deliberately narrow, for the
    reason written beside it in `voice.ts`: the arrow in "Estonian to English",
    the return key in a keyboard hint and the tick on the week strip are
    typographic glyphs doing a job, and a sweep that took those out would be
    waived by the first person it inconvenienced.
  */
  it("uses its own icons rather than emoji", () => {
    const inSource = FILES.filter((f) => !excused(f, "tell")).flatMap((f) =>
      readerFacingLines(f)
        .filter((l) => EMOJI.test(l.text))
        .map((l) => `${f}:${l.line}: ${l.text.trim().slice(0, 100)}`),
    );
    const inDocs = MARKDOWN.filter((f) => !excused(f, "tell")).flatMap((f) =>
      markdownProse(f)
        .filter((l) => EMOJI.test(l.text))
        .map((l) => `${f}:${l.line}: ${l.text.trim().slice(0, 100)}`),
    );
    expect([...inSource, ...inDocs]).toEqual([]);
  });
});

/*
  The table, checked against itself.

  A ban list nobody has watched fail is a ban list of unknown state, and the
  expensive failure here is not a missing tell, it is a tell that fires on
  honest copy: a check everybody waives is a check nobody reads. Both
  directions are asserted, and the second list is the sentences that actually
  tripped an earlier draft of this table while it was being written.
*/
describe("the voice table catches what it claims to and nothing else", () => {
  it("has an instead for every tell, so a failure says what to write", () => {
    for (const tell of TELLS) {
      expect(tell.instead.length, `${tell.name} has no replacement to suggest`).toBeGreaterThan(10);
      expect(tell.find.flags, `${tell.name} is case sensitive`).toContain("i");
    }
  });

  it("catches the phrases it exists for", () => {
    const generated = [
      "It's important to note that Estonian has fourteen cases.",
      "At the end of the day, practice is what matters.",
      "Great question! The partitive is used here.",
      "In conclusion, keep reviewing every day.",
      "Moreover, the genitive stem carries the whole paradigm.",
      "This is not just a rule, but a pattern you will see everywhere.",
      "Estonian is more than just a language.",
      "Let's delve into the partitive.",
      "Leverage our seamless, cutting-edge learning platform.",
      "Embark on your Estonian journey today.",
      "Unlock the power of spaced repetition.",
      "Whether you're a beginner or an advanced speaker, we've got you covered.",
      "Amazing work! That was fantastic.",
      "As an AI, I cannot be certain about that form.",
    ];
    for (const line of generated) {
      expect(findTells(line).map((t) => t.name), `nothing caught: ${line}`).not.toEqual([]);
    }
  });

  it("leaves honest copy alone", () => {
    const written = [
      "The recordings unlock once you have read the questions.",
      "Level 4, 120 XP to the next level.",
      "Whether you are stating, supposing, instructing or passing on something you did not witness.",
      "Navigate the health system and discuss public health policy.",
      "Not just answered right once.",
      "The perfect tense is taisminevik, and it is built on the tud-participle.",
      "Six days in a row. Your longest run so far.",
      "We could not reach Ekilex, so this word has no paradigm yet.",
      "Fill in what you know. The genitive alone unlocks all eleven regular cases.",
    ];
    for (const line of written) {
      expect(findTells(line).map((t) => t.name), `false positive: ${line}`).toEqual([]);
    }
  });
});
