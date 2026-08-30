/**
 * Bundle entry for `@earendil-works/pi-coding-agent`.
 * The package barrel re-exports the CLI (`main`), package manager, and Windows
 * self-update. Those pull ZIP extraction and child_process into main.js, which
 * looks like a plugin self-updater to Obsidian's review scanner.
 */
export { createAgentSession } from "../../../node_modules/@earendil-works/pi-coding-agent/dist/core/sdk.js";
export { ModelRuntime } from "../../../node_modules/@earendil-works/pi-coding-agent/dist/core/model-runtime.js";
export { SessionManager } from "../../../node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.js";
export { SettingsManager } from "../../../node_modules/@earendil-works/pi-coding-agent/dist/core/settings-manager.js";
export { defineTool } from "../../../node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.js";
