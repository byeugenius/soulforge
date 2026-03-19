import { loadConfig, loadProjectConfig } from "./config/index.js";
import { createForgeAgent } from "./core/agents/index.js";
import { ContextManager } from "./core/context/manager.js";
import { checkProviders, resolveModel } from "./core/llm/provider.js";
import { buildProviderOptions } from "./core/llm/provider-options.js";
import { getAllProviders } from "./core/llm/providers/index.js";
import { getProviderApiKey, setSecret } from "./core/secrets.js";
import type { AppConfig } from "./types/index.js";

const RST = "\x1b[0m";
const BOLD = "\x1b[1m";
const PURPLE = "\x1b[38;2;155;48;255m";
const DIM = "\x1b[2m";
const RED = "\x1b[38;2;255;0;64m";
const GREEN = "\x1b[38;2;0;200;80m";

// ─── List providers ───

async function listProviders(): Promise<void> {
  const statuses = await checkProviders();
  for (const s of statuses) {
    const mark = s.available ? `${GREEN}ready${RST}` : `${DIM}no key${RST}`;
    const env = s.envVar ? `  ${DIM}(${s.envVar})${RST}` : "";
    process.stdout.write(`${s.available ? GREEN : DIM}${s.id.padEnd(18)}${RST} ${mark}${env}\n`);
  }
}

// ─── List models ───

async function listModels(providerId?: string): Promise<void> {
  const providers = getAllProviders();
  const targets = providerId ? providers.filter((p) => p.id === providerId) : providers;

  if (targets.length === 0) {
    process.stderr.write(`${RED}Error:${RST} Unknown provider "${providerId ?? ""}"\n`);
    process.stderr.write(`Available: ${providers.map((p) => p.id).join(", ")}\n`);
    process.exit(1);
  }

  for (const provider of targets) {
    const hasKey = provider.envVar === "" || Boolean(getProviderApiKey(provider.envVar));
    if (!hasKey && !providerId) continue;

    process.stdout.write(`${BOLD}${PURPLE}${provider.name}${RST} ${DIM}(${provider.id})${RST}\n`);

    let models = await provider.fetchModels().catch(() => null);
    if (!models) models = provider.fallbackModels;

    for (const m of models) {
      const ctx = m.contextWindow
        ? `  ${DIM}${String(Math.round(m.contextWindow / 1000))}k ctx${RST}`
        : "";
      process.stdout.write(`  ${provider.id}/${m.id}${ctx}\n`);
    }
    process.stdout.write("\n");
  }
}

// ─── Set API key ───

const PROVIDER_TO_SECRET: Record<string, string> = {
  anthropic: "anthropic-api-key",
  openai: "openai-api-key",
  google: "google-api-key",
  xai: "xai-api-key",
  openrouter: "openrouter-api-key",
  llmgateway: "llmgateway-api-key",
  vercel_gateway: "vercel-gateway-api-key",
};

function setKey(providerId: string, key: string): void {
  const secretKey = PROVIDER_TO_SECRET[providerId];
  if (!secretKey) {
    const valid = Object.keys(PROVIDER_TO_SECRET).join(", ");
    process.stderr.write(`${RED}Error:${RST} Unknown provider "${providerId}"\n`);
    process.stderr.write(`Supported: ${valid}\n`);
    process.exit(1);
  }

  const result = setSecret(secretKey as Parameters<typeof setSecret>[0], key);
  if (result.success) {
    const where = result.storage === "keychain" ? "system keychain" : "~/.soulforge/secrets.json";
    process.stdout.write(`${GREEN}Saved${RST} ${providerId} key to ${where}\n`);
  } else {
    process.stderr.write(`${RED}Error:${RST} Failed to save key\n`);
    process.exit(1);
  }
}

// ─── Run prompt ───

async function runPrompt(opts: HeadlessRunOptions): Promise<void> {
  const startTime = Date.now();
  const cwd = opts.cwd ?? process.cwd();
  const config = loadConfig();
  const projectConfig = loadProjectConfig(cwd);
  const merged: AppConfig = { ...config, ...projectConfig };

  const modelId = opts.modelId ?? merged.defaultModel;
  if (modelId === "none") {
    process.stderr.write(
      `${RED}Error:${RST} No model configured. Pass --model provider/model or set defaultModel in config.\n`,
    );
    process.exit(1);
  }

  const model = resolveModel(modelId);
  const providerOpts = buildProviderOptions(modelId, merged);

  const contextManager = await ContextManager.createAsync(cwd, (step) => {
    if (!opts.json) process.stderr.write(`${DIM}${step}${RST}\n`);
  });

  const REPO_MAP_TIMEOUT = 15_000;
  if (!contextManager.isRepoMapReady()) {
    const start = Date.now();
    while (Date.now() - start < REPO_MAP_TIMEOUT) {
      await new Promise((r) => setTimeout(r, 200));
      if (contextManager.isRepoMapReady()) break;
    }
  }

  const repoMap = contextManager.isRepoMapReady() ? contextManager.getRepoMap() : undefined;

  try {
    const { warmupIntelligence } = await import("./core/intelligence/index.js");
    warmupIntelligence(cwd, merged.codeIntelligence);
  } catch {}

  const abortController = new AbortController();
  process.on("SIGINT", () => {
    abortController.abort();
  });

  const agent = createForgeAgent({
    model,
    contextManager,
    forgeMode: "default",
    editorIntegration: {
      diagnostics: false,
      symbols: false,
      hover: false,
      references: false,
      definition: false,
      codeActions: false,
      editorContext: false,
      rename: false,
      lspStatus: false,
      format: false,
    },
    providerOptions: providerOpts.providerOptions,
    headers: providerOpts.headers,
    cwd,
  });

  contextManager.updateConversationContext(opts.prompt, 0);

  if (!opts.json) {
    process.stderr.write(`${PURPLE}Model:${RST} ${modelId}\n`);
    if (repoMap) {
      const stats = repoMap.getStats();
      process.stderr.write(
        `${PURPLE}Repo:${RST}  ${String(stats.files)} files, ${String(stats.symbols)} symbols\n`,
      );
    }
    process.stderr.write(`${DIM}${"─".repeat(40)}${RST}\n`);
  }

  let output = "";
  let steps = 0;
  const tokens = { input: 0, output: 0, cacheRead: 0 };
  const toolCalls: string[] = [];
  let error: string | undefined;

  try {
    const result = await agent.stream({
      messages: [{ role: "user" as const, content: opts.prompt }],
      options: { userMessage: opts.prompt },
      abortSignal: abortController.signal,
    });

    for await (const part of result.fullStream) {
      if (part.type === "text-delta") {
        output += part.text;
        if (!opts.json) process.stdout.write(part.text);
      } else if (part.type === "tool-call") {
        toolCalls.push(part.toolName);
      } else if (part.type === "finish-step") {
        steps++;
        const usage = part.usage as {
          inputTokens?: number;
          outputTokens?: number;
          inputTokenDetails?: { cacheReadTokens?: number };
        };
        tokens.input += usage.inputTokens ?? 0;
        tokens.output += usage.outputTokens ?? 0;
        tokens.cacheRead += usage.inputTokenDetails?.cacheReadTokens ?? 0;
      }
    }
  } catch (err) {
    if (abortController.signal.aborted) {
      error = "Aborted by user";
      if (!opts.json) process.stderr.write(`\n${RED}Aborted${RST}\n`);
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      error = msg;
      if (!opts.json) process.stderr.write(`\n${RED}Error:${RST} ${msg}\n`);
    }
  }

  const duration = Date.now() - startTime;

  if (opts.json) {
    const report = {
      model: modelId,
      prompt: opts.prompt,
      output,
      steps,
      tokens,
      toolCalls,
      duration,
      ...(error ? { error } : {}),
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    if (output.length > 0 && !output.endsWith("\n")) process.stdout.write("\n");
    process.stderr.write(`${DIM}${"─".repeat(40)}${RST}\n`);
    const inK = (tokens.input / 1000).toFixed(1);
    const outK = (tokens.output / 1000).toFixed(1);
    const cachePct = tokens.input > 0 ? Math.round((tokens.cacheRead / tokens.input) * 100) : 0;
    const cacheStr = tokens.cacheRead > 0 ? `, ${String(cachePct)}% cached` : "";
    const durStr = duration < 1000 ? `${String(duration)}ms` : `${(duration / 1000).toFixed(1)}s`;
    process.stderr.write(
      `${DIM}${String(steps)} steps — ${inK}k in, ${outK}k out${cacheStr} — ${durStr}${RST}\n`,
    );
  }

  contextManager.dispose();
  process.exit(error ? 1 : 0);
}

// ─── CLI parsing ───

interface HeadlessRunOptions {
  prompt: string;
  modelId?: string;
  json?: boolean;
  cwd?: string;
}

type HeadlessAction =
  | { type: "run"; opts: HeadlessRunOptions }
  | { type: "list-providers" }
  | { type: "list-models"; provider?: string }
  | { type: "set-key"; provider: string; key: string };

const USAGE = `${BOLD}Usage:${RST}
  soulforge --headless <prompt>                          Run a prompt
  soulforge --headless --json <prompt>                   JSON output
  soulforge --headless --model <provider/model> <prompt> Override model
  echo "prompt" | soulforge --headless                   Pipe from stdin

${BOLD}Management:${RST}
  soulforge --list-providers                             Show providers + status
  soulforge --list-models [provider]                     Show available models
  soulforge --set-key <provider> <key>                   Save an API key
`;

export async function parseHeadlessArgs(argv: string[]): Promise<HeadlessAction | null> {
  if (argv.includes("--list-providers")) return { type: "list-providers" };

  if (argv.includes("--list-models")) {
    const idx = argv.indexOf("--list-models");
    const next = argv[idx + 1];
    const provider = next && !next.startsWith("--") ? next : undefined;
    return { type: "list-models", provider };
  }

  if (argv.includes("--set-key")) {
    const idx = argv.indexOf("--set-key");
    const provider = argv[idx + 1];
    const key = argv[idx + 2];
    if (!provider || !key) {
      process.stderr.write(`${RED}Error:${RST} --set-key requires <provider> <key>\n`);
      process.stderr.write(`Providers: ${Object.keys(PROVIDER_TO_SECRET).join(", ")}\n`);
      process.exit(1);
    }
    return { type: "set-key", provider, key };
  }

  if (!argv.includes("--headless")) return null;

  let modelId: string | undefined;
  let json = false;
  const promptParts: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--headless") continue;
    if (arg === "--model" && argv[i + 1]) {
      modelId = argv[++i];
    } else if (arg?.startsWith("--model=")) {
      modelId = arg.slice("--model=".length);
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--session" || arg === "--resume" || arg === "-s") {
      i++;
    } else if (arg?.startsWith("--session=") || arg?.startsWith("--resume=")) {
      // skip
    } else if (arg && !arg.startsWith("--")) {
      promptParts.push(arg);
    }
  }

  let prompt = promptParts.join(" ");

  if (!prompt && !process.stdin.isTTY) {
    prompt = await Bun.stdin.text();
    prompt = prompt.trim();
  }

  if (!prompt) {
    process.stderr.write(USAGE);
    process.exit(1);
  }

  return { type: "run", opts: { prompt, modelId, json } };
}

export async function runHeadless(action: HeadlessAction): Promise<void> {
  switch (action.type) {
    case "list-providers":
      await listProviders();
      break;
    case "list-models":
      await listModels(action.provider);
      break;
    case "set-key":
      setKey(action.provider, action.key);
      break;
    case "run":
      await runPrompt(action.opts);
      break;
  }
}
