import { afterEach, describe, expect, it } from "vitest";
import { resolveRecipients, transfersOutsideEea } from "./recipients";

/**
 * Who a deployment tells its readers it sends things to.
 *
 * Article 13(1)(e) asks for the recipients of personal data, and this page is
 * generated from the deployment's own configuration precisely so the answer
 * cannot go stale. That only works if turning a feature on adds its recipient,
 * which is the thing these check — and it was not true of the error webhook,
 * which one variable switched on and no page mentioned.
 *
 * Every case sets the environment it wants and clears it afterwards. A test
 * that inherits the machine's own keys reports the machine rather than the
 * code, which this repository has already been bitten by once.
 */

const TOUCHED = [
  "ERROR_WEBHOOK_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "EKILEX_API_KEY",
  "OPENROUTER_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GROQ_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
];

const saved = new Map(TOUCHED.map((key) => [key, process.env[key]]));

function only(set: Record<string, string> = {}) {
  for (const key of TOUCHED) delete process.env[key];
  for (const [key, value] of Object.entries(set)) process.env[key] = value;
}

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const names = () => resolveRecipients().map((r) => r.name);

describe("the recipients a deployment discloses", () => {
  it("names the error endpoint when one is configured", () => {
    only({ ERROR_WEBHOOK_URL: "https://hooks.example.test/t/abc" });
    expect(names().some((n) => n.includes("hooks.example.test"))).toBe(true);
  });

  it("says nothing about one when none is configured", () => {
    only();
    expect(names().some((n) => n.toLowerCase().includes("error"))).toBe(false);
  });

  it("names the host and never the path, which can carry a token", () => {
    const secret = "s3cret-token-value";
    only({ ERROR_WEBHOOK_URL: `https://hooks.example.test/t/${secret}` });
    const disclosed = names().join(" ");
    expect(disclosed).toContain("hooks.example.test");
    expect(disclosed).not.toContain(secret);
  });

  it("admits a malformed URL rather than printing it", () => {
    only({ ERROR_WEBHOOK_URL: "not a url at all" });
    const disclosed = names().join(" ");
    expect(disclosed).not.toContain("not a url at all");
    expect(disclosed.toLowerCase()).toContain("configured");
  });

  it("counts an endpoint of unknown home as a transfer that may leave", () => {
    // The operator picked the address and this app cannot see where it lands,
    // so the page has to warn rather than reassure.
    only({ ERROR_WEBHOOK_URL: "https://hooks.example.test/t/abc" });
    expect(transfersOutsideEea(resolveRecipients())).toBe(true);
  });

  it("always names the speech service, which every deployment uses", () => {
    only();
    expect(names().some((n) => n.includes("TartuNLP"))).toBe(true);
  });
});

describe("the machine the code runs on", () => {
  const KEEP = process.env.VERCEL;
  afterEach(() => {
    if (KEEP === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = KEEP;
  });

  it("names the host, because it handles every request on the page", () => {
    /*
      The list was built by asking the code which services it was configured to
      call, and the machine it runs on is not one of those, so the one
      recipient touching every single request was the one never named.
    */
    process.env.VERCEL = "1";
    const hosts = resolveRecipients().filter((r) => /Vercel/.test(r.name));
    expect(hosts.length).toBe(1);
    expect(hosts[0]?.eea).toBe(false);
    expect(hosts[0]?.what).toMatch(/request/i);
  });

  it("says nothing where the operator is the host", () => {
    // Self-hosted, the operator named at the top of the page owns the machine.
    // Listing them as a recipient of their own data is noise.
    delete process.env.VERCEL;
    expect(resolveRecipients().some((r) => /Vercel/.test(r.name))).toBe(false);
  });

  it("makes the transfer disclosure fire, since the company is not in the Union", () => {
    process.env.VERCEL = "1";
    expect(transfersOutsideEea(resolveRecipients())).toBe(true);
  });
});
