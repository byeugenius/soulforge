import { Agent, setGlobalDispatcher, fetch as undiciFetch } from "undici";

/**
 * Global HTTP dispatcher for every outgoing request in soulforge.
 *
 * Why: Bun's native `fetch` pool keeps keep-alive sockets indefinitely with
 * no configurable idle timeout and no half-closed-socket detection. Bun
 * docs confirm there is no Dispatcher/Agent API. Upstream load balancers
 * (Anthropic edge, OpenAI, local CLIProxyAPI) silently drop idle sockets
 * after 60-120s. The next request writes onto the dead socket and fails
 * with `TypeError: fetch failed` / `Unable to connect. Is the computer
 * able to access the url?`, which the AI SDK surfaces as
 * `APICallError: Cannot connect to API: ...`.
 *
 * Bun issue refs: oven-sh/bun#7260, #1725, #14538, #10642, #24376, #20486.
 *
 * Fix: route every request through undici's `fetch`, which honors the
 * dispatcher, reaps idle sockets before upstream closes them, and evicts
 * dead sockets on error. Bun's *global* `fetch` ignores the `dispatcher`
 * option (issues #10642, #24376), so we must replace `globalThis.fetch`
 * itself — `setGlobalDispatcher` alone is not enough under Bun.
 *
 * Timeouts are tuned for LLM workloads:
 *   - `keepAliveTimeout: 10s`   — close idle sockets client-side before
 *                                 upstream LBs do
 *   - `headersTimeout: 30min`   — extended thinking can take many minutes
 *   - `bodyTimeout:    30min`   — long streams
 *   - `connectTimeout: 30s`     — fail fast on a genuinely dead host
 */
const agent = new Agent({
  keepAliveTimeout: 10_000,
  keepAliveMaxTimeout: 60_000,
  connections: 64,
  pipelining: 0,
  headersTimeout: 30 * 60_000,
  bodyTimeout: 30 * 60_000,
  connectTimeout: 30_000,
});

setGlobalDispatcher(agent);

let installed = false;

/**
 * Install undici's `fetch` as `globalThis.fetch`. Idempotent. Must be
 * invoked once at process boot, before any provider is constructed.
 */
export function installGlobalFetch(): void {
  if (installed) return;
  installed = true;
  const undiciTyped = undiciFetch as unknown as typeof fetch;
  // Preserve Bun's `preconnect` so callers that use `fetch.preconnect(url)`
  // still work. Bun's preconnect warms its own pool, not undici's — so
  // calling it becomes a no-op for request routing, but it won't throw.
  if (typeof fetch.preconnect === "function" && typeof undiciTyped.preconnect !== "function") {
    (undiciTyped as unknown as { preconnect: typeof fetch.preconnect }).preconnect =
      fetch.preconnect.bind(fetch);
  }
  globalThis.fetch = undiciTyped;
}
