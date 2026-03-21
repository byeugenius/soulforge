---
name: reviewer-panel
description: Side-by-side review panel with read-only tools, independent chat, /review command
type: project
---

# Reviewer Panel

Side-by-side review panel that opens next to the main chat. Independent LLM session with read-only tool access. Activated via `/review`, communicates results back to main agent via `/review send`.

## Commands

| Command | Behavior |
|---|---|
| `/review` | Toggle panel open/close (default) |
| `/review send` | Inject summary of review into main chat |
| `/review close` | Close and terminate review session |

## Architecture

### Layout
- Right sidebar split in TabInstance (like ChangesPanel but ~40% width)
- `{showReview && <ReviewPanel />}` pattern
- Toggle state: `reviewOpen: boolean` in UIStore
- Configurable split percentage via `reviewSplit` in config

### Chat
- Separate `useChat` instance (independent message history)
- Shares `ContextManager` with main chat (repo map, symbols, etc.)
- Does NOT persist to session file (ephemeral)
- Task router slot: `reviewer` — defaults to cheaper/faster model

### Tools — Read-Only Only
- `soul_grep`, `soul_find`, `soul_analyze`, `soul_impact` — all read-only, no writes
- `read_file`, `read_code`, `navigate` — file reading
- `project` — read-only actions only (typecheck, lint, test — NO run)
- `memory_search`, `memory_list` — memory access
- **NO**: `edit_file`, `write_file`, `create_file`, `shell` (write), `rename_symbol`, `move_symbol`, `refactor`, `dispatch`
- Shell: only whitelisted read commands (`git log`, `git diff`, `git status`, `bun test`, `bun run typecheck`, `bun run lint`)

### `/review send` — Context Injection
- Extracts the last assistant message from review chat
- Truncates to ~2k tokens max
- Injects into main chat as system message: `[Review] ...`
- Main agent sees it as context, not as user instruction

## Fragility Assessment

### Low Risk
- Layout split — proven pattern (editor split, ChangesPanel)
- Command registration — trivial in commands.ts
- UIStore toggle — one boolean
- Read-only tools — subset of existing tool definitions

### Medium Risk
- **Two concurrent LLM streams** — share API key/rate limits. Mitigate: reviewer uses cheap model, main gets priority
- **Terminal width** — 40% of 80 cols = 32 cols. Message rendering and code blocks need to wrap. Test at narrow widths
- **Shared ContextManager** — repo map render cached (5s TTL), fine. But `mentionedFiles` tracking could cross-contaminate. Mitigate: reviewer doesn't track mentioned files

### Higher Risk
- **Focus management** — keyboard input routing between main chat input and review panel input. Current focus state machine has `chat | editor` modes. Adding `review` as third target requires extending `focusMode` state. This is the hardest part
- **`/review send` sizing** — review output can be multi-thousand tokens. Blind injection bloats main context. Must truncate or ask reviewer to produce a summary verdict

## Prerequisite: Input Box Improvements

**The current InputBox is fragile.** Before building a second input target, fix the foundation:

- **Copy/paste** — multi-line paste doesn't work reliably. Lines get concatenated or dropped
- **Line wrapping** — long lines overflow or clip instead of wrapping at terminal width
- **Cursor movement** — no word-jump (Ctrl+Left/Right), no Home/End in multi-line mode
- **Width calculation** — `measuredWidth` was a stale ref bug (fixed to state), but narrow widths still cause layout issues
- **Selection** — no text selection support (highlight + copy)
- **Newline insertion** — Shift+Enter or Alt+Enter for newlines is inconsistent across terminals
- **Resize handling** — terminal resize while typing can corrupt the input display

These issues exist in the current single-input setup. Adding a second input (review panel) doubles the surface area for these bugs. Fix InputBox first, then build the review panel on a solid foundation.

## Implementation Order

1. **Fix InputBox** — copy/paste, wrapping, resize handling
2. **UIStore + command** — `reviewOpen` toggle, `/review` command handler
3. **ReviewPanel component** — scrollable chat display, read-only tool output rendering
4. **Review useChat instance** — separate hook, read-only tool set, reviewer system prompt
5. **Focus management** — extend `focusMode` to include `review`, keyboard routing
6. **`/review send`** — truncated injection into main chat
7. **Task router integration** — `reviewer` slot for model selection

## System Prompt (Reviewer Role)

```
You are a code reviewer. You have read-only access to the codebase.

Your job:
- Review code changes, plans, and tool outputs from the main agent
- Flag bugs, security issues, performance problems, missed edge cases
- Suggest improvements but do NOT make changes yourself
- Be concise — your output may be sent to the main agent as context

You cannot edit files, run shell commands, or dispatch agents. Use read-only tools to verify claims and inspect code.
```

## Open Questions

- Should the reviewer auto-receive context when the main agent finishes a task? Or only on explicit `/review` trigger?
- Should `/review` pre-populate with the last N messages from main chat as context?
- Should the reviewer panel support its own slash commands (e.g., `/review focus <file>`)?
- Keybinding for toggle: Ctrl+R conflicts with terminal reverse search. Alt+R or Ctrl+Shift+R?
