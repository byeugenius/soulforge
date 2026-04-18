# SoulForge Documentation

## User Reference

- **[Command Reference](commands-reference.md)** — All 100 slash commands organized by category
- **[Headless Mode](headless.md)** — Non-interactive CLI for CI/CD, scripting, and automation
- **[Custom Providers](headless.md#custom-providers)** — Add any OpenAI-compatible API via config
- **[Themes](themes.md)** — 24 builtin themes, custom themes, hot reload — pick your flavor or add yours
- **[Project Tool](project-tool.md)** — Toolchain detection, pre-commit checks, monorepo discovery
- **[Steering](steering.md)** — Type while the agent works, messages inject mid-stream
- **[Provider Options](provider-options.md)** — Thinking modes, effort, speed, context management
- **[Copilot Provider](copilot-provider.md)** — Setup, models, cost, legal review for GitHub Copilot
- **[MCP Servers](mcp.md)** — Model Context Protocol server integration
- **[Hooks](hooks.md)** — 13 lifecycle events, Claude Code compatible
- **[Checkpoints](checkpoints.md)** — Conversation snapshots and rollback

## Tools

- **[AST Editing (`ast_edit`)](ast-edit.md)** — Surgical AST edits for TS/JS, 65+ operations, no `oldString`
- **[Compound Tools](compound-tools.md)** — `rename_symbol`, `move_symbol`, `refactor`, `project`
- **[Compound Tools — design rationale](compound-tools.md)** — Why one call beats five

## Architecture

- **[Architecture](architecture.md)** — System overview, 20 providers, agent tiers, data flow
- **[Prompt System](prompt-system.md)** — Per-family prompts, Soul Map injection, mode overlays, cache strategy
- **[Repo Map](repo-map.md)** — Graph intelligence (PageRank, cochange, blast radius, clone detection)
- **[Repo Map Visual](repo-map-visual.md)** — How the dependency graph is rendered
- **[Agent Bus](agent-bus.md)** — Multi-agent coordination (shared cache, edit mutex, findings board)
- **[Compaction](compaction.md)** — V1/V2 context management strategies
- **[Cross-Tab Coordination](cross-tab-coordination.md)** — Advisory file claims, git blocking, contention handling
- **[Mempalace Integration](mempalace-integration.md)** — Persistent memory layer

## Design Principles

SoulForge follows **ECC patterns** — enforce behavior with code, not prompt instructions:

- **Schema-level enforcement** — `targetFiles` required on dispatch, Zod rejects bad input before agents run
- **Confident output** — tool results say "content is already below" not "do NOT re-read"
- **Auto-enrichment** — dispatch tasks get symbol line ranges from repo map automatically
- **Pre-commit gates** — lint + typecheck before `git commit`, blocks on failure
- **Shell interceptors** — co-author injection, project tool redirect, read-command redirect
- **Result richness** — richer output = fewer re-read cycles = fewer tokens
