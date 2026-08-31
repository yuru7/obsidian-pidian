export class InvalidUrlError extends Error {
  constructor(message = "Invalid URL.") {
    super(message);
    this.name = "InvalidUrlError";
  }
}

export class BlockedUrlError extends Error {
  constructor(message = "URL is blocked.") {
    super(message);
    this.name = "BlockedUrlError";
  }
}

export class FetchTimeoutError extends Error {
  constructor(message = "Fetch timed out.") {
    super(message);
    this.name = "FetchTimeoutError";
  }
}

export class ResponseTooLargeError extends Error {
  constructor(message = "Response too large") {
    super(message);
    this.name = "ResponseTooLargeError";
  }
}

export class UnsupportedContentTypeError extends Error {
  constructor(contentType: string) {
    super(`Unsupported content type: ${contentType || "unknown"}`);
    this.name = "UnsupportedContentTypeError";
  }
}

export const JAVASCRIPT_REQUIRED_MESSAGE = "Page appears to require JavaScript rendering";

export class ContentExtractionError extends Error {
  constructor(message = "Could not extract readable content from HTML") {
    super(message);
    this.name = "ContentExtractionError";
  }
}

export class JavascriptRequiredError extends ContentExtractionError {
  constructor(message = JAVASCRIPT_REQUIRED_MESSAGE) {
    super(message);
    this.name = "JavascriptRequiredError";
  }
}

export class FetchFailedError extends Error {
  constructor(message = "Fetch failed.") {
    super(message);
    this.name = "FetchFailedError";
  }
}
