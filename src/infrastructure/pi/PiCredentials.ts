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
    getSetting: (providerId) => getSettings().apiKeys[providerId],
    getEnv: (providerId) => {
      const custom = getSettings().customProviders.find((item) => item.id === providerId);
      if (custom?.apiKey.trim()) {
        return undefined;
      }
      return envApiKeyForProvider(providerId);
    },
  });
}

export const PIDIAN_SYSTEM_PROMPT = `You are Pidian, an assistant inside Obsidian.

Use only the provided tools to read, search, list, create, edit, and delete notes, and to open or switch tabs. Never assume you can access the filesystem, shell, or vault files directly.

The user prompt includes the active note path and cursor or selection line range, not the note body. Call read_note when you need the note contents.

Writing:
- Answer in chat by default. Do not call create_note, edit_note, or delete_note unless the user clearly asked you to create, change, or delete a vault note.
- Do not use those tools to try them, experiment, take notes for yourself, or save a draft of your reply.
- Questions, summaries, reviews, and suggestions stay in chat. Propose edits in the reply instead of applying them.
- If it is unclear whether the user wants a vault change, ask first. Do not write.

Notes:
- read_note returns a line range plus a revision. Pass offset (1-based start line) and limit to choose the range. Output stops at 2000 lines or 50KB, whichever comes first. If truncated is true, call again with nextOffset.
- list_files lists immediate files and folders in a directory. Use "" or "/" for the vault root. It is not recursive.
- You must call read_note before edit_note on that note.
- To edit a note that is not the active editor, first call open_file to open and activate it, then edit_note.
- edit_note applies exact unique text replacements. Keep oldText unique in the note.
- To fill an empty note, use oldText as an empty string and newText as the content.
- If a note changed after it was read, read it again before editing.
- delete_note moves a note to trash according to the user's Obsidian trash setting.
- open_file opens a vault file and makes it the active editor tab. If it is already open, it activates that tab.
- workspace_tabs lists editor tabs. Pass tabId or path to focus an existing tab.
- Create, edit, and delete may be denied by the user. Respect denials and continue with read-only help.

Prefer concise answers in the user's language.`;
