/**
 * Pi coding tools and themes import the terminal UI for CLI rendering.
 * Pidian has its own React UI, so the TUI package is replaced at bundle time.
 *
 * Named exports must be real bindings. A CJS Proxy is invisible to esbuild's
 * __toESM copy, which made `class Foo extends Container` throw at plugin load.
 */
export class Component {
  constructor(..._args) {}
  render() {
    return "";
  }
  setText() {}
  addChild() {}
}

export class KeybindingsManager {
  constructor(..._args) {}
  setUserBindings() {}
  getResolvedBindings() {
    return {};
  }
  matches() {
    return false;
  }
  getKeys() {
    return [];
  }
}

const emptyKeybinding = { defaultKeys: [], description: "" };
export const TUI_KEYBINDINGS = new Proxy(
  {},
  {
    get: () => emptyKeybinding,
  },
);

export const Key = {};

export function getCapabilities() {
  return { trueColor: false, images: false, hyperlinks: false };
}

export function getKeybindings() {
  return {
    getKeys: () => [],
    matches: () => false,
  };
}

export function setKeybindings() {}
export function getImageDimensions() {
  return undefined;
}
export function hyperlink(text) {
  return text;
}
export function imageFallback() {
  return "";
}
export function truncateToWidth(text) {
  return text ?? "";
}
export function visibleWidth(text) {
  return String(text ?? "").length;
}
export function fuzzyFilter() {
  return [];
}
export function fuzzyMatch() {
  return false;
}
export function matchesKey() {
  return false;
}
export function sliceByColumn(text) {
  return text ?? "";
}
export function wrapTextWithAnsi(text) {
  return text ?? "";
}

export {
  Component as Box,
  Component as CancellableLoader,
  Component as CombinedAutocompleteProvider,
  Component as Container,
  Component as Editor,
  Component as Image,
  Component as Input,
  Component as Loader,
  Component as Markdown,
  Component as Marked,
  Component as ProcessTerminal,
  Component as SelectList,
  Component as SettingsList,
  Component as Spacer,
  Component as Text,
  Component as TruncatedText,
  Component as TuiAltScreen,
  Component as TuiMainScreen,
};
