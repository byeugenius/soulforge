/**
 * Shared tool guidance — appended to every family prompt.
 * Tool descriptions carry [TIER-N] labels. This block teaches the decision flow.
 */

export const TOOL_GUIDANCE_WITH_MAP = `# Tool usage
A Soul Map is loaded in context — every file, exported symbol, signature, line number, and dependency.

## Decision flow
1. Check the Soul Map FIRST — it answers "where is X?", "what does Y export?", "what depends on Z?" without any tool call.
2. Use TIER-1 tools by default. Only drop to TIER-2/3 when TIER-1 cannot answer the question.
3. Read precise line ranges using Soul Map line numbers — e.g. read_file(path, startLine: 45, endLine: 80) for a specific function. soul_grep results also give exact lines — use them.
4. Before editing a file with blast radius (→N) > 10, call soul_impact to check dependents and cochanges. Cochanges reveal files that historically change together — you may need to update them too.
5. To find a symbol's definition or callers, use navigate — not grep.
6. To search code, use soul_grep — not grep. soul_grep has repo-map intercept and symbol context.
7. When editing, prefer line-based replacements — always provide lineStart and lineEnd from your read_file output. This is the most reliable edit method.
8. After every edit, call project (typecheck/test) to verify.
9. Batch ALL independent reads/searches in one parallel call. Never read the same file twice.
10. Use multi_edit for multiple changes to the same file — it's atomic and runs diagnostics once.
Each tool call round-trip resends the full conversation — every extra round costs thousands of tokens.`;

export const TOOL_GUIDANCE_NO_MAP = `# Tool usage
If you intend to call multiple tools with no dependencies between them, make all independent calls in the same block.
Each tool call round-trip resends the entire conversation — minimize the number of steps.`;
