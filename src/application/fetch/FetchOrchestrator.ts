import {
  ContentExtractionError,
  JavascriptRequiredError,
} from "../../domain/fetch/FetchErrors";
import type {
  ExtractionResult,
  FetchedDocument,
  FetchMode,
  FetchResult,
} from "../../domain/fetch/FetchResult";
import { classifyMediaType } from "../../domain/fetch/mediaType";
import { extractHtml } from "../../infrastructure/fetch/htmlExtractor";
import type { BrowserFetcher } from "../../infrastructure/fetch/BrowserFetcher";
import type { StaticFetcher } from "../../infrastructure/fetch/StaticFetcher";

export type ContentExtractor = (
  html: string,
  url: string,
  options?: { alreadyRendered?: boolean },
) => Promise<ExtractionResult>;

export function formatFetchResult(result: FetchResult): string {
  const lines: string[] = [];
  if (result.title) {
    lines.push(`Title: ${result.title}`, "");
  }
  lines.push(`URL: ${result.finalUrl}`, "", result.content);
  return lines.join("\n");
}

export class FetchOrchestrator {
  constructor(
    private readonly staticFetcher: StaticFetcher,
    private readonly browserFetcher: BrowserFetcher,
    private readonly extract: ContentExtractor = extractHtml,
  ) {}

  async fetch(url: string, signal?: AbortSignal, mode: FetchMode = "auto"): Promise<FetchResult> {
    if (mode === "browser") {
      return this.fromHtmlDocument(await this.browserFetcher.fetch(url, signal), true);
    }
    const document = await this.staticFetcher.fetch(url, signal);
    if (classifyMediaType(document.contentType) !== "html") {
      return textResult(document);
    }
    const extracted = await this.extract(document.body, document.finalUrl);
    if (extracted.status === "success") {
      return htmlResult(document, extracted);
    }
    if (extracted.status === "javascript-required" && mode === "auto") {
      return this.fromHtmlDocument(await this.browserFetcher.fetch(url, signal), true);
    }
    throw extractionError(extracted.status);
  }

  private async fromHtmlDocument(document: FetchedDocument, alreadyRendered: boolean): Promise<FetchResult> {
    if (classifyMediaType(document.contentType) !== "html") {
      return textResult(document);
    }
    const extracted = await this.extract(document.body, document.finalUrl, { alreadyRendered });
    if (extracted.status === "success") {
      return htmlResult(document, extracted);
    }
    throw extractionError(extracted.status === "javascript-required" ? "extraction-failed" : extracted.status);
  }
}

export { FetchOrchestrator as FetchService };

function textResult(document: FetchedDocument): FetchResult {
  return {
    url: document.url,
    finalUrl: document.finalUrl,
    contentType: document.contentType,
    content: document.body,
    extractor: "text",
  };
}

function htmlResult(
  document: FetchedDocument,
  extracted: Extract<ExtractionResult, { status: "success" }>,
): FetchResult {
  return {
    url: document.url,
    finalUrl: document.finalUrl,
    contentType: document.contentType,
    content: extracted.content,
    extractor: extracted.extractor,
    ...(extracted.title ? { title: extracted.title } : {}),
  };
}

function extractionError(status: "javascript-required" | "extraction-failed"): ContentExtractionError {
  return status === "javascript-required" ? new JavascriptRequiredError() : new ContentExtractionError();
}
