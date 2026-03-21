# AI SDK 6 — Unadopted Features & Actions

> Current version: `ai@6.0.116`
> Last reviewed: July 2025

## Current Adoption

We already use the core AI SDK 6 agent primitives:

| Feature | Where | Status |
|---|---|---|
| `ToolLoopAgent` | `explore.ts`, `code.ts`, `forge.ts`, `web-search.ts` | ✅ |
| `prepareStep` | `step-utils.ts` → pruning, step nudges, context mgmt, tool sanitization | ✅ |
| `stopWhen` | `step-utils.ts` → step count limits + token guards | ✅ |
| `repairToolCall` | `stream-options.ts` → fixes malformed JSON from weak models | ✅ |
| `Output.object()` | `explore.ts`, `code.ts` → structured agent output schemas | ✅ |

---

## Unadopted Features

### 1. `toModelOutput` — Control what the parent model sees

**What it does**: When a subagent tool returns a result, `toModelOutput` lets you
show the full result in the UI while sending only a compact summary to the parent
model's context window.

**Why it matters**: Right now our dispatch tool in `subagent-tools.ts` manually
builds summary strings from `DoneToolResult` objects. The parent model receives
these summaries as regular tool results. With `toModelOutput`, the separation
between UI-visible output and model-visible output is built into the SDK — the
tool can yield the full structured `DoneToolResult` (user sees everything) while
the parent model only sees a 500-token summary.

**Impact**: Cleaner code, better context management for the parent forge agent,
and the ability to show richer subagent results in the UI without bloating the
parent's context.

**Files to touch**:
- `src/core/agents/subagent-tools.ts` — add `toModelOutput` to the dispatch tool definition
- `src/core/agents/agent-results.ts` — extract summary formatting into a reusable function for `toModelOutput`
- `src/core/agents/forge.ts` — remove manual summary truncation if `toModelOutput` handles it

---

### 2. `prepareCall` — Per-invocation agent configuration

**What it does**: A callback on `ToolLoopAgent` settings that runs once before each
`.generate()` or `.stream()` call. Receives the call parameters and can override
model, tools, instructions, maxOutputTokens, etc.

**Why it matters**: Currently `agent-runner.ts` creates a brand new `ToolLoopAgent`
instance for every dispatch task (`createAgent()` → `createExploreAgent()` /
`createCodeAgent()`). With `prepareCall`, we could pre-create one explore agent
and one code agent, then use `prepareCall` to customize per-task settings (model
selection based on task tier, adjusted token limits, task-specific tool subsets).

**Impact**: Enables agent instance reuse (see item 3). Reduces object allocation
and tool schema re-serialization overhead.

**Files to touch**:
- `src/core/agents/explore.ts` — add `prepareCall` to `ToolLoopAgent` constructor
- `src/core/agents/code.ts` — same
- `src/core/agents/agent-runner.ts` — pass task-specific config through `.generate()` options instead of constructor

---

### 3. Agent Instance Reuse (Pre-warming)

**What it does**: Create `ToolLoopAgent` instances once and reuse them across
dispatch tasks via repeated `.generate()` calls, instead of constructing a new
agent per task.

**Why it matters**: Every dispatch task currently calls `createExploreAgent()` or
`createCodeAgent()`, which builds a full `ToolLoopAgent` with tools, instructions,
prepareStep, output schemas, etc. For a 5-agent dispatch, that's 5 full
constructions. Pre-creating agents means tool schemas are already serialized and
the agent is "warm" — reducing startup overhead per task.

**Caveats**: Our agents have per-task state (bus tools, agentId, parentToolCallId).
This makes naive reuse impossible — either `prepareCall` must inject per-task
tools, or we need a factory that caches the expensive parts (tool schemas, system
prompt) and only rebuilds the per-task parts.

**Impact**: Modest latency improvement per dispatch. More meaningful at scale
(10+ agents, rapid re-dispatches).

**Files to touch**:
- `src/core/agents/agent-runner.ts` — `createAgent()` → agent pool or lazy factory
- `src/core/agents/explore.ts` — separate tool construction from agent construction
- `src/core/agents/code.ts` — same
- `src/core/agents/bus-tools.ts` — make bus tools injectable at call time

---

### 4. Streaming Subagent Progress (`readUIMessageStream`)

**What it does**: Subagent tools use `async function*` generators with
`readUIMessageStream` to yield incremental progress updates as the subagent works.
Each `yield` sends a `UIMessage` with all parts accumulated so far.

**Why it matters**: Currently subagent progress is communicated through our custom
`SubagentStep` events and the dispatch display component. The SDK's built-in
streaming would let subagent tool calls show real-time text/tool-call output
directly in the chat UI, not just step summaries.

**Caveats**: We use `generateText` (not `streamText`) for subagents, and our UI
is custom Ink (not React web). Adopting this would require significant plumbing
changes to our headless/TUI architecture. The existing custom event system
(`subagent-events.ts` → `dispatch-display.ts`) works well for our use case.

**Impact**: Low priority. Current system works. Only worth revisiting if we move
to a web UI or need richer subagent streaming.

**Files to touch** (if pursued):
- `src/core/agents/subagent-tools.ts` — convert dispatch execute to `async function*`
- `src/core/agents/agent-runner.ts` — switch from `.generate()` to `.stream()`
- `src/components/chat/dispatch-display.ts` — consume `UIMessage` chunks
- `src/core/agents/subagent-events.ts` — may become redundant

---

## Priority Order

1. **`toModelOutput`** — cleanest win, minimal risk, improves context management
2. **`prepareCall`** — enables item 3, modest refactor
3. **Agent reuse** — depends on 2, moderate complexity
4. **Streaming progress** — nice-to-have, large effort, current system is adequate

---

## Separate UX Issue: Inline Permission Approvals

### Problem

When the shell tool detects a destructive command (e.g. `rm -rf`), the approval
flow shows a separate `QuestionPrompt` box at the bottom of the screen. The user
has to interact with this box, and it feels like a separate injected message
rather than part of the tool call flow.

**Current behavior**:
```
●  [shell] Running rm -rf src/_test_dispatch
┌─ ? Question ──────────────────────┐
│ ⚠ Potentially destructive action: │
│ Shell: delete files/directories   │
│ `rm -rf src/_test_dispatch`       │
│                                   │
│  [Allow]  [Deny]  [Other]        │
└───────────────────────────────────┘
```

**Desired behavior**:
```
●  [shell] Running rm -rf src/_test_dispatch  [Allow] [Deny]
```
Then after approval:
```
✓  [shell] Running rm -rf src/_test_dispatch — ALLOWED
```

### Analysis

The approval gate lives in `src/core/tools/index.ts` (lines 369-374). When
`isDestructiveCommand()` returns true, it calls `opts.onApproveDestructive()`,
which is wired to `promptDestructive` in `useChat.ts` (line 995). This sets
`pendingQuestion` state, which renders a `QuestionPrompt` component in
`TabInstance.tsx` (line 490).

The permission result never enters the message history — `isPermission: true`
causes `TabInstance.tsx` line 497 to skip message injection. But the
`QuestionPrompt` box itself is visually disruptive: it appears as a separate
UI element rather than being part of the tool call display.

### Proposed Approach

Emit permission state as part of the tool call's live state, and render the
approval inline on the `ToolCallDisplay` row.

### Files to touch

- **`src/core/tools/index.ts`** — when `isDestructiveCommand` triggers, emit a
  permission-pending event (or set state on the tool call) before awaiting
  `onApproveDestructive`. After resolution, emit allowed/denied state.
- **`src/components/chat/ToolCallDisplay.tsx`** — render `[Allow] [Deny]` inline
  on the tool call row when permission is pending. After resolution, show
  `— ALLOWED` or `— DENIED` tag. Handle keyboard interaction for the inline
  prompt (Enter to allow, Esc/D to deny).
- **`src/components/QuestionPrompt.tsx`** — permission prompts no longer routed
  here. May need a `isInline` flag to distinguish, or permissions skip this
  component entirely.
- **`src/components/layout/TabInstance.tsx`** — skip rendering `QuestionPrompt`
  for permission-type questions if they're handled inline.
- **`src/hooks/useChat.ts`** — `promptDestructive` / `createPermissionPrompt`
  may need to set state on the tool call metadata instead of `pendingQuestion`.
- **`src/types/index.ts`** — extend `PendingQuestion` or add a parallel type
  for inline permission state tied to a specific tool call ID.

### Complexity

Medium. The keyboard interaction is the tricky part — currently `QuestionPrompt`
owns focus and key handling. Moving Allow/Deny inline means `ToolCallDisplay`
needs to handle focus for the active permission row without conflicting with
the `InputBox` or other keyboard handlers.

A simpler v1: keep `QuestionPrompt` for the interaction but after resolution,
emit the result as metadata on the tool call so `ToolCallDisplay` shows
`— ALLOWED` instead of the prompt disappearing silently.

---

## Non-Applicable Features

- **Sandbox container pre-warming** — AI SDK 6 docs reference using `prepareStep`
  to preserve Vercel Sandbox containers across steps. This is for Vercel's
  programmatic tool calling (Claude code execution in cloud sandboxes). We run
  locally — not applicable.
- **`ToolLoopAgent` class** — already adopted.
- **`stopWhen` combinators (`hasToolCall`, `stepCountIs`)** — already using custom
  stop conditions that are more sophisticated than the built-ins.
