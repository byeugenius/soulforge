# User Steering

Type messages while the agent is running. They get queued and injected into the conversation mid-stream.

## How It Works

1. User types a message while the agent is busy (loading indicator visible)
2. Message is queued (up to 5 messages, shown in UI with "queued" label)
3. At the next `prepareStep` call (between agent steps), `drainSteering()` drains all queued messages at once
4. Current assistant progress is committed as a completed message, steering messages are appended, and accumulators are reset
5. Combined steering text is injected as a user message into the AI conversation
6. Agent sees the steering and adjusts its approach

## Architecture

```
User types while loading
        │
        ▼
  messageQueue (state)
  messageQueueRef (ref)
        │
        ▼  prepareStep calls drainSteering()
  flushBeforeSteering():
    - Commits current assistant progress to messages
    - Appends steering messages after it
    - Resets accumulators (fullText, segments, tool calls)
        │
        ▼
  Combined text injected into AI messages as:
  { role: "user", content: "IMPORTANT — ..." }
        │
        ▼
  Agent processes in next step (fresh accumulators)
```

## Safety

- **Abort gate:** `steeringAbortedRef` prevents drainSteering from firing after Ctrl+X
- **Ref sync:** `messageQueueRef.current = []` set directly in abort handler
- **Queue cap:** Maximum 5 queued messages (enforced in onQueue callback)
- **Post-completion drain:** After stream ends, remaining queue is auto-submitted as the next message
- **Plan-aware:** Queue survives across plan revision/execution continuations

## UI

Queued messages appear below the chat with a left rail border and "queued" label. They disappear as they're consumed by the agent or cleared on abort.
