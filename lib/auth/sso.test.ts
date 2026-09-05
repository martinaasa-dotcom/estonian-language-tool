import { describe, expect, it } from "vitest";
import { readSsoPolicy, ssoConfigured, ssoDomainFor } from "./sso";

describe("readSsoPolicy", () => {
  it("holds nothing when the variable is unset", () => {
    expect(readSsoPolicy({}).domains).toEqual([]);
  });

  it("reads whitespace as absence", () => {
    expect(readSsoPolicy({ SSO_DOMAINS: "   " }).domains).toEqual([]);
    expect(readSsoPolicy({ SSO_DOMAINS: "\n\t" }).domains).toEqual([]);
  });

  it("parses a comma-separated list, ignoring case and spacing", () => {
    const policy = readSsoPolicy({ SSO_DOMAINS: " Kool.EE,  firma.ee " });
    expect(policy.domains).toEqual(["kool.ee", "firma.ee"]);
  });

  it("parses a whitespace-separated list too", () => {
    expect(readSsoPolicy({ SSO_DOMAINS: "kool.ee firma.ee" }).domains).toEqual([
      "kool.ee",
      "firma.ee",
    ]);
  });

  it("strips a leading @ from a domain", () => {
    expect(readSsoPolicy({ SSO_DOMAINS: "@kool.ee" }).domains).toEqual(["kool.ee"]);
  });
});

describe("ssoConfigured", () => {
  it("is false when nothing is set", () => {
    expect(ssoConfigured({})).toBe(false);
    expect(ssoConfigured({ SSO_DOMAINS: "" })).toBe(false);
    expect(ssoConfigured({ SSO_DOMAINS: "  " })).toBe(false);
  });

  it("is true once a domain is named", () => {
    expect(ssoConfigured({ SSO_DOMAINS: "kool.ee" })).toBe(true);
  });
});

describe("ssoDomainFor", () => {
  const none = readSsoPolicy({});
  const one = readSsoPolicy({ SSO_DOMAINS: "kool.ee" });
  const two = readSsoPolicy({ SSO_DOMAINS: "kool.ee, firma.ee" });

  it("answers null when no provider is configured", () => {
    expect(ssoDomainFor("anyone@kool.ee", none)).toBe(null);
  });

  it("returns the matching domain regardless of case or spacing", () => {
    expect(ssoDomainFor("  Anne@Kool.EE ", one)).toBe("kool.ee");
  });

  it("picks the domain the address is actually on", () => {
    expect(ssoDomainFor("anne@firma.ee", two)).toBe("firma.ee");
    expect(ssoDomainFor("anne@mujal.ee", two)).toBe(null);
  });

  it("does not let a lookalike domain through", () => {
    // A naive endsWith("kool.ee") would send both of these to somebody else's
    // identity provider.
    expect(ssoDomainFor("attacker@evilkool.ee", one)).toBe(null);
    expect(ssoDomainFor("attacker@kool.ee.evil.com", one)).toBe(null);
  });

  it("takes the domain from the last @, not the first", () => {
    expect(ssoDomainFor("kool.ee@evil.com", one)).toBe(null);
    expect(ssoDomainFor("x@evil.com@kool.ee", one)).toBe("kool.ee");
  });

  it("answers null for a missing or malformed address", () => {
    expect(ssoDomainFor(null, one)).toBe(null);
    expect(ssoDomainFor(undefined, one)).toBe(null);
    expect(ssoDomainFor("", one)).toBe(null);
    expect(ssoDomainFor("not-an-email", one)).toBe(null);
    expect(ssoDomainFor("trailing@", one)).toBe(null);
    expect(ssoDomainFor("@kool.ee", one)).toBe(null);
  });
});
