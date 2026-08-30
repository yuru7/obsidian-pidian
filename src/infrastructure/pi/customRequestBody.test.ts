import { describe, expect, it, vi } from "vitest";
import type { CustomOpenAIProvider } from "../../settings/Settings";
import {
  applyCustomRequestBody,
  createCustomRequestBodyFetch,
  findCustomModelForRequest,
  mergeChatCompletionsBody,
  parseExtraRequestBody,
} from "./customRequestBody";

const provider: CustomOpenAIProvider = {
  id: "custom-1",
  name: "Local",
  baseUrl: "http://localhost:11434/v1",
  models: [
    {
      id: "cfg-high",
      name: "foo high",
      modelId: "foo",
      extraRequestBody: '{"reasoning_effort":"high","temperature":0.2}',
    },
    {
      id: "foo",
      name: "foo",
      modelId: "foo",
      extraRequestBody: "",
    },
  ],
  apiKey: "",
};

describe("parseExtraRequestBody", () => {
  it("returns undefined for empty text", () => {
    expect(parseExtraRequestBody("")).toBeUndefined();
    expect(parseExtraRequestBody("  \n  ")).toBeUndefined();
  });

  it("parses a JSON object", () => {
    expect(parseExtraRequestBody('{"reasoning_effort":"high"}')).toEqual({ reasoning_effort: "high" });
  });

  it("rejects invalid JSON", () => {
    expect(() => parseExtraRequestBody("{")).toThrow(/Invalid additional JSON parameters/);
  });

  it("rejects a JSON array", () => {
    expect(() => parseExtraRequestBody("[]")).toThrow(/must be a JSON object/);
  });
});

describe("mergeChatCompletionsBody", () => {
  it("overlays Pidian fields on Pi's body and uses the configured model id", () => {
    expect(
      mergeChatCompletionsBody(
        { model: "foo", messages: [], stream: true, reasoning_effort: "medium" },
        { reasoning_effort: "high", temperature: 0.2 },
        "foo",
      ),
    ).toEqual({
      model: "foo",
      messages: [],
      stream: true,
      reasoning_effort: "high",
      temperature: 0.2,
    });
  });

  it("rewrites Pi's internal model id even when extra JSON is empty", () => {
    expect(mergeChatCompletionsBody({ model: "cfg-high", stream: true }, undefined, "foo")).toEqual({
      model: "foo",
      stream: true,
    });
  });

  it("uses the model ID field even if extra JSON also sets model", () => {
    expect(mergeChatCompletionsBody({ model: "cfg-high" }, { model: "from-extra", temperature: 0.2 }, "foo")).toEqual({
      model: "foo",
      temperature: 0.2,
    });
  });
});

describe("findCustomModelForRequest", () => {
  it("matches by unique config id on the custom base URL", () => {
    expect(findCustomModelForRequest([provider], "http://localhost:11434/v1/chat/completions", "cfg-high")?.id).toBe(
      "cfg-high",
    );
  });

  it("does not match a built-in request that happens to use the same model field", () => {
    expect(findCustomModelForRequest([provider], "https://api.openai.com/v1/chat/completions", "foo")).toBeUndefined();
  });
});

describe("applyCustomRequestBody", () => {
  it("merges extra JSON onto a Pi chat completions body", async () => {
    const next = await applyCustomRequestBody(
      "http://localhost:11434/v1/chat/completions",
      {
        method: "POST",
        body: JSON.stringify({
          model: "cfg-high",
          messages: [],
          stream: true,
          reasoning_effort: "medium",
        }),
      },
      [provider],
    );
    expect(JSON.parse(String(next?.body))).toEqual({
      model: "foo",
      messages: [],
      stream: true,
      reasoning_effort: "high",
      temperature: 0.2,
    });
  });

  it("leaves unrelated JSON bodies unchanged", async () => {
    const init = {
      method: "POST",
      body: JSON.stringify({ model: "gpt-5", stream: true }),
    };
    const next = await applyCustomRequestBody("https://api.openai.com/v1/chat/completions", init, [provider]);
    expect(next).toBe(init);
  });

  it("throws when extra JSON is invalid", async () => {
    const broken: CustomOpenAIProvider = {
      ...provider,
      models: [{ ...provider.models[0]!, extraRequestBody: "{" }],
    };
    await expect(
      applyCustomRequestBody(
        "http://localhost:11434/v1/chat/completions",
        { method: "POST", body: JSON.stringify({ model: "cfg-high", stream: true }) },
        [broken],
      ),
    ).rejects.toThrow(/Invalid additional JSON parameters/);
  });
});

describe("createCustomRequestBodyFetch", () => {
  it("sends the merged body to the wrapped fetch", async () => {
    const inner = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("ok"));
    const fetch = createCustomRequestBodyFetch(() => [provider], inner);
    await fetch("http://localhost:11434/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({ model: "cfg-high", messages: [], stream: true, reasoning_effort: "medium" }),
    });
    expect(JSON.parse(String(inner.mock.calls[0]?.[1]?.body))).toEqual({
      model: "foo",
      messages: [],
      stream: true,
      reasoning_effort: "high",
      temperature: 0.2,
    });
  });
});
