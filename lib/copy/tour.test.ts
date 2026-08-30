import { describe, expect, it } from "vitest";
import { TOUR, tourBySection } from "./tour";
import { DESTINATIONS } from "../ux/nav";

describe("the tour", () => {
  it("names a destination the rail has, for every stop", () => {
    // A stop is joined to the rail for its title and icon and dropped when it
    // matches nothing, so a renamed route would silently lose a room from the
    // guide rather than break the page. This is what notices.
    const hrefs = new Set(DESTINATIONS.map((d) => d.href));
    for (const stop of TOUR) {
      expect(hrefs.has(stop.href), `the guide describes ${stop.href} and the rail has no such place`)
        .toBe(true);
    }
  });

  it("loses nothing when it is grouped", () => {
    const grouped = tourBySection().flatMap((s) => s.rooms);
    expect(grouped).toHaveLength(TOUR.length);
  });

  it("takes each room's name from the rail rather than repeating it", () => {
    const byHref = new Map(DESTINATIONS.map((d) => [d.href, d]));
    for (const room of tourBySection().flatMap((s) => s.rooms)) {
      expect(room.title).toBe(byHref.get(room.href)?.label);
      expect(room.icon).toBe(byHref.get(room.href)?.icon);
    }
  });

  it("keeps every stop's own prose", () => {
    for (const stop of TOUR) {
      expect(stop.what.length, stop.href).toBeGreaterThan(20);
      expect(stop.when.length, stop.href).toBeGreaterThan(10);
    }
  });
});
