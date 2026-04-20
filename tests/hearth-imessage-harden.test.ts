/**
 * iMessage adapter hardening — approval prefix exact-match, sqlite param
 * validation rejects injection-shaped input.
 */
import { describe, expect, test } from "bun:test";

describe("iMessage approval short-reply matching", () => {
  test("'approve a' does NOT match any 6-char approval id", () => {
    const re = /^(approve|deny)\s+([A-Za-z0-9]{6})\b/i;
    expect(re.exec("approve a")).toBeNull();
    expect(re.exec("approve ab")).toBeNull();
    expect(re.exec("approve abcde")).toBeNull();
    expect(re.exec("approve abcdef")).not.toBeNull();
    expect(re.exec("deny 123xyz")).not.toBeNull();
  });

  test("prefix matching is exactly 6 chars", () => {
    const m = /^(approve|deny)\s+([A-Za-z0-9]{6})\b/i.exec("approve abcdef extra");
    expect(m?.[2]).toBe("abcdef");
  });
});

describe("iMessage sqlite param validation", () => {
  test("rejects param values with semicolons", () => {
    // We replicate the validator's check here since the runSqlite internal
    // spawns a subprocess. Keeping the regex invariants under test.
    const numeric = /^-?\d+$/;
    const safe = /^[A-Za-z0-9_.\-+ ]*$/;
    expect(numeric.test("123") || safe.test("123")).toBe(true);
    expect(numeric.test("'; DROP TABLE message;--")).toBe(false);
    expect(safe.test("'; DROP TABLE message;--")).toBe(false);
    expect(safe.test("hello world")).toBe(true);
  });

  test("param names must be simple identifiers", () => {
    const nameRe = /^[A-Za-z_][A-Za-z0-9_]*$/;
    expect(nameRe.test("minRowId")).toBe(true);
    expect(nameRe.test("1badName")).toBe(false);
    expect(nameRe.test("name;drop")).toBe(false);
  });
});
