import { describe, expect, it } from "vitest";

import { reviewMoment } from "./grade";

const CREATED = new Date("2026-08-01T09:00:00Z");
const NOW = new Date("2026-09-02T09:00:00Z");

describe("reviewMoment", () => {
  it("keeps a moment inside the card's own lifetime", () => {
    const at = new Date("2026-08-20T18:30:00Z");
    expect(reviewMoment(at, CREATED, NOW).toISOString()).toBe(at.toISOString());
  });

  it("will not record a review before the card it is about existed", () => {
    const at = new Date("2026-07-01T09:00:00Z");
    expect(reviewMoment(at, CREATED, NOW).toISOString()).toBe(CREATED.toISOString());
  });

  it("will not book a review into the future", () => {
    const at = new Date("2027-01-01T09:00:00Z");
    expect(reviewMoment(at, CREATED, NOW).toISOString()).toBe(NOW.toISOString());
  });

  it("treats a clock nobody can read as now, because the review still happened", () => {
    expect(reviewMoment(new Date("nonsense"), CREATED, NOW).toISOString()).toBe(NOW.toISOString());
  });

  it("is monotonic, so flooring a batch cannot reorder it", () => {
    const earlier = reviewMoment(new Date("2026-07-01T09:00:00Z"), CREATED, NOW);
    const later = reviewMoment(new Date("2026-07-15T09:00:00Z"), CREATED, NOW);
    expect(earlier.getTime()).toBeLessThanOrEqual(later.getTime());
  });
});
