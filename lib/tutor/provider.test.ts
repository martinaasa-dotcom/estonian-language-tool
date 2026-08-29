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

  it("walks past a key with no credit left, and says so in a sentence", async () => {
    /*
      A 402 is where a free key ends up, and it is not a rejected key: this
      account cannot pay, and the next one in the chain may well be able to.

      What it used to produce was the catch-all, which pasted 180 characters of
      the provider's own JSON into a line a learner reads, cut off mid-word:
      `OpenRouter returned 402. {"error":{"message":"This request requires more
      credits, or fewer max_tokens. You reques`. Found by running test-anu.mjs,
      which had never been run, against a key that had run out.
    */
    vi.stubEnv("OPENROUTER_API_KEY", "k");
    vi.stubEnv("OPENAI_API_KEY", "k");
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(new URL(url).host);
      if (url.includes("openrouter")) {
        return new Response('{"error":{"message":"This request requires more credits"}}', { status: 402 });
      }
      return sse("Partitive.");
    });

    const open = await openWithFallback(resolveProviders(), "system", [{ role: "user", content: "why?" }]);
    expect(calls).toEqual(["openrouter.ai", "api.openai.com"]);
    expect(open.config.name).toBe("openai");
  });

  it("never puts a provider's raw body in front of a learner", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "k");
    const bodies = [
      { status: 402, body: '{"error":{"message":"This request requires more credits"}}' },
      { status: 400, body: '{"error":{"message":"messages[0].content: expected string"}}' },
      { status: 500, body: "<html><body>upstream is having a moment</body></html>" },
    ];
    for (const { status, body } of bodies) {
      vi.stubGlobal("fetch", async () => new Response(body, { status }));
      const failed = await openWithFallback(resolveProviders(), "s", [{ role: "user", content: "q" }])
        .then(() => null, (error: Error) => error);
      expect(failed).toBeInstanceOf(TutorError);
      // Nothing of the provider's own format reaches the sentence.
      expect(failed!.message).not.toMatch(/[{}<>]|error"|max_tokens/);
      expect(failed!.message.length).toBeLessThan(220);
    }
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
