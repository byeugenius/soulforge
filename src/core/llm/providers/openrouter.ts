import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { ProviderDefinition, ProviderModelInfo } from "./types.js";

export const openrouter: ProviderDefinition = {
  id: "openrouter",
  name: "OpenRouter",
  envVar: "OPENROUTER_API_KEY",
  icon: "\uF0AC", // nf-fa-globe U+F0AC
  grouped: true,

  createModel(modelId: string) {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY is not set");
    }
    const provider = createOpenRouter({
      apiKey: process.env.OPENROUTER_API_KEY,
    });
    return provider(modelId);
  },

  async fetchModels(): Promise<ProviderModelInfo[] | null> {
    return null; // grouped provider — uses fetchGroupedModels instead
  },

  fallbackModels: [
    { id: "anthropic/claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
    { id: "anthropic/claude-3.5-haiku", name: "Claude 3.5 Haiku" },
    { id: "openai/gpt-4o", name: "GPT-4o" },
    { id: "openai/gpt-4o-mini", name: "GPT-4o Mini" },
    { id: "google/gemini-2.5-pro-preview", name: "Gemini 2.5 Pro" },
    { id: "google/gemini-2.0-flash-001", name: "Gemini 2.0 Flash" },
    { id: "deepseek/deepseek-chat-v3-0324", name: "DeepSeek V3" },
    { id: "meta-llama/llama-4-maverick", name: "Llama 4 Maverick" },
  ],

  contextWindows: [
    ["claude-sonnet-4", 200_000],
    ["claude-3.5-haiku", 200_000],
    ["claude-3.5-sonnet", 200_000],
    ["gpt-4o-mini", 128_000],
    ["gpt-4o", 128_000],
    ["gemini-2.5-pro", 1_048_576],
    ["gemini-2.0-flash", 1_048_576],
    ["deepseek-chat", 64_000],
    ["llama-4", 1_048_576],
  ],
};
