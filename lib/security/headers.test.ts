import { describe, expect, it, vi } from "vitest";
import { buildContentSecurityPolicy, STATIC_SECURITY_HEADERS } from "@/lib/security/headers";

function directive(name: string): string {
  const found = buildContentSecurityPolicy()
    .split("; ")
    .find((part) => part === name || part.startsWith(`${name} `));
  if (!found) throw new Error(`no ${name} in the policy`);
  return found;
}

function header(key: string): string {
  const found = STATIC_SECURITY_HEADERS.find((h) => h.key === key);
  if (!found) throw new Error(`no ${key} header`);
  return found.value;
}

describe("the policy says what the app actually needs", () => {
  it("refuses to be framed, in both directions", () => {
    // Sõnaveeb and Ekilex send X-Frame-Options: DENY at us and this app sends
    // it back out. Nothing here is meant to be embedded anywhere.
    expect(directive("frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive("frame-src")).toBe("frame-src 'none'");
    expect(header("X-Frame-Options")).toBe("DENY");
  });

  it("keeps the microphone and the camera, because two features need them", () => {
    // geolocation=() is a denial. The other two are not: components/Recorder.tsx
    // needs the microphone for speaking practice, and scanning a page needs the
    // camera, because `<input capture>` is governed by this policy and a phone
    // silently opens the photo library instead when it is denied. Either
    // denial switches a feature off with no error a learner could act on.
    expect(header("Permissions-Policy")).toContain("microphone=(self)");
    expect(header("Permissions-Policy")).toContain("camera=(self)");
    expect(header("Permissions-Policy")).toContain("geolocation=()");
  });

  it("lets a recording play back from a blob", () => {
    expect(directive("media-src")).toContain("blob:");
  });

  it("lets the service worker register", () => {
    expect(directive("worker-src")).toContain("'self'");
    expect(directive("manifest-src")).toBe("manifest-src 'self'");
  });

  it("allows an avatar from wherever Google serves it", () => {
    expect(directive("img-src")).toContain("https:");
  });

  it("names no third party to connect to", () => {
    /*
     * Ekilex, Wiktionary and the TartuNLP speech service are only ever
     * reached from the server. That is the same rule that keeps their keys
     * off the client, and this is what it looks like from the browser's
     * side: with no Supabase project configured there is nothing at all to
     * connect to but ourselves.
     */
    expect(directive("connect-src")).not.toMatch(/ekilex|wiktionary|tartunlp/i);
  });

  it("allows the Supabase project when one is configured, and nothing wider", () => {
    const previous = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcdefgh.supabase.co";
    try {
      const connect = directive("connect-src");
      expect(connect).toContain("https://abcdefgh.supabase.co");
      expect(connect).toContain("wss://abcdefgh.supabase.co");
      // Never a wildcard: one project's origin, not everybody's.
      expect(connect).not.toContain("*.supabase.co");
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = previous;
    }
  });

  it("locks down the things with no legitimate use here", () => {
    expect(directive("object-src")).toBe("object-src 'none'");
    expect(directive("base-uri")).toBe("base-uri 'self'");
    expect(directive("form-action")).toBe("form-action 'self'");
    expect(directive("default-src")).toBe("default-src 'self'");
  });

  it("does not allow eval in a production build", () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      expect(directive("script-src")).not.toContain("unsafe-eval");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("the static headers", () => {
  it("carries HSTS long enough to be preloaded", () => {
    expect(header("Strict-Transport-Security")).toContain("max-age=63072000");
    expect(header("Strict-Transport-Security")).toContain("includeSubDomains");
  });

  it("stops a response being sniffed into something else", () => {
    expect(header("X-Content-Type-Options")).toBe("nosniff");
  });

  it("does not leak a path to another site in the referrer", () => {
    expect(header("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });
});
