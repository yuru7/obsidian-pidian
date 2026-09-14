/** Parse HTML with the Electron renderer DOM. Tests that need this use happy-dom. */
export function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

