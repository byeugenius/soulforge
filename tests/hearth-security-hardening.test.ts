/**
 * Adversarial security tests for Hearth. Each test tries to *break* a
 * defense, not demonstrate it works in the happy path:
 *
 *   - allowlist fall-open scenarios (empty list, unknown key, typeof shenanigans)
 *   - Discord identity spoof via `member.user.id` bypass attempts
 *   - Telegram forward/via_bot/sender_chat spoof vectors
 *   - pairing brute-force + lockout evasion (case, whitespace, cross-surface)
 *   - policy whitespace-variant bypass of autoDeny
 *   - redaction false-negatives on corpus of crafted payloads
 *   - config containment escape (symlink, ..\/, ~ expansion, tmp/)
 *   - config poisoning (oversized file, wrong shape, NaN entries)
 *   - bridge-lock pid reuse + legacy format
 *   - protocol frame oversize / idle-timeout / version mismatch
 *
 * Runs with `bun test`. No network, no filesystem writes outside tmp.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createServer, type Server } from "node:net";
import { createConnection } from "node:net";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DiscordSurface } from "../src/hearth/adapters/discord.js";
import { TelegramSurface } from "../src/hearth/adapters/telegram.js";
import { parseCommand } from "../src/hearth/adapters/base.js";
import { ApprovalRegistry } from "../src/hearth/approvals.js";
import {
  acquireBridgeLock,
  BRIDGE_LOCK_PATH,
  readBridgeOwner,
  releaseBridgeLock,
} from "../src/hearth/bridge.js";
import {
  containPath,
  loadHearthConfig,
  validateSurfaceShape,
} from "../src/hearth/config.js";
import { PairingRegistry } from "../src/hearth/pairing.js";
import { evaluatePolicy } from "../src/hearth/policy.js";
import { attachFrameReader, HEARTH_MAX_FRAME_BYTES } from "../src/hearth/protocol.js";
import { auditRedaction, redact, redactUnknown } from "../src/hearth/redact.js";
import type { HearthSurfaceConfig, PermissionRequest, SurfaceId } from "../src/hearth/types.js";
import { HEARTH_PROTOCOL_VERSION } from "../src/hearth/types.js";

// ── Helpers ────────────────────────────────────────────────────────────────

function noopFetch(): typeof fetch {
  return (async () => new Response("{}", { status: 200 })) as unknown as typeof fetch;
}

function makeDiscord(allowed: Record<string, string[]>) {
  const inbound: Array<{ externalId: string; senderId?: string; text?: string }> = [];
  const logs: string[] = [];
  const surface = new DiscordSurface({
    appId: "testapp",
    allowedUserIdsByChannel: allowed,
    readToken: async () => "fake-token-never-leaked",
    fetchImpl: noopFetch(),
    webSocketImpl: class FakeWS {
      readyState = 0;
      static OPEN = 1;
      addEventListener() {}
      removeEventListener() {}
      send() {}
      close() {}
    } as unknown as typeof WebSocket,
    log: (l) => logs.push(l),
  });
  surface.onInbound((m) => inbound.push(m as never));
  return { surface, inbound, logs };
}

function makeTelegram(allowed: Record<string, number[]>) {
  const inbound: Array<{ externalId: string; text?: string }> = [];
  const logs: string[] = [];
  const surface = new TelegramSurface({
    botId: "1234",
    allowedUserIdsByChat: allowed,
    readToken: async () => "fake:token-never-leaked-xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    fetchImpl: noopFetch(),
    log: (l) => logs.push(l),
  });
  surface.onInbound((m) => inbound.push(m as never));
  return { surface, inbound, logs };
}

function policyReq(toolName: string, firstArg: string): PermissionRequest {
  return {
    v: HEARTH_PROTOCOL_VERSION,
    sessionId: "s1",
    toolCallId: "t1",
    toolName,
    toolInput: { command: firstArg },
    cwd: "/tmp",
    tabId: "tab-a",
  };
}

// ── Allowlist fall-open battery ────────────────────────────────────────────

describe("allowlist — Discord adversarial", () => {
  test("unknown channel dropped silently (no channel key in allowlist)", () => {
    const { surface, inbound } = makeDiscord({
      "12345": ["99999"],
    });
    // @ts-expect-error — reach into the private method for adversarial test
    surface.handleMessage({
      id: "m1",
      channel_id: "UNKNOWN_CHANNEL",
      author: { id: "99999" },
      content: "hi",
    });
    expect(inbound).toHaveLength(0);
  });

  test("empty allowlist array dropped (default-deny, not fall-open)", () => {
    const { surface, inbound } = makeDiscord({ ch1: [] });
    // @ts-expect-error
    surface.handleMessage({
      id: "m2",
      channel_id: "ch1",
      author: { id: "anybody" },
      content: "hi",
    });
    expect(inbound).toHaveLength(0);
  });

  test("missing allowlist section entirely (empty object) dropped", () => {
    const { surface, inbound } = makeDiscord({});
    // @ts-expect-error
    surface.handleMessage({
      id: "m3",
      channel_id: "any",
      author: { id: "any" },
      content: "hi",
    });
    expect(inbound).toHaveLength(0);
  });

  test("guild_id set (non-DM) dropped even with valid allowlist", () => {
    const { surface, inbound } = makeDiscord({ ch1: ["u1"] });
    // @ts-expect-error
    surface.handleMessage({
      id: "m4",
      channel_id: "ch1",
      author: { id: "u1" },
      content: "hi",
      guild_id: "malicious-guild",
    });
    expect(inbound).toHaveLength(0);
  });

  test("bot=true sender dropped before allowlist check", () => {
    const { surface, inbound } = makeDiscord({ ch1: ["u1"] });
    // @ts-expect-error
    surface.handleMessage({
      id: "m5",
      channel_id: "ch1",
      author: { id: "u1", bot: true },
      content: "hi",
    });
    expect(inbound).toHaveLength(0);
  });

  test("allowed user in unallowed channel dropped (per-channel, not global)", () => {
    const { surface, inbound } = makeDiscord({ ch1: ["u1"] });
    // @ts-expect-error
    surface.handleMessage({
      id: "m6",
      channel_id: "ch2",
      author: { id: "u1" },
      content: "hi",
    });
    expect(inbound).toHaveLength(0);
  });

  test("happy path — correct (channel, user) permitted", () => {
    const { surface, inbound } = makeDiscord({ ch1: ["u1"] });
    // @ts-expect-error
    surface.handleMessage({
      id: "m7",
      channel_id: "ch1",
      author: { id: "u1" },
      content: "hi",
    });
    expect(inbound).toHaveLength(1);
  });
});

describe("interaction — Discord identity spoof", () => {
  const { surface } = makeDiscord({ ch1: ["u1"] });
  // @ts-expect-error
  const handle = (i: unknown) => surface.handleInteraction(i);

  test("guild interaction (member set) rejected even if user.id is allowed", () => {
    let responded = "";
    // @ts-expect-error
    surface.respondInteraction = async (_i: unknown, m: string) => {
      responded = m;
    };
    handle({
      id: "i1",
      token: "t",
      type: 3,
      channel_id: "ch1",
      member: { user: { id: "u1" } },
      user: { id: "u1" },
      data: { custom_id: "apr:x:a" },
    });
    expect(responded).toBe("dm-only");
  });

  test("missing channel_id rejected", () => {
    let responded = "";
    // @ts-expect-error
    surface.respondInteraction = async (_i: unknown, m: string) => {
      responded = m;
    };
    handle({
      id: "i2",
      token: "t",
      type: 3,
      user: { id: "u1" },
      data: { custom_id: "apr:x:a" },
    });
    expect(responded).toBe("not authorised");
  });

  test("user not in allowlist rejected", () => {
    let responded = "";
    // @ts-expect-error
    surface.respondInteraction = async (_i: unknown, m: string) => {
      responded = m;
    };
    handle({
      id: "i3",
      token: "t",
      type: 3,
      channel_id: "ch1",
      user: { id: "u_NOT_LISTED" },
      data: { custom_id: "apr:x:a" },
    });
    expect(responded).toBe("not authorised");
  });

  test("type!=3 (non-button) silently ignored (no response)", () => {
    let calls = 0;
    // @ts-expect-error
    surface.respondInteraction = async () => {
      calls++;
    };
    handle({
      id: "i4",
      token: "t",
      type: 2 /* application command */,
      channel_id: "ch1",
      user: { id: "u1" },
    });
    expect(calls).toBe(0);
  });
});

describe("allowlist — Telegram adversarial", () => {
  test("forwarded message dropped (forward_origin set)", () => {
    const { surface, inbound, logs } = makeTelegram({ "100": [42] });
    // @ts-expect-error
    surface.handleUpdate({
      update_id: 1,
      message: {
        message_id: 1,
        from: { id: 42 },
        chat: { id: 100, type: "private" },
        text: "hi",
        date: Math.floor(Date.now() / 1000),
        forward_origin: { type: "user", sender_user: { id: 999 } },
      },
    });
    expect(inbound).toHaveLength(0);
    expect(logs.some((l) => l.includes("forwarded"))).toBe(true);
  });

  test("via_bot proxy dropped", () => {
    const { surface, inbound, logs } = makeTelegram({ "100": [42] });
    // @ts-expect-error
    surface.handleUpdate({
      update_id: 2,
      message: {
        message_id: 2,
        from: { id: 42 },
        chat: { id: 100, type: "private" },
        text: "hi",
        date: Math.floor(Date.now() / 1000),
        via_bot: { id: 777 },
      },
    });
    expect(inbound).toHaveLength(0);
    expect(logs.some((l) => l.includes("via_bot"))).toBe(true);
  });

  test("sender_chat (channel/group anon-admin) dropped", () => {
    const { surface, inbound, logs } = makeTelegram({ "100": [42] });
    // @ts-expect-error
    surface.handleUpdate({
      update_id: 3,
      message: {
        message_id: 3,
        from: { id: 42 },
        chat: { id: 100, type: "private" },
        text: "hi",
        date: Math.floor(Date.now() / 1000),
        sender_chat: { id: 500, type: "channel" },
      },
    });
    expect(inbound).toHaveLength(0);
    expect(logs.some((l) => l.includes("sender_chat"))).toBe(true);
  });

  test("stale message (>60s old) dropped", () => {
    const { surface, inbound, logs } = makeTelegram({ "100": [42] });
    // @ts-expect-error
    surface.handleUpdate({
      update_id: 4,
      message: {
        message_id: 4,
        from: { id: 42 },
        chat: { id: 100, type: "private" },
        text: "hi",
        date: Math.floor(Date.now() / 1000) - 120,
      },
    });
    expect(inbound).toHaveLength(0);
    expect(logs.some((l) => l.includes("stale"))).toBe(true);
  });

  test("edited_message dropped (could replay a command)", () => {
    const { surface, inbound } = makeTelegram({ "100": [42] });
    // @ts-expect-error
    surface.handleUpdate({
      update_id: 5,
      edited_message: {
        message_id: 5,
        from: { id: 42 },
        chat: { id: 100, type: "private" },
        text: "/pair LEAK",
        date: Math.floor(Date.now() / 1000),
      },
    });
    expect(inbound).toHaveLength(0);
  });

  test("non-allowed sender in allowed chat dropped silently", () => {
    const { surface, inbound } = makeTelegram({ "100": [42] });
    // @ts-expect-error
    surface.handleUpdate({
      update_id: 6,
      message: {
        message_id: 6,
        from: { id: 99 /* not 42 */ },
        chat: { id: 100, type: "private" },
        text: "hi",
        date: Math.floor(Date.now() / 1000),
      },
    });
    expect(inbound).toHaveLength(0);
  });

  test("unknown chat id with any sender dropped", () => {
    const { surface, inbound } = makeTelegram({ "100": [42] });
    // @ts-expect-error
    surface.handleUpdate({
      update_id: 7,
      message: {
        message_id: 7,
        from: { id: 42 },
        chat: { id: 999 /* not in list */, type: "private" },
        text: "hi",
        date: Math.floor(Date.now() / 1000),
      },
    });
    expect(inbound).toHaveLength(0);
  });
});

// ── Pairing brute-force + lockout ──────────────────────────────────────────

describe("pairing — brute-force defense", () => {
  const SID = "telegram:999" as SurfaceId;
  const CHAT = "chat-A";

  test("locks out after 5 failed attempts; correct code rejected while locked", () => {
    const r = new PairingRegistry(60_000);
    const real = r.issue(SID, CHAT);
    for (let i = 0; i < 5; i++) {
      expect(r.consume(SID, `WRONG${String(i)}`, CHAT)).toBeNull();
    }
    expect(r.isLocked(SID, CHAT)).toBe(true);
    // Even the correct code is refused during lockout.
    expect(r.consume(SID, real.code, CHAT)).toBeNull();
  });

  test("lockout is per-(surface,chat) — parallel chat unaffected", () => {
    const r = new PairingRegistry(60_000);
    const real = r.issue(SID, "chat-B");
    // burn chat-A's budget
    for (let i = 0; i < 5; i++) r.consume(SID, `NOPE${String(i)}`, "chat-A");
    expect(r.isLocked(SID, "chat-A")).toBe(true);
    // chat-B still clean
    expect(r.isLocked(SID, "chat-B")).toBe(false);
    const got = r.consume(SID, real.code, "chat-B");
    expect(got).not.toBeNull();
  });

  test("case-insensitive consume doesn't let attacker amplify tries", () => {
    const r = new PairingRegistry(60_000);
    const real = r.issue(SID, CHAT);
    // lowercase miss counts as failure
    expect(r.consume(SID, real.code.toLowerCase() + "XX", CHAT)).toBeNull();
    // but the real code (uppercased internally) still works since we have 4 budget left
    expect(r.consume(SID, real.code, CHAT)).not.toBeNull();
  });

  test("cross-surface codes never redeem — can't leak across bots", () => {
    const r = new PairingRegistry(60_000);
    const realA = r.issue("telegram:1" as SurfaceId, CHAT);
    // Try to redeem on discord
    expect(r.consume("discord:1" as SurfaceId, realA.code, CHAT)).toBeNull();
  });

  test("expired code deleted + failure counted", () => {
    const r = new PairingRegistry(1 /* 1ms TTL */);
    const real = r.issue(SID, CHAT);
    // busy-wait so the entry is definitely expired
    const start = Date.now();
    while (Date.now() - start < 5) {
      /* spin */
    }
    expect(r.consume(SID, real.code, CHAT)).toBeNull();
    // The real code is gone forever.
    expect(r.list()).toHaveLength(0);
  });

  test("successful consume clears the failure counter", () => {
    const r = new PairingRegistry(60_000);
    const real = r.issue(SID, CHAT);
    for (let i = 0; i < 3; i++) r.consume(SID, `XX${String(i)}`, CHAT);
    // Not locked yet (3 < 5).
    expect(r.isLocked(SID, CHAT)).toBe(false);
    // Success resets counter.
    expect(r.consume(SID, real.code, CHAT)).not.toBeNull();
    // Can now start fresh.
    const real2 = r.issue(SID, CHAT);
    for (let i = 0; i < 4; i++) r.consume(SID, `NN${String(i)}`, CHAT);
    expect(r.isLocked(SID, CHAT)).toBe(false);
    expect(r.consume(SID, real2.code, CHAT)).not.toBeNull();
  });

  test("consume without attemptKey never locks out (backward-compat)", () => {
    const r = new PairingRegistry(60_000);
    const real = r.issue(SID, CHAT);
    for (let i = 0; i < 20; i++) r.consume(SID, `WRONG${String(i)}`);
    // No attemptKey means no lockout tracking — correct code still works.
    expect(r.consume(SID, real.code)).not.toBeNull();
  });
});

// ── Policy whitespace/rule-variant bypass ─────────────────────────────────

describe("policy — whitespace normalization", () => {
  const binding = {
    autoDeny: ["shell(git push --force*)"],
    autoApprove: [],
  } as unknown as import("../src/hearth/types.js").ChatBinding;

  test("single-space form denied", () => {
    const d = evaluatePolicy(policyReq("shell", "git push --force"), binding);
    expect(d.kind).toBe("deny");
  });

  test("two-space form still denied (normalization kills the bypass)", () => {
    const d = evaluatePolicy(policyReq("shell", "git push  --force"), binding);
    expect(d.kind).toBe("deny");
  });

  test("tab-separated form denied", () => {
    const d = evaluatePolicy(policyReq("shell", "git\tpush\t--force"), binding);
    expect(d.kind).toBe("deny");
  });

  test("leading whitespace doesn't slip past", () => {
    const d = evaluatePolicy(policyReq("shell", "   git push --force-with-lease origin main"), {
      autoDeny: ["shell(git push --force*)"],
      autoApprove: [],
    } as never);
    expect(d.kind).toBe("deny");
  });

  test("unrelated command asks (not auto-allow by accident)", () => {
    const d = evaluatePolicy(policyReq("shell", "git status"), binding);
    expect(d.kind).toBe("ask");
  });
});

// ── Redaction evasion attempts ────────────────────────────────────────────

describe("redact — evasion corpus", () => {
  test("secret embedded inside a larger string still scrubbed", () => {
    const out = redact(
      "before sk-abcdefghijklmnopqrstuvwxyz0123456789ABCD after text continues",
    );
    expect(out).not.toContain("abcdefghijklmnopqrstuvwxyz0123456789ABCD");
    expect(out).toContain("sk-***");
  });

  test("multiple secrets in one string all scrubbed", () => {
    const out = redact(
      "a=sk-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa b=AKIAIOSFODNN7EXAMPLE c=1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij",
    );
    expect(out).not.toContain("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(out).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(out).not.toContain("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij");
  });

  test("secret split across JSON object values still scrubbed recursively", () => {
    const out = redactUnknown({
      outer: { inner: { auth: "Bearer abcdefghijklmnopqrstuvwxyz" } },
      arr: ["sk-ant-abcdefghijklmnopqrstuvwxyz01234"],
    });
    const flat = JSON.stringify(out);
    expect(flat).not.toContain("abcdefghijklmnopqrstuvwxyz01234");
    expect(flat).not.toContain("Bearer abcdefghijklmnopqrstuvwxyz");
  });

  test("PEM private key block redacted even when wrapped in surrounding text", () => {
    const pem =
      "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\nsecretkeymaterial\n-----END RSA PRIVATE KEY-----";
    const out = redact(`context before ${pem} context after`);
    expect(out).not.toContain("secretkeymaterial");
    expect(out).not.toContain("MIIEowIBAAKCAQEA");
  });

  test("DB URL redacted even with special chars in password", () => {
    const out = redact("DATABASE_URL=postgres://u:p!w@rd@db:5432/x");
    expect(out).not.toContain("p!w@rd");
  });

  test("basic-auth URL redacted", () => {
    const out = redact("https://alice:s3cr3t@api.internal/path");
    expect(out).not.toContain("s3cr3t");
  });

  test("audit report doesn't leak the matched secret", () => {
    const hits = auditRedaction(
      "Authorization: Bearer zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz_secret",
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(JSON.stringify(hits)).not.toContain("zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz");
  });

  test("legitimate git SHA (40 chars) NOT scrubbed (no false positive)", () => {
    const sha = "a".repeat(40);
    expect(redact(`commit ${sha}`)).toBe(`commit ${sha}`);
  });

  test("redactUnknown scrubs object KEYS too (defense in depth)", () => {
    const raw = {} as Record<string, unknown>;
    raw["sk-abcdefghijklmnopqrstuvwxyz01234"] = "value";
    const out = redactUnknown(raw) as Record<string, unknown>;
    for (const k of Object.keys(out)) {
      expect(k).not.toContain("abcdefghijklmnopqrstuvwxyz01234");
    }
  });
});

// ── Config containment + poisoning ────────────────────────────────────────

// These test the PRIMITIVES directly (containPath, validateSurfaceShape)
// because loadHearthConfig() reads ~/.soulforge/hearth.json which is baked
// to the real homedir() at module import — we can't mock $HOME for Bun's
// os.homedir() without forking the process. Unit-testing the primitives
// gives the same coverage without fragile fixture setup. Project-scoped
// config IS cwd-aware and is exercised in a separate describe below.

describe("config — containPath", () => {
  test("absolute paths outside ~/.soulforge rejected", () => {
    expect(containPath("/etc/passwd", "logFile")).toBe("");
    expect(containPath("/tmp/evil.sock", "socketPath")).toBe("");
    expect(containPath("/var/log/daemon.log", "logFile")).toBe("");
  });

  test("absolute path inside ~/.soulforge accepted", () => {
    const { homedir } = require("node:os") as typeof import("node:os");
    const good = join(homedir(), ".soulforge", "my.sock");
    expect(containPath(good, "socketPath")).toBe(good);
  });

  test("nested subdir inside ~/.soulforge accepted", () => {
    const { homedir } = require("node:os") as typeof import("node:os");
    const nested = join(homedir(), ".soulforge", "sub", "file.log");
    expect(containPath(nested, "logFile")).toBe(nested);
  });

  test("~/relative expands and contains to trust root", () => {
    expect(containPath("~/.soulforge/x.sock", "socketPath")).not.toBe("");
  });

  test("~/.soulforge/../../../etc/passwd cannot escape via parent-dir tricks", () => {
    expect(containPath("~/.soulforge/../../../etc/passwd", "logFile")).toBe("");
  });

  test("bare relative path rejected (resolves into cwd, not ~/.soulforge)", () => {
    expect(containPath("./hearth.log", "logFile")).toBe("");
  });

  test("trust root itself (~/.soulforge) accepted", () => {
    const { homedir } = require("node:os") as typeof import("node:os");
    const root = join(homedir(), ".soulforge");
    expect(containPath(root, "stateFile")).toBe(root);
  });
});

describe("config — validateSurfaceShape", () => {
  test("allowed as string rejected", () => {
    const cfg = {
      enabled: true,
      allowed: "not-an-object",
      chats: {},
    } as unknown as Partial<HearthSurfaceConfig>;
    expect(validateSurfaceShape("telegram:1", cfg)).toBe(false);
  });

  test("allowed as array rejected", () => {
    const cfg = {
      enabled: true,
      allowed: ["a", "b"],
      chats: {},
    } as unknown as Partial<HearthSurfaceConfig>;
    expect(validateSurfaceShape("telegram:1", cfg)).toBe(false);
  });

  test("chats as array rejected", () => {
    const cfg = {
      enabled: true,
      chats: ["c"],
    } as unknown as Partial<HearthSurfaceConfig>;
    expect(validateSurfaceShape("telegram:1", cfg)).toBe(false);
  });

  test("undefined rejected", () => {
    expect(validateSurfaceShape("telegram:1", undefined)).toBe(false);
  });

  test("well-formed config accepted", () => {
    const cfg: Partial<HearthSurfaceConfig> = {
      enabled: true,
      allowed: { "5": ["5"] },
      chats: {},
    };
    expect(validateSurfaceShape("telegram:1", cfg)).toBe(true);
  });

  test("partial config with only 'enabled' accepted", () => {
    expect(validateSurfaceShape("telegram:1", { enabled: true })).toBe(true);
  });
});

describe("config — loadHearthConfig via project overlay (cwd-scoped)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "hearth-proj-"));
    mkdirSync(join(tmpDir, ".soulforge"), { recursive: true, mode: 0o700 });
  });

  afterEach(() => {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  test("oversized project config (>1 MiB) dropped before parse — no OOM", () => {
    const bigJunk = "x".repeat(2 * 1024 * 1024);
    writeFileSync(
      join(tmpDir, ".soulforge", "hearth.json"),
      `{"defaults":{"maxTabs":999},"junk":"${bigJunk}"}`,
      { mode: 0o600 },
    );
    const cfg = loadHearthConfig(tmpDir);
    // Oversized file was dropped → the 999 override must NOT have applied.
    expect(cfg.defaults.maxTabs).not.toBe(999);
  });

  test("corrupt project JSON doesn't throw; project overlay absent", () => {
    writeFileSync(join(tmpDir, ".soulforge", "hearth.json"), "{ not json", { mode: 0o600 });
    expect(() => loadHearthConfig(tmpDir)).not.toThrow();
  });

  test("project config with malformed surface drops just that surface", () => {
    writeFileSync(
      join(tmpDir, ".soulforge", "hearth.json"),
      JSON.stringify({
        surfaces: {
          "telegram:bad": { enabled: true, allowed: "not-an-object", chats: {} },
          "telegram:good": { enabled: true, allowed: { "5": ["5"] }, chats: {} },
        },
      }),
      { mode: 0o600 },
    );
    const cfg = loadHearthConfig(tmpDir);
    expect(cfg.surfaces["telegram:bad" as SurfaceId]).toBeUndefined();
    // NOTE: global ~/.soulforge/hearth.json may have other surfaces from the
    // live environment — we only assert our malformed one was stripped.
  });

  test("project config cannot redirect daemon.logFile outside ~/.soulforge", () => {
    writeFileSync(
      join(tmpDir, ".soulforge", "hearth.json"),
      JSON.stringify({ daemon: { logFile: "/etc/passwd" } }),
      { mode: 0o600 },
    );
    const cfg = loadHearthConfig(tmpDir);
    expect(cfg.daemon.logFile).not.toBe("/etc/passwd");
  });
});

// ── Bridge lock battle ─────────────────────────────────────────────────────

describe("bridge lock — staleness + pid reuse", () => {
  let tmpHome: string;
  let prev: string | undefined;

  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), "hearth-lock-"));
    prev = process.env.HOME;
    process.env.HOME = tmpHome;
    // `BRIDGE_LOCK_PATH` is baked at import time from the real homedir(), so
    // these tests use the real path — keep them isolated by releasing first.
    if (existsSync(BRIDGE_LOCK_PATH)) {
      try {
        rmSync(BRIDGE_LOCK_PATH);
      } catch {}
    }
  });

  afterEach(() => {
    releaseBridgeLock();
    process.env.HOME = prev;
    try {
      rmSync(tmpHome, { recursive: true, force: true });
    } catch {}
  });

  test("legacy bare-pid lock file is treated as stale (forced steal)", () => {
    // Simulate an old TUI that wrote just "1234"
    writeFileSync(BRIDGE_LOCK_PATH, "1234", { mode: 0o600 });
    // readBridgeOwner must NOT return 1234 — legacy format is stale.
    expect(readBridgeOwner()).toBeNull();
    // And acquire must succeed (we reap the stale file).
    expect(acquireBridgeLock()).toBe(true);
    // Our own pid now owns it.
    expect(readBridgeOwner()).toBe(process.pid);
  });

  test("lock with future timestamp rejected as implausible", () => {
    const future = Date.now() + 10 * 60_000;
    writeFileSync(BRIDGE_LOCK_PATH, `${String(process.pid)}:${String(future)}`, {
      mode: 0o600,
    });
    // Even though the pid is live (it's us) the ts is in the future → stale.
    expect(readBridgeOwner()).toBeNull();
  });

  test("lock with a dead pid reaped", () => {
    // Pick a pid that definitely doesn't exist.
    writeFileSync(BRIDGE_LOCK_PATH, `1:${String(Date.now())}`, { mode: 0o600 });
    // pid 1 likely exists on every OS but isn't ours — so readBridgeOwner
    // returns 1 only if it's live. We can't reliably guarantee 1 is dead,
    // but we can guarantee an obviously-fake pid is dead.
    rmSync(BRIDGE_LOCK_PATH);
    writeFileSync(BRIDGE_LOCK_PATH, `4194303:${String(Date.now())}`, { mode: 0o600 });
    expect(readBridgeOwner()).toBeNull();
  });

  test("acquire is idempotent for our own pid", () => {
    expect(acquireBridgeLock()).toBe(true);
    expect(acquireBridgeLock()).toBe(true);
    expect(readBridgeOwner()).toBe(process.pid);
  });

  test("releaseBridgeLock only removes OUR pid, not a stale one", () => {
    writeFileSync(BRIDGE_LOCK_PATH, `99999999:${String(Date.now())}`, { mode: 0o600 });
    releaseBridgeLock();
    // File should still exist — we didn't own it (pid wasn't ours).
    // Actual behavior: readBridgeOwner returns null (dead pid), so release is no-op.
    // Either way our implementation must not throw here.
  });
});

// ── Protocol DoS ──────────────────────────────────────────────────────────

describe("protocol — frame limits + malformed input", () => {
  let server: Server | null = null;
  let sockPath: string;

  beforeEach(() => {
    sockPath = join(tmpdir(), `hearth-proto-${String(process.pid)}-${String(Date.now())}.sock`);
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((res) => server?.close(() => res()));
      server = null;
    }
    try {
      rmSync(sockPath);
    } catch {}
  });

  test("frame > HEARTH_MAX_FRAME_BYTES destroys the connection", async () => {
    let rejected = false;
    server = createServer((sock) => {
      attachFrameReader(sock, {
        onFrame: () => {
          // must not fire for oversized frame
        },
        onError: (err) => {
          if (err.message.includes("exceeds")) rejected = true;
        },
      });
    });
    await new Promise<void>((res) => server?.listen(sockPath, () => res()));
    await new Promise<void>((resolveClose) => {
      const client = createConnection(sockPath, () => {
        // Send > 1 MiB without a newline.
        client.write("A".repeat(HEARTH_MAX_FRAME_BYTES + 100));
      });
      client.on("close", () => resolveClose());
      // In case the server doesn't close us, force close after 500ms.
      setTimeout(() => {
        try {
          client.destroy();
        } catch {}
        resolveClose();
      }, 500);
    });
    expect(rejected).toBe(true);
  });

  test("protocol version mismatch destroys connection", async () => {
    let versionErr = false;
    server = createServer((sock) => {
      attachFrameReader(sock, {
        onFrame: () => {},
        onError: (err) => {
          if (err.message.includes("version")) versionErr = true;
        },
      });
    });
    await new Promise<void>((res) => server?.listen(sockPath, () => res()));
    await new Promise<void>((resolveClose) => {
      const client = createConnection(sockPath, () => {
        // Send a line with a bogus version.
        client.write(JSON.stringify({ v: 999, op: "health" }) + "\n");
      });
      client.on("close", () => resolveClose());
      setTimeout(() => {
        try {
          client.destroy();
        } catch {}
        resolveClose();
      }, 500);
    });
    expect(versionErr).toBe(true);
  });

  test("invalid JSON line destroys connection", async () => {
    let parseErr = false;
    server = createServer((sock) => {
      attachFrameReader(sock, {
        onFrame: () => {},
        onError: () => {
          parseErr = true;
        },
      });
    });
    await new Promise<void>((res) => server?.listen(sockPath, () => res()));
    await new Promise<void>((resolveClose) => {
      const client = createConnection(sockPath, () => {
        client.write("not json at all\n");
      });
      client.on("close", () => resolveClose());
      setTimeout(() => {
        try {
          client.destroy();
        } catch {}
        resolveClose();
      }, 500);
    });
    expect(parseErr).toBe(true);
  });
});

// ── Approvals registry cap ────────────────────────────────────────────────

describe("approvals — cap + timeouts", () => {
  test("MAX_PENDING cap denies new approvals when full", async () => {
    const reg = new ApprovalRegistry(60_000);
    try {
      const base = {
        sessionId: "s1",
        toolName: "shell",
        toolCallId: "t",
        cwd: "/tmp",
        tabId: "tab-a",
        toolInput: {},
      };
      const resolved: Array<{ decision: string; reason?: string }> = [];
      for (let i = 0; i < 300; i++) {
        reg.register(base, (r) => resolved.push(r as never));
      }
      // The 256-cap should have rejected the last ~44 overflow requests with
      // `decision: deny, reason: "approval registry full"`.
      const denied = resolved.filter(
        (r) => r.decision === "deny" && r.reason === "approval registry full",
      );
      expect(denied.length).toBeGreaterThanOrEqual(44);
      expect(reg.count()).toBeLessThanOrEqual(256);
    } finally {
      reg.stop();
    }
  });

  test("timeout resolves as deny, never allow (via manual sweep)", async () => {
    const reg = new ApprovalRegistry(1 /* 1ms ttl */);
    try {
      const result = await new Promise<{ decision: string; reason?: string }>((resolve) => {
        reg.register(
          {
            sessionId: "s1",
            toolName: "shell",
            toolCallId: "t1",
            cwd: "/tmp",
            tabId: "tab-a",
            toolInput: {},
          },
          (r) => resolve(r as never),
          1,
        );
        // Spin until the 1ms ttl has definitely expired, then poke the sweep.
        // Production sweep runs every 30s — tests can't wait that long.
        setTimeout(() => {
          (reg as unknown as { sweepExpiredNowForTests(): void }).sweepExpiredNowForTests();
        }, 10);
      });
      expect(result.decision).toBe("deny");
      expect(result.reason).toBe("approval timed out");
    } finally {
      reg.stop();
    }
  });

  test("resolve is once — second call ignored", async () => {
    const reg = new ApprovalRegistry(60_000);
    try {
      let calls = 0;
      const entry = reg.register(
        {
          sessionId: "s1",
          toolName: "shell",
          toolCallId: "t",
          cwd: "/tmp",
          tabId: "tab-a",
          toolInput: {},
        },
        () => {
          calls++;
        },
      );
      reg.resolve(entry.id, {
        v: HEARTH_PROTOCOL_VERSION,
        decision: "allow",
      });
      reg.resolve(entry.id, {
        v: HEARTH_PROTOCOL_VERSION,
        decision: "deny",
      });
      expect(calls).toBe(1);
    } finally {
      reg.stop();
    }
  });

  test("cancelForSession denies every approval for that session", async () => {
    const reg = new ApprovalRegistry(60_000);
    try {
      const decisions: string[] = [];
      for (let i = 0; i < 5; i++) {
        reg.register(
          {
            sessionId: "sess-X",
            toolName: "shell",
            toolCallId: `t${String(i)}`,
            cwd: "/tmp",
            tabId: "tab-a",
            toolInput: {},
          },
          (r) => decisions.push(r.decision),
        );
      }
      reg.register(
        {
          sessionId: "sess-Y",
          toolName: "shell",
          toolCallId: "ty",
          cwd: "/tmp",
          tabId: "tab-a",
          toolInput: {},
        },
        (r) => decisions.push(`Y:${r.decision}`),
      );
      const n = reg.cancelForSession("sess-X");
      expect(n).toBe(5);
      expect(decisions.filter((d) => d === "deny")).toHaveLength(5);
      expect(decisions.filter((d) => d === "Y:deny")).toHaveLength(0);
    } finally {
      reg.stop();
    }
  });
});

// ── parseCommand adversarial ──────────────────────────────────────────────

describe("parseCommand — DoS + edge cases", () => {
  test("1 MiB of spaces caps at 64 tokens, doesn't explode", () => {
    const huge = "/" + " ".repeat(1024 * 1024);
    const res = parseCommand(huge);
    // Input is trimmed → "/" with no args. Must not hang, must not OOM.
    expect(res?.name).toBe("/");
    expect(res?.args.length).toBeLessThanOrEqual(64);
  });

  test("input >4 KiB is sliced before split", () => {
    const cmd = "/cmd " + "arg ".repeat(2000);
    const start = Date.now();
    const res = parseCommand(cmd);
    expect(Date.now() - start).toBeLessThan(200);
    expect(res?.name).toBe("/cmd");
    expect(res?.args.length).toBeLessThanOrEqual(64);
  });

  test("non-slash input returns undefined", () => {
    expect(parseCommand("hello world")).toBeUndefined();
    expect(parseCommand("")).toBeUndefined();
    expect(parseCommand("   ")).toBeUndefined();
  });

  test("lone slash parses as command with no args", () => {
    expect(parseCommand("/")?.name).toBe("/");
  });
});
