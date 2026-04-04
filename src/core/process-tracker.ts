import type { ChildProcess } from "node:child_process";

const tracked = new Set<ChildProcess>();

export function trackProcess(proc: ChildProcess): void {
  tracked.add(proc);
  proc.on("exit", () => tracked.delete(proc));
}

export function killAllTracked(): void {
  for (const proc of tracked) {
    try {
      proc.kill("SIGTERM");
    } catch {}
  }
  setTimeout(() => {
    for (const proc of tracked) {
      try {
        proc.kill("SIGKILL");
      } catch {}
    }
    tracked.clear();
  }, 1000);
}
