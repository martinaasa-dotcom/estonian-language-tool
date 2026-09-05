import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { bucketDigest, resetRateLimitForTests } from "@/lib/security/rateLimit";
import { checkSharedRateLimit } from "./sharedLimit";

/**
 * The limiter that is supposed to be the same number whichever instance
 * answers, against a database, because that is the only place it can be wrong.
 *
 * The fault it exists for cannot be reproduced in a unit test at all: the
 * in-memory limiter is correct about the instance it lives in and says nothing
 * about the other one, so "the limit is however many instances happen to be
 * warm" looks exactly like a working limiter from inside any single process.
 * What stands in for a second instance here is `resetRateLimitForTests`, which
 * empties the Map exactly as a cold start would. A caller that gets a fresh
 * allowance after that is a caller the shared counter did not catch.
 */

const KEY = "itest:shared-limit";
const WINDOW_MS = 60_000;

async function wipe() {
  await prisma.$executeRaw`DELETE FROM "RateLimit" WHERE "bucket" = ${bucketDigest(KEY)}`;
}

/** A cold start: this instance forgets everything and the row does not. */
function coldStart() {
  resetRateLimitForTests();
}

beforeEach(async () => {
  coldStart();
  await wipe();
});

afterAll(async () => { await wipe(); await prisma.$disconnect(); });

describe("a limit every instance shares", () => {
  it("survives the instance forgetting, which is the whole point", async () => {
    expect((await checkSharedRateLimit(KEY, 3, WINDOW_MS)).ok).toBe(true);
    expect((await checkSharedRateLimit(KEY, 3, WINDOW_MS)).ok).toBe(true);

    // A cold instance picks the request up with an empty Map. Before this
    // module, that was two more requests and then two more after that.
    coldStart();

    expect((await checkSharedRateLimit(KEY, 3, WINDOW_MS)).ok).toBe(true);
    const over = await checkSharedRateLimit(KEY, 3, WINDOW_MS);
    expect(over.ok).toBe(false);
    expect(over.retryAfterSec).toBeGreaterThan(0);
  });

  it("counts concurrent calls once each, because the increment is the decision", async () => {
    /*
      Ten at once against a limit of four. The ledger next door needs an
      advisory lock for this shape; here the count returned by the upsert is
      the verdict, so the statement is atomic on its own and exactly six are
      refused.
    */
    const verdicts = await Promise.all(
      Array.from({ length: 10 }, () => checkSharedRateLimit(KEY, 4, WINDOW_MS)),
    );
    expect(verdicts.filter((v) => v.ok).length).toBe(4);
    expect(verdicts.filter((v) => !v.ok).length).toBe(6);
  });

  it("writes a digest rather than the key, so there is no owner id in the table", async () => {
    const key = `tts:o:8f14e45f-ea8b-4d1e-9b3a-2c5d7e0a1b42`;
    await checkSharedRateLimit(key, 5, WINDOW_MS);
    try {
      const rows = await prisma.$queryRaw<{ bucket: string }[]>`
        SELECT "bucket" FROM "RateLimit" WHERE "bucket" = ${bucketDigest(key)}
      `;
      expect(rows.length).toBe(1);
      expect(rows[0]?.bucket).not.toContain("8f14e45f");
      expect(rows[0]?.bucket).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      await prisma.$executeRaw`DELETE FROM "RateLimit" WHERE "bucket" = ${bucketDigest(key)}`;
    }
  });

  it("gives a new window a new allowance", async () => {
    const now = Date.now();
    expect((await checkSharedRateLimit(KEY, 1, WINDOW_MS, now)).ok).toBe(true);
    coldStart();
    expect((await checkSharedRateLimit(KEY, 1, WINDOW_MS, now)).ok).toBe(false);

    // One window on, which is a different row rather than a reset counter.
    coldStart();
    expect((await checkSharedRateLimit(KEY, 1, WINDOW_MS, now + WINDOW_MS)).ok).toBe(true);
  });

  it("stops counting one past the limit, so a hammered endpoint bounds its own row", async () => {
    for (let i = 0; i < 8; i += 1) {
      coldStart();
      await checkSharedRateLimit(KEY, 2, WINDOW_MS);
    }
    const rows = await prisma.$queryRaw<{ count: number }[]>`
      SELECT "count" FROM "RateLimit" WHERE "bucket" = ${bucketDigest(KEY)}
    `;
    expect(rows[0]?.count).toBe(3);
  });

  it("keeps two endpoints of one caller apart", async () => {
    const owner = "o:8f14e45f-ea8b-4d1e-9b3a-2c5d7e0a1b42";
    try {
      expect((await checkSharedRateLimit(`tts:${owner}`, 1, WINDOW_MS)).ok).toBe(true);
      coldStart();
      // Spending the speech allowance must not spend the export allowance.
      expect((await checkSharedRateLimit(`export:${owner}`, 1, WINDOW_MS)).ok).toBe(true);
    } finally {
      for (const endpoint of ["tts", "export"]) {
        await prisma.$executeRaw`
          DELETE FROM "RateLimit" WHERE "bucket" = ${bucketDigest(`${endpoint}:${owner}`)}
        `;
      }
    }
  });
});
