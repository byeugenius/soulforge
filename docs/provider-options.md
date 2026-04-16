# Provider Options

Model-specific options for thinking, context management, and capabilities.

## Thinking Modes

Configured via `/provider` → Claude tab:

| Mode | Behavior |
|------|----------|
| `off` | No thinking blocks |
| `auto` / `adaptive` | Model decides when to think (Claude 4+ only) |
| `enabled` | Fixed budget thinking with configurable token budget |

Budget tokens (when mode is `enabled`): 1024, 2048, 5000, 10000, 20000.

## Context Management

Anthropic API context management edits:

| Feature | What it does |
|---------|-------------|
| **Clear Thinking** | Auto-clears old thinking blocks, keeps last 5 turns |
| **Clear Tool Uses** | Clears old tool use content when input exceeds 100k tokens |
| **Compact** | API-side compaction at 75% of context window |

These are applied per-model based on capabilities. Clear thinking requires thinking to be enabled — the system enforces this at the code level.

## Subagent Options

Subagents inherit the parent's provider options with one exception: `contextManagement` is stripped. Subagents are short-lived (token-budgeted) and don't need context window management strategies. This prevents errors when the subagent model doesn't support the same features as the parent model.

## Degradation

When provider options cause an API error, the system automatically retries with degraded options:

1. **Level 0:** Full options (thinking + context management)
2. **Level 1:** Reduced (basic thinking, no context management)
3. **Level 2:** No Anthropic-specific options

Detection patterns: "not supported", "thinking is not supported", "adaptive thinking", "clear_thinking", "context management", "unknown parameter".

## Retry on Transient Errors

Both the main chat loop and dispatched sub-agents retry automatically on transient provider errors (429 rate limits, 529/503 overloaded, timeouts, socket errors). Wait time doubles each attempt with jitter: `baseDelayMs * 2^attempt + random(0–500ms)`.

Configure in your config file (`~/.config/soulforge/config.json` or `.soulforge/config.json`):

```json
{
  "retry": {
    "maxAttempts": 5,
    "baseDelayMs": 3000
  }
}
```

| Field | Default | Range | Notes |
|-------|---------|-------|-------|
| `maxAttempts` | `3` | 1–10 | Retries on top of the initial attempt. `5` gives delays of ~3s, 6s, 12s, 24s, 48s. |
| `baseDelayMs` | `2000` (agents), `1000` (chat) | 250–60000 | Starting delay before the first retry. Doubles each attempt. |

If you're hitting `Error: Failed after 3 attempts. Last error: Too Many Requests`, bump `maxAttempts` to 5–6 and `baseDelayMs` to 3000–5000.
