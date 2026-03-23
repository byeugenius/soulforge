import { checkProviders } from "../core/llm/provider.js";
import { getAllProviders } from "../core/llm/providers/index.js";
import { getProviderApiKey, setCustomSecret, setSecret } from "../core/secrets.js";
import { BOLD, DIM, EXIT_ERROR, GREEN, PURPLE, RED, RST } from "./constants.js";

export async function listProviders(): Promise<void> {
  const statuses = await checkProviders();
  const providers = getAllProviders();
  const customIds = new Set(providers.filter((p) => p.custom).map((p) => p.id));

  for (const s of statuses) {
    const tag = customIds.has(s.id) ? ` ${DIM}[custom]${RST}` : "";
    const mark = s.available ? `${GREEN}ready${RST}` : `${DIM}no key${RST}`;
    const env = s.envVar ? `  ${DIM}(${s.envVar})${RST}` : "";
    process.stdout.write(
      `${s.available ? GREEN : DIM}${s.id.padEnd(18)}${RST} ${mark}${env}${tag}\n`,
    );
  }
}

export async function listModels(providerId?: string): Promise<void> {
  const providers = getAllProviders();
  const targets = providerId ? providers.filter((p) => p.id === providerId) : providers;

  if (targets.length === 0) {
    process.stderr.write(`${RED}Error:${RST} Unknown provider "${providerId ?? ""}"\n`);
    process.stderr.write(`Available: ${providers.map((p) => p.id).join(", ")}\n`);
    process.exit(EXIT_ERROR);
  }

  for (const provider of targets) {
    const hasKey = provider.envVar === "" || Boolean(getProviderApiKey(provider.envVar));
    if (!hasKey && !providerId) continue;

    const tag = provider.custom ? ` ${DIM}[custom]${RST}` : "";
    process.stdout.write(
      `${BOLD}${PURPLE}${provider.name}${RST} ${DIM}(${provider.id})${RST}${tag}\n`,
    );

    let models = await provider.fetchModels().catch((err: unknown) => {
      process.stderr.write(
        `${DIM}  (model fetch failed: ${err instanceof Error ? err.message : String(err)} — showing cached models)${RST}\n`,
      );
      return null;
    });
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

const BUILTIN_SECRETS: Record<string, string> = {
  anthropic: "anthropic-api-key",
  openai: "openai-api-key",
  google: "google-api-key",
  xai: "xai-api-key",
  openrouter: "openrouter-api-key",
  llmgateway: "llmgateway-api-key",
  vercel_gateway: "vercel-gateway-api-key",
};

export function setKey(providerId: string, key: string): void {
  const builtinKey = BUILTIN_SECRETS[providerId];
  if (builtinKey) {
    const result = setSecret(builtinKey as Parameters<typeof setSecret>[0], key);
    if (result.success) {
      const where = result.storage === "keychain" ? "system keychain" : "~/.soulforge/secrets.json";
      process.stdout.write(`${GREEN}Saved${RST} ${providerId} key to ${where}\n`);
    } else {
      process.stderr.write(`${RED}Error:${RST} Failed to save key\n`);
      process.exit(EXIT_ERROR);
    }
    return;
  }

  const provider = getAllProviders().find((p) => p.id === providerId);
  if (provider?.envVar) {
    const result = setCustomSecret(provider.envVar, key);
    if (result.success) {
      const where = result.storage === "keychain" ? "system keychain" : "~/.soulforge/secrets.json";
      process.stdout.write(`${GREEN}Saved${RST} ${providerId} key to ${where}\n`);
    } else {
      process.stderr.write(`${RED}Error:${RST} Failed to save key\n`);
      process.exit(EXIT_ERROR);
    }
    return;
  }

  const allIds = getAllProviders().map((p) => p.id);
  process.stderr.write(`${RED}Error:${RST} Unknown provider "${providerId}"\n`);
  process.stderr.write(`Available: ${allIds.join(", ")}\n`);
  process.exit(EXIT_ERROR);
}
