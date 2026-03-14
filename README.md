# SoulForge - AI-Powered Terminal IDE

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%203.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Version](https://img.shields.io/badge/version-3.0.0-brightgreen.svg)](https://github.com/proxysoul/soulforge)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-1174%20passing-brightgreen.svg)](#testing)
[![Bun](https://img.shields.io/badge/runtime-Bun-f472b6.svg)](https://bun.sh)

SoulForge is a terminal-based IDE powered by AI. It embeds a real Neovim editor with LSP, a multi-agent system with parallel dispatch, and graph-powered code intelligence — all in a single terminal session. Built by proxySoul.

## Key Features

- **Embedded Neovim** — your actual Neovim config, plugins, and keybindings with full LSP support, right next to the AI chat
- **Multi-Agent Dispatch** — parallel explore, code, and web search agents with shared file cache and edit coordination
- **Graph-Powered Repo Map** — PageRank-ranked codebase index with cochange analysis, blast radius, clone detection, and unused export detection
- **Compound Tools** — `rename_symbol`, `move_symbol`, `refactor`, `project` do the complete job in one call across your entire codebase
- **4-Tier Code Intelligence** — LSP → ts-morph → tree-sitter → regex fallback chain covering 20+ languages
- **9 LLM Providers** — Anthropic, OpenAI, Google, xAI, Ollama (local), OpenRouter, LLMGateway, Vercel Gateway, and more
- **Task Router** — assign different models to planning, coding, exploration, and cleanup tasks automatically
- **Forge Modes** — default, architect (read-only design), socratic (question-first), challenge (adversarial review), plan (research-then-plan)
- **Terminal-Native** — works over SSH, in tmux, on headless servers. No Electron, no GUI required.

## Installation

**Requirements:** [Bun](https://bun.sh) >= 1.0, [Neovim](https://neovim.io) >= 0.9

```bash
bun install -g @proxysoul/soulforge
```

Launch with:

```bash
soulforge
```

or the shorthand:

```bash
sf
```

SoulForge will check for prerequisites on first launch and offer to install Neovim and Nerd Fonts if missing.

> **Note:** SoulForge is published on GitHub Packages. Configure your `.npmrc` with the correct registry, or see [GETTING_STARTED.md](GETTING_STARTED.md) for detailed setup instructions.

## Usage

### Chat + Editor

SoulForge opens in chat mode by default. Press `Ctrl+E` to open the embedded Neovim editor in a split pane. Press `Escape` to toggle focus between chat and editor.

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+L` | Select LLM model |
| `Ctrl+E` | Toggle editor panel |
| `Ctrl+G` | Git menu |
| `Ctrl+S` | Skills browser |
| `Ctrl+K` | Command picker |
| `Ctrl+N` | New tab |
| `Ctrl+W` | Close tab |
| `Tab` | Switch tabs |
| `Escape` | Toggle chat/editor focus |

### Slash Commands

Type `/` in the chat input to see all available commands. Key ones:

- `/model` — switch model
- `/router` — configure per-task model routing
- `/provider` — adjust thinking, effort, speed settings
- `/git` — git operations
- `/compact` — manually trigger context compaction
- `/sessions` — browse and restore past sessions
- `/setup` — check prerequisites and install missing tools

### Forge Modes

Switch modes with `/mode <name>`:

- **default** — full agent capability, reads and writes code
- **architect** — read-only, focuses on design and architecture decisions
- **socratic** — asks questions to deepen understanding before suggesting changes
- **challenge** — adversarial review, finds flaws and edge cases
- **plan** — creates structured plans with step-by-step execution

## Configuration

SoulForge uses a layered config system:

- **Global:** `~/.soulforge/config.json` — applies everywhere
- **Project:** `.soulforge/config.json` — per-project overrides

### LLM Providers

Set your API key as an environment variable:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
export GOOGLE_GENERATIVE_AI_API_KEY=...
export XAI_API_KEY=...
```

For local models, install [Ollama](https://ollama.ai) and SoulForge will detect it automatically.

### Task Router — Per-Task Model Assignment

The task router lets you assign different models to different task types. Configure via `/router` in the UI:

| Task Type | Description | Example Model |
|-----------|-------------|---------------|
| Planning | Architecture, design decisions | Claude Opus |
| Coding | Implementation, bug fixes | Claude Sonnet |
| Exploration | Research, code reading | Claude Haiku |
| Trivial | Small, simple tasks | Fast/cheap model |
| Desloppify | Post-implementation cleanup | Claude Sonnet |

### Key Config Options

```json
{
  "defaultModel": "anthropic/claude-sonnet-4-6",
  "thinking": { "mode": "adaptive" },
  "repoMap": true,
  "semanticSummaries": "ast",
  "diffStyle": "default",
  "chatStyle": "accent",
  "vimHints": true
}
```

See [GETTING_STARTED.md](GETTING_STARTED.md) for the full configuration reference.

## Architecture

SoulForge is built with:

- **Runtime:** [Bun](https://bun.sh) (not Node.js)
- **Language:** TypeScript (strict mode)
- **TUI:** [OpenTUI](https://github.com/anthropics/opentui) (React for terminals)
- **LLM:** [Vercel AI SDK](https://sdk.vercel.ai) v6 (multi-provider)
- **Editor:** Neovim (embedded via msgpack-RPC)
- **Intelligence:** tree-sitter (AST), ts-morph (TypeScript), LSP (via Neovim)
- **Storage:** SQLite (bun:sqlite) for repo map, memory, and history
- **State:** Zustand

For the full technical reference, see [docs/architecture.md](docs/architecture.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

## Testing

```bash
bun test              # run all tests (1174 tests across 24 files)
bun run typecheck     # tsc --noEmit
bun run lint          # biome check
bun run lint:fix      # auto-fix lint issues
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, project structure, coding rules, and PR guidelines.

## Security

See [SECURITY.md](SECURITY.md) for our security policy and responsible disclosure guidelines.

## License

[AGPL-3.0-only](LICENSE). See the [LICENSE](LICENSE) file for details.

Third-party dependencies and their licenses are listed in [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

## Code of Conduct

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
