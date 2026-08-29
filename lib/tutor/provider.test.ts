import { afterEach, describe, expect, it, vi } from "vitest";
import {
  completeWithImage, FREE_OPENROUTER_MODELS, openWithFallback, resolveProviders,
  TutorError, visionProviders,
} from "@/lib/tutor/provider";
import { priceFor } from "@/lib/usage/pricing";

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
    const seen: string[] = [];
    for (const { name } of resolveProviders()) if (seen[seen.length - 1] !== name) seen.push(name);
    expect(seen).toEqual(["openrouter", "anthropic", "openai"]);
  });

  it("asks free models by default, because the setup a stranger follows has no credit on it", () => {
    /*
      This default was `openai/gpt-4o`, a paid model at OpenRouter's full rate,
      three lines under a comment saying the default provider is a free one. A
      new key has no credit, so the answer was a 402 and Anu was dead on
      arrival. Asserted rather than remembered, on both halves: the slug says
      free, and the ledger agrees it costs nothing.
    */
    only("openrouter");
    const models = resolveProviders().map((p) => p.model);
    expect(models).toEqual([...FREE_OPENROUTER_MODELS]);
    expect(models.length).toBeGreaterThan(1);
    for (const model of models) {
      expect(model.endsWith(":free")).toBe(true);
      expect(priceFor(model)).toEqual({ inputPerMTok: 0, outputPerMTok: 0 });
    }
  });

  it("takes a list from the environment, so a deployment with credit can point elsewhere", () => {
    only("openrouter");
    vi.stubEnv("OPENROUTER_MODEL", "openai/gpt-4o, anthropic/claude-sonnet-5 ");
    expect(resolveProviders().map((p) => p.model)).toEqual([
      "openai/gpt-4o", "anthropic/claude-sonnet-5",
    ]);
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
    // One free model, so this test is about walking between providers. The
    // walk between models of one provider is the test below it.
    vi.stubEnv("OPENROUTER_MODEL", "free/one:free");
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
    vi.stubEnv("OPENROUTER_MODEL", "free/one:free");
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
    vi.stubEnv("OPENROUTER_MODEL", "paid/one");
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
    vi.stubEnv("OPENROUTER_MODEL", "free/one:free");
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
    vi.stubEnv("OPENROUTER_MODEL", "free/one:free");
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

  it("walks past a free model that has been retired, but only to its own provider", async () => {
    /*
      A free model exists at somebody else's expense, so it is withdrawn the
      moment it stops being worth paying for, and a slug in a constant here
      goes stale on its own. Across providers a 404 stays fatal, for the
      reason above: the model name is wrong, and it is wrong everywhere.
    */
    only("openrouter");
    vi.stubEnv("OPENROUTER_MODEL", "gone/yesterday:free, still/here:free");
    const models: string[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const model = JSON.parse(String(init.body)).model as string;
      models.push(model);
      return model.startsWith("gone/")
        ? new Response("no such model", { status: 404 })
        : sse("Partitive.");
    });

    const open = await openWithFallback(resolveProviders(), "s", [{ role: "user", content: "q" }]);
    expect(models).toEqual(["gone/yesterday:free", "still/here:free"]);
    expect(open.config.model).toBe("still/here:free");
  });

  it("does not walk a missing model across to another provider", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "k");
    vi.stubEnv("OPENAI_API_KEY", "k");
    vi.stubEnv("OPENROUTER_MODEL", "gone/yesterday:free");
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(new URL(url).host);
      return new Response("no such model", { status: 404 });
    });

    await expect(openWithFallback(resolveProviders(), "s", [{ role: "user", content: "q" }]))
      .rejects.toMatchObject({ status: 404 });
    expect(calls).toEqual(["openrouter.ai"]);
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

  it("asks one model once, however many links the chat chain has", () => {
    /*
      The chat chain is a link per free model at OpenRouter, so an override
      collapsing them all onto one model would otherwise ask it three times
      and read the third refusal as having exhausted the chain.
    */
    only("openrouter");
    vi.stubEnv("OPENROUTER_MODEL", "");
    vi.stubEnv("OPENROUTER_VISION_MODEL", "openai/gpt-4o");
    expect(resolveProviders().length).toBeGreaterThan(1);
    expect(visionProviders()).toHaveLength(1);
  });

  it("reports the tokens the provider actually charged", async () => {
    only("openai");
    vi.stubEnv("OPENAI_VISION_MODEL", "");
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
    // One OpenRouter link rather than one per free model, so the count below
    // measures the walk past a provider and not the length of that list.
    vi.stubEnv("OPENROUTER_MODEL", "openai/gpt-4o");
    vi.stubEnv("OPENROUTER_VISION_MODEL", "");

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
    vi.stubEnv("OPENROUTER_MODEL", "openai/gpt-4o");
    vi.stubEnv("OPENROUTER_VISION_MODEL", "");

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
