/**
 * Shared tool guidance — appended to every family prompt.
 * Dramatically simplified from the old tier system.
 * Detailed behavior lives in individual tool descriptions, not here.
 */

export const TOOL_GUIDANCE_WITH_MAP = `# Tool usage
A Soul Map of the codebase is loaded in context — it lists every file, exported symbol, signature, and dependency. Consult it before any tool call.

Tool priority — use the cheapest tool that answers your question:
1. **Soul Map** (already in context, zero cost) — answers "where is X", "what does Y export", "what depends on Z". If the Soul Map lists a file path, use it directly — do NOT soul_find for files you can already see.
2. **LSP tools** (instant, no file I/O) — navigate for definitions/references/callers, analyze for types/diagnostics/outlines
3. **Soul tools** (indexed, fast) — soul_find for files/symbols NOT in the Soul Map, soul_grep for pattern counts, soul_impact for dependencies, soul_analyze for profiles
4. **Targeted reads** — read_file with target+name to extract one symbol
5. **Broad reads** — read_file full, grep for string literals, web_search for external docs
6. **Verify** — project tool (typecheck/lint/test/build — auto-detects toolchain). Use freely after edits to catch errors early.
7. **COSTLY — use sparingly** — dispatch spawns parallel subagents, each with its own context window at full model cost. Only for 8+ file edits or 11+ file exploration. Most tasks do NOT need dispatch.

Editing: read file ONCE in full, plan all changes, multi_edit in ONE call per file.
ALWAYS pass lineStart (1-indexed, from read_file output) on every edit — it makes edits escape-proof. Without it, backslash-heavy code (regex, paths) can fail to match.
Compound tools (rename_symbol, move_symbol, refactor) do the complete job — no verification needed after.

Dispatch: reading ≤10 files → read_file directly (parallel tool calls, stays cached). Editing ≤7 files → edit_file directly.
Each subagent gets a fresh context at full model price — dispatch 4 agents across 9 files can cost 10x more than reading those files directly.
After dispatch: act on results immediately — never re-read dispatched files.
Use exact Soul Map paths for targetFiles. Agents with precise targets finish in 1-2 tool calls.
Do not create task_list entries for dispatch subtasks — dispatch tracks its own progress via agent events.

Planning: edit files directly unless 8+ files involved. When planning: research → plan → user confirms → execute.`;

export const TOOL_GUIDANCE_NO_MAP = `# Tool usage
Tool priority — use the cheapest tool that answers your question:
1. **Search tools** — grep for patterns, glob for files, soul_find when available
2. **LSP tools** — navigate for definitions/references, analyze for types/diagnostics
3. **Read tools** — read_file for source and config files
4. **Verify** — project tool (typecheck/lint/test/build). Use freely after edits.
5. **COSTLY — use sparingly** — dispatch spawns parallel subagents at full model cost. Only for 8+ file edits or 11+ file exploration.

Editing: read file ONCE in full, plan all changes, multi_edit in ONE call per file.
ALWAYS pass lineStart (1-indexed, from read_file output) on every edit — it makes edits escape-proof. Without it, backslash-heavy code (regex, paths) can fail to match.
Compound tools (rename_symbol, move_symbol, refactor) do the complete job — no verification needed after.

Dispatch: reading ≤10 files → read directly. Editing ≤7 files → edit directly. Most tasks do NOT need dispatch.`;
