# Compound Tools — Design & Rationale

Compound tools are SoulForge's answer to the most expensive pattern in AI coding: the agent guessing shell commands, failing, and retrying.

## The Problem

Every AI coding tool asks the LLM to construct commands. The LLM gets it wrong:

```
Agent: I'll run the tests with `npm test`
Shell: npm ERR! missing script: test
Agent: Let me try `npx jest`
Shell: jest: not found
Agent: Let me check package.json for the test runner...
Agent: I see it uses bun. Let me try `bun test`
Shell: ✓ 42 tests passed
```

Three wasted steps, three tool calls, hundreds of tokens burned. Multiply by every test/build/lint command across every ecosystem.

## The Solution

Push everything the agent currently guesses into the tool. One call does the complete job.

### Design Principles

1. **Tool finds things itself** — no file hint, no line numbers, no prior exploration required
2. **Confident output** — state facts ("All references updated. No errors."), never hedge ("Run tests to verify")
3. **One call = complete job** — the agent shouldn't orchestrate multi-step mechanical workflows
4. **Know the project** — toolchain, runner, linter detected automatically from config files
5. **Accept flexible input** — symbol name instead of file path + line number

### Why Output Tone Matters

This is subtle but measurable. When a tool says "Run tests to verify", the agent:
1. Calls `analyze diagnostics`
2. Calls `shell bun test`
3. Reads the output
4. Reports back

That's 3 extra steps triggered by a suggestion in tool output.

When a tool says "All references updated. No errors.", the agent trusts it and moves on. One step.

Benchmark on `rename_symbol`: **19 steps / $0.228 → 3 steps / $0.036** with confident output + grep verification built into the tool.

## Tool Reference

### `read`

```typescript
read({ files: [
  { path: "src/index.ts" },                                    // full file
  { path: "src/utils.ts", ranges: [{ start: 10, end: 50 }] }, // line range
  { path: "src/agent.ts", target: "class", name: "AgentBus" }  // surgical symbol extraction
]})
```

Reads multiple files in parallel in one call. Each file can be a full read, a line range, or a surgical symbol extraction by name. Large files are automatically truncated with a symbol outline from the Soul Map so the agent knows what's in the file without reading it all. Duplicate reads return a stub.

### `multi_edit`

```typescript
multi_edit({
  path: "src/index.ts",
  edits: [
    { oldString: "const x = 1;", newString: "const x = 2;", lineStart: 10 },
    { oldString: "const y = 3;", newString: "const y = 4;", lineStart: 25 }
  ]
})
```

Applies multiple edits to a file atomically. All-or-nothing: if any edit fails, zero edits are applied. `lineStart` values reference the original file; the tool handles offset tracking. Includes auto-format and post-edit diagnostics.

### `rename_symbol`

```typescript
rename_symbol({ symbol: "AgentBus", newName: "CoordinationBus" })
```

Locates the symbol automatically (no file hint needed), performs an LSP rename across all files, and verifies no references remain. One call, compiler-guaranteed.

### `move_symbol`

```typescript
move_symbol({ symbol: "parseConfig", from: "src/utils.ts", to: "src/config/parser.ts" })
```

Moves a symbol between files and updates all imports across the project. Supports TypeScript/JavaScript, Python, and Rust import updates. Go/C/C++ get graceful degradation.

### `rename_file`

```typescript
rename_file({ from: "src/old-name.ts", to: "src/new-name.ts" })
```

Renames or moves a file and updates all import paths across the project. One call handles the file move and every importer.

### `project`

```typescript
project({ action: "test", filter: "auth" })
project({ action: "lint", fix: true })
project({ action: "typecheck" })
```

Auto-detects the toolchain from config files (23 ecosystems) and runs the right command. No guessing `npm test` vs `bun test` vs `cargo test`. Accepts flags, env vars, cwd override, timeout.

### `navigate`

```typescript
navigate({ action: "references", symbol: "AgentBus" })
navigate({ action: "call_hierarchy", symbol: "buildTools" })
```

LSP-backed navigation: definitions, references, call hierarchy, implementations, type hierarchy. The agent uses this instead of grep for structural queries.
