# Architecture

Technical reference for SoulForge's internals. Each section is self-contained — read what you need.

## System Overview

```
User Input
    │
    ▼
┌─────────┐     ┌──────────────┐     ┌───────────────┐
│ InputBox │────▶│   useChat    │────▶│  Forge Agent   │
│ (OpenTUI)│     │  (AI SDK)    │     │ (orchestrator) │
└─────────┘     └──────────────┘     └───────┬───────┘
                                             │ dispatch
                              ┌──────────────┼──────────────┐
                              ▼              ▼              ▼
                     ┌────────────┐  ┌────────────┐  ┌──────────┐
                     │ ⚡ Spark    │  │ 🔥 Ember   │  │WebSearch │
                     │ explore /  │  │   code     │  │  agent   │
                     │ investigate│  │   agent    │  │          │
                     └─────┬─────┘  └─────┬──────┘  └────┬─────┘
                           │              │              │
                           └──────┬───────┘──────────────┘
                                  ▼
                           ┌──────────────┐
                           │   AgentBus   │
                           │ file cache   │
                           │ tool cache   │
                           │ findings     │
                           │ edit mutex   │
                           └──────────────┘
                                  │
                   ┌──────────────┼──────────────┐
                   ▼              ▼              ▼
            ┌───────────┐  ┌───────────┐  ┌───────────┐
            │   Tools   │  │Intelligence│  │  Neovim   │
            │  36 tools │  │  Router    │  │ (msgpack) │
            └───────────┘  └─────┬─────┘  └───────────┘
                                 │
                      ┌──────────┼──────────┐
                      ▼          ▼          ▼
                    LSP    tree-sitter    regex
```

---

## Repo Map

SQLite-backed index of the entire codebase. Parses every source file with tree-sitter, builds a dependency graph, and ranks files with PageRank. Updated in real-time as files are edited.

The ranking blends structural importance (PageRank over the import graph) with conversational relevance (edited files, mentioned files, FTS matches on conversation terms, git co-change partners). Budget scales down as the conversation grows to save prompt space.

Semantic summaries: top symbols get one-line LLM-generated descriptions, cached by file mtime. Configurable via `taskRouter.semantic`.

See [Repo Map](repo-map.md) for the full reference.

---

## Agent System

### Spark / Ember Architecture

Subagents are classified into two tiers by `classifyTask()`:

| Tier | Name | Roles | Model slot | Cache strategy | Purpose |
|------|------|-------|------------|----------------|---------|
| 0 | **Forge** | orchestrator | active model | full context | Main agent — plans, dispatches, responds |
| 1 | **⚡ Spark** | explore, investigate | `taskRouter.spark` | Shares forge's system prompt + tool definitions for cache prefix hits | Read-only research, code analysis. Step limit: 28 (explore), 18 (code) |
| 2 | **🔥 Ember** | code | `taskRouter.ember` | Fresh context, own model | File edits, refactoring, implementation |
| — | **WebSearch** | web research | `taskRouter.webSearch` | — | Multi-step web research with scraping |

Sparks share the forge's system prompt and tool definitions for cache prefix hits. Embers use their own model and context. Code agents are always embers. The dispatch schema's `tier` field allows override.

Optional post-dispatch passes: de-sloppify (cleanup agent reviews edits in fresh context) and verify (checks correctness). Both configurable via task router.

### AgentBus

**File**: `src/core/agents/agent-bus.ts`

In-process coordination layer for parallel subagents. Handles file caching (deduplicated reads across agents), tool result caching (persists across dispatches), edit coordination (serialized writes per file with ownership tracking), and real-time peer findings.

### Agent Quality

- **Schema enforcement**: dispatch requires `targetFiles` with real file paths. Validated before any agent runs.
- **Spark/ember routing**: explore/investigate tasks share the forge's cache prefix (sparks). Code tasks get their own model and context (embers).
- **Post-dispatch passes**: optional de-sloppify (cleanup agent reviews edits in fresh context) and verify (checks correctness). Both configurable via task router.
- **Result contracts**: subagent done tools demand pasteable code, not prose. The parent only sees what the done call contains.

All features can be toggled via `/agent-features` or `agentFeatures` in config.

---

## Intelligence Router

**File**: `src/core/intelligence/router.ts`

Routes code intelligence operations to the best available backend.

### Backends

| Backend | Tier | Capabilities |
|---------|------|-------------|
| **LSP** | 1 | definitions, references, rename, diagnostics, code actions, call hierarchy, type info, formatting |
| **ts-morph** | 2 | TypeScript/JavaScript — AST definitions, references, rename, extract function/variable, unused detection, type info |
| **tree-sitter** | 2 | 33 languages — symbol extraction, imports/exports, scopes, outlines via WASM grammars |
| **regex** | 3 | Universal fallback — symbol search, simple definitions, import patterns |

For each operation, the router tries backends in tier order. If tier 1 returns null or throws, tier 2 is tried, then tier 3.

### LSP Integration

Dual-backend architecture — the agent always has LSP access regardless of editor state:

- **Neovim bridge**: when the editor is open, routes LSP requests through Neovim's running servers. Zero startup cost.
- **Standalone client**: when the editor is closed, spawns LSP servers directly. Full protocol support.
- Multi-language warmup on boot. Standalone servers stay warm as hot standby even when Neovim is open.
- Mason servers auto-installed on first editor launch.

After file edits, LSP diagnostics are diffed against pre-edit state to surface new errors, resolved errors, and cross-file impact.

---

## Web Search

Web search supports Brave Search API (with `BRAVE_API_KEY`) and DuckDuckGo as fallback. Page fetching uses multiple extraction backends with automatic fallback. Results are cached.

When `taskRouter.webSearch` is configured, the `web_search` tool spawns a multi-step agent that can run multiple queries, follow URLs, and synthesize a structured summary with citations.

---

## Tool Design

### Principles

1. **Tool finds things itself** — no file hint, no line numbers, no prior exploration required
2. **Confident output** — state facts, never hedge (prevents verification spirals)
3. **One call = complete job** — the agent shouldn't orchestrate multi-step mechanical workflows
4. **Know the project** — toolchain, test runner, linter detected automatically
5. **Accept flexible input** — symbol name instead of file path + line number

See [Compound Tools](compound-tools.md) for the full tool reference.

### Code Execution (Smithy)

Optional sandboxed code execution via Anthropic's `code_execution` tool. The agent can run Python to process data, do calculations, or batch tool calls programmatically.

---

## Context Manager

Assembles the system prompt from: mode instructions, project info, git context, repo map, persistent memory, forbidden file patterns, and loaded skills. Write tools require user confirmation for paths outside the project directory.

Conversation tracking (edited files, mentioned files, conversation terms) flows into repo map personalization — the system prompt evolves as the conversation progresses.

See [Compaction](compaction.md) for context management details.

---

## LLM Layer

### Providers

**File**: `src/core/llm/providers/`

| Provider | SDK | Notes |
|----------|-----|-------|
| **Anthropic** | `@ai-sdk/anthropic` | Claude models, prompt caching support |
| **OpenAI** | `@ai-sdk/openai` | GPT-4o, o3, o4-mini |
| **xAI** | `@ai-sdk/xai` | Grok models |
| **Google** | `@ai-sdk/google` | Gemini models |
| **Ollama** | Custom | Local models, no API key needed |
| **AI Gateway** | Custom | Vercel AI Gateway — all providers through one key |
| **Proxy** | `@ai-sdk/anthropic` (custom baseURL) | Local CLIProxyAPI relay for Claude web session auth |

### Task Router

Maps task types to specific models. Slots: `spark`, `ember`, `webSearch`, `desloppify`, `verify`, `compact`, `semantic`, `default`. Resolution: slot → default → active model. Legacy fields (`coding`, `exploration`, `trivial`) are mapped to spark/ember on config load.

---

## UI Layer

Built on OpenTUI (React reconciler for terminal UIs) with Zustand for state management. Lock-in mode (`/lock-in`) hides agent narration and shows only tool activity + final answer.

---

## Sessions

Sessions are persisted as JSONL files with crash-resilient incremental saves. Restored sessions reconstruct full tool call/result pairing for mid-conversation recovery.
