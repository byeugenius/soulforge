# SoulForge Documentation

## User Reference

- **[Command Reference](commands-reference.md)** — All 60 slash commands organized by category
- **[Headless Mode](headless.md)** — Non-interactive CLI for CI/CD, scripting, and automation
- **[Project Tool](project-tool.md)** — Toolchain detection, pre-commit checks, monorepo discovery
- **[Steering](steering.md)** — Type while the agent works, messages inject mid-stream
- **[Provider Options](provider-options.md)** — Thinking modes, effort, speed, context management

## Architecture

- **[Architecture](architecture.md)** — System overview, data flow, component lifecycle
- **[Repo Map](repo-map.md)** — Graph intelligence (PageRank, cochange, blast radius, clone detection)
- **[Agent Bus](agent-bus.md)** — Multi-agent coordination (shared cache, edit mutex, findings board)
- **[Compound Tools](compound-tools.md)** — rename_symbol, move_symbol, refactor internals
- **[Compaction](compaction.md)** — V1/V2 context management strategies

## Design Principles

SoulForge follows **ECC patterns** — enforce behavior with code, not prompt instructions:

- **Schema-level enforcement** — `targetFiles` required on dispatch, Zod rejects bad input before agents run
- **Confident output** — tool results say "content is already below" not "do NOT re-read"
- **Auto-enrichment** — dispatch tasks get symbol line ranges from repo map automatically
- **Pre-commit gates** — lint + typecheck before `git commit`, blocks on failure
- **Shell interceptors** — co-author injection, project tool redirect, read-command redirect
- **Result richness** — richer output = fewer re-read cycles = fewer tokens
