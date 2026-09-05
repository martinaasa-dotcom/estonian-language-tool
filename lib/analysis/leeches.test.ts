import { describe, expect, it } from "vitest";
import {
  LEECH_LAPSES, buildClinicQuestion, classifyShape, findConfusable, rankLeeches, toLeech,
  type LeechCandidate,
} from "./leeches";

/** "f" = failed (rating 1), "o" = recalled (rating 4). */
function history(pattern: string) {
  return [...pattern].map((c, i) => ({
    rating: c === "f" ? 1 : 4,
    at: new Date(2026, 0, i + 1),
  }));
}

function candidate(over: Partial<LeechCandidate> = {}): LeechCandidate {
  return {
    cardId: "c1", front: "tuba", back: "room", cardType: "RECOGNITION",
    targetCase: null, lemma: "tuba", translation: "room",
    lapses: 5, reps: 10, history: history("ffffoff"),
    ...over,
  };
}

describe("classifyShape", () => {
  it("calls a card that was fine and then broke 'regressed'", () => {
    // Interference from a newly learned word looks exactly like this.
    expect(classifyShape(history("oooooofff"))).toBe("regressed");
  });

  it("calls a card that never held 'never-stuck'", () => {
    expect(classifyShape(history("ffffffff"))).toBe("never-stuck");
  });

  it("calls an alternating card 'unstable'", () => {
    expect(classifyShape(history("fofofofo"))).toBe("unstable");
  });

  it("declines to classify too short a history", () => {
    expect(classifyShape(history("ff"))).toBe("early");
    expect(classifyShape([])).toBe("early");
  });
});

describe("toLeech", () => {
  it("computes the failure rate over all attempts", () => {
    expect(toLeech(candidate({ history: history("ffoo") })).failRate).toBe(50);
  });

  it("counts Hard as a failure, since the card was not recalled cleanly", () => {
    const hardOnly = [{ rating: 2, at: new Date() }, { rating: 4, at: new Date() }];
    expect(toLeech(candidate({ history: hardOnly })).failRate).toBe(50);
  });

  it("carries a pattern sentence that names the shape", () => {
    expect(toLeech(candidate({ history: history("oooooofff") })).pattern)
      .toMatch(/interfering/);
  });

  it("handles a card with no history at all", () => {
    expect(toLeech(candidate({ history: [] })).failRate).toBe(0);
  });
});

describe("rankLeeches", () => {
  it("ignores cards below the lapse threshold", () => {
    // Two failures is a bad week, not a leech.
    expect(rankLeeches([candidate({ lapses: LEECH_LAPSES - 1 })])).toEqual([]);
  });

  it("includes a card exactly at the threshold", () => {
    expect(rankLeeches([candidate({ lapses: LEECH_LAPSES })])).toHaveLength(1);
  });

  it("ranks by lapses, since that is what the card is costing", () => {
    const ranked = rankLeeches([
      candidate({ cardId: "few", lapses: 4 }),
      candidate({ cardId: "many", lapses: 9 }),
    ]);
    expect(ranked.map((l) => l.cardId)).toEqual(["many", "few"]);
  });

  it("honors the limit", () => {
    const many = Array.from({ length: 20 }, (_, i) => candidate({ cardId: `c${i}`, lapses: 5 + i }));
    expect(rankLeeches(many, 3)).toHaveLength(3);
  });

  it("returns nothing for an empty deck", () => {
    expect(rankLeeches([])).toEqual([]);
  });
});

describe("findConfusable", () => {
  it("finds words sharing a long prefix", () => {
    expect(findConfusable("kirjutama", ["kirjatama", "kirjeldama", "sööma"]))
      .toContain("kirjeldama");
  });

  it("finds a word differing by one letter at the same length", () => {
    expect(findConfusable("kali", ["kali", "kala", "raamat"])).toContain("kala");
  });

  it("never returns the word itself", () => {
    expect(findConfusable("tuba", ["tuba", "tuli"])).not.toContain("tuba");
  });

  it("returns nothing when nothing is similar", () => {
    expect(findConfusable("tuba", ["raamat", "sõiduk"])).toEqual([]);
  });

  it("honors the limit", () => {
    const deck = ["kirjeldama", "kirjutaja", "kirjanik", "kirjand", "kirjastus", "kirju"];
    expect(findConfusable("kirjutama", deck, 2)).toHaveLength(2);
  });

  it("is case-insensitive but returns the original spelling", () => {
    expect(findConfusable("Kala", ["Kali"])).toEqual(["Kali"]);
  });

  it("does not call two words similar just because they start alike", () => {
    // tuba / tuli share only "tu" and differ in two places — not a confusion
    // worth putting in front of a learner as one.
    expect(findConfusable("tuba", ["tuli"])).toEqual([]);
  });
});

describe("buildClinicQuestion", () => {
  const leech = toLeech(candidate({ history: history("oooooofff"), targetCase: "INESSIVE" }));

  it("states the failure pattern rather than asking for a definition", () => {
    // "Explain this word" returns the dictionary entry they already failed to
    // remember. Naming the pattern is what makes the answer new.
    const q = buildClinicQuestion(leech, ["tuli", "tulu"]);
    expect(q).toMatch(/interfering/);
    expect(q).toContain("tuli, tulu");
    expect(q).toContain("INESSIVE".toLowerCase());
  });

  it("asks a regressed card which neighbor is interfering", () => {
    expect(buildClinicQuestion(leech, ["tuli"])).toMatch(/tell them apart/);
  });

  it("asks a never-stuck card for a concrete mnemonic, not study advice", () => {
    const stuck = toLeech(candidate({ history: history("ffffffff") }));
    const q = buildClinicQuestion(stuck, []);
    expect(q).toMatch(/Not general advice/);
  });

  it("omits the similar-words line when there are none", () => {
    expect(buildClinicQuestion(leech, [])).not.toMatch(/similar:/);
  });

  it("never asks the model to supply an Estonian form", () => {
    // ADR-005. The question asks how to tell forms apart, never what they are.
    const q = buildClinicQuestion(leech, ["tuli"]).toLowerCase();
    expect(q).not.toMatch(/what is the .* form|give me the .* form|conjugate|decline/);
  });
});
