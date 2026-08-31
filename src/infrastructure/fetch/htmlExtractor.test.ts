import { describe, expect, it } from "vitest";
import { classifyExtractedHtml, extractHtml, extractReadability, isJavascriptLikely } from "./htmlExtractor";

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
    expect(extracted.status).toBe("success");
    if (extracted.status !== "success") {
      return;
    }
    expect(extracted.extractor).toBe("readability");
    expect(extracted.content.length).toBeGreaterThanOrEqual(500);
  });

  it("reports pages that appear to need JavaScript", async () => {
    await expect(extractHtml(SPA_HTML, "https://example.com/app")).resolves.toEqual({
      status: "javascript-required",
    });
  });

  it("still extracts a rendered article when leftover scripts would look like an SPA", async () => {
    const rendered = `<!DOCTYPE html>
<html>
<head><title>App</title></head>
<body>
  <div id="root">
    <article>
      <h1>Example</h1>
      <p>${ARTICLE_PARAGRAPH}</p>
      <p>${ARTICLE_PARAGRAPH}</p>
    </article>
  </div>
  <script src="/app.js"></script>
  <script src="/vendor.js"></script>
  <script src="/chunk.js"></script>
</body>
</html>`;
    const extracted = await extractHtml(rendered, "https://example.com/app", { alreadyRendered: true });
    expect(extracted.status).toBe("success");
    if (extracted.status !== "success") {
      return;
    }
    expect(extracted.content).toContain("Pi coding agent");
    expect(extracted.content).not.toContain("<script");
  });
});

describe("isJavascriptLikely", () => {
  it("treats an empty SPA root as JavaScript-required even with one script", () => {
    const html = `<!DOCTYPE html><html><body><div id="app"></div><script src="/app.js"></script></body></html>`;
    expect(isJavascriptLikely(html)).toBe(true);
  });
});

describe("classifyExtractedHtml", () => {
  it("falls back to Defuddle when Readability is missing or too short", () => {
    const defuddle = {
      title: "Defuddle",
      content: "D".repeat(500),
      extractor: "defuddle" as const,
    };
    expect(
      classifyExtractedHtml({ title: "Short", content: "too short", extractor: "readability" }, defuddle, false),
    ).toEqual({ status: "success", ...defuddle });
    expect(classifyExtractedHtml(undefined, defuddle, false)).toEqual({ status: "success", ...defuddle });
  });

  it("keeps a short Readability result when Defuddle is also short", () => {
    const readability = { title: "Short", content: "hello", extractor: "readability" as const };
    expect(
      classifyExtractedHtml(readability, { content: "also short", extractor: "defuddle" }, false),
    ).toEqual({ status: "success", ...readability });
  });

  it("marks short content as javascript-required when the page looks like an SPA", () => {
    expect(classifyExtractedHtml({ content: "hi", extractor: "readability" }, undefined, true)).toEqual({
      status: "javascript-required",
    });
  });
});
