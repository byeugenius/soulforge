# SoulForge Roadmap — Open Items & Future Work

## Design Debt

### ~~Redundant `refactor rename` action~~ ✅ Done
Removed — `RefactorAction` no longer includes `rename`.

### ~~`refactor extract_function` requires line numbers~~ ✅ Done
Added `name` param that auto-resolves symbol line range via `getFileOutline`. Agent can pass a symbol name instead of `startLine`/`endLine`.

### `coreMessages` grows unbounded within a turn
No mid-turn compaction. Individual turns rarely exceed context, but long agent runs could benefit from streaming compaction. Architectural change needed.

### Semantic summaries rarely generated
**File:** `src/core/intelligence/repo-map.ts`

LLM-based symbol summaries are too expensive for interactive use. Needs a cheaper strategy — docstring extraction, batch summarization with a small model, or on-demand generation for high-PageRank symbols only.

---

## ~~LSP Installer — Phase 2~~ ✅ Done

Full Mason registry integration with `/lsp-install` slash command.

- **installer.ts** — reads Mason's registry.json (576+ packages), installs via bun/pip/go/cargo/curl to `~/.soulforge/lsp-servers/`
- **LspInstallSearch.tsx** — full-screen modal with Search/Installed/Disabled/Recommended tabs, category filter (^F), scoped enable/disable
- **server-registry.ts** — probes PATH → SoulForge → Mason, 17 language candidates, `disabledLspServers` config support
- Answers to open questions: isolated install dir (`~/.soulforge/`), manual install via picker, includes all Mason categories (LSP/formatters/linters/DAP)

---

## ~~Intelligence Verification Diagnostic~~ ✅ Done

`/diagnose` slash command that probes all intelligence backends against a real project file.

- **router.ts** — `runHealthCheck()` method probes 4 backends × 6 operations (findSymbols, findImports, findExports, getFileOutline, getDiagnostics, readSymbol) with timing and pass/fail/timeout/error status
- **instance.ts** — `runIntelligenceHealthCheck()` exported
- **commands.ts** — `/diagnose` command shows results in InfoPopup with per-backend sections, status icons, timing
- Catches: missing LSP binary, tree-sitter grammar load failure, ts-morph init failure, timeouts, performance issues

---

## Competitive Gaps (from comparison analysis)

See `competitive-comparison-2026.md` for full details. Key gaps:

1. **Declarative subagent config** — Claude Code has `.claude/agents/*.md` with YAML frontmatter. We could add `.soulforge/agents/*.md`.
2. **Model-specific edit formats** — Aider uses different diff strategies per model. We use string replace for all.
3. **Worktree isolation option** — Claude Code uses git worktrees for parallel agent safety. We use edit mutexes.