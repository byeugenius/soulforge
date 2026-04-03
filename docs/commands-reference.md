# Command Reference

86 slash commands available. Type `/` in chat or press `Ctrl+K` to open the command palette.

Sub-commands (like `/proxy login`) work when typed directly but are grouped under their parent in the palette.

## Keybindings

| Key | Action |
|-----|--------|
| `Ctrl+K` | Command palette — search all commands |
| `Ctrl+L` | Switch LLM model |
| `Ctrl+E` | Toggle editor panel |
| `Ctrl+G` | Git menu |
| `Ctrl+P` | Browse sessions |
| `Ctrl+S` | Browse skills |
| `Ctrl+N` | New session (saves current, starts fresh) |
| `Ctrl+T` | New tab |
| `Ctrl+W` | Close tab |
| `Ctrl+D` | Cycle forge mode |
| `Ctrl+X` | Abort generation |
| `Ctrl+C` | Copy selection / exit |
| `Ctrl+O` | Expand/collapse all (code, reasoning) |
| `Ctrl+H` | Command palette |
| `Ctrl+[` / `]` | Prev / next tab |
| `Ctrl+1-9` | Switch to tab N |
| `Alt+R` | Error log |

## Models & Providers

| Command | Description |
|---------|-------------|
| `/models` | Switch LLM model (Ctrl+L) — search enabled |
| `/router` | Route models by task type (spark, ember, web search, desloppify, verify, compact) |
| `/provider-settings` | Configure provider features — thinking mode, effort, speed, context management |
| `/model-scope` | Toggle model persistence scope (project vs global) |
| `/keys` | Manage API keys (LLM providers & web search) |
| `/proxy` | Proxy — status, login, logout, install, upgrade |
| `/web-search` | Web search API keys & settings |

## Agent & Modes

| Command | Description |
|---------|-------------|
| `/mode <name>` | Switch forge mode (default, auto, architect, socratic, challenge, plan) |
| `/plan` | Enter plan mode — research first, then structured plan with execution |
| `/agent-features` | Toggle agent features (de-sloppify, verify edits, tier routing) |
| `/reasoning` | Toggle visibility of reasoning/thinking blocks |
| `/verbose` | Toggle verbose tool output |
| `/continue` | Continue from where the agent left off |

## Settings

| Command | Description |
|---------|-------------|
| `/settings` | Settings hub — all options in one place |
| `/chat-style` | Chat layout style (accent/bubble) |
| `/diff-style` | Diff display mode (default, sidebyside, compact) |
| `/font` | Terminal font settings |
| `/font nerd` | Toggle Nerd Font icon display |
| `/nvim-config` | Neovim config mode (default, user, none) |
| `/vim-hints` | Toggle Neovim keybinding hints |
| `/instructions` | Toggle instruction files (SOULFORGE.md, CLAUDE.md, etc.) |
| `/git co-author` | Toggle co-author trailer on commits |
| `/split` | Cycle editor/chat split ratio (40/50/60/70) |

## Editor

| Command | Description |
|---------|-------------|
| `/editor` | Toggle editor panel (Ctrl+E) |
| `/editor-settings` | Editor display and LSP integration settings |
| `/open <file>` | Open a file in the editor |

## Git

| Command | Description |
|---------|-------------|
| `/git` | Git operations menu — commit, push, pull, stash, log, lazygit (Ctrl+G) |
| `/git commit` | AI-assisted commit with staged file display |
| `/git push` | Push to remote |
| `/git pull` | Pull from remote |
| `/git branch` | Show or create branches |
| `/git log` | Recent commit history |
| `/git diff` | Open diff in editor |
| `/git status` | Working tree status |
| `/git stash` | Stash changes — `pop` to restore |
| `/git init` | Initialize git repository |
| `/git lazygit` | Launch lazygit terminal UI |

## Intelligence & LSP

| Command | Description |
|---------|-------------|
| `/lsp` | LSP status — install, restart servers |
| `/diagnose` | Health check — probes LSP, tree-sitter, semantic indexing |
| `/repo-map` | Soul map settings (AST index, semantic summaries) |
| `/context` | Context & system dashboard (Context tab) |
| `/memory` | Memory system — scopes, view, clear |
| `/skills` | Browse & install skills (Ctrl+S) |

## Sessions & Tabs

| Command | Description |
|---------|-------------|
| `/sessions` | Browse and restore past sessions (Ctrl+P) |
| `/export` | Export chat — markdown, json, clipboard, diagnostic |
| `/clear` | Clear chat history |
| `/compact` | Trigger context compaction |
| `/compaction` | Compaction strategy & pruning settings |
| `/plan` | Toggle plan mode |
| `/continue` | Resume interrupted generation |
| `/tab` | Tabs — list, new, close, rename |
| `/tab new` | Open a new tab (Ctrl+T) |
| `/tab close` | Close current tab (Ctrl+W) |
| `/tab rename` | Rename current tab |
| `/changes` | Toggle changed files panel |
| `/claim` | Show file claims across tabs |

## System

| Command | Description |
|---------|-------------|
| `/status` | System status dashboard (System tab) |
| `/errors` | Error & tool execution log (Alt+R) |
| `/compact-v2-logs` | Compaction event history |
| `/storage` | Storage usage & cleanup |
| `/setup` | Check & install prerequisites |
| `/privacy` | Manage forbidden file patterns |
| `/help` | Open command palette |
| `/restart` | Restart SoulForge |
| `/quit` | Exit SoulForge |