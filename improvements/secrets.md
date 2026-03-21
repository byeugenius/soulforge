# Provider API Keys in App — Research & Plan

## Current Architecture

### Secrets System (`src/core/secrets.ts`)
- `SecretKey` type: `"brave-api-key" | "jina-api-key"` — only web search keys
- `ENV_MAP`: maps secret keys to env vars (`brave-api-key` → `BRAVE_SEARCH_API_KEY`, `jina-api-key` → `JINA_API_KEY`)
- Storage hierarchy: **env var → OS keychain → `~/.soulforge/secrets.json`**
- Functions: `getSecret()`, `setSecret()`, `deleteSecret()`, `hasSecret()`
- Keychain: macOS (`security` CLI), Linux (`secret-tool`), file fallback with `chmod 600`
- `SECRET_KEYS` array exported for iteration

### Web Search Settings UI (`src/components/WebSearchSettings.tsx`)
- Popup modal with menu of key items (Brave, Jina)
- Shows key status: `not set`, `set (env)`, `set (keychain)`, `set (file)`
- Input mode for pasting keys (masked display)
- Remove action for non-env keys
- Zustand store `useWebSearchStore` with `keys` state and `refresh()`
- Opened via `/web-search` command → `openWebSearchSettings()` → `openModal("webSearchSettings")`

### Provider System (`src/core/llm/providers/`)
- `ProviderDefinition` interface: `{ id, name, envVar, icon, createModel(), fetchModels(), ... }`
- Each provider reads `process.env[ENVVAR]` directly in `createModel()` and `fetchModels()`
- Providers: `anthropic`, `openai`, `google`, `xai`, `ollama`, `proxy`, `vercelGateway`, `llmgateway`
  - OpenRouter exists but NOT in `ALL_PROVIDERS` list
- `checkProviders()` checks `process.env[p.envVar]` for availability
- **No provider ever calls `getSecret()`** — they only check `process.env`

### Provider Env Vars
| Provider | envVar | 
|----------|--------|
| anthropic | `ANTHROPIC_API_KEY` |
| openai | `OPENAI_API_KEY` |
| google | `GOOGLE_GENERATIVE_AI_API_KEY` |
| xai | `XAI_API_KEY` |
| ollama | (empty — uses `checkAvailability()`) |
| proxy | (empty) |
| vercelGateway | `VERCEL_API_KEY` |
| llmgateway | (need to check) |
| openrouter | `OPENROUTER_API_KEY` (not in ALL_PROVIDERS) |

### Modal System (`src/stores/ui.ts`)
- `ModalName` union type lists all modal IDs
- `INITIAL_MODALS` record initializes all to `false`
- `openModal(name)`, `closeModal(name)`, `toggleModal(name)`
- App.tsx renders modals conditionally based on `modals.xxx`

### Command System (`src/components/commands.ts`)
- `CommandContext` interface has `openWebSearchSettings()`, `openProviderSettings()`
- Commands: `/web-search` opens web search settings, `/providers` opens providers list

## Problem
Users must set provider API keys via shell environment (`.bashrc`, `.zshrc`, etc.). There's no way to set them from within the app like Brave/Jina keys.

## Plan

### Approach: Extend secrets system + inject into `process.env`

The cleanest approach is:
1. Extend `SecretKey` type to include provider keys
2. On startup and on key save, inject secrets into `process.env` so all providers work transparently
3. Create a new `ProviderKeysSettings` UI (or rename/extend WebSearchSettings to a general "API Keys" popup)
4. Wire into commands

### Files to Change

#### 1. `src/core/secrets.ts`
- Extend `SecretKey` type to add provider keys:
  ```
  "anthropic-api-key" | "openai-api-key" | "google-api-key" | "xai-api-key" | "openrouter-api-key"
  ```
- Extend `ENV_MAP` with provider env var mappings
- Add `syncSecretsToEnv()` function that reads all secrets and sets `process.env[envVar]` for each
- Update `setSecret()` to also set `process.env[envVar]` immediately
- Update `deleteSecret()` to also delete from `process.env`
- Update `SECRET_KEYS` array
- Maybe split into categories: `PROVIDER_SECRET_KEYS` and `TOOL_SECRET_KEYS`

#### 2. `src/boot.tsx` and/or `src/index.tsx`
- Call `syncSecretsToEnv()` early in boot, **before** `checkProviders()` runs
- This ensures keychain/file-stored keys are available as env vars

#### 3. `src/components/WebSearchSettings.tsx`
- Rename to `ApiKeySettings.tsx` (or keep and add a separate component)
- **Option A**: Rename to general "API Keys" popup with tabs (Providers / Web Search)
- **Option B**: Create a new `ProviderKeysSettings.tsx` as a separate popup
- **Option B is simpler** — follows existing pattern, less disruption

#### 4. New `src/components/ProviderKeysSettings.tsx`
- Same pattern as `WebSearchSettings.tsx`
- Shows provider API keys with status
- Input mode for setting keys
- Remove action
- Provider-specific descriptions and links

#### 5. `src/stores/ui.ts`
- Add `"providerKeys"` to `ModalName`
- Add to `INITIAL_MODALS`

#### 6. `src/components/App.tsx`
- Import `ProviderKeysSettings`
- Add `openProviderKeys` to command context
- Render `<ProviderKeysSettings>` modal
- After key save, trigger provider re-check

#### 7. `src/components/commands.ts`
- Add `openProviderKeys` to `CommandContext`
- Add `/keys` or `/api-keys` command

#### 8. `src/core/llm/provider.ts`
- Update `checkProviders()` — after `syncSecretsToEnv()` runs at boot, `process.env` checks will just work
- No changes needed if we inject into env at boot + on save

#### 9. `src/components/InputBox.tsx`
- Add `/keys` or `/api-keys` to autocomplete list

#### 10. `src/components/HelpPopup.tsx`
- Add `/keys` entry

### Key Design Decisions
- **Inject into `process.env`** rather than modifying every provider — zero provider changes needed
- **Separate popup** rather than extending WebSearchSettings — cleaner separation
- **Sync on boot + on save** — covers both startup and runtime key changes
- After saving a key, call `checkProviders()` to refresh LLM selector availability
- Provider keys stored with same security (keychain preferred, file fallback with `chmod 600`)

### Implementation Order
1. Extend `secrets.ts` (types, ENV_MAP, sync function)
2. Add sync call in boot
3. Create `ProviderKeysSettings.tsx` component
4. Wire into UI store, App.tsx, commands
5. Test flow: set key → provider becomes available → model selection works
