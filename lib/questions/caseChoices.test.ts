import { describe, expect, it } from "vitest";
import { caseFormChoices } from "./caseChoices";
import { stemsFrom } from "@/lib/estonian/derive";

/** `tuba : toa : tuba`, with the short illative the dictionary records. */
const room = stemsFrom([
  { formType: "NOM_SG", value: "tuba" },
  { formType: "GEN_SG", value: "toa" },
  { formType: "PART_SG", value: "tuba" },
  { formType: "ILL_SG_SHORT", value: "tuppa" },
  { formType: "NOM_PL", value: "toad" },
]);

/** Fixed, so a test asserts the ranking rather than a shuffle. */
const fixed = () => 0.5;

describe("caseFormChoices", () => {
  it("offers four forms of the one word, the answer among them", () => {
    const options = caseFormChoices({
      stems: room, accepted: ["toas"], answer: "toas", rng: fixed,
    });
    expect(options).toHaveLength(4);
    expect(options).toContain("toas");
    // Every option is a form of this word: nothing is written, and a decoy
    // from another entry would make the question about vocabulary instead.
    for (const option of options!) expect(option).toMatch(/^(tuba|toa|tuppa|toad)/);
  });

  /*
    THE OTHER TRUE ANSWER IS NEVER A WRONG ONE. `tuba` has two illatives and
    the card marks both right, so offering `toasse` against `tuppa` would mark
    a learner wrong for the answer the dictionary itself prints beside it. That
    is the `tuppa` fault, which this app has shipped in both directions.
  */
  it("never offers a spelling the card accepts", () => {
    const options = caseFormChoices({
      stems: room, accepted: ["tuppa", "toasse"], answer: "tuppa", rng: fixed,
    });
    expect(options).not.toContain("toasse");
    expect(options).toContain("tuppa");
  });

  /*
    The oblique cases outrank the principal parts, which is `formNearness`'s
    own argument: `tuba` beside `toas` is crossed out on the first two letters,
    where `toast` and `toale` have to be read to the end.
  */
  it("leads with the forms that have to be read to the end", () => {
    const options = caseFormChoices({
      stems: room, accepted: ["toas"], answer: "toas", rng: fixed,
    })!.filter((o) => o !== "toas");
    expect(options.every((o) => o.startsWith("toa"))).toBe(true);
  });

  it("returns nothing rather than padding when the word cannot fill four", () => {
    const bare = stemsFrom([{ formType: "NOM_SG", value: "tuba" }]);
    expect(caseFormChoices({ stems: bare, accepted: ["toas"], answer: "toas", rng: fixed })).toBeNull();
  });
});

import { verbFormChoices, verbFormSlots } from "./caseChoices";

describe("verbFormChoices", () => {
  const reading = {
    lemma: "lugema",
    forms: [
      { formType: "PRES_1SG", value: "loen" },
      { formType: "PAST_1SG", value: "lugesin" },
    ],
  };
  const fixed = () => 0.5;

  it("offers four persons of the one verb, the answer among them", () => {
    const options = verbFormChoices({ lex: reading, accepted: ["loeb"], answer: "loeb", rng: fixed });
    expect(options).toHaveLength(4);
    expect(options).toContain("loeb");
    for (const option of options!) expect(option).toMatch(/^(ei )?(loe|luge)/);
  });

  it("never offers a spelling the card accepts", () => {
    const options = verbFormChoices({
      lex: reading, accepted: ["ei loe", "pole"], answer: "ei loe", rng: fixed,
    });
    expect(options).not.toContain("pole");
  });

  /*
    The negative carries its `ei`, so `ei loe` and `loe` are two options and
    two slots rather than one spelling claimed by both, and a wrong pick can be
    written down as the slot it was.
  */
  it("names the slot of every form it can offer, and the pair apart", () => {
    const slots = verbFormSlots(reading);
    expect(slots.get("loeb")).toBe("IndPrSg3");
    expect(slots.get("ei loe")).toBe("IndPrPs_");
    expect(slots.get("loe")).toBe("ImpPrSg2");
    expect(slots.get("lugesin")).toBe("IndIpfSg1");
  });
});
