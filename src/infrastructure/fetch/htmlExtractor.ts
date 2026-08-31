import { Readability } from "@mozilla/readability";
import { Defuddle } from "defuddle/node";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
import type { ExtractionResult, FetchExtractor } from "../../domain/fetch/FetchResult";
import { MIN_USEFUL_CONTENT_LENGTH } from "../../domain/fetch/FetchResult";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

const SPA_ROOT_SELECTOR = "#root, #app, #__next, [data-reactroot]";

export interface ExtractedHtml {
  title?: string;
  content: string;
  extractor: Exclude<FetchExtractor, "text">;
}

export async function extractHtml(
  html: string,
  url: string,
  options?: { alreadyRendered?: boolean },
): Promise<ExtractionResult> {
  const readability = extractReadability(html);
  const defuddle =
    readability && readability.content.length >= MIN_USEFUL_CONTENT_LENGTH
      ? undefined
      : await extractDefuddle(html, url);
  return classifyExtractedHtml(
    readability,
    defuddle,
    options?.alreadyRendered ? false : isJavascriptLikely(html),
  );
}

export function classifyExtractedHtml(
  readability: ExtractedHtml | undefined,
  defuddle: ExtractedHtml | undefined,
  javascriptLikely: boolean,
): ExtractionResult {
  if (readability && readability.content.length >= MIN_USEFUL_CONTENT_LENGTH) {
    return { status: "success", ...readability };
  }
  if (defuddle && defuddle.content.length >= MIN_USEFUL_CONTENT_LENGTH) {
    return { status: "success", ...defuddle };
  }
  if (javascriptLikely) {
    return { status: "javascript-required" };
  }
  if (readability) {
    return { status: "success", ...readability };
  }
  if (defuddle) {
    return { status: "success", ...defuddle };
  }
  return { status: "extraction-failed" };
}

export function isJavascriptLikely(html: string): boolean {
  const { document } = parseHTML(html);
  if (document.querySelectorAll("script").length >= 2) {
    return true;
  }
  const root = document.querySelector(SPA_ROOT_SELECTOR);
  if (!root) {
    return false;
  }
  return (root.textContent?.trim().length ?? 0) < 50;
}

export function extractReadability(html: string): ExtractedHtml | undefined {
  try {
    const { document } = parseHTML(html);
    const article = new Readability(document).parse();
    const contentHtml = article?.content?.trim();
    if (!contentHtml) {
      return undefined;
    }
    const content = turndown.turndown(contentHtml).trim();
    if (!content) {
      return undefined;
    }
    const title = article?.title?.trim();
    return title ? { title, content, extractor: "readability" } : { content, extractor: "readability" };
  } catch {
    return undefined;
  }
}

export async function extractDefuddle(html: string, url: string): Promise<ExtractedHtml | undefined> {
  try {
    const { document } = parseHTML(html);
    const result = await Defuddle(document, url, {
      markdown: true,
      useAsync: false,
    });
    const content = result.content?.trim();
    if (!content) {
      return undefined;
    }
    const title = result.title?.trim();
    return title ? { title, content, extractor: "defuddle" } : { content, extractor: "defuddle" };
  } catch {
    return undefined;
  }
}
