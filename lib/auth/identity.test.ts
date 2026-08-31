/*
  The three questions this module answers, and the one it refuses to.

  A cookie name decides whether a request is worth a client at all; a set of
  claims decides who is reading; and a transport decides whether "no" meant
  "nobody is signed in" or "nobody answered". The last of those is the one
  worth a test file: everything downstream reads a missing identity as a
  sign-out, and the whole point of the third state is that one case where it
  must not.
*/
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  authCookieName,
  boundedTransport,
  hasSessionCookie,
  learnerFromClaims,
  readIdentity,
  type Transport,
} from "./identity";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("authCookieName", () => {
  it("derives the project ref the way @supabase/ssr does", () => {
    expect(authCookieName("https://abcdefghijkl.supabase.co")).toBe("sb-abcdefghijkl-auth-token");
  });

  it("takes the first label of a custom auth domain", () => {
    expect(authCookieName("https://auth.kodukeel.ee")).toBe("sb-auth-auth-token");
  });

  it("has no answer for a deployment with no project", () => {
    // Passed explicitly rather than left to the default, which reads the
    // environment: a unit test that consults the machine it runs on reports
    // the machine.
    expect(authCookieName("")).toBe(null);
    expect(authCookieName("  ")).toBe(null);
    expect(authCookieName("not a url")).toBe(null);
  });
});

describe("hasSessionCookie", () => {
  const key = "sb-abcdefghijkl-auth-token";

  it("finds the cookie whole", () => {
    expect(hasSessionCookie(["other", key], key)).toBe(true);
  });

  it("finds a session split across chunks", () => {
    expect(hasSessionCookie([`${key}.0`, `${key}.1`], key)).toBe(true);
    expect(hasSessionCookie([`${key}.10`], key)).toBe(true);
  });

  it("says no to a request carrying nothing of the kind", () => {
    expect(hasSessionCookie([], key)).toBe(false);
    expect(hasSessionCookie(["theme", "sb-other-project-auth-token"], key)).toBe(false);
  });

  it("does not read the sign-in handshake as a session", () => {
    /*
      The PKCE verifier is written while somebody is still at Google and
      cleared when they come back. Counting it would put every visitor
      mid-handshake on the slow path for the one request where the answer is
      known to be no.
    */
    expect(hasSessionCookie([`${key}-code-verifier`], key)).toBe(false);
    expect(hasSessionCookie([`${key}.0.stray`], key)).toBe(false);
  });

  it("cannot rule it out with no project configured", () => {
    expect(hasSessionCookie([], null)).toBe(true);
  });
});

describe("learnerFromClaims", () => {
  it("prefers the name Google gave", () => {
    const learner = learnerFromClaims({
      sub: "user-1",
      email: "maarja@example.ee",
      user_metadata: { full_name: "Maarja Tamm", avatar_url: "https://example.test/a.jpg" },
    });
    expect(learner).toEqual({
      id: "user-1",
      name: "Maarja Tamm",
      email: "maarja@example.ee",
      avatarUrl: "https://example.test/a.jpg",
    });
  });

  it("falls back through name, then the address, then a placeholder", () => {
    expect(learnerFromClaims({ sub: "u", user_metadata: { name: "Anu" } }).name).toBe("Anu");
    expect(learnerFromClaims({ sub: "u", email: "maarja@example.ee" }).name).toBe("maarja");
    expect(learnerFromClaims({ sub: "u" }).name).toBe("you");
  });

  it("treats a blank claim as absent rather than as a name", () => {
    const learner = learnerFromClaims({
      sub: "u",
      email: "  ",
      user_metadata: { full_name: "   ", avatar_url: "" },
    });
    expect(learner.name).toBe("you");
    expect(learner.email).toBe(null);
    expect(learner.avatarUrl).toBe(null);
  });
});

describe("boundedTransport", () => {
  it("gives up on a call that does not answer, and says so", async () => {
    vi.stubGlobal("fetch", (_input: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      }));
    const transport = boundedTransport(10);
    await expect(transport.fetch("https://auth.test/user")).rejects.toThrow();
    expect(transport.reached).toBe(false);
  });

  it("counts a refusal as an answer", async () => {
    /*
      The distinction the whole third state rests on. A 401 is the auth
      service telling us the session is no good, which is a fact about the
      session. Only a call that never completed is a fact about the network.
    */
    vi.stubGlobal("fetch", async () => new Response("no", { status: 401 }));
    const transport = boundedTransport(1_000);
    const response = await transport.fetch("https://auth.test/user");
    expect(response.status).toBe(401);
    expect(transport.reached).toBe(true);
  });
});

/** A client that answers `getClaims` with whatever this test needs it to. */
function clientReturning(result: unknown): SupabaseClient {
  return { auth: { getClaims: async () => result } } as unknown as SupabaseClient;
}

function reached(value: boolean): Transport {
  return { reached: value, fetch: globalThis.fetch };
}

describe("readIdentity", () => {
  it("reads a verified token as the learner it names", async () => {
    const client = clientReturning({
      data: { claims: { sub: "user-1", email: "maarja@example.ee" } },
      error: null,
    });
    const identity = await readIdentity(client, reached(true));
    expect(identity).toEqual({
      state: "in",
      learner: { id: "user-1", name: "maarja", email: "maarja@example.ee", avatarUrl: null },
    });
  });

  it("reads no token from a service that answered as signed out", async () => {
    const client = clientReturning({ data: null, error: null });
    expect(await readIdentity(client, reached(true))).toEqual({ state: "out" });
  });

  it("reads no token from a service that did not answer as unknown", async () => {
    /*
      The one that matters. Folding this into "out" would sign a learner out
      of their own deck over a bad minute at somebody else's server, on the
      screen they open every day.
    */
    const client = clientReturning({ data: null, error: new Error("network") });
    expect(await readIdentity(client, reached(false))).toEqual({ state: "unreachable" });
  });

  it("does not turn a thrown error into a sign-out either", async () => {
    const client = { auth: { getClaims: async () => { throw new Error("boom"); } } } as unknown as SupabaseClient;
    expect(await readIdentity(client, reached(true))).toEqual({ state: "unreachable" });
  });
});
