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
4. Before editing a file with blast radius (→N) > 10, call soul_impact. Cochanges reveal files that historically change together.
5. navigate auto-resolves files from symbol names. Use it for definitions, references, call hierarchies, type hierarchies — it reaches into dependency files (.d.ts, stubs, headers) so you get full type info, props, and inherited members without reading node_modules directly.
6. soul_grep with dep param searches inside dependencies (e.g. dep="react", dep="@opentui/core"). Works for any language/package manager.
7. Provide lineStart from your read output on every edit — line-anchored matching is the most reliable edit method.
8. Each tool call round-trip resends the full conversation. Every extra call costs thousands of tokens — batch aggressively.

## Shell is for git, installs, and system commands only
Tool descriptions list what each dedicated tool covers. Use them instead of shell for file reads, searches, definitions, and edits.`;

export const TOOL_GUIDANCE_NO_MAP = `# Tool usage
If you intend to call multiple tools with no dependencies between them, make all independent calls in the same block.
Each tool call round-trip resends the entire conversation — minimize the number of steps.`;
