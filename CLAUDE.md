# SoulForge

AI-Powered Terminal IDE by proxySoul.

## Stack

- **Runtime**: Bun (not Node.js)
- **Language**: TypeScript (strict mode)
- **TUI**: Ink (React for CLIs)
- **LLM**: Vercel AI SDK (multi-provider)
- **Editor**: Neovim (embedded via msgpack-RPC)
- **Linter/Formatter**: Biome

## Commands

- `bun run dev` — start soulforge
- `bun run lint` — lint with biome
- `bun run lint:fix` — auto-fix lint issues
- `bun run format` — format with biome
- `bun run typecheck` — check types

## CLI Flags

- `--session <id>` / `--resume <id>` / `-s <id>` — resume a saved session
- `--headless <prompt>` — run without TUI, stream output to stdout
- `--headless --model <provider/model>` — override the configured model
- `--headless --json` — output structured JSON instead of streaming text
- `--list-providers` — show providers and their key status
- `--list-models [provider]` — show available models (all or for a specific provider)
- `--set-key <provider> <key>` — save an API key to system keychain
- Piped input: `echo "prompt" | soulforge --headless`

## Conventions

- Use `bun` instead of `node`, `npm`, `npx`
- Use Biome for linting + formatting (not ESLint/Prettier)
- Strict TypeScript — no `any`, no unused vars
- React JSX transform (no `import React` needed)
