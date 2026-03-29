# Changelog

All notable changes to SoulForge are documented here.

## [1.0.0] — 2026-03-29

Initial public release.

### Core

- **Embedded Neovim** — full LazyVim distribution with 30+ plugins, LSP via Mason, Catppuccin theme, msgpack-RPC bridge
- **Multi-agent dispatch** — up to 8 parallel agents (3 concurrent slots) with shared file cache, edit ownership, and dependency ordering
- **Graph-powered repo map** — SQLite-backed codebase graph with PageRank, cochange analysis, blast radius, clone detection, and FTS5 search
- **4-tier code intelligence** — LSP → ts-morph → tree-sitter → regex fallback chain across 33+ languages
- **V2 incremental compaction** — deterministic state extraction from tool calls with cheap LLM gap-fill
- **Per-step tool result pruning** — rolling window keeps last 4 results full, older results become one-line summaries enriched with repo map symbols

### Tools (34 total)

- **Compound tools** — `rename_symbol` (compiler-guaranteed), `move_symbol` (with cross-file import updates), `refactor` (extract function/variable)
- **Soul tools** — `soul_grep` (count-mode with repo map intercept), `soul_find` (fuzzy search with PageRank + signatures), `soul_analyze` (file profiles, unused exports, identifier frequency), `soul_impact` (dependents, cochanges, blast radius)
- **Project tool** — auto-detects lint/test/build/typecheck across 23 ecosystems, pre-commit gate, monorepo workspace discovery
- **Web tools** — `web_search` and `fetch_page` with SSRF protection and approval gates
- **Memory system** — SQLite with FTS5, title-only memories, pull-based recall
- **Line-anchored editing** — `edit_file` with `lineStart` hint, auto re-read on content drift, rich error output

### Providers

- 9 built-in providers: Anthropic, OpenAI, Google, xAI, Ollama, OpenRouter, LLM Gateway, Vercel AI Gateway, Proxy — plus custom OpenAI-compatible
- Task router — assign models per task type (plan, code, explore, search, trivial, cleanup, compact)
- Per-family prompt system with separate base prompts for Claude, OpenAI, Gemini, and generic fallback

### Interface

- 86 slash commands, 17 keyboard shortcuts
- 6 forge modes: default, auto, architect, socratic, challenge, plan
- Multi-tab chat with cross-tab file coordination and advisory claims
- **Floating terminals** — spawn, resize, and manage terminal sessions alongside the chat
- **22 builtin themes** — Catppuccin, Dracula, Gruvbox, Nord, Tokyo Night, Rose Pine, and more. Custom themes via `~/.soulforge/themes/` with hot reload.
- User steering — type while the agent works, messages inject at the next step
- Installable skill system for domain-specific capabilities
- Destructive action approval gates — individually prompted for `rm -rf`, `git push --force`, sensitive file edits
- Unified model selector with search, provider scoping (`provider/model`), and context window display

### Distribution

- **macOS and Linux only** — native support for macOS (ARM64, x64) and Linux (x64, ARM64). Windows users can run via WSL.
- Self-contained bundle with Neovim, ripgrep, fd, lazygit, tree-sitter grammars, Nerd Fonts
- npm via GitHub Packages (`@proxysoul/soulforge`)
- Homebrew (`brew install proxysoul/tap/soulforge`)
- Headless mode for CI/CD and scripting with JSON, JSONL, and streaming output
- Automated releases with git-cliff changelog generation

### Documentation

- README with architecture diagrams, comparison table, full tool reference
- 12 deep-dive docs covering architecture, repo map, agent bus, compound tools, compaction, project tool, steering, provider options, prompt system, headless mode, commands reference, and cross-tab coordination
- Getting started guide with multi-platform installation
- Contributing guide with project structure, conventions, and PR guidelines
