/**
 * Shared context window fallback patterns — only patterns whose IDs and values
 * are consistent across providers. Provider-specific IDs (dot vs hyphen variants,
 * different ctx values) belong in the provider's own contextWindows array.
 *
 * Ordered most-specific first — first match wins in substring search.
 * Values sourced from OpenRouter + LLM Gateway APIs (2026-04-02).
 */
export const SHARED_CONTEXT_WINDOWS: [pattern: string, tokens: number][] = [
  // Claude — generic patterns only (dot/hyphen variants are provider-specific)
  ["claude-3-opus", 200_000],
  ["claude-3-sonnet", 200_000],
  ["claude-3-haiku", 200_000],
  ["claude", 200_000],

  // OpenAI / GPT — gpt-5.4/gpt-5-chat are provider-specific (values differ)
  ["gpt-4o-mini", 128_000],
  ["gpt-4o", 128_000],
  ["gpt-4-turbo", 128_000],
  ["gpt-4-1106", 128_000],
  ["gpt-4-32k", 32_000],
  ["gpt-3.5-turbo", 16_385],
  ["gpt-3.5", 4_096],
  ["o4-mini", 200_000],
  ["o3-pro", 200_000],
  ["o3-mini", 200_000],
  ["o3", 200_000],
  ["o1-pro", 200_000],
  ["o1-mini", 128_000],
  ["o1", 200_000],

  // Gemini — image models have small ctx
  ["gemini-2.5-flash-image", 32_768],
  ["gemini-3.1-flash-image", 65_536],
  ["gemini-3-pro-image", 65_536],
  ["gemini-3", 1_048_576],
  ["gemini-2.5", 1_048_576],
  ["gemini-2.0-flash", 1_048_576],
  ["gemini-1.5-pro", 2_000_000],
  ["gemini-1.5-flash", 1_000_000],
  ["gemini", 1_048_576],

  // Grok
  ["grok-4-fast", 2_000_000],
  ["grok-4", 256_000],
  ["grok-3", 131_072],
  ["grok-2", 131_072],

  // DeepSeek
  ["deepseek-v3.2", 163_840],
  ["deepseek-v3.1", 128_000],
  ["deepseek-v3", 163_840],
  ["deepseek-r1-distill", 131_072],
  ["deepseek-r1", 64_000],
  ["deepseek-chat", 163_840],
  ["deepseek-coder", 128_000],
  ["deepseek", 163_840],

  // Llama — llama-3.x base (8k) vs instruct (128k) varies, provider catch-alls handle it
  ["llama-4-maverick", 1_048_576],
  ["llama-3.3", 131_072],
  ["llama-3-8b", 8_192],
  ["llama-3-70b", 8_192],

  // Qwen — conservative base, specific variants in provider files
  ["qwen3.6", 1_000_000],
  ["qwen3-coder-flash", 1_000_000],
  ["qwen3-coder-plus", 1_000_000],
  ["qwen3-coder", 262_144],
  ["qwen3-max", 262_144],
  ["qwen3-vl", 131_072],

  // Mistral
  ["codestral", 256_000],
  ["devstral", 262_144],
  ["ministral", 262_144],

  // Amazon Nova
  ["nova-premier", 1_000_000],
  ["nova-2-lite", 1_000_000],
  ["nova-pro", 300_000],
  ["nova-lite", 300_000],
  ["nova-micro", 128_000],

  // AI21
  ["jamba", 256_000],
];
