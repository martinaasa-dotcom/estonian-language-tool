import { describe, expect, it } from "vitest";
import { buildRecord, redact } from "./report";

describe("redact", () => {
  it("removes a value whose key names a credential", () => {
    const out = redact({ apiKey: "abc123", ANTHROPIC_API_KEY: "x", note: "fine" }) as Record<string, unknown>;
    expect(out.apiKey).toBe("[redacted]");
    expect(out.ANTHROPIC_API_KEY).toBe("[redacted]");
    expect(out.note).toBe("fine");
  });

  it("removes an email even though it is not obviously a secret", () => {
    // Personal data. An opaque user id is what belongs in a log.
    const out = redact({ email: "ann@example.com" }) as Record<string, unknown>;
    expect(out.email).toBe("[redacted]");
  });

  it("removes a credential-shaped string under an innocent key", () => {
    const out = redact({ detail: "upstream said sk-ant-api03-AAAAAAAAAAAAAAAAAAAA is invalid" });
    expect(JSON.stringify(out)).not.toContain("sk-ant-api03");
    expect(JSON.stringify(out)).toContain("[redacted]");
  });

  it("removes a postgres URL carrying a password", () => {
    const out = redact("connect failed: postgresql://user:hunter2@db.example.com:5432/x");
    expect(out).not.toContain("hunter2");
  });

  it("removes a JWT", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.QUFBQUFB";
    expect(redact(`token ${jwt} rejected`)).not.toContain(jwt);
  });

  it("truncates a very long string rather than logging a whole document", () => {
    const out = redact("x".repeat(5000));
    expect((out as string).length).toBeLessThan(600);
  });

  it("stops recursing on a deeply nested object", () => {
    let nested: Record<string, unknown> = { leaf: true };
    for (let i = 0; i < 20; i++) nested = { nested };
    expect(() => redact(nested)).not.toThrow();
  });

  it("survives a circular structure", () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    expect(() => redact(a)).not.toThrow();
  });

  it("caps a long array", () => {
    expect((redact(Array.from({ length: 100 }, (_, i) => i)) as unknown[]).length).toBe(20);
  });
});

describe("buildRecord", () => {
  it("keeps the opaque owner id, which is not personal data", () => {
    const record = buildRecord(new Error("boom"), { at: "api/tutor", ownerId: "user-123" });
    expect(record.ownerId).toBe("user-123");
    expect(record.at).toBe("api/tutor");
    expect(record.message).toBe("boom");
  });

  it("accepts a thrown non-Error", () => {
    expect(buildRecord("just a string", { at: "x" }).message).toBe("just a string");
  });

  it("redacts a secret that reached the error message", () => {
    const record = buildRecord(new Error("bad key sk-proj-AAAAAAAAAAAAAAAAAAAAAA"), { at: "x" });
    expect(record.message).not.toContain("sk-proj-");
  });

  it("produces something JSON can serialise", () => {
    const record = buildRecord(new Error("boom"), { at: "x", extra: { a: 1 } });
    expect(() => JSON.stringify(record)).not.toThrow();
  });
});
