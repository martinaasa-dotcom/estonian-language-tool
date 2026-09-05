import { describe, expect, it } from "vitest";
import { isMutatingRequest, isSameOriginMutation } from "@/lib/security/sameOrigin";

/** The two headers the gate reads, and nothing else. */
function req(headers: Record<string, string>, method = "POST") {
  return {
    method,
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
  };
}

describe("which methods are gated", () => {
  it("gates everything that can change something", () => {
    for (const m of ["POST", "PUT", "PATCH", "DELETE", "post", "delete"]) {
      expect(isMutatingRequest(m)).toBe(true);
    }
  });

  it("leaves reads alone", () => {
    for (const m of ["GET", "HEAD", "OPTIONS"]) {
      expect(isMutatingRequest(m)).toBe(false);
    }
  });
});

describe("Sec-Fetch-Site is the answer when the browser sends it", () => {
  it("allows our own pages", () => {
    expect(isSameOriginMutation(req({ "sec-fetch-site": "same-origin" }))).toBe(true);
  });

  it("allows a typed URL or a bookmark", () => {
    expect(isSameOriginMutation(req({ "sec-fetch-site": "none" }))).toBe(true);
  });

  it("refuses another site, and another subdomain of ours", () => {
    expect(isSameOriginMutation(req({ "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(isSameOriginMutation(req({ "sec-fetch-site": "same-site" }))).toBe(false);
  });

  it("believes it over a forged Origin", () => {
    // Page script cannot write Sec-Fetch-Site, so when the two disagree the
    // one the browser set is the one that counts.
    expect(
      isSameOriginMutation(
        req({ "sec-fetch-site": "cross-site", origin: "https://kodukeel.app", host: "kodukeel.app" }),
      ),
    ).toBe(false);
  });
});

describe("Origin is the fallback", () => {
  it("compares hosts, ignoring the scheme and the port", () => {
    expect(isSameOriginMutation(req({ origin: "https://kodukeel.app", host: "kodukeel.app" }))).toBe(true);
    expect(isSameOriginMutation(req({ origin: "http://localhost:3000", host: "localhost:3000" }))).toBe(true);
  });

  it("refuses a mismatch", () => {
    expect(isSameOriginMutation(req({ origin: "https://evil.example", host: "kodukeel.app" }))).toBe(false);
  });

  it("is not fooled by a host that merely ends in ours", () => {
    expect(
      isSameOriginMutation(req({ origin: "https://kodukeel.app.evil.example", host: "kodukeel.app" })),
    ).toBe(false);
  });
});

describe("a request with no browser behind it", () => {
  /*
    Deliberate. A caller sending neither header is not a browser, so it has no
    ambient session cookie to forge with, and refusing it would break every
    server to server call and every curl for no security gained at all.
    Forgery is a browser attack, so a browser is what this checks.
  */
  it("passes, because forgery needs a browser", () => {
    expect(isSameOriginMutation(req({}))).toBe(true);
  });

  it("refuses an opaque origin, which is a sandboxed frame rather than no browser", () => {
    // A sandboxed iframe posts with `Origin: null`. That is a browser saying
    // where it came from, and the answer is not us.
    expect(isSameOriginMutation(req({ origin: "null", host: "kodukeel.app" }))).toBe(false);
  });

  it("passes an empty Origin, which is a header that was never set", () => {
    expect(isSameOriginMutation(req({ origin: "", host: "kodukeel.app" }))).toBe(true);
  });
});

describe("an Origin that is there and will not parse", () => {
  /*
    Found by scripts/test-security.mjs against a running server, which is the
    kind of fault a source check cannot see: the header is present, so this is
    something claiming to be a browser, and the value is unreadable. That was
    being answered as though no header had been sent, which is the reading
    reserved for "not a browser at all".
  */
  it("is refused rather than read as no origin", () => {
    // `3000.evil.example` is not a port, so the URL parser gives up on it.
    expect(isSameOriginMutation(
      req({ origin: "http://localhost:3000.evil.example", host: "localhost:3000" }),
    )).toBe(false);

    for (const origin of ["http://", "::::", "https://[", "%%%"]) {
      expect(isSameOriginMutation(req({ origin, host: "kodukeel.ee" })), origin).toBe(false);
    }
  });

  it("still lets through a request that sent no Origin at all", () => {
    // Not a browser, so no ambient cookie to forge with. Refusing it would
    // break every server-to-server caller for nothing.
    expect(isSameOriginMutation(req({ host: "kodukeel.ee" }))).toBe(true);
    expect(isSameOriginMutation(req({ origin: "   ", host: "kodukeel.ee" }))).toBe(true);
  });

  it("still refuses the literal null a sandboxed frame sends", () => {
    // This one parses, to the hostname "null", and is compared like any other.
    expect(isSameOriginMutation(req({ origin: "null", host: "kodukeel.ee" }))).toBe(false);
  });
});
