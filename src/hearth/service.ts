/**
 * Persistent-daemon service management. Installs / removes the platform-native
 * auto-start unit so `hearth start` survives reboot without manual launchctl /
 * systemctl dance.
 *
 * macOS: LaunchAgent plist under ~/Library/LaunchAgents/dev.soulforge.hearth.plist.
 *   Loaded via `launchctl bootstrap gui/<uid>` (modern) with `launchctl load`
 *   fallback for older macOS.
 *
 * Linux: systemd --user unit under ~/.config/systemd/user/soulforge-hearth.service.
 *   Enabled + started via `systemctl --user`. Requires lingering for boot-time
 *   start (loginctl enable-linger), which we note but don't auto-toggle.
 *
 * Windows: unsupported (daemon not targeted for Windows yet).
 *
 * No shell injection: we write a literal config file with escaped paths, and
 * invoke launchctl/systemctl with fixed argv arrays.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, platform, userInfo } from "node:os";
import { join } from "node:path";

export type ServicePlatform = "darwin" | "linux" | "unsupported";

export interface ServiceStatus {
  platform: ServicePlatform;
  installed: boolean;
  unitPath: string;
  unitLabel: string;
  /** Best-effort — whether the unit is currently loaded/active. */
  active?: boolean;
  /** Last error from install/uninstall/status, if any. */
  error?: string;
}

export interface InstallOptions {
  /** Absolute path to the `soulforge` (or `bun`) binary. */
  cmd: string;
  /** Args appended to cmd. E.g. ["hearth", "start"] or ["<checkout>/src/boot.tsx", "hearth", "start"]. */
  args: string[];
  /** Where to send stdout/stderr. */
  logPath?: string;
  /** Where to send errors separately (default: alongside logPath). */
  errPath?: string;
}

export const MACOS_LABEL = "dev.soulforge.hearth";
export const LINUX_UNIT_NAME = "soulforge-hearth.service";

function currentPlatform(): ServicePlatform {
  const p = platform();
  if (p === "darwin") return "darwin";
  if (p === "linux") return "linux";
  return "unsupported";
}

function macosPlistPath(): string {
  return join(homedir(), "Library", "LaunchAgents", `${MACOS_LABEL}.plist`);
}

function linuxUnitPath(): string {
  return join(homedir(), ".config", "systemd", "user", LINUX_UNIT_NAME);
}

function defaultLogPath(): string {
  return join(homedir(), ".soulforge", "hearth.log");
}

function defaultErrPath(): string {
  return join(homedir(), ".soulforge", "hearth.err");
}

/** XML-escape a string for inclusion in an Apple plist. */
function plistEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Escape a value for a systemd unit key-value line. Systemd handles single-line strings. */
function systemdEscape(s: string): string {
  // systemd: backslashes → \\, no special quoting for our use case.
  return s.replace(/\\/g, "\\\\");
}

/** Run a command with argv array, no shell. Returns {code, stdout, stderr}. */
function runCmd(
  cmd: string,
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    proc.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    proc.on("error", (err) => resolve({ code: 1, stdout, stderr: err.message }));
  });
}

function buildMacosPlist(opts: InstallOptions): string {
  const logPath = opts.logPath ?? defaultLogPath();
  const errPath = opts.errPath ?? defaultErrPath();
  const programArgs = [opts.cmd, ...opts.args];
  const argsXml = programArgs.map((a) => `    <string>${plistEscape(a)}</string>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${plistEscape(MACOS_LABEL)}</string>
  <key>ProgramArguments</key>
  <array>
${argsXml}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>${plistEscape(logPath)}</string>
  <key>StandardErrorPath</key>
  <string>${plistEscape(errPath)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>TERM</key>
    <string>dumb</string>
    <key>NO_COLOR</key>
    <string>1</string>
    <key>SOULFORGE_NO_TTY</key>
    <string>1</string>
  </dict>
</dict>
</plist>
`;
}

function buildLinuxUnit(opts: InstallOptions): string {
  const logPath = opts.logPath ?? defaultLogPath();
  const errPath = opts.errPath ?? defaultErrPath();
  const execStart = [opts.cmd, ...opts.args].map(systemdEscape).join(" ");
  return `[Unit]
Description=SoulForge Hearth daemon (remote surface bridge)
After=network.target

[Service]
Type=simple
ExecStart=${execStart}
Restart=on-failure
RestartSec=10
StandardOutput=append:${systemdEscape(logPath)}
StandardError=append:${systemdEscape(errPath)}
Environment=TERM=dumb NO_COLOR=1 SOULFORGE_NO_TTY=1

[Install]
WantedBy=default.target
`;
}

/** Install and enable the persistent service. Returns the final status. */
export async function installService(opts: InstallOptions): Promise<ServiceStatus> {
  const plat = currentPlatform();

  if (plat === "darwin") {
    const plistPath = macosPlistPath();
    try {
      mkdirSync(join(homedir(), "Library", "LaunchAgents"), { recursive: true });
      writeFileSync(plistPath, buildMacosPlist(opts), { mode: 0o600 });

      // Unload first (idempotent — ignore failure) then load/bootstrap.
      const uid = userInfo().uid;
      const domain = `gui/${String(uid)}`;
      await runCmd("launchctl", ["bootout", domain, plistPath]);
      const boot = await runCmd("launchctl", ["bootstrap", domain, plistPath]);
      if (boot.code !== 0) {
        // Old macOS — fall back to launchctl load.
        const load = await runCmd("launchctl", ["load", "-w", plistPath]);
        if (load.code !== 0) {
          return {
            platform: plat,
            installed: true,
            unitPath: plistPath,
            unitLabel: MACOS_LABEL,
            error: `bootstrap failed: ${boot.stderr || boot.stdout}; load fallback: ${load.stderr || load.stdout}`,
          };
        }
      }
      return {
        platform: plat,
        installed: true,
        unitPath: plistPath,
        unitLabel: MACOS_LABEL,
        active: true,
      };
    } catch (err) {
      return {
        platform: plat,
        installed: existsSync(plistPath),
        unitPath: plistPath,
        unitLabel: MACOS_LABEL,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  if (plat === "linux") {
    const unitPath = linuxUnitPath();
    try {
      mkdirSync(join(homedir(), ".config", "systemd", "user"), { recursive: true });
      writeFileSync(unitPath, buildLinuxUnit(opts), { mode: 0o600 });

      await runCmd("systemctl", ["--user", "daemon-reload"]);
      const enable = await runCmd("systemctl", ["--user", "enable", "--now", LINUX_UNIT_NAME]);
      if (enable.code !== 0) {
        return {
          platform: plat,
          installed: true,
          unitPath,
          unitLabel: LINUX_UNIT_NAME,
          error: `systemctl enable failed: ${enable.stderr || enable.stdout}`,
        };
      }
      return {
        platform: plat,
        installed: true,
        unitPath,
        unitLabel: LINUX_UNIT_NAME,
        active: true,
      };
    } catch (err) {
      return {
        platform: plat,
        installed: existsSync(unitPath),
        unitPath,
        unitLabel: LINUX_UNIT_NAME,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return {
    platform: plat,
    installed: false,
    unitPath: "",
    unitLabel: "",
    error: "persistent service not supported on this platform",
  };
}

/** Disable + remove the persistent service unit. Daemon itself is left alone. */
export async function uninstallService(): Promise<ServiceStatus> {
  const plat = currentPlatform();

  if (plat === "darwin") {
    const plistPath = macosPlistPath();
    try {
      const uid = userInfo().uid;
      const domain = `gui/${String(uid)}`;
      await runCmd("launchctl", ["bootout", domain, plistPath]);
      // Old macOS fallback
      await runCmd("launchctl", ["unload", "-w", plistPath]);
      if (existsSync(plistPath)) unlinkSync(plistPath);
      return {
        platform: plat,
        installed: false,
        unitPath: plistPath,
        unitLabel: MACOS_LABEL,
        active: false,
      };
    } catch (err) {
      return {
        platform: plat,
        installed: existsSync(plistPath),
        unitPath: plistPath,
        unitLabel: MACOS_LABEL,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  if (plat === "linux") {
    const unitPath = linuxUnitPath();
    try {
      await runCmd("systemctl", ["--user", "disable", "--now", LINUX_UNIT_NAME]);
      if (existsSync(unitPath)) unlinkSync(unitPath);
      await runCmd("systemctl", ["--user", "daemon-reload"]);
      return {
        platform: plat,
        installed: false,
        unitPath,
        unitLabel: LINUX_UNIT_NAME,
        active: false,
      };
    } catch (err) {
      return {
        platform: plat,
        installed: existsSync(unitPath),
        unitPath,
        unitLabel: LINUX_UNIT_NAME,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return {
    platform: plat,
    installed: false,
    unitPath: "",
    unitLabel: "",
    error: "persistent service not supported on this platform",
  };
}

/** Read current state without mutation. */
export async function getServiceStatus(): Promise<ServiceStatus> {
  const plat = currentPlatform();

  if (plat === "darwin") {
    const plistPath = macosPlistPath();
    const installed = existsSync(plistPath);
    if (!installed) {
      return { platform: plat, installed: false, unitPath: plistPath, unitLabel: MACOS_LABEL };
    }
    const uid = userInfo().uid;
    const list = await runCmd("launchctl", ["print", `gui/${String(uid)}/${MACOS_LABEL}`]);
    const active = list.code === 0 && /state = running/i.test(list.stdout);
    return { platform: plat, installed, unitPath: plistPath, unitLabel: MACOS_LABEL, active };
  }

  if (plat === "linux") {
    const unitPath = linuxUnitPath();
    const installed = existsSync(unitPath);
    if (!installed) {
      return { platform: plat, installed: false, unitPath, unitLabel: LINUX_UNIT_NAME };
    }
    const check = await runCmd("systemctl", ["--user", "is-active", LINUX_UNIT_NAME]);
    const active = check.code === 0 && check.stdout.trim() === "active";
    return { platform: plat, installed, unitPath, unitLabel: LINUX_UNIT_NAME, active };
  }

  return { platform: plat, installed: false, unitPath: "", unitLabel: "" };
}
