// ─── Tool Categories ───
// Displayed as a dim tag before the tool label, e.g. [lsp] Definition

export type ToolCategory =
  | "file"
  | "shell"
  | "git"
  | "lsp"
  | "tree-sitter"
  | "ts-morph"
  | "regex"
  | "code"
  | "web"
  | "memory"
  | "agent"
  | "ui"
  | "editor"
  | "execution"
  | "repo-map";

export const TOOL_CATEGORIES: Record<string, ToolCategory> = {
  // File tools
  read_file: "file",
  edit_file: "file",
  grep: "file",
  glob: "file",

  // Shell
  shell: "shell",

  // Git tools
  git_status: "git",
  git_diff: "git",
  git_log: "git",
  git_commit: "git",
  git_push: "git",
  git_pull: "git",
  git_stash: "git",

  // Code intelligence — backend resolved dynamically (ts-morph > lsp > tree-sitter > regex)
  navigate: "code",
  read_code: "code",
  analyze: "code",
  rename_symbol: "code",
  move_symbol: "code",
  refactor: "code",
  project: "shell",
  test_scaffold: "code",
  discover_pattern: "code",

  // Editor core (neovim buffer ops)
  editor_read: "editor",
  editor_edit: "editor",
  editor_navigate: "editor",
  editor_panel: "editor",

  // LSP (neovim language server)
  editor_diagnostics: "lsp",
  editor_symbols: "lsp",
  editor_hover: "lsp",
  editor_references: "lsp",
  editor_definition: "lsp",
  editor_actions: "lsp",
  editor_rename: "lsp",
  editor_lsp_status: "lsp",
  editor_format: "lsp",

  // Web
  web_search: "web",
  fetch_page: "web",

  // Memory
  memory_write: "memory",
  memory_list: "memory",
  memory_search: "memory",
  memory_delete: "memory",

  // Agent / subagent
  dispatch: "agent",

  // Interactive UI
  plan: "ui",
  update_plan_step: "ui",
  ask_user: "ui",
  task_list: "ui",

  // Code execution (sandboxed)
  code_execution: "execution",

  // Repo map powered
  soul_grep: "repo-map",
  soul_find: "repo-map",
  soul_analyze: "repo-map",
  soul_impact: "repo-map",
};

export const CATEGORY_COLORS: Record<string, string> = {
  file: "#5C9FD6",
  shell: "#c55",
  git: "#4a7",
  lsp: "#c678dd",
  "tree-sitter": "#e5c07b",
  "ts-morph": "#3178C6",
  regex: "#888",
  code: "#e5c07b",
  web: "#5CBBF6",
  memory: "#b87333",
  agent: "#c080ff",
  ui: "#00BFFF",
  editor: "#5C9FD6",
  execution: "#c55",
  "repo-map": "#2dd4bf",
  brave: "#FB542B",
  ddg: "#DE5833",
  jina: "#FFAA00",
  "jina-api": "#FFAA00",
  readability: "#888",
  fetch: "#5CBBF6",
};

const BACKEND_LABELS_BASE: Record<string, string> = {
  jina: "jina",
  brave: "brave",
  ddg: "ddg",
  readability: "readability",
  fetch: "fetch",
};

export function getBackendLabel(tag: string): string {
  if (tag === "jina-api") return `jina ${icon("proxy")}`;
  return BACKEND_LABELS_BASE[tag] ?? tag;
}

// ─── Tool Icons ───

import { icon } from "./icons.js";

const TOOL_ICON_MAP: Record<string, string> = {
  read_file: "file",
  edit_file: "pencil",
  shell: "terminal",
  grep: "search",
  glob: "changes",
  dispatch: "explore",
  web_search: "globe",
  fetch_page: "file",
  memory_write: "bookmark",
  memory_list: "bookmark",
  memory_search: "search",
  memory_delete: "trash_alt",
  editor_read: "file",
  editor_edit: "pencil",
  editor_navigate: "arrow_right",
  editor_diagnostics: "warning",
  editor_symbols: "plan",
  editor_hover: "brain_alt",
  editor_references: "references",
  editor_definition: "definition",
  editor_actions: "actions",
  editor_rename: "rename",
  editor_lsp_status: "cog",
  editor_format: "format",
  git_status: "git",
  git_diff: "git",
  git_log: "git",
  git_commit: "git",
  git_push: "git",
  git_pull: "git",
  git_stash: "git",
  read_code: "code",
  navigate: "arrow_right",
  analyze: "search",
  rename_symbol: "rename",
  move_symbol: "arrow_right",
  refactor: "wrench",
  project: "terminal",
  test_scaffold: "plan",
  discover_pattern: "search",
  editor_panel: "pencil",
  plan: "plan",
  update_plan_step: "check",
  ask_user: "question",
  task_list: "plan",
  code_execution: "code",
  _repomap: "repomap",
  soul_grep: "search",
  soul_find: "search",
  soul_analyze: "repomap",
  soul_impact: "repomap",
};

export function toolIcon(name: string): string {
  const key = TOOL_ICON_MAP[name];
  return key ? icon(key) : icon("wrench");
}

export const TOOL_ICONS = new Proxy({} as Record<string, string>, {
  get(_, prop: string) {
    return toolIcon(prop);
  },
});

// ─── Tool Labels ───

export const TOOL_LABELS: Record<string, string> = {
  read_file: "Reading",
  edit_file: "Editing",
  shell: "Running",
  grep: "Searching",
  glob: "Globbing",
  dispatch: "Dispatching",
  web_search: "Searching web",
  fetch_page: "Fetching page",
  memory_write: "Recording",
  memory_list: "Listing memories",
  memory_search: "Searching memory",
  memory_delete: "Forgetting",
  editor_read: "Reading buffer",
  editor_edit: "Editing buffer",
  editor_navigate: "Navigating",
  editor_diagnostics: "Diagnostics",
  editor_symbols: "Symbols",
  editor_hover: "Hover",
  editor_references: "References",
  editor_definition: "Definition",
  editor_actions: "Code actions",
  editor_rename: "Renaming",
  editor_lsp_status: "LSP status",
  editor_format: "Formatting",
  git_status: "Git status",
  git_diff: "Git diff",
  git_log: "Git log",
  git_commit: "Committing",
  git_push: "Pushing",
  git_pull: "Pulling",
  git_stash: "Stashing",
  read_code: "Reading code",
  navigate: "Navigating",
  analyze: "Analyzing",
  rename_symbol: "Renaming symbol",
  move_symbol: "Moving symbol",
  refactor: "Refactoring",
  project: "Project",
  test_scaffold: "Scaffolding tests",
  discover_pattern: "Discovering",
  editor_panel: "Opening editor",
  plan: "Planning",
  update_plan_step: "Updating plan",
  ask_user: "Asking",
  task_list: "Tasks",
  code_execution: "Executing",
  soul_grep: "Searching",
  soul_find: "Finding",
  soul_analyze: "Analyzing",
  soul_impact: "Impact analysis",
};

// ─── Tool Icon Colors ───

export const TOOL_ICON_COLORS: Record<string, string> = {
  read_file: "#5C9FD6",
  edit_file: "#c89030",
  shell: "#c55",
  grep: "#c8b040",
  glob: "#5C9FD6",
  dispatch: "#9B30FF",
  web_search: "#5CBBF6",
  fetch_page: "#5CBBF6",
  memory_write: "#b87333",
  memory_list: "#b87333",
  memory_search: "#b87333",
  memory_delete: "#b87333",
  editor_read: "#5C9FD6",
  editor_edit: "#c89030",
  editor_navigate: "#5C9FD6",
  editor_diagnostics: "#c8b040",
  editor_symbols: "#8B5CF6",
  editor_hover: "#8B5CF6",
  editor_references: "#8B5CF6",
  editor_definition: "#8B5CF6",
  editor_actions: "#8B5CF6",
  editor_rename: "#c89030",
  editor_lsp_status: "#8B5CF6",
  editor_format: "#8B5CF6",
  git_status: "#4a7",
  git_diff: "#4a7",
  git_log: "#4a7",
  git_commit: "#c89030",
  git_push: "#c89030",
  git_pull: "#4a7",
  git_stash: "#4a7",
  read_code: "#8B5CF6",
  navigate: "#8B5CF6",
  analyze: "#8B5CF6",
  rename_symbol: "#c89030",
  move_symbol: "#c89030",
  refactor: "#c89030",
  project: "#c55",
  test_scaffold: "#8B5CF6",
  discover_pattern: "#8B5CF6",
  plan: "#00BFFF",
  update_plan_step: "#00BFFF",
  ask_user: "#c89030",
  task_list: "#00BFFF",
  editor_panel: "#5C9FD6",
  code_execution: "#c55",
  soul_grep: "#2dd4bf",
  soul_find: "#2dd4bf",
  soul_analyze: "#2dd4bf",
  soul_impact: "#2dd4bf",
};
