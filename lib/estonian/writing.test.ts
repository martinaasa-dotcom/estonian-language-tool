import { describe, expect, it } from "vitest";
import {
  authoritativeForm, checkForm, looksLikeSentence, writingTasksFor,
  type WritingSource, type WritingTask,
} from "./writing";

const tuba: WritingSource = {
  lemma: "tuba",
  translation: "room",
  pos: "NOUN",
  forms: [
    { formType: "NOM_SG", value: "tuba" },
    { formType: "GEN_SG", value: "toa" },
    { formType: "PART_SG", value: "tuba" },
    { formType: "ILL_SG_SHORT", value: "tuppa" },
  ],
};

const withEkilex: WritingSource = {
  ...tuba,
  forms: [
    ...tuba.forms,
    { formType: "EKILEX:SgIn", value: "toas", morphCode: "SgIn" },
    // A form Ekilex disagrees with the derivation about — Ekilex must win.
    { formType: "EKILEX:SgIll", value: "toasse", morphCode: "SgIll" },
  ],
};

describe("authoritativeForm", () => {
  it("prefers an Ekilex form over the app's derivation", () => {
    expect(authoritativeForm(withEkilex, "INESSIVE")).toEqual({
      value: "toas", provenance: "ekilex",
    });
  });

  it("uses a stored principal part for the genitive", () => {
    expect(authoritativeForm(tuba, "GENITIVE")).toEqual({ value: "toa", provenance: "ekilex" });
  });

  it("falls back to deriving from the genitive stem", () => {
    const derived = authoritativeForm(tuba, "INESSIVE");
    expect(derived).toEqual({ value: "toas", provenance: "derived" });
  });

  it("returns null rather than inventing a form when there is no stem", () => {
    const stemless: WritingSource = { lemma: "x", translation: "x", pos: "NOUN", forms: [] };
    expect(authoritativeForm(stemless, "INESSIVE")).toBeNull();
  });
});

describe("writingTasksFor", () => {
  it("builds a task per case the word can actually supply", () => {
    const tasks = writingTasksFor(tuba);
    expect(tasks.length).toBeGreaterThan(5);
    expect(tasks.every((t) => t.targetForm.length > 0)).toBe(true);
  });

  it("skips a case whose form equals the headword", () => {
    // tuba : tuba in the partitive — the learner could write the lemma and be
    // marked correct without having produced anything.
    const cases = writingTasksFor(tuba).map((t) => t.caseKey);
    expect(cases).not.toContain("PARTITIVE");
  });

  it("carries the Estonian case name and its question word", () => {
    const inessive = writingTasksFor(tuba).find((t) => t.caseKey === "INESSIVE");
    expect(inessive?.caseEt).toBe("seesütlev");
    expect(inessive?.caseQuestion).toContain("kus?");
  });

  it("sets no exercises for a verb, which has no case paradigm", () => {
    expect(writingTasksFor({
      lemma: "lugema", translation: "to read", pos: "VERB",
      forms: [{ formType: "GEN_SG", value: "x" }],
    })).toEqual([]);
  });

  it("returns nothing for a word with no genitive stem", () => {
    expect(writingTasksFor({ lemma: "ja", translation: "and", pos: "NOUN", forms: [] })).toEqual([]);
  });
});

const task: WritingTask = {
  lemma: "tuba", translation: "room", caseKey: "INESSIVE",
  caseEn: "Inessive", caseEt: "seesütlev", caseQuestion: "milles? kus?",
  targetForm: "toas", provenance: "derived",
};

const OTHER_FORMS = ["tuba", "toa", "tuppa", "tubade"];

describe("checkForm", () => {
  it("accepts a sentence containing the required form", () => {
    expect(checkForm("Ma olen toas.", task, OTHER_FORMS)).toEqual({
      used: true, usedAnotherForm: false,
    });
  });

  it("accepts the form at the start of a sentence, capitalised", () => {
    expect(checkForm("Toas on soe.", task, OTHER_FORMS).used).toBe(true);
  });

  it("accepts the form followed by punctuation", () => {
    expect(checkForm("Kus sa oled? Toas!", task, OTHER_FORMS).used).toBe(true);
  });

  it("rejects the form appearing inside a longer word", () => {
    // A substring test would accept this; Estonian compounds make that a real risk.
    expect(checkForm("See on toaseinal.", task, OTHER_FORMS).used).toBe(false);
  });

  it("notices that a different form of the same word was used", () => {
    expect(checkForm("Ma näen tuba.", task, OTHER_FORMS)).toEqual({
      used: false, usedAnotherForm: true,
    });
  });

  it("reports neither when the word is absent entirely", () => {
    expect(checkForm("Ma söön leiba.", task, OTHER_FORMS)).toEqual({
      used: false, usedAnotherForm: false,
    });
  });

  it("is not fooled by the form appearing only as part of a compound", () => {
    expect(checkForm("elutoas", task, OTHER_FORMS).used).toBe(false);
  });
});

describe("looksLikeSentence", () => {
  it.each(["Ma olen toas", "Toas on väga soe täna"])("accepts %j", (text) => {
    expect(looksLikeSentence(text)).toBe(true);
  });

  it.each(["toas", "", "   ", "ma olen"])("rejects %j as too short to grade", (text) => {
    // Refused before a call is spent: a one-word answer is not a sentence.
    expect(looksLikeSentence(text)).toBe(false);
  });
});
