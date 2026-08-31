export function classifyMediaType(mediaType: string): "html" | "text" | "unsupported" {
  if (mediaType === "text/html" || mediaType === "application/xhtml+xml") {
    return "html";
  }
  if (mediaType.startsWith("text/")) {
    return "text";
  }
  if (mediaType === "application/json" || mediaType.endsWith("+json")) {
    return "text";
  }
  if (mediaType === "application/xml" || mediaType.endsWith("+xml")) {
    return "text";
  }
  return "unsupported";
}

export function mediaTypeOf(contentType: string): string {
  return contentType.split(";")[0]?.trim().toLowerCase() ?? "";
}

export function charsetOf(contentType: string): string {
  const match = /charset\s*=\s*("?)([^;"]+)\1/i.exec(contentType);
  return match?.[2]?.trim() || "utf-8";
}
