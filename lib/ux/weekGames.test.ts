import { describe, expect, it } from "vitest";
import { modeAt } from "./modes";
import { WEEKDAY_LONG, type Weekday } from "./schedule";
import { gameAfter, gameOn, WEEK_GAMES } from "./weekGames";

/**
 * The table, and the two things about it that can rot.
 *
 * Every href has to be a mode this app has, or the card on Today links
 * somewhere that renders a 404 on one day of the week and nothing else in the
 * app is any the wiser. And the seven have to be seven: a table with Tuesday's
 * row missing reads as Monday's game twice and looks deliberate.
 */

describe("the week's games", () => {
  it("has one for every day", () => {
    expect(WEEK_GAMES).toHaveLength(7);
    for (let day = 0; day < 7; day++) {
      expect(gameOn(day as Weekday), WEEKDAY_LONG[day]).toBeDefined();
    }
  });

  it("names a mode this app has, every day", () => {
    for (const featured of WEEK_GAMES) {
      expect(modeAt(featured.href), `${featured.href} is not a practice mode`).toBeDefined();
    }
  });

  it("gives every day a different one", () => {
    expect(new Set(WEEK_GAMES.map((g) => g.href)).size).toBe(7);
  });

  it("says why, in a line", () => {
    for (const featured of WEEK_GAMES) {
      expect(featured.why.length).toBeGreaterThan(0);
      // A card's worth, not a paragraph. The reader-copy sweep caps a body at
      // 100 and this sits in the same kind of slot.
      expect(featured.why.length, featured.href).toBeLessThanOrEqual(70);
    }
  });

  it("looks round the corner to tomorrow", () => {
    expect(gameAfter(0).weekday).toBe("Monday");
    expect(gameAfter(0).game.href).toBe(gameOn(1).href);
    // And wraps, which is the one case an off-by-one gets wrong.
    expect(gameAfter(6).weekday).toBe("Sunday");
    expect(gameAfter(6).game.href).toBe(gameOn(0).href);
  });
});
