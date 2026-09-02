import { afterEach, describe, expect, it } from "vitest";
import { halfConfigured, supabaseConfigured } from "./mode";

/**
 * The two variables are a pair, and the state worth a test is the one where
 * somebody has set one of them. See `halfConfigured` for what that state
 * would otherwise have done to a hosted install.
 */
const URL_KEY = "NEXT_PUBLIC_SUPABASE_URL";
const ANON_KEY = "NEXT_PUBLIC_SUPABASE_ANON_KEY";
const before = { url: process.env[URL_KEY], anon: process.env[ANON_KEY] };

function set(url: string | undefined, anon: string | undefined) {
  if (url === undefined) delete process.env[URL_KEY]; else process.env[URL_KEY] = url;
  if (anon === undefined) delete process.env[ANON_KEY]; else process.env[ANON_KEY] = anon;
}

afterEach(() => set(before.url, before.anon));

describe("halfConfigured", () => {
  it("is silent when both are set, which is a hosted deployment", () => {
    set("https://example.supabase.co", "anon-key");
    expect(halfConfigured()).toBeNull();
    expect(supabaseConfigured()).toBe(true);
  });

  it("is silent when neither is set, which is one learner on one machine", () => {
    set(undefined, undefined);
    expect(halfConfigured()).toBeNull();
    expect(supabaseConfigured()).toBe(false);
  });

  it("names the missing one when only the URL is set", () => {
    set("https://example.supabase.co", undefined);
    expect(halfConfigured()).toBe(ANON_KEY);
  });

  it("names the missing one when only the key is set", () => {
    set(undefined, "anon-key");
    expect(halfConfigured()).toBe(URL_KEY);
  });
});
