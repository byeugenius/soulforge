import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PKG_NAME = "@proxysoul/soulforge";
const CONFIG_DIR = join(homedir(), ".soulforge");
const VERSION_CACHE_FILE = join(CONFIG_DIR, "version-cache.json");
const CACHE_TTL = 30 * 60 * 1000; // 30 min
const DISMISSED_FILE = join(CONFIG_DIR, "update-dismissed.json");

// ── Current version ──────────────────────────────────────────────────
// Read from package.json at import time. Works in dev (bun run) and
// in compiled binaries (Bun embeds JSON imports).

let _currentVersion = "0.0.0";
try {
  // In dev mode, resolve relative to this file's directory
  const pkgPath = join(import.meta.dir, "..", "..", "package.json");
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    _currentVersion = pkg.version ?? "0.0.0";
  }
} catch {}

export const CURRENT_VERSION: string = _currentVersion;

// ── Install method detection ─────────────────────────────────────────

export type InstallMethod = "npm" | "pnpm" | "yarn" | "bun" | "brew" | "binary" | "unknown";

export function detectInstallMethod(): InstallMethod {
  try {
    const execPath = process.argv[0] ?? "";
    const moduleUrl = import.meta.url;

    // Compiled binary (bun --compile)
    if (moduleUrl.includes("$bunfs")) return "binary";

    // Homebrew
    if (execPath.includes("/Cellar/") || execPath.includes("/homebrew/")) return "brew";

    // Check if running from a global node_modules
    const dir = import.meta.dir;
    if (dir.includes("/pnpm/")) return "pnpm";
    if (dir.includes("/.bun/")) return "bun";
    if (dir.includes("/yarn/")) return "yarn";
    if (dir.includes("/npm/") || dir.includes("/node_modules/")) return "npm";

    // Fallback: check npm_config_user_agent
    const ua = process.env.npm_config_user_agent ?? "";
    if (ua.startsWith("pnpm/")) return "pnpm";
    if (ua.startsWith("yarn/")) return "yarn";
    if (ua.startsWith("bun/")) return "bun";
    if (ua.startsWith("npm/")) return "npm";
  } catch {}
  return "unknown";
}

export function getUpgradeCommand(method?: InstallMethod): string {
  const m = method ?? detectInstallMethod();
  switch (m) {
    case "npm":
      return `npm update -g ${PKG_NAME}`;
    case "pnpm":
      return `pnpm update -g ${PKG_NAME}`;
    case "yarn":
      return `yarn global upgrade ${PKG_NAME}`;
    case "bun":
      return `bun update -g ${PKG_NAME}`;
    case "brew":
      return "brew upgrade soulforge";
    case "binary":
      return "Download the latest release from GitHub";
    default:
      return `npm update -g ${PKG_NAME}`;
  }
}

/** Split upgrade command into [binary, ...args] for spawn. */
export function getUpgradeArgs(method?: InstallMethod): { command: string; args: string[] } | null {
  const m = method ?? detectInstallMethod();
  switch (m) {
    case "npm":
      return { command: "npm", args: ["update", "-g", PKG_NAME] };
    case "pnpm":
      return { command: "pnpm", args: ["update", "-g", PKG_NAME] };
    case "yarn":
      return { command: "yarn", args: ["global", "upgrade", PKG_NAME] };
    case "bun":
      return { command: "bun", args: ["update", "-g", PKG_NAME] };
    case "brew":
      return { command: "brew", args: ["upgrade", "soulforge"] };
    case "binary":
      return null;
    default:
      return { command: "npm", args: ["update", "-g", PKG_NAME] };
  }
}

// ── Perform upgrade ──────────────────────────────────────────────────

export interface UpgradeResult {
  ok: boolean;
  output: string;
  error?: string;
}

export async function performUpgrade(
  method?: InstallMethod,
  onStatus?: (msg: string) => void,
): Promise<UpgradeResult> {
  const { spawn } = await import("node:child_process");
  const args = getUpgradeArgs(method);

  if (!args) {
    return {
      ok: false,
      output: "",
      error: "Cannot auto-upgrade binary installs. Download the latest release from GitHub.",
    };
  }

  onStatus?.(`Running: ${args.command} ${args.args.join(" ")}…`);

  return new Promise((resolve) => {
    const chunks: string[] = [];
    const proc = spawn(args.command, args.args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    proc.stdout?.on("data", (data: Buffer) => {
      const line = data.toString().trim();
      if (line) {
        chunks.push(line);
        onStatus?.(line);
      }
    });

    proc.stderr?.on("data", (data: Buffer) => {
      const line = data.toString().trim();
      if (line) {
        chunks.push(line);
        onStatus?.(line);
      }
    });

    const timeout = setTimeout(() => {
      proc.kill();
      resolve({ ok: false, output: chunks.join("\n"), error: "Upgrade timed out after 60s" });
    }, 60_000);

    proc.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve({ ok: true, output: chunks.join("\n") });
      } else {
        resolve({ ok: false, output: chunks.join("\n"), error: `Exit code ${code}` });
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      resolve({ ok: false, output: chunks.join("\n"), error: err.message });
    });
  });
}

// ── Version cache ────────────────────────────────────────────────────

interface VersionCache {
  latest: string;
  changelog: string[];
  checkedAt: number;
}

function readCache(): VersionCache | null {
  try {
    if (!existsSync(VERSION_CACHE_FILE)) return null;
    const data = JSON.parse(readFileSync(VERSION_CACHE_FILE, "utf-8")) as VersionCache;
    if (Date.now() - data.checkedAt > CACHE_TTL) return null;
    return data;
  } catch {
    return null;
  }
}

function writeCache(cache: VersionCache): void {
  try {
    if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(VERSION_CACHE_FILE, JSON.stringify(cache));
  } catch {}
}

// ── Dismissed version tracking ───────────────────────────────────────

interface DismissedInfo {
  version: string;
  dismissedAt: number;
}

export function isDismissed(version: string): boolean {
  try {
    if (!existsSync(DISMISSED_FILE)) return false;
    const data = JSON.parse(readFileSync(DISMISSED_FILE, "utf-8")) as DismissedInfo;
    return data.version === version;
  } catch {
    return false;
  }
}

export function dismissVersion(version: string): void {
  try {
    if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(DISMISSED_FILE, JSON.stringify({ version, dismissedAt: Date.now() }));
  } catch {}
}

// ── Semver comparison ────────────────────────────────────────────────

function parseVersion(v: string): number[] {
  return v
    .replace(/^v/, "")
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
}

export function isNewer(latest: string, current: string): boolean {
  const l = parseVersion(latest);
  const c = parseVersion(current);
  for (let i = 0; i < 3; i++) {
    if ((l[i] ?? 0) > (c[i] ?? 0)) return true;
    if ((l[i] ?? 0) < (c[i] ?? 0)) return false;
  }
  return false;
}

// ── Fetch latest version from npm ────────────────────────────────────

export interface VersionCheckResult {
  current: string;
  latest: string | null;
  changelog: string[];
  updateAvailable: boolean;
}

export async function checkForUpdate(): Promise<VersionCheckResult> {
  const current = CURRENT_VERSION;

  // Try cache first
  const cached = readCache();
  if (cached) {
    return {
      current,
      latest: cached.latest,
      changelog: cached.changelog,
      updateAvailable: isNewer(cached.latest, current),
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`https://registry.npmjs.org/${PKG_NAME}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timeout);

    if (!res.ok) return { current, latest: null, changelog: [], updateAvailable: false };

    const data = (await res.json()) as {
      "dist-tags"?: { latest?: string };
      versions?: Record<string, { description?: string }>;
    };

    const latest = data["dist-tags"]?.latest ?? null;
    if (!latest) return { current, latest: null, changelog: [], updateAvailable: false };

    // Build a simple changelog from version descriptions or just list versions
    const changelog: string[] = [];
    if (data.versions) {
      const versions = Object.keys(data.versions)
        .filter((v) => isNewer(v, current))
        .sort((a, b) => {
          const pa = parseVersion(a);
          const pb = parseVersion(b);
          for (let i = 0; i < 3; i++) {
            if ((pb[i] ?? 0) !== (pa[i] ?? 0)) return (pb[i] ?? 0) - (pa[i] ?? 0);
          }
          return 0;
        })
        .slice(0, 10);
      for (const v of versions) {
        changelog.push(`v${v}`);
      }
    }

    writeCache({ latest, changelog, checkedAt: Date.now() });

    return {
      current,
      latest,
      changelog,
      updateAvailable: isNewer(latest, current),
    };
  } catch {
    return { current, latest: null, changelog: [], updateAvailable: false };
  }
}
