import { FetchService } from "../../application/fetch/FetchService";
import { SsrfGuard } from "./ssrfGuard";

export function createFetchService(fetchFn: typeof fetch): FetchService {
  return new FetchService(fetchFn, new SsrfGuard());
}
