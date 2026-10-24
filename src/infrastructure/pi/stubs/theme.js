/**
 * AgentSession imports Pi's terminal theme for TUI rendering and HTML export.
 * Loading the real module watches theme files and pulls the syntax highlighter.
 * Pidian never initializes or renders that theme.
 */
export function getThemeByName() {
  return undefined;
}

export function getResolvedThemeColors() {
  return {};
}

export function getThemeExportColors() {
  return {};
}

export const theme = new Proxy(
  {},
  {
    get() {
      throw new Error("Pidian does not use Pi themes");
    },
  },
);
