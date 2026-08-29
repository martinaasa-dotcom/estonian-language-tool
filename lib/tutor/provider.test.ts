import { afterEach, describe, expect, it, vi } from "vitest";
import { openWithFallback, resolveProviders, TutorError } from "@/lib/tutor/provider";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** A server-sent event stream carrying one OpenAI-shaped text delta. */
function sse(text: string): Response {
  const body = `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
  return new Response(body, { status: 200 });
}

function only(name: "openrouter" | "anthropic" | "openai") {
  vi.stubEnv("OPENROUTER_API_KEY", name === "openrouter" ? "k" : "");
  vi.stubEnv("ANTHROPIC_API_KEY", name === "anthropic" ? "k" : "");
  vi.stubEnv("OPENAI_API_KEY", name === "openai" ? "k" : "");
}

describe("the chain", () => {
  it("is empty with no key at all, so nothing above it has to guess", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(resolveProviders()).toEqual([]);
  });

  it("puts the free provider first, so a paid key is the fallback and not the default", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "k");
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    vi.stubEnv("OPENAI_API_KEY", "k");
    expect(resolveProviders().map((p) => p.name)).toEqual(["openrouter", "anthropic", "openai"]);
  });

  it("is a chain of one when only one key is set, which is what it has always been", () => {
    only("anthropic");
    expect(resolveProviders().map((p) => p.name)).toEqual(["anthropic"]);
  });
});

describe("falling back", () => {
  async function collect(open: { chunks: AsyncGenerator<string> }): Promise<string> {
    let out = "";
    for await (const chunk of open.chunks) out += chunk;
    return out;
  }

  it("walks past a throttled provider and says who actually answered", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "k");
    vi.stubEnv("OPENAI_API_KEY", "k");
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(new URL(url).host);
      // The free model is out of quota, which is its ordinary state.
      if (url.includes("openrouter")) return new Response("rate limited", { status: 429 });
      return sse("Partitive.");
    });

    const chain = resolveProviders();
    const open = await openWithFallback(chain, "system", [{ role: "user", content: "why?" }]);

    expect(calls).toEqual(["openrouter.ai", "api.openai.com"]);
    // Not the head of the chain. That is the whole point: a screen naming the
    // wrong model is worse than one naming none.
    expect(open.config.name).toBe("openai");
    expect(await collect(open)).toBe("Partitive.");
  });

  it("does not walk past a rejected key, because every provider would answer the same", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "k");
    vi.stubEnv("OPENAI_API_KEY", "k");
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(new URL(url).host);
      return new Response("bad key", { status: 401 });
    });

    await expect(
      openWithFallback(resolveProviders(), "system", [{ role: "user", content: "why?" }]),
    ).rejects.toThrow(TutorError);
    // One clear message beats a slower one that tried everything first.
    expect(calls).toEqual(["openrouter.ai"]);
  });

  it("waits on a 429 only when there is nowhere else to ask", async () => {
    /*
      The retry loop and the chain want opposite things from a 429, and the
      chain is right whenever it has somewhere to go: sitting through 4.5
      seconds of backoff against a provider that has already said no, and
      then falling back anyway, is four and a half seconds of a learner
      watching nothing happen. So the first link asks once and moves on; the
      last link, which has nowhere to move to, is the one that waits.
    */
    vi.stubEnv("OPENROUTER_API_KEY", "k");
    vi.stubEnv("OPENAI_API_KEY", "k");
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(new URL(url).host);
      return new Response("rate limited", { status: 429 });
    });

    vi.useFakeTimers();
    try {
      const failing = openWithFallback(resolveProviders(), "system", [
        { role: "user", content: "why?" },
      ]);
      const settled = expect(failing).rejects.toMatchObject({ status: 429 });
      await vi.runAllTimersAsync();
      await settled;
    } finally {
      vi.useRealTimers();
    }

    expect(calls).toEqual([
      "openrouter.ai",
      "api.openai.com",
      "api.openai.com",
      "api.openai.com",
    ]);
  });

  it("refuses an empty chain rather than pretending it asked", async () => {
    await expect(openWithFallback([], "system", [{ role: "user", content: "why?" }]))
      .rejects.toMatchObject({ status: 503 });
  });

  it("reads Anthropic's frame shape as well as the OpenAI one", async () => {
    only("anthropic");
    vi.stubGlobal("fetch", async () =>
      new Response(
        `data: ${JSON.stringify({
          type: "content_block_delta",
          delta: { type: "text_delta", text: "Osastav." },
        })}\n\n`,
        { status: 200 },
      ),
    );
    const open = await openWithFallback(resolveProviders(), "system", [
      { role: "user", content: "why?" },
    ]);
    expect(await collect(open)).toBe("Osastav.");
  });
});
