import { Readability } from "@mozilla/readability";
import { Defuddle } from "defuddle/node";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
import { ContentExtractionError } from "../../domain/fetch/FetchErrors";
import { MIN_USEFUL_CONTENT_LENGTH, type FetchExtractor } from "../../domain/fetch/FetchResult";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

export interface ExtractedHtml {
  title?: string;
  content: string;
  extractor: Exclude<FetchExtractor, "text">;
}

export async function extractHtml(html: string, url: string): Promise<ExtractedHtml> {
  const readability = extractReadability(html);
  const defuddle =
    readability && readability.content.length >= MIN_USEFUL_CONTENT_LENGTH
      ? undefined
      : await extractDefuddle(html, url);
  return selectExtractedHtml(readability, defuddle, countScripts(html));
}

export function selectExtractedHtml(
  readability: ExtractedHtml | undefined,
  defuddle: ExtractedHtml | undefined,
  scriptCount: number,
): ExtractedHtml {
  if (readability && readability.content.length >= MIN_USEFUL_CONTENT_LENGTH) {
    return readability;
  }
  if (defuddle && defuddle.content.length >= MIN_USEFUL_CONTENT_LENGTH) {
    return defuddle;
  }
  if (scriptCount >= 2) {
    throw new ContentExtractionError("Page appears to require JavaScript rendering");
  }
  if (readability) {
    return readability;
  }
  if (defuddle) {
    return defuddle;
  }
  throw new ContentExtractionError();
}

export function extractReadability(html: string): ExtractedHtml | undefined {
  try {
    const { document } = parseHTML(html);
    const article = new Readability(document as unknown as Document).parse();
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
    const result = await Defuddle(document as unknown as Document, url, {
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

function countScripts(html: string): number {
  const { document } = parseHTML(html);
  return document.querySelectorAll("script").length;
}
