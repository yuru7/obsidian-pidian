import { FetchOrchestrator, type ContentExtractor } from "../../application/fetch/FetchOrchestrator";
import { BrowserFetcher } from "./BrowserFetcher";
import { StaticFetcher } from "./StaticFetcher";
import { SsrfGuard } from "./ssrfGuard";

const extractHtmlWhenNeeded: ContentExtractor = async (html, url, options) => {
  const { extractHtml } = await import("./htmlExtractor");
  return extractHtml(html, url, options);
};

export function createFetchService(fetchFn: typeof fetch): FetchOrchestrator {
  const guard = new SsrfGuard();
  return new FetchOrchestrator(new StaticFetcher(fetchFn, guard), new BrowserFetcher(guard), extractHtmlWhenNeeded);
}
