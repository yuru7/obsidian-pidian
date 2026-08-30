import type { FetchFunction } from "@earendil-works/pi-ai";
import {
  customProviderModels,
  isConfiguredCustomProvider,
  type CustomOpenAIProvider,
  type CustomProviderModel,
} from "../../settings/Settings";
import { corsFreeFetch } from "./corsFreeFetch";

export function parseExtraRequestBody(raw: string): Record<string, unknown> | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid additional JSON parameters: ${message}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Additional JSON parameters must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

export function mergeChatCompletionsBody(
  piBody: Record<string, unknown>,
  extra: Record<string, unknown> | undefined,
  modelId: string,
): Record<string, unknown> {
  return { ...piBody, ...extra, model: modelId };
}

export function findCustomModelForRequest(
  providers: CustomOpenAIProvider[],
  requestUrl: string,
  modelField: string,
): CustomProviderModel | undefined {
  for (const provider of providers) {
    if (!isConfiguredCustomProvider(provider)) {
      continue;
    }
    if (!requestMatchesCustomBaseUrl(requestUrl, provider.baseUrl)) {
      continue;
    }
    const match = customProviderModels(provider).find((model) => model.id === modelField);
    if (match) {
      return match;
    }
  }
  return undefined;
}

export function createCustomRequestBodyFetch(
  getCustomProviders: () => CustomOpenAIProvider[],
  baseFetch: FetchFunction = corsFreeFetch,
): FetchFunction {
  return async (input, init) => {
    const nextInit = await applyCustomRequestBody(input, init, getCustomProviders());
    return baseFetch(input, nextInit);
  };
}

export async function applyCustomRequestBody(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  providers: CustomOpenAIProvider[],
): Promise<RequestInit | undefined> {
  const bodyText = await requestBodyText(input, init);
  if (bodyText === undefined) {
    return init;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return init;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return init;
  }
  const body = parsed as Record<string, unknown>;
  if (typeof body.model !== "string") {
    return init;
  }
  const config = findCustomModelForRequest(providers, requestUrlFrom(input), body.model);
  if (!config) {
    return init;
  }
  const extra = parseExtraRequestBody(config.extraRequestBody);
  const merged = mergeChatCompletionsBody(body, extra, config.modelId);
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  headers.delete("content-length");
  return { ...init, body: JSON.stringify(merged), headers };
}

function requestMatchesCustomBaseUrl(requestUrl: string, baseUrl: string): boolean {
  const base = baseUrl.trim().replace(/\/+$/, "");
  if (!base) {
    return false;
  }
  try {
    const request = new URL(requestUrl);
    const parsedBase = new URL(base);
    if (request.origin !== parsedBase.origin) {
      return false;
    }
    return request.pathname === parsedBase.pathname || request.pathname.startsWith(`${parsedBase.pathname}/`);
  } catch {
    return requestUrl.startsWith(base);
  }
}

function requestUrlFrom(input: RequestInfo | URL): string {
  if (input instanceof URL) {
    return input.href;
  }
  if (typeof input === "string") {
    return input;
  }
  return input.url;
}

async function requestBodyText(input: RequestInfo | URL, init?: RequestInit): Promise<string | undefined> {
  if (init?.body != null) {
    return bodyInitToText(init.body);
  }
  if (input instanceof Request && input.method !== "GET" && input.method !== "HEAD") {
    const text = await input.clone().text();
    return text.length > 0 ? text : undefined;
  }
  return undefined;
}

async function bodyInitToText(body: BodyInit): Promise<string | undefined> {
  if (typeof body === "string") {
    return body;
  }
  if (body instanceof Uint8Array) {
    return Buffer.from(body).toString("utf8");
  }
  if (body instanceof ArrayBuffer) {
    return Buffer.from(body).toString("utf8");
  }
  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return body.text();
  }
  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
    return body.toString();
  }
  return new Response(body).text();
}
