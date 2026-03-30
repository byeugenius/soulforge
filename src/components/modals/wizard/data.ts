/* ── Step definitions ──────────────────────────────────────────── */

export const STEPS = ["welcome", "setup", "features", "shortcuts", "theme", "ready"] as const;
export type Step = (typeof STEPS)[number];

export const STEP_LABELS: Record<Step, string> = {
  welcome: "Welcome",
  setup: "Provider & Key",
  features: "Features",
  shortcuts: "Shortcuts",
  theme: "Theme",
  ready: "Ready",
};

/* ── Provider & key data ──────────────────────────────────────── */

export const PROVIDERS = [
  { name: "LLM Gateway", desc: "One key, all models — llmgateway.io/dashboard", highlight: true },
  { name: "Anthropic", desc: "Claude Sonnet 4, Claude Opus 4, Haiku", highlight: false },
  { name: "OpenAI", desc: "GPT-4.1, o3, o4-mini", highlight: false },
  { name: "Google", desc: "Gemini 2.5 Pro, Flash", highlight: false },
  { name: "xAI", desc: "Grok", highlight: false },
  { name: "Ollama", desc: "Local models — no API key needed", highlight: false },
  { name: "OpenRouter", desc: "Aggregator — hundreds of models", highlight: false },
  { name: "CLIProxyAPI", desc: "Managed access — no keys needed", highlight: false },
] as const;

/* ── Feature & shortcut data ──────────────────────────────────── */

export const FEATURES = [
  {
    section: "Editor & Intelligence",
    items: [
      {
        ic: "editor",
        title: "Editor Panel",
        keys: "Ctrl+E",
        desc: "Built-in Neovim with LSP, diagnostics, hover, go-to-def",
      },
      {
        ic: "search",
        title: "Soul Map",
        keys: "/repo-map",
        desc: "AST index of your entire codebase for smart context",
      },
      {
        ic: "brain",
        title: "Code Intelligence",
        keys: "/lsp",
        desc: "Tree-sitter + LSP — symbols, refs, rename",
      },
    ],
  },
  {
    section: "Workflow",
    items: [
      {
        ic: "chat",
        title: "Tabs & Sessions",
        keys: "Ctrl+T / Ctrl+P",
        desc: "Multiple chats, browse & restore sessions",
      },
      {
        ic: "git",
        title: "Git Integration",
        keys: "Ctrl+G",
        desc: "Commit, diff, branch — AI adds co-author tag",
      },
      {
        ic: "ai",
        title: "Task Router",
        keys: "/router",
        desc: "Route coding, search, compact to different models",
      },
      {
        ic: "skills",
        title: "Skills & Plugins",
        keys: "Ctrl+S",
        desc: "Browse & install community skills",
      },
    ],
  },
] as const;

export const MODES = ["auto", "default", "architect", "plan", "socratic", "challenge"] as const;

export const SHORTCUTS = [
  {
    section: "Navigation",
    items: [
      { keys: "Ctrl+L", desc: "Model selector", slash: false },
      { keys: "Ctrl+K", desc: "Command palette — search all commands", slash: false },
      { keys: "Ctrl+O", desc: "Expand/collapse tool output", slash: false },
      { keys: "Ctrl+E", desc: "Toggle editor panel", slash: false },
    ],
  },
  {
    section: "Workflow",
    items: [
      { keys: "Ctrl+G", desc: "Git menu — commit, diff, branch", slash: false },
      { keys: "Ctrl+T", desc: "New tab", slash: false },
      { keys: "Ctrl+N", desc: "New session (clear chat)", slash: false },
      { keys: "Ctrl+W", desc: "Close tab", slash: false },
      { keys: "Ctrl+D", desc: "Cycle agent mode", slash: false },
      { keys: "Ctrl+P", desc: "Browse & restore sessions", slash: false },
      { keys: "Ctrl+S", desc: "Search & install skills", slash: false },
      { keys: "Ctrl+C", desc: "Cancel current generation", slash: false },
    ],
  },
  {
    section: "Essential Commands",
    items: [
      { keys: "/help", desc: "Command palette — all commands", slash: true },
      { keys: "/setup", desc: "Install tools, LSP servers, fonts", slash: true },
      { keys: "/settings", desc: "Settings hub — all options", slash: true },
      { keys: "/keys", desc: "Manage API keys", slash: true },
      { keys: "/privacy", desc: "Manage forbidden file patterns", slash: true },
      { keys: "/sessions", desc: "Browse & restore sessions", slash: true },
    ],
  },
] as const;

/* ── Welcome & ready content ──────────────────────────────────── */

export const WELCOME_BULLETS = [
  "Chat with AI to build, debug, and refactor code",
  "Edit files directly — AI reads and writes your codebase",
  "Run shell commands, git operations, and tests from chat",
  "Dispatch parallel agents for large multi-file tasks",
  "Built-in Neovim editor with LSP intelligence",
] as const;

export const QUICK_START = [
  '"fix the bug in auth.ts"',
  '"add tests for the user service"',
  '"refactor this to use async/await"',
  '"explain how the payment flow works"',
] as const;

/* ── Animation constants ──────────────────────────────────────── */

export const WELCOME_TITLE = "Welcome to SoulForge";
export const TYPEWRITER_MS = 45;
export const BLINK_COUNT = 4;
export const BLINK_MS = 300;
export const BLINK_INITIAL_MS = 400;

/* ── Layout constants ─────────────────────────────────────────── */

export const MAX_W = 90;
