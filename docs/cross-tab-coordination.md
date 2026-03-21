# Cross-Tab Coordination

SoulForge supports up to 5 concurrent tabs editing the same codebase. The WorkspaceCoordinator manages advisory file claims so tabs are aware of what others are editing.

## How It Works

When any tab edits a file (via `edit_file`, `multi_edit`, `rename_symbol`, `move_symbol`, `rename_file`, `refactor`, or shell writes), the file is automatically claimed for that tab. Other tabs see the claim and get advisory warnings.

### Claim Lifecycle

| Event | What happens |
|-------|-------------|
| Agent edits a file | File claimed for the tab via `checkAndClaim` |
| Another tab edits the same file | Warning returned: "File X is being edited by Tab Y" |
| Tab goes idle (prompt finishes) | Claims released after 5 seconds |
| User aborts (Ctrl+X) | Claims released immediately |
| Tab closes | Claims released + tab marked as closed (blocks ghost claims) |
| Stale sweep (every 30s) | Claims older than 5 minutes released regardless |
| Leaked agents (15 min) | Agent counters cleared by sweep |

### Git Blocking

Git operations that modify the working tree (`commit`, `stash`, `restore`, `branch switch`) are blocked while another tab has active dispatch agents. This prevents partial commits during concurrent edits.

The block is per-tab — a tab's own agents don't block its own git operations. When blocked, the tool returns a terminal error ("BLOCKED ... do not attempt again") instead of a retryable error, preventing token-burning retry loops.

### Contention Handling

When `edit_file` fails with `old_string not found` AND the file is claimed by another tab, a terminal CONTENTION error is returned instead of the normal rich error. The agent stops and informs the user instead of retrying.

## Commands

| Command | Description |
|---------|-------------|
| `/claims` | Show all active file claims across tabs |
| `/unclaim <path>` | Release a specific file claim from current tab |
| `/unclaim-all` | Release all claims from current tab |
| `/force-claim <path>` | Steal a file claim from another tab |

## Architecture

```
WorkspaceCoordinator (singleton)
├── claims: Map<path, FileClaim>        — who owns what
├── activeAgents: Map<tabId, count>     — dispatch agent tracking
├── closedTabs: Set<tabId>              — ghost claim prevention
├── idleTimers: Map<tabId, timer>       — auto-release on idle
├── agentStartedAt: Map<tabId, ts>      — leaked agent sweep
└── listeners: Set<callback>            — event subscribers (UI sync)
```

### Events

All claim state changes emit batched events via `queueMicrotask`:
- `claim` — file claimed by a tab
- `release` — file released (including force-claim releasing the old owner)
- `conflict` — tab tried to claim a file owned by another tab

The tab bar listens to these events and updates the claim count indicator. Only re-renders when the count actually changes (deduped).

### Tool Integration

Every file-modifying tool calls `checkAndClaim` before execution (advisory warning) or `claimAfterCompoundEdit` after execution (post-hoc claim):

- `edit_file`, `multi_edit` — `checkAndClaim` before edit
- `rename_symbol`, `move_symbol`, `rename_file`, `refactor` — `checkAndClaim` before + `claimAfterCompoundEdit` after
- `shell` (sed, cp, mv, tee, >) — `claimAfterCompoundEdit` after
- `test_scaffold` — `claimAfterCompoundEdit` after

### System Prompt

The `prepareStep` hook injects fresh cross-tab claim state on every agent step. This is NOT in the initial system prompt (which would go stale) — it's live on every step.

## Design Decisions

**Advisory, not blocking.** Edits always proceed. The warning tells the agent another tab owns the file — the agent can choose to skip or proceed. This avoids deadlocks.

**Git is the exception.** Git operations during active dispatch are hard-blocked because committing mid-dispatch produces garbage (partial edits). This is the only hard gate.

**Claims are transient.** Auto-released on idle (5s), on abort, on tab close. The stale sweep (5 min) is the safety net. Nothing persists forever.
