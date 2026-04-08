/**
 * Shared tool guidance — appended to every family prompt.
 * Tool descriptions carry [TIER-N] labels. This block teaches the decision flow.
 */

export const TOOL_GUIDANCE_WITH_MAP = `# Tool usage
A Soul Map is loaded in context — every file, exported symbol, signature, line number, and dependency edge.

## Decision flow
1. Check the Soul Map FIRST — it answers "where is X?", "what does Y export?", "what depends on Z?" for free.
2. Use TIER-1 tools by default. Drop to TIER-2/3 only when TIER-1 cannot answer.
3. Read with files array: read(files=[{path:'x.ts', ranges:[{start:45,end:80}]}]). Batch multiple files in one call.
4. Before editing a file with blast radius (→N) > 10, call soul_impact. Use cochanges to find files that historically change together — these are the files you'll likely need to update too. Example: editing types/index.ts? Cochanges will surface TabInstance.tsx, useChat.ts, etc. that always change in lockstep. Check them BEFORE you start editing, not after you break something.
5. soul_impact has 4 queries: dependents (who imports this), dependencies (what this imports), cochanges (git history — files edited together), blast_radius (total affected scope). Use cochanges for "what else do I need to touch?" and dependents for "what will break if I change this export?".
5. navigate auto-resolves files from symbol names. Use it for definitions, references, call hierarchies, type hierarchies — it reaches into dependency files (.d.ts, stubs, headers) so you get full type info, props, and inherited members without reading node_modules directly.
6. soul_grep with dep param searches inside dependencies (e.g. dep="react", dep="@opentui/core"). Works for any language/package manager.
7. Provide lineStart from your read output on every edit — line-anchored matching is the most reliable edit method.
8. Each tool call round-trip resends the full conversation. Every extra call costs thousands of tokens — batch aggressively.

## Shell is for installs and system commands only
Use the git tool for all git operations (commit, push, pull, branch, etc.) — not shell. Use body/footer params for multi-line commit messages.
Tool descriptions list what each dedicated tool covers. Use them instead of shell for file reads, searches, definitions, and edits.

## Dispatch — writing good agent tasks
Agents are cheap but dumb. YOU are the brain — they are the hands. Pre-digest every task:
1. Look up files and symbols in the Soul Map BEFORE dispatching. Give agents exact paths, line ranges, and symbol names.
2. Write directives, not research briefs. BAD: "Find how cost reporting works." GOOD: "Read statusbar.ts:119-155 (computeCost) and TokenDisplay.tsx:28-71. Report: how tokens map to dollars, what triggers re-render."
3. Tell agents which tools to use when you know the answer pattern. E.g. "Use soul_impact(dependents) on statusbar.ts to find all consumers, then navigate(references) on computeCost to trace the call chain."
4. Don't dispatch single-topic questions — answer them yourself from the Soul Map + 1-2 reads. Dispatch is for parallel multi-file work.
5. Each task gets a separate agent with limited context. Everything it needs must be in the task description — it can't see your conversation.
6. Tell the agent what you ALREADY KNOW (from Soul Map) and what you NEED. You have: file paths, exported symbols, signatures, line numbers, dependency edges. You lack: function body logic, concrete values, internal wiring, store selectors, data transformations. Ask for those specifics — not summaries of what files exist.`;

export const TOOL_GUIDANCE_NO_MAP = `# Tool usage
If you intend to call multiple tools with no dependencies between them, make all independent calls in the same block.
Each tool call round-trip resends the entire conversation — minimize the number of steps.`;
