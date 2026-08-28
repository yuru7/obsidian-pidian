/** Pi's TUI theme imports highlight.js for terminal syntax coloring. */
function language() {
  return { name: "plaintext" };
}

const hljs = {
  registerLanguage() {},
  highlight(code) {
    return { value: String(code ?? "") };
  },
  highlightAuto(code) {
    return { value: String(code ?? "") };
  },
  getLanguage() {
    return undefined;
  },
};

export default hljs;
export { language as bash, hljs };
