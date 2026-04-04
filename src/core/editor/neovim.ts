import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { attach } from "neovim";
import type { NvimConfigMode } from "../../types/index.js";
import { trackProcess } from "../process-tracker.js";
import { NvimScreen } from "./screen.js";

export interface NvimInstance {
  api: ReturnType<typeof attach>;
  process: ChildProcess;
  screen: NvimScreen;
}

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;

/**
 * Launch an embedded neovim instance with UI attached.
 * We attach as a UI client and receive redraw events to render
 * the screen in our TUI.
 *
 * Flags:
 * - `--embed`: run as an embedded UI client (waits for nvim_ui_attach)
 * - `-i NONE`: skip ShaDa file (marks, registers, history — irrelevant for embedded use)
 */
let _onFileWritten: ((absPath: string) => void) | null = null;

export function setNeovimFileWrittenHandler(handler: (absPath: string) => void): void {
  _onFileWritten = handler;
}

export async function launchNeovim(
  nvimPath: string,
  cols: number = DEFAULT_COLS,
  rows: number = DEFAULT_ROWS,
  configMode: NvimConfigMode = "default",
): Promise<NvimInstance> {
  killBootstrap();

  let effectivePath = nvimPath;
  const args = ["--embed", "-i", "NONE"];

  const isBundled = import.meta.url.includes("$bunfs");
  const bundledInit = join(homedir(), ".soulforge", "init.lua");
  const devInit = join(import.meta.dir, "init.lua");
  const shippedInit = isBundled ? bundledInit : existsSync(devInit) ? devInit : bundledInit;

  switch (configMode) {
    case "none":
      args.push("-u", "NONE");
      break;
    case "default":
      if (existsSync(shippedInit)) {
        args.push("-u", shippedInit);
      }
      break;
    case "user": {
      const { findNvim } = await import("neovim");
      const systemResult = findNvim({ orderBy: "desc", minVersion: "0.11.0" });
      const systemNvim = systemResult.matches.find((m) => m.path && !m.path.includes(".soulforge"));
      if (systemNvim?.path) {
        effectivePath = systemNvim.path;
      }
      break;
    }
  }

  const env = configMode === "user" ? process.env : { ...process.env, NVIM_APPNAME: "soulforge" };

  const proc = spawn(effectivePath, args, {
    cwd: process.cwd(),
    stdio: ["pipe", "pipe", "pipe"],
    env,
  });
  trackProcess(proc);

  const api = attach({ proc });
  const screen = new NvimScreen(rows, cols);

  // Subscribe to notifications BEFORE ui_attach so we don't miss events
  api.on("notification", (method: string, args: unknown[]) => {
    if (method === "redraw") {
      screen.processEvents(args);
    } else if (method === "soulforge:file_written" && _onFileWritten) {
      const path = Array.isArray(args) ? args[0] : undefined;
      if (typeof path === "string" && path) _onFileWritten(path);
    }
  });

  // Attach as a UI client — neovim will start sending redraw events
  await api.request("nvim_ui_attach", [cols, rows, { ext_linegrid: true, rgb: true }]);

  return { api, process: proc, screen };
}

/**
 * Open a file in the embedded neovim instance.
 */
export async function openFile(nvim: NvimInstance, filePath: string): Promise<void> {
  await nvim.api.executeLua(
    "vim.cmd({cmd='edit', args={vim.fn.fnameescape(...)}, mods={silent=true}})",
    [filePath],
  );
}

/**
 * Get cursor position from neovim.
 */
export async function getCursorPosition(
  nvim: NvimInstance,
): Promise<{ line: number; col: number }> {
  const window = await nvim.api.window;
  const [line, col] = await window.cursor;
  return { line, col };
}

/**
 * Get current buffer name from neovim.
 */
export async function getBufferName(nvim: NvimInstance): Promise<string> {
  const result = await nvim.api.request("nvim_buf_get_name", [0]);
  return typeof result === "string" ? result : "";
}

/**
 * Get visual selection text from neovim.
 * Uses getpos('v') + getpos('.') which work during live visual mode,
 * unlike '< '> marks which only set after leaving visual.
 * Returns selected text or null if not in visual mode.
 */
export async function getVisualSelection(nvim: NvimInstance): Promise<string | null> {
  const lua = `
    local mode = vim.fn.mode()
    if mode ~= 'v' and mode ~= 'V' and mode ~= '\\22' then
      return nil
    end
    local vstart = vim.fn.getpos('v')
    local vend = vim.fn.getpos('.')
    local srow, scol = vstart[2], vstart[3]
    local erow, ecol = vend[2], vend[3]
    if srow > erow or (srow == erow and scol > ecol) then
      srow, scol, erow, ecol = erow, ecol, srow, scol
    end
    local lines = vim.api.nvim_buf_get_lines(0, srow - 1, erow, false)
    if #lines == 0 then return nil end
    if mode == 'V' then
      return table.concat(lines, '\\n')
    end
    if #lines == 1 then
      return lines[1]:sub(scol, ecol)
    end
    lines[1] = lines[1]:sub(scol)
    lines[#lines] = lines[#lines]:sub(1, ecol)
    return table.concat(lines, '\\n')
  `;
  try {
    const result = await nvim.api.executeLua(lua, []);
    return typeof result === "string" ? result : null;
  } catch {
    return null;
  }
}

let _bootstrapProc: ChildProcess | null = null;

/**
 * Kill the headless bootstrap if it's still running.
 * Called before launching the embedded editor to prevent concurrent lazy.nvim installs.
 * Removes partially-cloned plugin dirs so the embedded neovim gets a clean install.
 */
function killBootstrap(): void {
  if (_bootstrapProc) {
    try {
      _bootstrapProc.kill();
    } catch {}
    _bootstrapProc = null;
    const lazyDir = join(homedir(), ".local", "share", "soulforge", "lazy");
    try {
      rmSync(lazyDir, { recursive: true, force: true });
    } catch {}
  }
}

/**
 * Bootstrap lazy.nvim plugins + mason LSP servers in a headless neovim.
 * Fire-and-forget — runs in background so editor is ready when user opens it.
 * Skips if lazy.nvim data dir already exists (plugins already installed).
 * If user opens the editor before this finishes, it's killed (launchNeovim calls killBootstrap).
 */
export function bootstrapNeovimPlugins(nvimPath: string): void {
  const isBundled = import.meta.url.includes("$bunfs");
  const bundledInit = join(homedir(), ".soulforge", "init.lua");
  const devInit = join(import.meta.dir, "init.lua");
  const shippedInit = isBundled ? bundledInit : existsSync(devInit) ? devInit : bundledInit;

  if (!existsSync(shippedInit)) return;

  const dataDir = join(homedir(), ".local", "share", "soulforge");
  const lazyDir = join(dataDir, "lazy");
  if (existsSync(lazyDir)) return;

  const proc = spawn(
    nvimPath,
    [
      "--headless",
      "-i",
      "NONE",
      "-u",
      shippedInit,
      "+Lazy! install",
      "+MasonToolsInstallSync",
      "+qa",
    ],
    {
      cwd: process.cwd(),
      stdio: "ignore",
      detached: true,
      env: { ...process.env, NVIM_APPNAME: "soulforge" },
    },
  );
  proc.unref();
  _bootstrapProc = proc;
  proc.on("exit", () => {
    _bootstrapProc = null;
  });
}

/**
 * Shut down the embedded neovim instance.
 */
export async function shutdownNeovim(nvim: NvimInstance): Promise<void> {
  try {
    await nvim.api.request("nvim_ui_detach", []);
  } catch {
    // May not have UI attached
  }
  try {
    await nvim.api.command("qall!");
  } catch {
    // May already be closed
  }
  nvim.process.kill();
}
