import { spawn } from "node:child_process";

export function copyToClipboard(text: string): void {
  const isDarwin = process.platform === "darwin";
  const cmd = isDarwin ? "pbcopy" : "xclip";
  const args = isDarwin ? [] : ["-selection", "clipboard"];
  const proc = spawn(cmd, args, { stdio: ["pipe", "ignore", "ignore"] });
  proc.stdin.write(text);
  proc.stdin.end();
}
