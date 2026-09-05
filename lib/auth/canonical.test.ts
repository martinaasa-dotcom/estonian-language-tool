import { describe, expect, it } from "vitest";
import { canonicalOrigin, canonicalRedirect } from "./canonical";

const SITE = "https://kodukeel.ee";

describe("canonicalOrigin", () => {
  it("is nothing until somebody sets it", () => {
    expect(canonicalOrigin({})).toBeNull();
    expect(canonicalOrigin({ NEXT_PUBLIC_SITE_URL: "  " })).toBeNull();
  });

  it("keeps the origin and drops any path somebody pasted with it", () => {
    expect(canonicalOrigin({ NEXT_PUBLIC_SITE_URL: "https://kodukeel.ee/welcome" })?.href)
      .toBe("https://kodukeel.ee/");
  });

  it("refuses a bare hostname rather than guessing its scheme", () => {
    expect(canonicalOrigin({ NEXT_PUBLIC_SITE_URL: "kodukeel.ee" })).toBeNull();
    expect(canonicalOrigin({ NEXT_PUBLIC_SITE_URL: "ftp://kodukeel.ee" })).toBeNull();
  });
});

describe("canonicalRedirect", () => {
  it("sends the platform's own name to the domain, keeping the path and the query", () => {
    expect(canonicalRedirect("kodukeel.vercel.app", "/sign-in?next=%2Fprogress", { NEXT_PUBLIC_SITE_URL: SITE }))
      .toBe("https://kodukeel.ee/sign-in?next=%2Fprogress");
  });

  it("leaves a request that is already home alone, whatever the case of the host", () => {
    expect(canonicalRedirect("kodukeel.ee", "/", { NEXT_PUBLIC_SITE_URL: SITE })).toBeNull();
    expect(canonicalRedirect("Kodukeel.EE", "/", { NEXT_PUBLIC_SITE_URL: SITE })).toBeNull();
  });

  it("treats a port as part of the address", () => {
    const env = { NEXT_PUBLIC_SITE_URL: "https://kodukeel.ee:8443" };
    expect(canonicalRedirect("kodukeel.ee:8443", "/", env)).toBeNull();
    expect(canonicalRedirect("kodukeel.ee", "/", env)).toBe("https://kodukeel.ee:8443/");
  });

  it("does nothing with no canonical address configured", () => {
    expect(canonicalRedirect("kodukeel.vercel.app", "/", {})).toBeNull();
  });

  it("never sends a developer's own machine to production", () => {
    for (const host of ["localhost:3000", "127.0.0.1:3000", "app.localhost", "[::1]:3000"]) {
      expect(canonicalRedirect(host, "/", { NEXT_PUBLIC_SITE_URL: SITE })).toBeNull();
    }
  });

  it("leaves a Vercel preview on its own host", () => {
    const env = { NEXT_PUBLIC_SITE_URL: SITE, VERCEL: "1", VERCEL_ENV: "preview" };
    expect(canonicalRedirect("kodukeel-git-branch.vercel.app", "/", env)).toBeNull();
  });

  it("and still redirects Vercel production", () => {
    const env = { NEXT_PUBLIC_SITE_URL: SITE, VERCEL: "1", VERCEL_ENV: "production" };
    expect(canonicalRedirect("kodukeel.vercel.app", "/welcome", env)).toBe("https://kodukeel.ee/welcome");
  });

  it("has nowhere to send a request with no host", () => {
    expect(canonicalRedirect(null, "/", { NEXT_PUBLIC_SITE_URL: SITE })).toBeNull();
    expect(canonicalRedirect("", "/", { NEXT_PUBLIC_SITE_URL: SITE })).toBeNull();
  });

  it("does not choke on a host that is not one", () => {
    expect(canonicalRedirect("not a host", "/", { NEXT_PUBLIC_SITE_URL: SITE })).toBeNull();
  });
});
