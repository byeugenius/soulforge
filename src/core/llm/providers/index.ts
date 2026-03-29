export { anthropic } from "./anthropic.js";
export { buildCustomProvider } from "./custom.js";
export { google } from "./google.js";
export { llmgateway } from "./llmgateway.js";
export { ollama } from "./ollama.js";
export { openai } from "./openai.js";
export { openrouter } from "./openrouter.js";
export { proxy } from "./proxy.js";
export type { CustomProviderConfig, ProviderDefinition, ProviderModelInfo } from "./types.js";
export { vercelGatewayProvider } from "./vercel-gateway.js";
export { xai } from "./xai.js";

import { anthropic } from "./anthropic.js";
import { buildCustomProvider } from "./custom.js";
import { google } from "./google.js";
import { llmgateway } from "./llmgateway.js";
import { ollama } from "./ollama.js";
import { openai } from "./openai.js";
import { openrouter } from "./openrouter.js";
import { proxy } from "./proxy.js";
import type { CustomProviderConfig, ProviderDefinition } from "./types.js";
import { vercelGatewayProvider } from "./vercel-gateway.js";
import { xai } from "./xai.js";

const BUILTIN_PROVIDERS: ProviderDefinition[] = [
  llmgateway,
  anthropic,
  proxy,
  vercelGatewayProvider,
  openai,
  xai,
  google,
  openrouter,
  ollama,
];

let allProviders: ProviderDefinition[] = [...BUILTIN_PROVIDERS];
let providerMap = new Map(allProviders.map((p) => [p.id, p]));

export function registerCustomProviders(configs: CustomProviderConfig[]): void {
  const builtinIds = new Set(BUILTIN_PROVIDERS.map((p) => p.id));

  const seen = new Map<string, ProviderDefinition>();
  for (const c of configs) {
    const def = buildCustomProvider(c);
    if (builtinIds.has(c.id) || seen.has(c.id)) {
      def.id = `${c.id}-custom`;
      // If still conflicts (e.g. builtin called "x-custom"), keep appending
      let id = def.id;
      let n = 2;
      while (builtinIds.has(id) || seen.has(id)) {
        id = `${c.id}-custom-${String(n++)}`;
      }
      def.id = id;
    }
    seen.set(def.id, def);
  }

  allProviders = [...BUILTIN_PROVIDERS, ...seen.values()];
  providerMap = new Map(allProviders.map((p) => [p.id, p]));
}

export function getProvider(id: string): ProviderDefinition | undefined {
  return providerMap.get(id);
}

export function getAllProviders(): ProviderDefinition[] {
  return allProviders;
}
