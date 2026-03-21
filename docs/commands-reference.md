# Command Reference

73 slash commands available. Press `/` in the chat input or `Ctrl+K` to open the command picker.

## Models & Providers

| Command | Description |
|---------|-------------|
| `/model` | Switch active LLM model |
| `/models` | Browse all available models by provider |
| `/router` | Configure per-task model routing (planning, coding, exploration, etc.) |
| `/provider-settings` | Provider settings — thinking mode, effort, speed, context management |
| `/model-scope` | Toggle model persistence scope (project vs global) |

## Agent & Modes

| Command | Description |
|---------|-------------|
| `/mode <name>` | Switch forge mode (default, auto, architect, socratic, challenge, plan) |
| `/plan` | Enter plan mode — research first, then structured plan with execution |
| `/agent-features` | Toggle agent features (de-sloppify pass, tier routing) |
| `/reasoning` | Toggle visibility of reasoning/thinking blocks |
| `/verbose` | Toggle verbose tool output |
| `/continue` | Continue from where the agent left off |

## Editor

| Command | Description |
|---------|-------------|
| `/editor` | Toggle Neovim editor panel |
| `/open <file>` | Open a file in the editor |
| `/split` | Cycle editor/chat split ratio |
| `/nvim-config` | Neovim config mode (auto, user, default, none) |
| `/editor-settings` | Editor display and LSP integration settings |
| `/vim-hints` | Toggle Neovim keybinding hints |
| `/diff-style` | Diff display mode (default, sidebyside, compact) |
| `/chat-style` | Chat accent style |
| `/nerd-font` | Toggle Nerd Font icon display |
| `/font` | Font settings |

## Git

| Command | Description |
|---------|-------------|
| `/git` | Git operations menu (commit, push, pull, stash, log, lazygit) |
| `/commit` | AI-assisted commit with staged file display and auto co-author |
| `/push` | Push to remote |
| `/pull` | Pull from remote |
| `/branch` | Show or create branches |
| `/log` | Recent commit history |
| `/diff` | Open diff in editor |
| `/git-status` | Current working tree status |
| `/stash` | Stash changes |
| `/stash pop` | Pop stashed changes |
| `/init` | Initialize git repository |
| `/lazygit` | Launch lazygit terminal UI |
| `/co-author-commits` | Toggle co-author trailer on commits |

## Intelligence & LSP

| Command | Description |
|---------|-------------|
| `/lsp` | LSP server status — running servers, PIDs, diagnostics per file |
| `/lsp-install` | LSP server manager — search 200+ servers (Mason registry), install, uninstall, enable/disable |
| `/diagnose` | Intelligence health check — probes all backends (LSP, ts-morph, tree-sitter, regex) |
| `/repo-map` | Repo map settings and status |
| `/web-search` | Web search configuration (API keys, page fetcher) |
| `/keys` | Manage LLM provider API keys (Anthropic, OpenAI, Google, xAI, etc.) |

### LSP Install Tabs

The `/lsp-install` command opens a full manager with 4 tabs:

- **Search** — Browse Mason registry (200+ LSP servers, formatters, linters, DAP debuggers)
- **Installed** — View installed servers with source (PATH, soulforge, mason)
- **Disabled** — Toggle servers on/off without uninstalling
- **Recommended** — Auto-suggested servers based on file types in your project

Supports installation via npm, pip, cargo, go, and GitHub binaries.

## Context & Memory

| Command | Description |
|---------|-------------|
| `/compact` | Trigger context compaction (V1 or V2 strategy) |
| `/compaction` | Switch compaction strategy (v1 LLM summary, v2 deterministic extraction) |
| `/context` | Context budget inspector — per-section token breakdown with visual bar |
| `/instructions` | Toggle instruction files loaded into system prompt (FORGE.md, CLAUDE.md, .cursorrules, etc.) |
| `/memory` | Memory system — title-only memories searchable by FTS5 |
| `/compact-v2-logs` | View compaction event history with token breakdowns |

## Sessions & Export

| Command | Description |
|---------|-------------|
| `/sessions` | Browse and restore past sessions (fuzzy search, metadata, size) |
| `/export` | Export current tab to markdown file |
| `/export json` | Export current tab as JSON file |
| `/export clipboard` | Copy current tab to clipboard (markdown) |
| `/new-tab` | Open a new tab |
| `/close-tab` | Close current tab |
| `/rename` | Rename current tab |
| `/tabs` | List all open tabs |

## Cross-Tab Coordination

| Command | Description |
|---------|-------------|
| `/claims` | Show all active file claims across tabs |
| `/unclaim <path>` | Release a file claim from current tab |
| `/unclaim-all` | Release all claims from current tab |
| `/force-claim <path>` | Steal a file claim from another tab |

## System

| Command | Description |
|---------|-------------|
| `/setup` | Check prerequisites and install missing tools (Bun, Neovim, Nerd Fonts) |
| `/skills` | Skills browser — search, install, and manage agent skills from community registry |
| `/privacy` | Manage forbidden file patterns (add/remove denied paths, project/global scope) |
| `/storage` | Storage usage breakdown and cleanup |
| `/errors` | Browse tool execution and API error log |
| `/status` | System status overview |
| `/proxy` | Proxy provider status |
| `/proxy install` | Install CLIProxyAPI |
| `/proxy login` | Authenticate proxy with Claude |
| `/help` | Searchable command list |
| `/clear` | Clear chat history |
| `/restart` | Restart SoulForge |
| `/quit` | Exit SoulForge |
| `/changes` | View files changed in current session |
