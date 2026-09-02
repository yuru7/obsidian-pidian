import { registerBunOAuthFlows } from "@earendil-works/pi-ai/bun-oauth";

/**
 * Pi loads OAuth via `import("./openai-codex.ts")` so bundlers skip Node-only
 * flow code. Obsidian evals the plugin, so that import becomes
 * `app://obsidian.md/openai-codex.js` and fails.
 *
 * `registerBunOAuthFlows` is Pi's bundled-binary hook: it statically embeds
 * every OAuth flow. Call it before ModelRuntime login/refresh.
 */
registerBunOAuthFlows();
