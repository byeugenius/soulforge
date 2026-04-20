/**
 * Discord adapter hardening tests — intent minimization, fatal close code
 * lockout, interaction allowlist, 429 retry.
 */
import { describe, expect, test } from "bun:test";
import { DiscordSurface } from "../src/hearth/adapters/discord.js";

describe("Discord intent minimization", () => {
  test("identify payload requests only DIRECT_MESSAGES intent (1 << 12)", async () => {
    const sentPayloads: unknown[] = [];
    class FakeWS extends EventTarget {
      static OPEN = 1;
      readyState = 1;
      send(data: string) {
        sentPayloads.push(JSON.parse(data));
      }
      close() {}
      addEventListener(type: string, handler: (ev: Event) => void) {
        super.addEventListener(type, handler);
      }
    }
    const surface = new DiscordSurface({
      appId: "test",
      readToken: async () => "stub",
      fetchImpl: (async () => new Response(null, { status: 200 })) as typeof fetch,
      webSocketImpl: FakeWS as unknown as typeof WebSocket,
      log: () => {},
    });
    await (surface as unknown as { connect: () => Promise<void> }).connect();
    // Simulate HELLO op 10 → triggers identify
    const ws = (surface as unknown as { ws: FakeWS }).ws;
    const msgEvent = new MessageEvent("message", {
      data: JSON.stringify({ op: 10, d: { heartbeat_interval: 45_000 } }),
    });
    ws.dispatchEvent(msgEvent);
    // Wait a tick so async identify fires
    await new Promise((r) => setTimeout(r, 5));
    const identify = sentPayloads.find(
      (p): p is { op: number; d: { intents?: number } } =>
        !!p && typeof p === "object" && (p as { op: number }).op === 2,
    );
    expect(identify).toBeTruthy();
    expect(identify?.d.intents).toBe(1 << 12); // DIRECT_MESSAGES only
    // Confirm no MESSAGE_CONTENT (1 << 15)
    expect((identify?.d.intents ?? 0) & (1 << 15)).toBe(0);
    // Confirm no GUILDS (1 << 0)
    expect((identify?.d.intents ?? 0) & (1 << 0)).toBe(0);
  });
});

describe("Discord fatal close lockout", () => {
  test("close code 4014 (disallowed intents) stops reconnect", async () => {
    let wsCount = 0;
    class FakeWS extends EventTarget {
      static OPEN = 1;
      readyState = 1;
      constructor() {
        super();
        wsCount++;
      }
      send() {}
      close() {}
    }
    const surface = new DiscordSurface({
      appId: "test",
      readToken: async () => "stub",
      fetchImpl: (async () => new Response(null, { status: 200 })) as typeof fetch,
      webSocketImpl: FakeWS as unknown as typeof WebSocket,
      log: () => {},
    });
    await (surface as unknown as { connect: () => Promise<void> }).connect();
    const ws = (surface as unknown as { ws: FakeWS }).ws;
    // Fire a CloseEvent with code 4014 (privileged intent not toggled)
    ws.dispatchEvent(Object.assign(new Event("close"), { code: 4014 }));
    // Wait well past the reconnect backoff window
    await new Promise((r) => setTimeout(r, 50));
    expect(wsCount).toBe(1); // no reconnect attempted
  });
});
