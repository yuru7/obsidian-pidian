import { describe, expect, it } from "vitest";
import { ContentExtractionError } from "../../domain/fetch/FetchErrors";
import { extractHtml, extractReadability, selectExtractedHtml } from "./htmlExtractor";

const ARTICLE_PARAGRAPH = [
  "Pi coding agent is a CLI assistant that helps software engineers read,",
  "search, and edit codebases with tool calls. The documentation explains",
  "how sessions work, how models are selected, and how custom tools are",
  "registered without exposing the host filesystem directly to the model.",
  "This paragraph is intentionally long so Readability treats it as useful",
  "article content rather than boilerplate navigation chrome on the page.",
].join(" ");

const ARTICLE_HTML = `<!DOCTYPE html>
<html>
<head><title>Example</title></head>
<body>
  <nav><a href="/">Home</a><a href="/about">About</a></nav>
  <article>
    <h1>Example</h1>
    <p>${ARTICLE_PARAGRAPH}</p>
    <p>${ARTICLE_PARAGRAPH}</p>
  </article>
</body>
</html>`;

const SPA_HTML = `<!DOCTYPE html>
<html>
<head><title>App</title></head>
<body>
  <div id="root"></div>
  <script src="/app.js"></script>
  <script src="/vendor.js"></script>
</body>
</html>`;

describe("extractReadability", () => {
  it("keeps article body as Markdown and drops navigation", () => {
    const extracted = extractReadability(ARTICLE_HTML);
    expect(extracted?.extractor).toBe("readability");
    expect(extracted?.title).toBe("Example");
    expect(extracted?.content).toContain("Pi coding agent");
    expect(extracted?.content).not.toContain("Home");
    expect(extracted?.content).not.toContain("<nav>");
    expect(extracted?.content).not.toContain("<p>");
  });
});

describe("extractHtml", () => {
  it("uses Readability for a long article", async () => {
    const extracted = await extractHtml(ARTICLE_HTML, "https://example.com/article");
    expect(extracted.extractor).toBe("readability");
    expect(extracted.content.length).toBeGreaterThanOrEqual(500);
  });

  it("reports pages that appear to need JavaScript", async () => {
    await expect(extractHtml(SPA_HTML, "https://example.com/app")).rejects.toBeInstanceOf(
      ContentExtractionError,
    );
    await expect(extractHtml(SPA_HTML, "https://example.com/app")).rejects.toThrow(
      "Page appears to require JavaScript rendering",
    );
  });
});

describe("selectExtractedHtml", () => {
  it("falls back to Defuddle when Readability is missing or too short", () => {
    const defuddle = {
      title: "Defuddle",
      content: "D".repeat(500),
      extractor: "defuddle" as const,
    };
    expect(
      selectExtractedHtml({ title: "Short", content: "too short", extractor: "readability" }, defuddle, 0),
    ).toEqual(defuddle);
    expect(selectExtractedHtml(undefined, defuddle, 0)).toEqual(defuddle);
  });

  it("keeps a short Readability result when Defuddle is also short", () => {
    const readability = { title: "Short", content: "hello", extractor: "readability" as const };
    expect(selectExtractedHtml(readability, { content: "also short", extractor: "defuddle" }, 0)).toEqual(
      readability,
    );
  });
});
