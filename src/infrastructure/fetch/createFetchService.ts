import { FetchOrchestrator } from "../../application/fetch/FetchOrchestrator";
import { BrowserFetcher } from "./BrowserFetcher";
import { StaticFetcher } from "./StaticFetcher";
import { SsrfGuard } from "./ssrfGuard";

export function createFetchService(fetchFn: typeof fetch): FetchOrchestrator {
  const guard = new SsrfGuard();
  return new FetchOrchestrator(new StaticFetcher(fetchFn, guard), new BrowserFetcher(guard));
}
