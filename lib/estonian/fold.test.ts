import { describe, expect, it } from "vitest";
import { FOLD, fold, FOLD_FROM, FOLD_TO } from "./fold";

/**
 * The six letters, and the two shapes the app reads them in.
 *
 * There were three copies of this and they happened to agree, which is the
 * dangerous state rather than the safe one: a marker and a search box that
 * disagreed about whether ž folds would mark somebody wrong for a spelling the
 * dictionary had just offered them.
 */

describe("fold", () => {
  it("folds the six Estonian letters and nothing else", () => {
    expect(fold("sõna")).toBe("sona");
    expect(fold("ärkab")).toBe("arkab");
    expect(fold("öö")).toBe("oo");
    expect(fold("üks")).toBe("uks");
    expect(fold("šokolaad")).toBe("sokolaad");
    expect(fold("žanr")).toBe("zanr");
  });

  it("lowercases, because half its callers were doing that separately", () => {
    expect(fold("SÕNA")).toBe("sona");
    expect(fold("Õun")).toBe("oun");
  });

  it("leaves an ordinary word alone", () => {
    expect(fold("raamat")).toBe("raamat");
  });

  it("leaves a letter with a diacritic that Estonian does not use", () => {
    // Not this app's business: folding é would be claiming a rule about a
    // language it does not teach.
    expect(fold("café")).toBe("café");
  });

  /**
   * The SQL half. `translate(lower(lemma), FOLD_FROM, FOLD_TO)` runs in
   * Postgres to narrow a search and `fold` decides it in JavaScript, so the two
   * have to be the same six characters in the same order. They used to be two
   * hand-kept lists with a comment saying so.
   */
  it("gives Postgres the same table in the same order", () => {
    expect(FOLD_FROM.length).toBe(FOLD_TO.length);
    expect([...FOLD_FROM].length).toBe(Object.keys(FOLD).length);
    [...FOLD_FROM].forEach((from, i) => {
      expect(FOLD[from], `${from} in FOLD_FROM`).toBe([...FOLD_TO][i]);
    });
  });

  it("agrees with itself over every letter in the table", () => {
    for (const [from, to] of Object.entries(FOLD)) {
      expect(fold(from)).toBe(to);
    }
  });
});
