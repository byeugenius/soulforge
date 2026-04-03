# Context Snapshot — Pre-Compaction

Captured at this point in the conversation. Everything I currently know and have worked on.

## Files I've Read (full or partial)

### README.md
- Read multiple times across the session
- Started at 814 lines, now 331 lines
- Rewrote: hero tagline, Why SoulForge section, cost table, What makes SoulForge different (6 cards), And also list, comparison table, installation (Homebrew first), usage, providers, config, documentation links, roadmap, inspirations, license
- Current hero: "The AI coding agent that already knows your codebase."
- Current subtitle: "Graph-powered intelligence · multi-agent dispatch · terminal-native"
- Cost table has 6 rows: Live Soul Map, Surgical reads, Zero-cost compaction, Shared agent cache, Mix-and-match models, Prompt caching
- Comparison table has 10 rows: Codebase awareness, Cost optimization, Code intelligence, Multi-agent, Multi-tab, Task routing, Compound tools, Editor, Providers, License
- Config example uses spark/ember/desloppify task router slots
- Installation order: Homebrew (recommended), Bun, Prebuilt binary, Self-contained bundle, Build from source
- Platform: macOS and Linux only

### docs/architecture.md
- Read fully, edited heavily
- Started at 538 lines, now ~191 lines
- Removed: SQL schemas, step lifecycle with exact token thresholds, result pipeline internals, compaction flow, proxy provider details, file layout tree, UI component table, web search fallback chain details
- Updated: Agent system from "Three-Tier" to Spark/Ember, TaskRouter interface (spark/ember/desloppify/verify slots), tool count 33→35+, added Smithy/code execution, added lock-in mode, trimmed LSP integration details
- Kept: system overview ASCII diagram (updated with Spark/Ember), intelligence backends table, tool design principles

### docs/agent-bus.md
- Read fully, edited heavily
- Started at 187 lines, now ~52 lines
- Removed: acquireFileRead API shapes, generation counter internals, cache key format, cross-dispatch code snippets, promise-chaining details, findings flow internals, dispatch orchestration step-by-step, result compression details, comparison table
- Updated: diagram to Spark/Ember, added Spark vs Ember section, dispatch flow simplified
- Kept: what it does description, dispatch flow outline, comparison table (trimmed)

### docs/compound-tools.md
- Read fully, edited
- Started at 166 lines (before my additions), ended at ~117 lines
- Added: `read` and `multi_edit` as compound tool entries with usage examples
- Replaced: stale `read_code` section with `rename_file`
- Removed: "What happens internally" detailed step lists for rename_symbol, move_symbol, project
- Kept: design principles, why output tone matters, benchmark results, usage examples

### docs/compaction.md
- Read, verified accuracy
- No major changes needed
- Contains the real-world example (34 messages → 5, zero tokens)

### docs/repo-map.md
- Read fully, edited
- Removed: full SQL schema (replaced with one-line summary), real-time update pipeline with function names and debounce timings
- Kept: how it works sections, ranking pipeline description, budget dynamics, comparison table, language support, monorepo support

### docs/repo-map-visual.md
- Read partially, edited
- Fixed: bus-tools.ts → subagent-tools.ts in mermaid graph
- Removed: exact scoring weights (+0.5, 5×, +min(count/5, 3)), internal function names from examples, debounce timings
- Replaced: acquireFileRead examples with parseConfig examples

### docs/headless.md
- Grep checked, one edit
- Updated: tool count 33→35+, tool list updated

### docs/commands-reference.md
- Grep checked, one edit
- Updated: /router description from "planning, coding, exploration, verification" to "spark, ember, web search, desloppify, verify, compact"

### src/core/tools/index.ts
- Read ranges: 283-400, 400-550, 549-700, 1580-1695
- Contains buildTools() function with all tool definitions
- read tool: accepts files array, parallel execution, re-read protection, smart truncation
- edit_file: blast radius annotation from repo map
- multi_edit: atomic, line offset tracking
- code_execution: Anthropic's codeExecution_20260120 tool (Smithy)
- web_fetch: included with code execution

### src/core/tools/constants.ts
- Read fully
- CORE_TOOL_NAMES: read, edit_file, multi_edit, grep, glob, shell, project
- TOOL_CATALOG: 30 tools listed with descriptions
- RESTRICTED_TOOL_NAMES: read-only tools for architect/socratic/challenge modes
- PLAN_EXECUTION_TOOL_NAMES: tools available during plan execution

### src/core/tools/read-file.ts
- Read fully (1-320)
- readFileTool: accepts path, startLine, endLine, target, name
- Symbol extraction via intelligence router (4-tier)
- Smart truncation at 200 lines with buildSymbolOutline()
- buildSymbolOutline uses repo map for symbol names/kinds/line ranges
- MAX_READ_LINES = 2000, MAX_READ_SIZE = 250KB, SMART_TRUNCATE_LINES = 200

### src/core/tools/multi-edit.ts
- Read fully
- Atomic all-or-nothing edits
- Sorts edits top-to-bottom by lineStart
- Tracks cumulative line offsets
- Fuzzy whitespace matching fallback
- CAS: verifies file not modified since last read
- Post-edit: auto-format, LSP diagnostics diff

### src/core/tools/bus-cache.ts
- Read fully
- wrapWithBusCache: wraps tools with AgentBus cache
- CACHE_HIT_LINES_THRESHOLD = 80 (files ≥80 lines get stub instead of full content)
- tagCacheHit: returns 4-line stub with symbol names and line ranges for large files
- Cached tools: read, grep, glob, navigate, analyze, web_search, soul_grep, soul_find, soul_analyze, soul_impact, list_dir
- Edit tools (edit_file, multi_edit): wrapped with acquireEditLock, invalidateFile on success

### src/core/tool-display.ts
- Read lines 1-100
- ToolCategory type: file, shell, git, lsp, tree-sitter, ts-morph, regex, code, web, memory, agent, ui, editor, smithy, soul-map
- code_execution → "smithy" category
- soul_grep/soul_find/soul_analyze/soul_impact → "soul-map" category

### src/core/agents/subagent-tools.ts
- Read lines 1-380
- SubagentModels interface: defaultModel, sparkModel, emberModel, webSearchModel, desloppifyModel, verifyModel, forgeInstructions, forgeTools, parentMessagesRef
- EXPLORE_BLOCKED: edit_file, multi_edit, write_file, create_file, rename_symbol, move_symbol, refactor, dispatch, shell
- CODE_BLOCKED: dispatch only
- guardForgeTools: wraps forge tools with role-based execute guards for sparks (definitions kept for cache prefix, execute blocked)
- createAgent: classifies task → spark or ember, selects model, shares forge instructions for sparks
- useSpark = forgeInstructions != null && tier !== "ember"
- buildSubagentTools: creates dispatch tool with shared cache ref

### src/core/agents/agent-runner.ts
- Read lines 1-180
- TaskTier imported from types
- classifyTask: code → ember, explore/investigate → spark
- selectModel: spark → sparkModel ?? defaultModel, ember → emberModel ?? defaultModel
- MAX_CONCURRENT_AGENTS = 3
- AGENT_TIMEOUT_MS = 300_000
- Retry logic: up to 3 retries with jitter for overloaded/rate-limited errors

### src/core/agents/forge.ts
- Read lines 1-50
- createForgeAgent function
- RESTRICTED_MODES: architect, socratic, challenge, plan
- Imports: EPHEMERAL_CACHE, isAnthropicNative from provider-options
- Uses SharedCacheRef for dispatch cache sharing

### src/core/agents/step-utils.ts
- Read lines 1-200
- PrepareStepOptions: bus, agentId, role, allTools, symbolLookup, contextWindow, disablePruning
- OUTPUT_NUDGE_PCT = 0.8, HARD_STOP_PCT = 0.9
- KEEP_RECENT_MESSAGES = 4
- EXPLORE_MAX_STEPS = 28, CODE_MAX_STEPS = 18
- SUMMARIZABLE_TOOLS: read, grep, glob, analyze, web_search, fetch_page, shell, dispatch, list_dir, soul_grep, soul_analyze, soul_impact, memory, skills, plan, update_plan_step, ask_user, git
- EDIT_TOOLS: edit_file, multi_edit, write_file, create_file
- buildSummary: creates one-line summaries for old tool results

### src/types/index.ts
- Read lines 1-330
- TaskRouter: spark, ember, webSearch, desloppify, verify, compact, semantic, default (+ legacy: coding, exploration, trivial)
- TaskTier = "spark" | "ember"
- ForgeMode = "default" | "architect" | "socratic" | "challenge" | "plan" | "auto"
- lockIn?: boolean in AppConfig
- ToolResult: success, output, error, backend, outlineOnly, filesEdited

### src/core/prompts/modes/index.ts
- Read fully
- MODE_INSTRUCTIONS for: default (null), architect, socratic, challenge, plan (null), auto
- Plan mode: PLAN_FULL (>50% context) vs PLAN_LIGHT (≤50%)
- Auto mode: execute immediately, prefer assumptions over questions, destructive actions still need confirmation

### src/components/chat/LockInStreamView.tsx
- Read lines 1-200
- LOCKIN_EDIT_TOOLS: edit_file, multi_edit, write_file, create_file, rename_file, move_symbol, rename_symbol
- Phase-specific spinners: SPIN_EXPLORE, SPIN_EDIT, SPIN_DISPATCH
- Rotating status messages: EXPLORE_PAIRS, EDIT_PAIRS, DISPATCH_PAIRS
- LockInWrapper component: shows status header + tool rail

### src/core/llm/provider-options.ts
- Read lines 1-80
- ModelCapabilities interface: provider, thinking, adaptiveThinking, effort, speed, contextManagement, interleavedThinking
- ANTHROPIC_FULL, OPENAI_FULL, GATEWAY_FULL provider constraints
- EPHEMERAL_CACHE used for prompt caching

### src/core/context/manager.ts
- Read lines 95-130
- ContextManager class
- createAsync factory with step callbacks
- Wires file event handlers, repo map callbacks

### ../pouiiro/src/content/blog/soulforge.mdx
- Read fully, edited heavily
- Started at 226 lines, now 172 lines
- Updated: numbers (tools, providers, themes, languages), dispatch (Spark/Ember), compound tools list, cost section (users choose models), context section (trimmed + doc link), themes (24), removed floating terminals section, removed theme config JSON, added lock-in mode section, added multi-tab mention, added surgical reads to Soul Map section, all em-dashes removed, internal details replaced with doc links

### ../pouiiro/src/lib/blog.ts
- Read lines 1-30
- Velite-based blog system, posts array with title/slug/date/description/image/tags/published/body

## Key Decisions Made

1. README leads with value prop and cost story, not Neovim
2. No mermaid diagrams in README (moved to docs)
3. Homebrew is recommended install method, not prebuilt binary
4. macOS and Linux only
5. No emojis in section headers
6. No "xyz — xyz" em-dash pattern anywhere
7. Docs trimmed to remove implementation secrets (SQL schemas, exact thresholds, internal function names, cache key formats)
8. Blog post links to docs instead of re-explaining internals
9. Task router uses spark/ember terminology (not coding/exploration/trivial)
10. Shared agent cache correctly described: large files get 4-line stubs, not full content
11. Model routing is user-controlled, not auto-detected
12. multi_edit is a compound tool (atomic, offset tracking)
13. read is a compound tool (batch, parallel, surgical extraction)
14. Smithy = code_execution tool category (Anthropic sandboxed Python)
15. Lock-in mode = UI config option, hides narration during work

## Errors Encountered

1. Dispatch failed multiple times due to Haiku model not supporting programmatic tool calling (web_fetch tool has allowedCallers)
2. multi_edit failed twice on blog post due to em-dash encoding mismatch between my oldString and the actual file content
3. Had to fall back to individual edit_file calls for the blog post after multi_edit encoding issues

## Current State

- README.md: 331 lines, fully updated
- docs/architecture.md: ~191 lines, trimmed and updated
- docs/agent-bus.md: ~52 lines, trimmed and updated
- docs/compound-tools.md: ~117 lines, updated with read/multi_edit
- docs/repo-map.md: ~161 lines, trimmed
- docs/repo-map-visual.md: updated references
- docs/headless.md: tool count updated
- docs/commands-reference.md: router description updated
- Blog post (soulforge.mdx): 172 lines, fully updated
- Social posts (X thread + LinkedIn): drafted but not written to files yet

## What I Haven't Touched

- docs/compaction.md (verified accurate, no changes needed)
- docs/steering.md
- docs/project-tool.md
- docs/prompt-system.md
- docs/provider-options.md
- docs/cross-tab-coordination.md
- docs/themes.md
- GETTING_STARTED.md
- CONTRIBUTING.md
- SECURITY.md
- CHANGELOG.md
- Any source code files (only read, never edited)
- mintlify-docs/ (separate docs site)
