import { afterEach, describe, expect, it, vi } from "vitest";
import {
  completeWithImage, openWithFallback, resolveProviders, TutorError, visionProviders,
} from "@/lib/tutor/provider";

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

/*
  Reading a photograph.

  The chain is the same one, with one difference that matters to whoever pays
  the bill: it uses the model the deployment already configured unless it is
  told otherwise, so turning on the camera cannot quietly move a free-model
  deployment onto a paid one.
*/
const IMAGE = { mediaType: "image/jpeg", base64: "AAAA" };

function jsonReply(words: { et: string; en: string }[], usage?: object): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ words }) } }],
      ...(usage ? { usage } : {}),
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("the chain that looks at pictures", () => {
  it("uses whatever model the deployment configured", () => {
    only("openrouter");
    vi.stubEnv("OPENROUTER_MODEL", "z-ai/glm-5.2:free");
    vi.stubEnv("OPENROUTER_VISION_MODEL", "");
    expect(visionProviders()[0]?.model).toBe("z-ai/glm-5.2:free");
  });

  it("takes an override, which is how a text-only default gets eyes", () => {
    only("openrouter");
    vi.stubEnv("OPENROUTER_MODEL", "z-ai/glm-5.2:free");
    vi.stubEnv("OPENROUTER_VISION_MODEL", "openai/gpt-4o");
    expect(visionProviders()[0]?.model).toBe("openai/gpt-4o");
  });

  it("reports the tokens the provider actually charged", async () => {
    only("openai");
    vi.stubGlobal("fetch", vi.fn(async () =>
      jsonReply([{ et: "tuba", en: "room" }], { prompt_tokens: 2100, completion_tokens: 40 })));

    const seen: { input: number; output: number }[] = [];
    const reply = await completeWithImage(
      visionProviders(), "system", "prompt", IMAGE,
      (usage) => seen.push({ input: usage.inputTokens, output: usage.outputTokens }),
    );

    expect(reply.text).toContain("tuba");
    expect(seen).toEqual([{ input: 2100, output: 40 }]);
  });

  it("walks past a model that cannot see, unlike the chat path", async () => {
    /*
      A 400 stops `openWithFallback`, because a malformed request would be
      refused by everybody. Whether a model accepts an image is a fact about
      that one model, so here the next provider is worth asking.
    */
    vi.stubEnv("OPENROUTER_API_KEY", "k");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "k");

    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes("openrouter")
        ? new Response("no image support", { status: 400 })
        : jsonReply([{ et: "raamat", en: "book" }]));
    vi.stubGlobal("fetch", fetchMock);

    const reply = await completeWithImage(visionProviders(), "system", "prompt", IMAGE);
    expect(reply.config.name).toBe("openai");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops at a rejected key, because no amount of retrying fixes one", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "k");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "k");

    const fetchMock = vi.fn(async () => new Response("nope", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(completeWithImage(visionProviders(), "s", "p", IMAGE)).rejects.toBeInstanceOf(TutorError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("says so plainly when nothing is configured", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    await expect(completeWithImage([], "s", "p", IMAGE)).rejects.toThrow(/No AI provider/);
  });
});
