# Pidian

Pi Coding Agent on Obsidian

**English** | [日本語](README_ja.md)

A plugin that lets you chat with an AI in the Obsidian sidebar to ask about or edit the open note, search notes, and search the web.

Desktop only. Mobile is not supported.

## What it can do

The AI agent decides on its own when to read, write, and search notes.

- Ask about the note you currently have open
- Find notes in the vault
- Edit notes
- Restrict edits, web search, and similar actions with permissions

## Install

Pidian is not in the Community Plugins list yet. Use one of the following.

**From a release**

1. Download `main.js`, `manifest.json`, and `styles.css` from the GitHub Release
2. Place them in `.obsidian/plugins/pidian/` in your vault
3. Enable Pidian under Settings → Community plugins

**To build from source**, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Getting started

When you enable the plugin, the Pidian sidebar opens on the right. After you close it, reopen it from the left ribbon, or from the command palette with **Open Pidian**.

1. Go to Settings → Pidian → **API credentials** and enter an API key for the service you use
2. Choose a provider and model under **General**, or at the bottom of the sidebar
3. With a Markdown note open, type a message in the sidebar

If you leave the API key blank, Pidian uses environment variables.

Start a new conversation with **New chat** in the sidebar, or with the **New Pidian chat** command.

## Permissions

To prevent accidental changes, everything except read is restricted by default. Change this under Settings → Pidian → **Permissions**.

| Action | Default | What it covers |
| --- | --- | --- |
| Read | Always allow | Read notes, search the vault, list folders, open and switch tabs |
| Edit | Ask every time | Change an existing note. The target file and a diff are shown before running |
| Create | Deny | Create a new note |
| Delete | Deny | Trash a note according to Obsidian's trash settings |
| Web search | Deny | Search the web and fetch pages |

When set to **Ask every time**, you are prompted to allow or deny before the action runs. Denying stops only that action. The conversation continues.

To let the agent create notes, delete notes, or search the web, change only the permissions you need to **Ask every time** or **Always allow**.

Edits apply to the currently active Markdown editor after you confirm. You can undo them with Obsidian's standard Undo. Newly created notes cannot be undone that way; delete the file instead.

## Context

When you send a message, Pidian includes the path of the active Markdown note, plus the cursor position or selection.

## Saving conversations

Conversations are saved in a plugin folder in the vault (default: `pidian/sessions/`). You can change the location under Settings → Pidian → **Sessions** → Plugin folder.

Automatic deletion of old conversations is off by default. When you turn it on, conversations older than the retention period are deleted on startup.

### Extra instructions (optional)

If you add `pidian/AGENTS.md` (when the plugin folder is the default), it is loaded as extra instructions for conversations. The plugin works without this file.

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
3. Existing Pi credentials

Example environment variables:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`
- `OPENROUTER_API_KEY`

For Chat Completions-compatible endpoints, add Name / Base URL / Model ID / API key under Settings → Pidian → **API credentials** → Custom OpenAI Compatible.

## Limitations

- Desktop only (no mobile support)
- Vault-wide embedding search (RAG), shell, and MCP are out of scope
- Does not operate on `.obsidian/` or conversation files

## For developers

Build, architecture, testing, and release steps are in [CONTRIBUTING.md](CONTRIBUTING.md). Agent execution uses [Pi](https://github.com/badlogic/pi-mono).
