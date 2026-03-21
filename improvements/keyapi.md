# Inline API Key Input per Provider

## Goal
When selecting a provider in the LlmSelector, show an API key input field at the top of the provider's model list. Users can paste/type their key directly — no need to exit SoulForge and set env vars. Keys are stored the same way as Brave/Jina keys (OS keychain → `~/.soulforge/secrets.json` fallback).

## Current State

### Secrets system (`src/core/secrets.ts`)
- `SecretKey` type: `"brave-api-key" | "jina-api-key"` — needs expanding
- `ENV_MAP`: maps SecretKey → env var name
- `getSecret(key)`: checks env → keychain → file
- `setSecret(key, value)`: stores in keychain (preferred) or file
- `deleteSecret(key)`: removes from both
- `hasSecret(key)`: returns `{ set: boolean, source: "env" | "keychain" | "file" | "none" }`
- **Missing**: no `process.env` injection after save — providers only check `process.env[envVar]`

### Provider env vars
| Provider | id | envVar | Needs key? |
|---|---|---|---|
| Claude | `anthropic` | `ANTHROPIC_API_KEY` | ✅ |
| OpenAI | `openai` | `OPENAI_API_KEY` | ✅ |
| Gemini | `google` | `GOOGLE_GENERATIVE_AI_API_KEY` | ✅ |
| Grok | `xai` | `XAI_API_KEY` | ✅ |
| OpenRouter | `openrouter` | `OPENROUTER_API_KEY` | ✅ |
| LLM Gateway | `llmgateway` | `LLM_GATEWAY_API_KEY` | ✅ |
| Vercel Gateway | `vercel_gateway` | `AI_GATEWAY_API_KEY` | ✅ |
| Ollama | `ollama` | `""` | ❌ local |
| Proxy | `proxy` | `""` | ❌ hardcoded |

### LlmSelector flow
1. **Provider list** → user picks provider → Enter
2. **Subprovider list** (if `grouped: true`) → Enter
3. **Model list** → Enter to select model

### WebSearchSettings (reference pattern)
- Two-mode popup: `"menu"` | `"input"`
- Zustand store with `keys` record + `refresh()`
- Input mode: masked display (`****last4`), paste support via `renderer.keyInput`, character input, backspace
- On confirm: `setSecret()` → `refresh()` → back to menu

## Design

### UX Flow
When user enters a provider (goes to model list or subprovider list), show at the top:

```
╭─────────────────────────────────────────────╮
│  󱜙 Claude                                   │
│  ─────────────────────────────────────────── │
│  🔑 API Key              ●  set (keychain)  │
│  ─────────────────────────────────────────── │
│    esc to go back                            │
│                                              │
│  › claude-opus-4                             │
│    claude-sonnet-4                           │
│    claude-haiku-4                            │
│                                              │
│  ↑↓ navigate  ⏎ select  k edit key  esc back│
╰─────────────────────────────────────────────╯
```

If no key is set:
```
│  🔑 API Key              ○  not set          │
```

If set via env var:
```
│  🔑 API Key              ●  set (env)        │
```

Press `k` to enter key input mode (same pattern as WebSearchSettings):
```
╭─────────────────────────────────────────────╮
│  🔑 ANTHROPIC_API_KEY                        │
│  ─────────────────────────────────────────── │
│  Paste your key:                             │
│  ************************************sk-1234_│
│  ─────────────────────────────────────────── │
│  ⏎ save  esc cancel  stored in OS keychain   │
╰─────────────────────────────────────────────╯
```

After saving, inject into `process.env` so provider works immediately, re-check availability, and refresh model list.

### Skip for keyless providers
Ollama (`envVar: ""`) and Proxy (`envVar: ""`) skip the key row entirely — go straight to model/subprovider list as today.

## Changes

### 1. `src/core/secrets.ts`
- Expand `SecretKey` union to include all provider keys:
  ```ts
  type SecretKey =
    | "brave-api-key"
    | "jina-api-key"
    | "anthropic-api-key"
    | "openai-api-key"
    | "google-api-key"
    | "xai-api-key"
    | "openrouter-api-key"
    | "llm-gateway-api-key"
    | "ai-gateway-api-key";
  ```
- Expand `ENV_MAP` with the new entries
- Add `setSecretAndEnv(key, value)` helper that calls `setSecret()` then injects into `process.env[ENV_MAP[key]]`
- Add `deleteSecretAndEnv(key)` that calls `deleteSecret()` then removes from `process.env`
- Add `loadSecretsIntoEnv()` — on boot, load all saved secrets into `process.env` (so keys persist across restarts without re-entering)
- Update `SECRET_KEYS` array

### 2. `src/boot.tsx`
- Call `loadSecretsIntoEnv()` early in boot (before `checkProviders()`) so saved keys are available

### 3. `src/components/LlmSelector.tsx`
- Add state: `keyMode: boolean`, `keyInput: string`
- Import `hasSecret`, `setSecretAndEnv`, `deleteSecretAndEnv`, `getStorageBackend` from secrets
- Add helper: `getSecretKeyForProvider(providerId: string): SecretKey | null` — maps provider id → SecretKey
- In model list view + subprovider list view:
  - If provider has an `envVar` (not empty), render a key status row before the model list
  - Show key status: set/not set, source (env/keychain/file)
  - `k` key → enter key input mode (if source ≠ env)
  - `x` key → remove key (if set and source ≠ env)
- Key input mode: same masked input pattern as WebSearchSettings
  - On confirm: `setSecretAndEnv()` → re-trigger `checkProviders()` → refresh provider statuses → refresh models
  - On cancel: back to model list
- Add paste handler (same as WebSearchSettings pattern)
- Footer hint: add `k edit key` to the keyboard hints

### 4. `src/core/llm/provider.ts`
- `checkProviders()` already reads `process.env[envVar]` — will pick up injected keys automatically
- No changes needed

## Edge Cases
- **Env var already set**: show "set (env)" — block editing with flash message (same as WebSearchSettings)
- **Key saved in keychain but env not set**: `loadSecretsIntoEnv()` on boot handles this; `setSecretAndEnv()` handles runtime
- **Provider uses key in `createModel()`**: after injecting into `process.env`, next `createModel()` call will pick it up — no provider code changes needed
- **Grouped providers**: show key row at subprovider level too (e.g., OpenRouter needs key before listing subproviders)
- **Model fetch after key change**: after saving key, trigger model refetch by toggling the `expandedProvider` state (unmount/remount the `useProviderModels` hook)
