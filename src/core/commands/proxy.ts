import type { InfoPopupLine } from "../../components/modals/InfoPopup.js";
import { icon } from "../icons.js";
import type { CommandContext, CommandHandler } from "./types.js";
import { sysMsg } from "./utils.js";

async function handleProxyStatus(_input: string, ctx: CommandContext): Promise<void> {
  const { fetchProxyStatus } = await import("../proxy/lifecycle.js");

  const buildLines = (s: Awaited<ReturnType<typeof fetchProxyStatus>>): InfoPopupLine[] => {
    const lines: InfoPopupLine[] = [
      {
        type: "entry",
        label: "Status",
        desc: s.running ? "● running" : "○ stopped",
        descColor: s.running ? "#2d5" : "#FF0040",
      },
      { type: "entry", label: "Endpoint", desc: s.endpoint, descColor: "#888" },
      {
        type: "entry",
        label: "Binary",
        desc: s.binaryPath ?? "not installed",
        descColor: s.installed ? "#888" : "#FF0040",
      },
    ];
    if (s.pid) lines.push({ type: "entry", label: "PID", desc: String(s.pid), descColor: "#888" });
    if (s.models.length > 0) {
      lines.push({ type: "spacer" }, { type: "separator" }, { type: "spacer" });
      lines.push({ type: "header", label: `Models (${s.models.length})` });
      for (const m of s.models) lines.push({ type: "text", label: `  ${m}`, color: "#888" });
    }
    lines.push(
      { type: "spacer" },
      { type: "separator" },
      { type: "spacer" },
      { type: "header", label: "Commands" },
      { type: "entry", label: "/proxy login", desc: "authenticate with Claude" },
      { type: "entry", label: "/proxy install", desc: "manually install CLIProxyAPI" },
    );
    return lines;
  };

  ctx.openInfoPopup({
    title: "Proxy Status",
    icon: icon("proxy"),
    lines: [{ type: "text", label: "Loading...", color: "#888" }],
  });

  let pollActive = true;
  const poll = async () => {
    while (pollActive) {
      const status = await fetchProxyStatus();
      if (!pollActive) break;
      ctx.openInfoPopup({
        title: "Proxy Status",
        icon: icon("proxy"),
        lines: buildLines(status),
        onClose: () => {
          pollActive = false;
        },
      });
      await new Promise((r) => setTimeout(r, 3000));
    }
  };
  poll();
}

async function handleProxyLogin(_input: string, ctx: CommandContext): Promise<void> {
  const { runProxyLogin } = await import("../proxy/lifecycle.js");
  type Line = InfoPopupLine;
  const loginLines: Line[] = [
    { type: "text", label: "Opening browser for authentication...", color: "#888" },
  ];

  const updatePopup = (extraLines: Line[], closeCb?: () => void) => {
    ctx.openInfoPopup({
      title: "Proxy Login",
      icon: icon("proxy"),
      lines: extraLines,
      onClose: closeCb,
    });
  };

  let handle: ReturnType<typeof runProxyLogin> | null = null;
  const onClose = () => {
    handle?.abort();
  };
  updatePopup(loginLines, onClose);

  handle = runProxyLogin((line) => {
    loginLines.push({ type: "text", label: line, color: "#ccc" });
    updatePopup([...loginLines], onClose);
  });

  handle.promise
    .then(({ ok }) => {
      loginLines.push({
        type: "text",
        label: ok ? "Authentication complete." : "Authentication failed.",
        color: ok ? "#2d5" : "#FF0040",
      });
      updatePopup([...loginLines]);
    })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      loginLines.push({ type: "text", label: `Error: ${msg}`, color: "#FF0040" });
      updatePopup([...loginLines]);
    });
}

async function handleProxyInstall(_input: string, ctx: CommandContext): Promise<void> {
  const { installProxy } = await import("../setup/install.js");
  sysMsg(ctx, "Installing CLIProxyAPI...");
  installProxy()
    .then((path: string) => sysMsg(ctx, `CLIProxyAPI installed at ${path}`))
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      sysMsg(ctx, `Install failed: ${msg}`);
    });
}

export function register(map: Map<string, CommandHandler>): void {
  map.set("/proxy", handleProxyStatus);
  map.set("/proxy status", handleProxyStatus);
  map.set("/proxy login", handleProxyLogin);
  map.set("/proxy install", handleProxyInstall);
}
