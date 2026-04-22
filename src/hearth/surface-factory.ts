/**
 * Factory that turns a HearthConfig's `surfaces` map into live Surface instances.
 * Shared by the CLI (`soulforge hearth start`) and the daemon's live-reload path
 * so both paths produce identically-configured adapters.
 */

import { DiscordSurface } from "./adapters/discord.js";
import { FakechatSurface } from "./adapters/fakechat.js";
import { TelegramSurface } from "./adapters/telegram.js";
import type { HearthConfig, Surface, SurfaceId } from "./types.js";

export interface BuildSurfacesResult {
  surfaces: Surface[];
  errors: { id: SurfaceId; error: string }[];
}

export function buildSurfacesFromConfig(
  config: HearthConfig,
  onLog?: (line: string) => void,
): BuildSurfacesResult {
  const out: Surface[] = [];
  const errors: { id: SurfaceId; error: string }[] = [];
  for (const [surfaceId, cfg] of Object.entries(config.surfaces)) {
    if (!cfg.enabled) continue;
    const [kind, id] = surfaceId.split(":") as [string, string];
    if (!kind || !id) continue;
    try {
      if (kind === "telegram") {
        const allowed: Record<string, number[]> = {};
        for (const [chatId, userIds] of Object.entries(cfg.allowed ?? {})) {
          const parsed: number[] = [];
          for (const raw of userIds) {
            const n = Number.parseInt(raw, 10);
            if (Number.isNaN(n)) {
              // M7: loudly drop non-numeric Telegram allowlist entries so
              // typos don't silently produce an empty — and after H1,
              // default-deny — allowlist the user can't diagnose.
              onLog?.(
                `telegram:${id} allowlist: dropping non-numeric id "${raw}" for chat ${chatId}`,
              );
              continue;
            }
            parsed.push(n);
          }
          allowed[chatId] = parsed;
          if (parsed.length === 0) {
            onLog?.(
              `telegram:${id} allowlist for chat ${chatId} is empty — chat will reject all messages (default-deny)`,
            );
          }
        }
        out.push(new TelegramSurface({ botId: id, allowedUserIdsByChat: allowed, log: onLog }));
      } else if (kind === "discord") {
        const allowed: Record<string, string[]> = {};
        for (const [chId, userIds] of Object.entries(cfg.allowed ?? {})) {
          allowed[chId] = userIds;
          if (userIds.length === 0) {
            onLog?.(
              `discord:${id} allowlist for channel ${chId} is empty — channel will reject all messages (default-deny)`,
            );
          }
        }
        out.push(new DiscordSurface({ appId: id, allowedUserIdsByChannel: allowed, log: onLog }));
      } else if (kind === "fakechat") {
        out.push(new FakechatSurface(`fakechat:${id}` as SurfaceId));
      }
    } catch (err) {
      errors.push({
        id: surfaceId as SurfaceId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { surfaces: out, errors };
}
