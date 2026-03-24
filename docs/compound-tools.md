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

### `rename_symbol`

```typescript
rename_symbol({ symbol: "AgentBus", newName: "CoordinationBus" })
```

**What happens internally:**
1. LSP workspace symbol search for the name
2. Filter results: `isFile()` validation (rejects nested properties like `User.id`), prefer exported symbols
3. If LSP can't find it: grep fallback across the codebase
4. LSP `textDocument/rename` with all workspace edits applied
5. Grep verification: confirm no remaining references to old name
6. Report: files changed, references updated, any remaining occurrences

**Why it's better than `refactor rename`:** No `file` parameter needed. The tool locates the symbol itself via workspace search + grep fallback. Works across monorepos.

### `move_symbol`

```typescript
move_symbol({ symbol: "parseConfig", from: "src/utils.ts", to: "src/config/parser.ts" })
```

**What happens internally:**
1. Parse source file, extract the symbol's full source code
2. Remove from source file (preserve surrounding code)
3. Insert into target file (created if it doesn't exist)
4. Scan all files in the project for imports of the symbol from the old path
5. Update each import to point to the new path
6. Handle re-exports if the source file re-exported the symbol

**Per-language import handlers:**
- **TypeScript/JavaScript**: Full support. Handles `import { X }`, `import type { X }`, `require()`, re-exports. Respects `verbatimModuleSyntax` (uses `import type` for type-only symbols)
- **Python**: Handles `from module import X`, `import module`, bare imports with same-directory resolution
- **Rust**: Handles `use crate::path::Symbol`, `mod` declarations
- **Go/C/C++**: Graceful degradation — moves the symbol but warns that imports need manual update

### `project`

```typescript
project({ action: "test", filter: "auth" })
project({ action: "build" })
project({ action: "lint", fix: true })
project({ action: "typecheck" })
project({ action: "run", script: "dev" })
```

**What happens internally:**
1. Probe for config files to detect the toolchain:
   - `bun.lock` / `bunfig.toml` → bun
   - `Cargo.toml` → cargo
   - `go.mod` → go
   - `pyproject.toml` → uv/pytest/ruff
   - `*.xcodeproj` → xcodebuild
   - `build.gradle` → gradlew
   - `pubspec.yaml` → flutter/dart
   - `*.csproj` / `*.sln` → dotnet
   - `CMakeLists.txt` → cmake
   - `mix.exs` → mix
   - `Gemfile` → bundle
   - ... 20+ ecosystems

2. Map `action` to the correct command for that toolchain:
   - `test` → `bun test`, `cargo test`, `pytest`, `go test ./...`, `xcodebuild test -scheme...`
   - `build` → `bun run build`, `cargo build`, `go build ./...`, `dotnet build`
   - `lint` → `biome check`, `clippy`, `ruff check`, `golangci-lint run`

3. Apply user overrides: flags, env vars, cwd, timeout

4. Execute and return structured output

**Why this matters:** No LLM nails an Xcode build command or Gradle task on the first try. `project("test")` works — first time, every project, every language.

### `discover_pattern`

```typescript
discover_pattern({ pattern: "api endpoint handler" })
```

Scans the codebase for recurring structural patterns (e.g., how API handlers are structured, how tests are organized). Returns examples the agent can follow for consistent code generation.

### `read_code`

```typescript
read_code({ symbol: "AgentBus", file: "src/core/agents/agent-bus.ts" })
```

Extracts just one symbol's source code instead of dumping the entire file. Token savings: a 500-line file might have a 30-line class definition — `read_code` returns only those 30 lines.

Falls through: tree-sitter extraction → regex extraction → full file with line range.

### `navigate`

```typescript
navigate({ action: "definition", symbol: "acquireFileRead", file: "src/core/agents/agent-bus.ts" })
navigate({ action: "references", symbol: "AgentBus" })
navigate({ action: "call_hierarchy", symbol: "buildTools", direction: "incoming" })
```

LSP-backed navigation. Returns locations with surrounding context lines. The agent uses this instead of grep for structural queries.

## Benchmark Results

Single representative run on `rename_symbol` (renaming an exported class across 8 files). Results vary by model, codebase size, and symbol complexity:

| Metric | Before (manual) | After (compound) | Improvement |
|--------|-----------------|-------------------|-------------|
| Agent steps | 19 | 3 | 84% fewer |
| Token cost | $0.228 | $0.036 | 84% cheaper |

Without compound tools, the agent has to: read the file to find the symbol, figure out the test runner, attempt a rename via string replacement, grep for remaining references, fix missed references one by one, run tests, fix failures, re-run tests. 19 steps of trial and error.

With `rename_symbol`: one tool call locates the symbol, performs the LSP rename, verifies via grep, and reports "All references updated. No errors." — 3 steps total.

The improvements come from three changes applied together:
1. Grep fallback in `locateSymbol` — tool finds the symbol itself, no file hint needed
2. Confident output — no "verify" suggestions that trigger agent verification spirals
3. Toolchain in context — `Toolchain: bun` prevents wrong-runner retries
