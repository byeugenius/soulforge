/**
 * Pairing-code registry — short-lived 6-character codes that bind a freshly
 * authenticated chat to an existing surface. The user runs the daemon, the
 * daemon prints/sends a code, and the user types it on the trusted side.
 *
 * Codes are derived from crypto.randomBytes — never timestamps. TTL keeps
 * old codes from being reused; one-shot resolves keep the surface idempotent.
 */

import { randomBytes, randomInt } from "node:crypto";
import type { ExternalChatId, PairingCode, SurfaceId } from "./types.js";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/I/1

export function generatePairingCode(length = 6): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    const byte = bytes[i] ?? 0;
    out += ALPHABET[byte % ALPHABET.length];
  }
  return out;
}

export class PairingRegistry {
  private codes = new Map<string, PairingCode>();
  /** Per-(surface|externalId) failed-attempt counter. Locks out after
   *  `maxFailures` for `lockoutMs`. Prevents brute-forcing 6-char codes
   *  over the TTL window (30 bits = 1e9 search space — still cap it). */
  private failures = new Map<string, { count: number; lockedUntil: number }>();
  private readonly maxFailures = 5;
  private readonly lockoutMs = 10 * 60_000;

  constructor(private ttlMs: number) {}

  issue(surfaceId: SurfaceId, externalId: ExternalChatId): PairingCode {
    const code = generatePairingCode();
    const now = Date.now();
    const entry: PairingCode = {
      code,
      surfaceId,
      externalId,
      createdAt: now,
      expiresAt: now + this.ttlMs,
    };
    this.codes.set(code, entry);
    return entry;
  }

  /** Redeem a code. Returns the PairingCode on success, null otherwise.
   *  Counts failures per surface+chat and locks the chat out after 5 bad
   *  attempts for 10 minutes. Successful consumption resets the counter. */
  consume(surfaceId: SurfaceId, code: string, attemptKey?: string): PairingCode | null {
    const key = attemptKey ? `${surfaceId}|${attemptKey}` : null;
    if (key) {
      const f = this.failures.get(key);
      if (f && f.lockedUntil > Date.now()) return null;
    }
    const upper = code.trim().toUpperCase();
    const entry = this.codes.get(upper);
    const bump = (): void => {
      if (!key) return;
      const now = Date.now();
      const f = this.failures.get(key) ?? { count: 0, lockedUntil: 0 };
      f.count++;
      if (f.count >= this.maxFailures) {
        f.lockedUntil = now + this.lockoutMs;
        f.count = 0;
      }
      this.failures.set(key, f);
    };
    if (!entry) {
      bump();
      return null;
    }
    if (entry.surfaceId !== surfaceId) {
      bump();
      return null;
    }
    if (entry.expiresAt < Date.now()) {
      this.codes.delete(upper);
      bump();
      return null;
    }
    this.codes.delete(upper);
    if (key) this.failures.delete(key);
    return entry;
  }

  /** True when the chat is currently locked out from further redeem attempts. */
  isLocked(surfaceId: SurfaceId, attemptKey: string): boolean {
    const f = this.failures.get(`${surfaceId}|${attemptKey}`);
    return !!f && f.lockedUntil > Date.now();
  }

  /** Drop expired entries and stale lockouts. */
  prune(): number {
    const now = Date.now();
    let n = 0;
    for (const [k, v] of this.codes) {
      if (v.expiresAt < now) {
        this.codes.delete(k);
        n++;
      }
    }
    for (const [k, f] of this.failures) {
      if (f.lockedUntil !== 0 && f.lockedUntil < now) this.failures.delete(k);
    }
    return n;
  }

  list(): PairingCode[] {
    return [...this.codes.values()];
  }

  /** Used by tests to seed deterministic codes. */
  injectForTests(entry: PairingCode): void {
    this.codes.set(entry.code, entry);
  }
}

/** Random nonce used for pairing handshakes that can't reuse the alphabet. */
export function randomNonceHex(bytes = 16): string {
  return randomBytes(bytes).toString("hex");
}

/** Numeric verification code (e.g. SMS-style fallback when the surface can't render text). */
export function randomNumericCode(digits = 6): string {
  let out = "";
  for (let i = 0; i < digits; i++) out += String(randomInt(0, 10));
  return out;
}
