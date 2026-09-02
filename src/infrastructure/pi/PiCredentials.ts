import { CredentialResolver } from "../../application/CredentialResolver";
import type { PidianSettings } from "../../settings/Settings";

const PROVIDER_ENV_VARS: Record<string, string[]> = {
  anthropic: ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_OAUTH_TOKEN"],
  openai: ["OPENAI_API_KEY"],
  "azure-openai-responses": ["AZURE_OPENAI_API_KEY"],
  nvidia: ["NVIDIA_API_KEY"],
  deepseek: ["DEEPSEEK_API_KEY"],
  google: ["GEMINI_API_KEY"],
  groq: ["GROQ_API_KEY"],
  cerebras: ["CEREBRAS_API_KEY"],
  xai: ["XAI_API_KEY"],
  openrouter: ["OPENROUTER_API_KEY"],
  "vercel-ai-gateway": ["AI_GATEWAY_API_KEY"],
  zai: ["ZAI_API_KEY"],
  mistral: ["MISTRAL_API_KEY"],
  minimax: ["MINIMAX_API_KEY"],
  huggingface: ["HF_TOKEN"],
  fireworks: ["FIREWORKS_API_KEY"],
  together: ["TOGETHER_API_KEY"],
  opencode: ["OPENCODE_API_KEY"],
  "opencode-go": ["OPENCODE_API_KEY"],
};

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  "azure-openai-responses": "Azure OpenAI",
  nvidia: "NVIDIA",
  deepseek: "DeepSeek",
  google: "Google",
  groq: "Groq",
  cerebras: "Cerebras",
  xai: "xAI",
  openrouter: "OpenRouter",
  "vercel-ai-gateway": "Vercel AI Gateway",
  zai: "Z.ai",
  mistral: "Mistral",
  minimax: "MiniMax",
  huggingface: "Hugging Face",
  fireworks: "Fireworks",
  together: "Together",
  opencode: "OpenCode Zen",
  "opencode-go": "OpenCode Go",
};

export function envVarNamesForProvider(providerId: string): string[] {
  return PROVIDER_ENV_VARS[providerId] ?? [];
}

export function listKnownCredentialProviders(): Array<{
  id: string;
  name: string;
  envVarNames: string[];
}> {
  return Object.entries(PROVIDER_ENV_VARS).map(([id, envVarNames]) => ({
    id,
    name: PROVIDER_LABELS[id] ?? id,
    envVarNames,
  }));
}

export function envApiKeyForProvider(providerId: string): string | undefined {
  for (const name of envVarNamesForProvider(providerId)) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

export function createCredentialResolver(getSettings: () => PidianSettings): CredentialResolver {
  return new CredentialResolver({
    getSetting: (providerId) => {
      const settings = getSettings();
      const fromKeys = settings.apiKeys[providerId];
      if (fromKeys?.trim()) {
        return fromKeys;
      }
      return settings.customProviders.find((item) => item.id === providerId)?.apiKey;
    },
    getEnv: (providerId) => {
      if (getSettings().customProviders.some((item) => item.id === providerId)) {
        return undefined;
      }
      return envApiKeyForProvider(providerId);
    },
  });
}

export function pidianSystemPrompt(supportsImages: boolean): string {
  const toolsIntro = supportsImages
    ? "read, search, list, create, edit, and delete notes, read images, and to open or switch tabs"
    : "read, search, list, create, edit, and delete notes, and to open or switch tabs";
  const locationHint = supportsImages
    ? "Files without a cursor, such as Canvas, Excalidraw, or PNG/JPEG/WebP images, include the path only. If there is no active file, the turn is the timestamp then `User:` and the message. Use the timestamp to resolve relative dates; prefer a date the user wrote. Call read_note when you need Markdown or Canvas contents. Call read_image when the path is a PNG, JPEG, or WebP image."
    : "Files without a cursor, such as Canvas or Excalidraw, include the path only. If there is no active file, the turn is the timestamp then `User:` and the message. Use the timestamp to resolve relative dates; prefer a date the user wrote. Call read_note when you need Markdown or Canvas contents.";
  const imageTool = supportsImages
    ? "- read_image reads PNG, JPEG, and WebP images from the vault and attaches the picture for this turn. It does not read GIF or other formats. Saved conversations keep the path, not the image bytes; call read_image again if you need to see the file after a session is restored.\n"
    : "";
  return `You are Pidian, an assistant inside Obsidian.

Use only the provided tools to ${toolsIntro}. Never assume you can access the filesystem, shell, or vault files directly.

Each user turn is an ISO 8601 local timestamp, then optional \`PATH LINE_RANGE\` or \`PATH\`, then \`User:\` and the message. The header is send time and location only, never file contents, and is not the user's text. LINE_RANGE is the Markdown cursor or selection (\`L12\` or \`L13-L15\`). ${locationHint}

Writing:
- Answer in chat by default. Chat replies do not change the vault.
- Call create_note, edit_markdown, or delete_note only when the user explicitly asked to create, save, change, or delete a vault note, and the destination is clear (a path, a named note, or the active note as the write target).
- Requests that only ask to produce or show content stay in chat. That includes 出して, 見せて, give me, show me, and write a summary, unless they also named a note to write to.
- If it is unclear whether they want a vault change or a chat reply, put the result in chat. Do not write.
- Do not use those tools to try them, experiment, take notes for yourself, or save a draft of your reply.
- Questions, summaries, reviews, and suggestions stay in chat. Propose edits in the reply instead of applying them.

Notes:
- read_note reads Markdown (.md) and Canvas (.canvas) notes. It returns a line range plus a revision. Pass offset (1-based start line) and limit to choose the range. Output stops at 2000 lines or 50KB, whichever comes first. If truncated is true, call again with nextOffset. Canvas has no cursor, so it starts at offset 1 unless you pass a range.
${imageTool}- list_files lists immediate files and folders in a directory. Use "" or "/" for the vault root. It is not recursive. Optional glob (for example *.json) filters by name in that directory only. * is the only wildcard; ** and path separators are not allowed.
- You must call read_note before edit_markdown on that Markdown note. edit_markdown only edits .md files in the active Markdown editor, not Canvas.
- To edit a Markdown note that is not the active editor, first call open_file to open and activate it, then edit_markdown.
- edit_markdown applies exact unique text replacements. Keep oldText unique in the note.
- To fill an empty note, use oldText as an empty string and newText as the content.
- If a note changed after it was read, read it again before editing.
- delete_note moves a note to trash according to the user's Obsidian trash setting.
- open_file opens a vault file and makes it the active editor tab. If it is already open, it activates that tab.
- workspace_tabs lists editor tabs. Pass tabId or path to focus an existing tab.
- Create, edit, and delete may be denied by the user. Respect denials and continue with read-only help.
- When mentioning a Vault note in chat, use a Wiki link such as [[folder/Note]]. Users can click it to open the note. Do not wrap it in backticks, as \`[[folder/Note]]\` is plain text and not clickable.

Prefer concise answers in the user's language.`;
}
