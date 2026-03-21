import type { Session, Result } from "./types.js";
import { getUser } from "./db.js";

const sessions = new Map<string, Session>();

export function login(email: string, password: string): Result<Session> {
  const users = [...(globalThis as any).__users?.values() ?? []];
  const user = users.find((u: any) => u.email === email);
  if (!user) return { ok: false, error: "user not found" };

  const session: Session = {
    token: Math.random().toString(36).slice(2),
    userId: user.id,
    expiresAt: Date.now() + 3600000,
  };
  sessions.set(session.token, session);
  return { ok: true, data: session };
}

export function verify(token: string): Result<Session> {
  const s = sessions.get(token);
  if (!s) return { ok: false, error: "invalid token" };
  if (s.expiresAt < Date.now()) {
    sessions.delete(token);
    return { ok: false, error: "expired" };
  }
  return { ok: true, data: s };
}

export function logout(token: string) {
  sessions.delete(token);
}

export function requireAdmin(token: string): Result<null> {
  const s = verify(token);
  if (!s.ok) return s;
  const user = getUser(s.data.userId);
  if (!user || user.role !== "admin") return { ok: false, error: "forbidden" };
  return { ok: true, data: null };
}
