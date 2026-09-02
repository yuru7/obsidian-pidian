# Pidian

Pi Coding Agent in Obsidian

**English** | [日本語](README_ja.md)

![icon](./assets/obsidian-pi-badge-256.png)

A plugin that lets you chat with an AI in the Obsidian sidebar to ask about or edit the open note, search notes, and search the web.

It includes the AI harness [Pi Coding Agent](https://pi.dev), so you get a strong agent experience without extra tools.

Desktop only. Mobile is not supported.

## What it can do

The AI agent decides on its own when to read, write, and search notes.

- Ask about the note or image you currently have open
- Find notes in the vault
- Read PNG, JPEG, and WebP images from the vault
- Edit notes
- Restrict edits, web search, and similar actions with permissions

## Install

Install from the Obsidian Community Plugins.

To build from source, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Quick start

When you enable the plugin, the Pidian sidebar opens on the right. After you close it, reopen it from the left ribbon, or from the command palette with **Open Pidian**.

1. Go to Settings → Pidian → **API credentials** and enter an API key for the service you use
2. Choose a provider and model under **General**, or at the bottom of the sidebar
3. With a note or other vault file open, type a message in the sidebar

If you leave the API key blank, Pidian uses environment variables.

Start a new conversation with **New chat** in the sidebar, or with the **New Pidian chat** command.

## Permissions

To prevent accidental changes, everything except read is restricted by default. Change this under Settings → Pidian → **Permissions**.

| Action | Default | What it covers |
| --- | --- | --- |
| Read | Always allow | Read notes and PNG/JPEG/WebP images, search the vault, list folders, open and switch tabs |
| Edit | Ask every time | Change an existing note. The target file and a diff are shown before running |
| Create | Deny | Create a new note |
| Delete | Deny | Trash a note according to Obsidian's trash settings |
| Web search | Ask every time | Search the web and fetch pages |

When set to **Ask every time**, you are prompted to allow or deny before the action runs. Denying stops only that action. The conversation continues.

To let the agent create notes, delete notes, or search the web, change only the permissions you need to **Ask every time** or **Always allow**.

Edits go through Obsidian, so you can undo them with Obsidian's standard Undo.

## Context

When you send a message, Pidian includes the path of the active file. For Markdown notes, it also includes the cursor position or selection. Canvas and PNG, JPEG, or WebP images include the path only. The agent reads an image with `read_image` when it needs to see it.

## Saving conversations

Conversations are saved in a plugin folder in the vault (default: `pidian/sessions/`). You can change the location under Settings → Pidian → **General** → Plugin folder.

When you turn on automatic deletion of old conversations, conversations older than the retention period are deleted on startup.

### Extra instructions (optional)

If you add `pidian/AGENTS.md` (when the plugin folder is the default) and write instructions for the AI's tone and behavior, you can customize how it works. The plugin works without this file.

```markdown
# Instructions

- Reply in English
- Keep the note's writing style
- Always check the content before editing
```

## API keys

API keys are stored in Obsidian plugin data.

Priority, from highest to lowest:

1. Pidian settings
2. Environment variables

Example environment variables:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`
- `OPENROUTER_API_KEY`

For Chat Completions-compatible endpoints, add Name / Base URL / Model ID / API key under Settings → Pidian → **API credentials** → Custom OpenAI Compatible.

## Limitations

- Desktop only (no mobile support)
- Does not operate on `.obsidian/` or conversation files
- Pi Coding Agent extensions cannot be used

## For developers

Build, architecture, testing, and release steps are in [CONTRIBUTING.md](CONTRIBUTING.md).

## Third-party assets

[NOTICE.md](./NOTICE.md)

## License

MIT
