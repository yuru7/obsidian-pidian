export class SearchProviderUnavailableError extends Error {
  constructor(public readonly providerId: string) {
    super(`Unknown search provider: ${providerId}`);
    this.name = "SearchProviderUnavailableError";
  }
}

export class SearchFailedError extends Error {
  constructor(message = "Web search failed.") {
    super(message);
    this.name = "SearchFailedError";
  }
}
