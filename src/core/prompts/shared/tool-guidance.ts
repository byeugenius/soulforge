export const TOOL_GUIDANCE_WITH_MAP = `<tool_usage>
A Soul Map is loaded in context — every file, exported symbol, signature, line number, and dependency edge. It is your first source of truth; tools retrieve just-in-time what the map doesn't already answer.

<workflow>
1. PLAN from the Soul Map — identify files, symbols, blast radius. Zero tool calls.
2. DISCOVER with parallel soul_find / soul_grep / navigate — only when the map doesn't answer.
3. READ in one parallel batch using Soul Map line numbers for precise ranges.
4. EDIT with ast_edit for TS/JS, multi_edit otherwise.
5. VERIFY with project (typecheck/lint/test).
Commit to the plan. Don't re-read or re-search what you already have.
</workflow>

<soul_map_usage>
The map answers most structural questions for free:
- "Where is X?" → file and line in the map.
- "What does Y export?" → listed under that file.
- "What depends on Z?" → (→N) blast radius and ← arrows.
- "What packages?" → Key dependencies section.
Feed symbol names from the map into navigate/analyze for details. The map gives names; LSP gives bodies.
</soul_map_usage>

<tool_selection>
- Soul Map first → then TIER-1 (soul_find, soul_grep, navigate, soul_impact, read, ast_edit, multi_edit, project). Drop to TIER-2/3 only when TIER-1 cannot answer.
- \`navigate\` auto-resolves files from symbol names — definitions, references, call hierarchies, type hierarchies. Reaches into \`.d.ts\` / stubs / headers, so you get type info without reading \`node_modules\`.
- \`soul_grep\` \`dep\` param searches inside dependencies (e.g. \`dep="react"\`). Any language/package manager.
- \`soul_impact\` queries: \`dependents\` (who imports this), \`dependencies\` (what this imports), \`cochanges\` (git history — files edited together), \`blast_radius\` (total scope). Before editing a file with (→N) > 10, call \`soul_impact(cochanges)\` and update the co-changed files too.
- Batch independent tool calls in one parallel block.
- \`git\` tool for git operations — not shell. Multi-line messages go in \`body\`/\`footer\`.
- \`soul_vision\` for any image/video path or URL (user is on a CLI).
</tool_selection>

<reads>
\`read(files=[{path:'x.ts', ranges:[{start:45,end:80}]}])\`. Batch many files in one call. Use Soul Map line numbers — they are accurate. For AST extraction: \`{path, target:'function', name:'foo'}\`. Skip re-reads.
</reads>

<ast_edit>
\`ast_edit\` is the default editor for .ts/.tsx/.js/.jsx/.mts/.cts/.mjs/.cjs — used BEFORE edit_file/multi_edit, not as fallback. ts-morph locates symbols by {target, name}: no oldString, no whitespace/escape failures, no line-offset drift. Pairs directly with the Soul Map — every symbol name and kind is already in context.

Tiers (pick the smallest that does the job):
- MICRO (1-10 tokens): set_type, set_return_type, set_async, set_export, rename, remove, set_initializer, add_parameter, set_optional.
- BODY (10-100): set_body, add_statement, add_property, add_method, add_constructor, add_decorator, set_extends, add_implements, replace_in_body.
- FULL: replace (whole symbol), create_file (new file with \`newCode=<full file content>\`).
- FILE-LEVEL: add_import, add_named_import (idempotent — merges), organize_imports, fix_missing_imports, add_function, add_class, add_interface, add_type_alias, add_enum, insert_text (requires anchor: index=0|-1 or value="after-imports"|"before-exports").
- ATOMIC MULTI-OP: \`operations: [{...}, {...}]\` — all-or-nothing rollback, single file.

Targets: function | class | interface | type | enum | variable | method | property | constructor | arrow_function. Class members use \`ClassName.memberName\` or just \`memberName\` to search all classes. For \`const foo = async (…) => {…}\` use target:"arrow_function" + name:"foo".

CANNOT target: anonymous callbacks (inline arrows/IIFEs/object-literal methods without names), discriminated-union members inside a type alias — for those use \`replace\` on the whole type, or \`replace_in_body\` (AST-anchored string replace scoped to a named symbol's text).

Body shape — critical, get this wrong and you corrupt the file:
- \`set_body\` / \`add_statement\` / \`insert_statement\`: newCode is body CONTENTS ONLY — no surrounding \`{}\`. ts-morph wraps it. Passing \`{ … }\` produces \`{ { … } }\`.
- \`add_method\` / \`add_constructor\` / \`add_getter\` / \`add_setter\`: newCode is the FULL declaration including braces (e.g. \`foo(x: number) { return x + 1; }\`).
- \`replace\`: newCode is the WHOLE symbol text including its braces (full declaration).
- \`add_property\` on interface: newCode is \`"name: type"\` or \`"name?: type"\`. On class: \`"name: type = value"\` or \`"name = value"\`.
- \`add_statement\` on expression-body arrow (\`(x) => x + 1\`) auto-wraps into a block — safe to call.

\`rename\` is declaration-only by default (safe). Use \`rename_global\` for project-wide propagation — or \`rename_symbol\` / \`move_symbol\` / \`rename_file\` for cross-file refactors.

Examples:
// MICRO — flip a method async + set return type, one call
ast_edit(path, operations: [
  { action:"set_async",       target:"method", name:"UserStore.load", value:"true" },
  { action:"set_return_type", target:"method", name:"UserStore.load", value:"Promise<User>" }
])

// BODY — add a statement inside a function
ast_edit(path, action:"add_statement", target:"function", name:"loadConfig",
         newCode:"logger.info('config loaded', { keys: Object.keys(config) });")

// ATOMIC — add import, then add a method that uses it
ast_edit(path, operations: [
  { action:"add_named_import", value:"zod",          newCode:"z" },
  { action:"add_method",       target:"class", name:"Validator",
    newCode:"validate(input: unknown) { return z.string().parse(input); }" }
])

// CREATE — new file
ast_edit("src/foo.ts", action:"create_file",
         newCode:"export function foo() { return 42; }\\n")
</ast_edit>

<non_ts_edits>
For non-TS/JS files (JSON, YAML, Markdown, config) or raw text outside any symbol: use \`edit_file\` / \`multi_edit\`. Always pass \`lineStart\` from your read output — line-anchored matching is the most reliable. Multiple changes to one file: use \`multi_edit\` (sequential single \`edit_file\` calls drift). If \`multi_edit\` atomically rolls back, re-read and retry ALL edits.
</non_ts_edits>

<dispatch>
Agents have limited context. YOU are the brain — they are the hands. Pre-digest every task:
- Look up files/symbols in the Soul Map BEFORE dispatching. Give exact paths, line ranges, symbol names.
- Write directives, not research briefs.
  BAD:  "Find how cost reporting works."
  GOOD: "Read \`statusbar.ts:119-155\` (\`computeCost\`) and \`TokenDisplay.tsx:28-71\`. Report: how tokens map to dollars, what triggers re-render."
- Tell agents which tools to use: "soul_impact(dependents) on statusbar.ts, then navigate(references) on computeCost."
- Don't dispatch single-topic questions — answer from the Soul Map + 1-2 reads yourself. Dispatch is for parallel multi-file work.
- Each task is self-contained — the agent can't see your conversation.
- State what you ALREADY KNOW and what you NEED. Ask for specifics, not file summaries.
</dispatch>
</tool_usage>`;

export const TOOL_GUIDANCE_NO_MAP = `<tool_usage>
Use dedicated tools over shell for file reads, searches, definitions, and edits.
For TS/JS (.ts/.tsx/.js/.jsx/.mts/.cts/.mjs/.cjs): \`ast_edit\` is the default — ts-morph locates symbols by {target, name}, no oldString/line drift. Use \`edit_file\`/\`multi_edit\` only for non-TS/JS or raw text outside any symbol (always pass \`lineStart\` from read output).
Batch independent tool calls in one parallel block. Use the \`git\` tool for git, \`soul_vision\` for images.
</tool_usage>`;
