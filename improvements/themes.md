# Theme System Implementation Plan

## Status: Ready to Implement

**Estimated effort:** 2-3 hours focused work
**Risk:** Low — architecture is ideal for this (Ink + Zustand + existing config system)

---

## Current State Audit

### Config Infrastructure (already exists)

- `~/.soulforge/config.json` has `theme: { accentColor: string }` — **but it's dead code with ZERO consumers**
- `theme` is shallow-merged between global and project configs in `mergeConfigs()` (`src/config/index.ts:112`)
- `useConfigSync` hook watches config changes — can be extended to watch `themes.json`
- `saveGlobalConfig()`, `saveProjectConfig()`, `applyConfigPatch()` all handle nested `theme` key

### Type Definition (`src/types/index.ts:225-227`)

```ts
theme: {
  accentColor: string;  // free-form string, defaults to "cyan", NEVER READ by any component
};
```

### No Centralized Color System

- **~75+ unique hardcoded hex colors** spread across ~15 component files
- No theme store, no color context, no reactive color resolution
- All Ink components use `<text fg="#hexcode">` — string props, trivially replaceable

### Existing Color Constants (scattered, not shared)

| File | Constants |
|------|-----------|
| `src/core/tool-display.ts:71-93` | `CATEGORY_COLORS` — 21 tool category colors |
| `src/core/utils/splash.ts` | `BRAND_PURPLE=#9B30FF`, `BRAND_RED=#FF0040`, `BRAND_SEGMENTS` |
| `src/hooks/useForgeMode.ts:15-22` | `MODE_COLORS` — 6 forge mode colors |
| `src/components/chat/ToolCallDisplay.tsx:38-45` | `COLORS` — spinner/done/error (local) |
| `src/components/chat/ToolCallDisplay.tsx:196-201` | `CACHE_COLORS` — hit/wait/store/invalidate |
| `src/components/chat/MessageList.tsx:29-32` | `USER_COLOR`, `ASSISTANT_COLOR`, `SYSTEM_COLOR`, `ERROR_COLOR`, `RETRY_COLOR` |
| `src/components/chat/tool-formatters.ts:241-245` | `OUTSIDE_BADGE` — outside/config/tmp colors |
| `src/components/layout/EditorPanel.tsx:24-35` | `MODE_COLORS` — 9 vim mode colors |
| `src/components/layout/LandingPage.tsx:10-16` | `PURPLE`, `RED`, `FAINT`, `MUTED`, `SUBTLE`, `GREEN`, `AMBER` |
| `src/components/chat/ReasoningBlock.tsx:1-5` | `BORDER`, `BORDER_ACTIVE`, `TEXT_COLOR`, `MUTED`, `DIMMED` |
| `src/components/layout/ContextBar.tsx:17-45` | `getBarColor()`, `getPctColor()`, `getFlashColor()` threshold functions |

### Boot Screen (`src/boot.tsx`) — Special Case

Uses **raw ANSI escape codes** (`\x1b[38;2;R;G;Bm`) before React mounts:
```
PURPLE = rgb("#9B30FF")     — ghost icon, wordmark, spinner
DIM_PURPLE = rgb("#4a1a6b") — wisp animation
FAINT = rgb("#333333")      — garbled wordmark, dividers
MUTED = rgb("#555555")      — subtitle, spinner message
SUBTLE = rgb("#444444")     — subtitle dashes
RED = rgb("#FF0040")        — brand cursor animation
```
Also duplicated in child-process spinner as string literals:
```
const PURPLE = "\\x1b[38;2;155;48;255m";
const MUTED = "\\x1b[38;2;85;85;85m";
```
Reads config synchronously for nerdFont — can do the same for theme.

### Syntax Highlighting (`src/core/utils/syntax.ts:42-79`)

Hardcoded `ThemeTokenStyle[]` array with 20 scope-to-color mappings (Material-like dark theme).
Uses `@opentui/core`'s `SyntaxStyle.fromTheme()` — can regenerate from theme tokens.

---

## Complete Color Catalog by File

### `src/components/App.tsx` (header bar)

| Color | Usage |
|-------|-------|
| `#9B30FF` | SoulForge brand text |
| `#8B5CF6` | "proxy" label |
| `#444` | separator `›` |
| `#555` | "gateway" label |
| `#666` | provider icon |
| `#888` | model name |
| `#333` | dot separator `·`, border |
| `#b87333` | dirty git indicator |
| `#4a7` | clean git indicator |
| `#222` | dot separator (dim) |
| `modeColor` | from `MODE_COLORS[forgeMode]` |

### `src/components/chat/MessageList.tsx`

| Color | Usage |
|-------|-------|
| `#00BFFF` | `USER_COLOR` — user message accent |
| `#9B30FF` | `ASSISTANT_COLOR` — assistant accent |
| `#555` | `SYSTEM_COLOR` — system message accent |
| `#f44` | `ERROR_COLOR` — error messages |
| `#fa0` | `RETRY_COLOR` — retry messages |
| `#e88` | error text body |
| `#777` | system/retry text body, args |
| `#4a7` | success status dot |
| `#666` | denied/pending status |
| `#999` | labels |
| `#a55` | error in tool row |
| `#333` | hints |
| `#0a1218` | user message background |
| `CATEGORY_COLORS[cat]` | tool category colors (imported) |

### `src/components/chat/ToolCallDisplay.tsx`

| Color | Usage |
|-------|-------|
| `#9B30FF` | `spinnerActive`, `toolNameActive`, agent IDs |
| `#aaa` | `argsActive` |
| `#4a7` | `checkDone`, cache hit |
| `#555` | `textDone`, pending/thinking |
| `#f44` | `error` |
| `#FFDD57` | cache wait |
| `#5af` | cache store |
| `#f80` | cache invalidate |
| `#00CED1` | investigate role |
| `#FF6B2B` | code role |
| `#d9a020` | warning/trivial tier |
| `#2dd4bf` | non-trivial tier |
| `#333` | tree connectors |
| `#444` | done state |
| `#666` | running spinner |
| `#777`, `#888` | labels |
| `#ddd` | active name |
| `#5a9` | model label |
| `#8a6` | gear/steps |
| `#7a8` | token display |
| `#b87333` | awaiting review |
| `#b388ff` | brand variant |

### `src/components/chat/InputBox.tsx`

| Color | Usage |
|-------|-------|
| `#FF0040` | prompt `>`, focused border, fuzzy selected, highlight |
| `#FF8C00` | fuzzy mode border, fuzzy header |
| `#3a7bd5` | slash mode border, autocomplete unselected |
| `#5a9bf5` | autocomplete selected text |
| `#59122a` | busy border |
| `#333` | unfocused border, autocomplete unselected, hints |
| `#0d1520` | autocomplete bg |
| `#111` | fuzzy bg |
| `#444` | ghost text, hints, autocomplete dim |
| `#555` | placeholder, hints |
| `#666` | autocomplete selected dim |
| `#ccc` | text, normal highlight |
| `#fff` | fuzzy text bright |

### `src/components/layout/SystemBanner.tsx`

| Color | Usage (normal / error) |
|-------|----------------------|
| `#1a1028` / `#3a1010` | bgColor |
| `#9B30FF` / `#f44` | accentColor (LOCAL var, not from config) |
| `#c8b8e8` / `#faa` | textColor |
| `#b388ff` / `#f66` | iconColor |
| `#333` | dimColor |
| `#111` | fadeTarget |
| `#000` | fBg fade target |
| `#666` | ^O hint |

### `src/components/layout/EditorPanel.tsx`

| Color | Usage |
|-------|-------|
| `#6A0DAD` | normal mode, header bg |
| `#00AA00` | insert mode, vim hints on, install commands |
| `#FF8C00` | visual modes |
| `#FF0040` | replace mode, focused border, error, vim hints off |
| `#4488FF` | command modes |
| `#888888` | terminal mode |
| `#333` | borders/separators (×6), waiting, vim hints |
| `#444` | dim loading, vim hint labels |
| `#555` | file path, "nvim" label, install prefix |
| `#666` | error detail, cursor position |
| `#888` | filename |
| `#9B30FF` | animation loading |
| `white` | text on colored backgrounds |

### `src/components/layout/LandingPage.tsx`

| Color | Usage |
|-------|-------|
| `#9B30FF` | PURPLE — ghost, wordmark gradient start |
| `#FF0040` | RED — wordmark gradient end, errors, slash `/` |
| `#222` | FAINT — dividers |
| `#555` | MUTED — subtitle, indexed count |
| `#444` | SUBTLE — dashes, inactive providers, cmd args |
| `#4a7` | GREEN — active providers, tool checkmarks |
| `#b87333` | AMBER — indexing spinner |
| `#777` | command names |
| `#FF8C00` | optional missing tools |

### `src/components/chat/ReasoningBlock.tsx`

| Color | Usage |
|-------|-------|
| `#333` | BORDER, MUTED, ^T hint |
| `#3a3050` | BORDER_ACTIVE |
| `#444` | TEXT_COLOR |
| `#3a3a3a` | DIMMED — collapsed header |
| `#5a4a70` | ThinkingSpinner, brain icon |
| `#6a5a80` | reasoning label |
| `#2a2a2a` | ^T hint (streaming) |
| `#1a5` | checkmark ✓ |
| `#1a1a1a` | reasoning header bg |

### `src/components/layout/ContextBar.tsx`

Threshold-based color functions (all return hardcoded hex):
```
getBarColor():   <50% #1a6, <70% #a07018, <85% #b06000, ≥85% #b0002e
getPctColor():   <50% #176, <70% #7a5510, <85% #884a00, ≥85% #881020
getFlashColor(): same as getBarColor()
```
Additional: `#5af` (compacting), `#633` (compact:off), `#336` (v2 slots), `#222` (empty bar)

### `src/components/layout/TabInstance.tsx`

| Color | Usage |
|-------|-------|
| `#9B30FF` | streaming border, AI label |
| `#FF8C00` | steering queue indicator |
| `#333` | non-streaming border |
| `#444` | various dim labels |
| `#666` | queue count |

---

## Semantic Token Mapping

The ~75 hex values collapse into ~20 semantic tokens:

```ts
interface ThemeTokens {
  // Brand
  brand: string;            // #9B30FF — SoulForge purple
  brandSecondary: string;   // #FF0040 — SoulForge red
  brandDim: string;         // #4a1a6b — dim purple (boot wisp)
  brandAlt: string;         // #8B5CF6 — "proxy" label

  // Semantic status
  error: string;            // #f44
  success: string;          // #4a7
  warning: string;          // #FF8C00
  info: string;             // #5af / #00BFFF
  amber: string;            // #b87333

  // Text hierarchy
  textPrimary: string;      // #ccc / #ddd
  textSecondary: string;    // #888
  textMuted: string;        // #555
  textDim: string;          // #444
  textFaint: string;        // #333
  textSubtle: string;       // #222

  // Backgrounds (all support "transparent" for terminal bg passthrough)
  bgApp: string;            // root app bg — currently NONE (transparent by default)
  bgPopup: string;          // #111122 — modals/popups (POPUP_BG in shared.tsx)
  bgPopupHighlight: string; // #1a1a3e — popup selected row (POPUP_HL)
  bgOverlay: string;        // #0a0812 — modal dimming overlay
  bgPrimary: string;        // #000
  bgSecondary: string;      // #111
  bgElevated: string;       // #1a1a1a — reasoning block, diff view, plan view
  bgInput: string;          // #0d1520 — autocomplete dropdown
  bgBanner: string;         // #1a1028 — system banner
  bgBannerError: string;    // #3a1010 — error banner
  bgUser: string;           // #0a1218 — user message bubbles

  // Borders
  border: string;           // #333
  borderFocused: string;    // #FF0040
  borderActive: string;     // #9B30FF
  borderSlash: string;      // #3a7bd5

  // Accent colors (map to brand by default)
  accentUser: string;       // #00BFFF
  accentAssistant: string;  // #9B30FF
  accentSystem: string;     // #555
}
```

### Colors that stay FIXED (not theme-able)

These are semantic/identity colors that shouldn't change with themes:

| Constant | Reason |
|----------|--------|
| `CATEGORY_COLORS` (21 tool colors) | Semantic identity per tool category |
| `MODE_COLORS` (6 forge modes) | Semantic identity per mode |
| `CACHE_COLORS` (4 cache states) | Semantic status indicators |
| Vim `MODE_COLORS` (9 modes) | Standard vim mode conventions |

These could optionally be overridable via a separate `categoryColors` key in the theme, but should not be required.

---

## Implementation Plan

### New Files

```
src/core/theme/
  ├── tokens.ts     # ThemeTokens interface + DEFAULT_DARK + DEFAULT_LIGHT
  ├── store.ts      # useTheme() Zustand store — resolves active theme
  ├── loader.ts     # Load/watch ~/.soulforge/themes.json, merge with builtins
  └── index.ts      # Barrel export
```

### Step 1: Define Token Type + Built-in Themes (`src/core/theme/tokens.ts`)

```ts
export interface ThemeTokens {
  // ... (see semantic token mapping above)
}

export const DARK_THEME: ThemeTokens = {
  brand: "#9B30FF",
  brandSecondary: "#FF0040",
  brandDim: "#4a1a6b",
  brandAlt: "#8B5CF6",
  error: "#f44",
  success: "#4a7",
  warning: "#FF8C00",
  info: "#00BFFF",
  amber: "#b87333",
  textPrimary: "#ccc",
  textSecondary: "#888",
  textMuted: "#555",
  textDim: "#444",
  textFaint: "#333",
  textSubtle: "#222",
  bgPrimary: "#000",
  bgSecondary: "#111",
  bgElevated: "#1a1a1a",
  bgInput: "#0d1520",
  bgBanner: "#1a1028",
  bgBannerError: "#3a1010",
  bgUser: "#0a1218",
  border: "#333",
  borderFocused: "#FF0040",
  borderActive: "#9B30FF",
  borderSlash: "#3a7bd5",
  accentUser: "#00BFFF",
  accentAssistant: "#9B30FF",
  accentSystem: "#555",
};

export const LIGHT_THEME: ThemeTokens = {
  brand: "#7B20CF",
  brandSecondary: "#CC0030",
  brandDim: "#c4a0e8",
  brandAlt: "#6B4ACF",
  error: "#c00",
  success: "#080",
  warning: "#c60",
  info: "#0088CC",
  amber: "#8a5500",
  textPrimary: "#222",
  textSecondary: "#555",
  textMuted: "#888",
  textDim: "#aaa",
  textFaint: "#ccc",
  textSubtle: "#e5e5e5",
  bgPrimary: "#fff",
  bgSecondary: "#f5f5f5",
  bgElevated: "#eee",
  bgInput: "#f0f4f8",
  bgBanner: "#ece0f5",
  bgBannerError: "#fde8e8",
  bgUser: "#e8f0f5",
  border: "#ddd",
  borderFocused: "#CC0030",
  borderActive: "#7B20CF",
  borderSlash: "#3a7bd5",
  accentUser: "#0077BB",
  accentAssistant: "#7B20CF",
  accentSystem: "#888",
};
```

### Step 2: Theme Store (`src/core/theme/store.ts`)

```ts
import { create } from "zustand";
import { DARK_THEME, type ThemeTokens } from "./tokens.js";

interface ThemeState {
  name: string;
  tokens: ThemeTokens;
  setTheme: (name: string, tokens: ThemeTokens) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  name: "dark",
  tokens: DARK_THEME,
  setTheme: (name, tokens) => set({ name, tokens }),
}));

/** Convenience hook — returns just the tokens */
export function useTheme(): ThemeTokens {
  return useThemeStore((s) => s.tokens);
}

/** Non-hook access for boot.tsx and non-React code */
export function getThemeTokens(): ThemeTokens {
  return useThemeStore.getState().tokens;
}
```

### Step 3: Theme Loader (`src/core/theme/loader.ts`)

```ts
import { existsSync, readFileSync, watch } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { DARK_THEME, LIGHT_THEME, type ThemeTokens } from "./tokens.js";
import { useThemeStore } from "./store.js";

const THEMES_FILE = join(homedir(), ".soulforge", "themes.json");

const BUILTIN_THEMES: Record<string, ThemeTokens> = {
  dark: DARK_THEME,
  light: LIGHT_THEME,
};

function loadCustomThemes(): Record<string, Partial<ThemeTokens>> {
  if (!existsSync(THEMES_FILE)) return {};
  try {
    return JSON.parse(readFileSync(THEMES_FILE, "utf-8"));
  } catch {
    return {};
  }
}

export function resolveTheme(name: string): ThemeTokens {
  // Builtin themes
  if (BUILTIN_THEMES[name]) return BUILTIN_THEMES[name];

  // Custom themes extend dark by default
  const custom = loadCustomThemes();
  if (custom[name]) {
    const base = custom[name]._extends === "light" ? LIGHT_THEME : DARK_THEME;
    return { ...base, ...custom[name] };
  }

  return DARK_THEME; // fallback
}

export function applyTheme(name: string): void {
  const tokens = resolveTheme(name);
  useThemeStore.getState().setTheme(name, tokens);
}

export function watchThemes(): void {
  if (!existsSync(THEMES_FILE)) return;
  watch(THEMES_FILE, () => {
    const { name } = useThemeStore.getState();
    applyTheme(name); // re-resolve current theme on file change
  });
}
```

### Step 4: Expand AppConfig Type (`src/types/index.ts:225-227`)

```ts
// Before:
theme: {
  accentColor: string;
};

// After:
theme: {
  name: string;        // "dark" | "light" | custom theme name
  accentColor?: string; // deprecated, kept for compat
};
```

Update default in `src/config/index.ts:30-32`:
```ts
theme: {
  name: "dark",
},
```

### Step 5: Add `/theme` Command (`src/core/commands/config.ts`)

```ts
// /theme [name]     — switch theme
// /theme list       — show available themes
// /theme            — show current theme
```

### Step 6: Wire Config Sync (`src/hooks/useConfigSync.ts`)

Add effect to sync `effectiveConfig.theme.name` → `applyTheme()`.

### Step 7: Replace Hardcoded Colors in Components

**Files to modify (15 total):**

| File | Color replacements |
|------|-------------------|
| `src/components/App.tsx` | ~11 inline hex → `t.brand`, `t.textMuted`, `t.border`, etc. |
| `src/components/chat/MessageList.tsx` | Replace 5 constants + ~10 inline |
| `src/components/chat/ToolCallDisplay.tsx` | Replace `COLORS` + ~15 inline |
| `src/components/chat/InputBox.tsx` | ~15 inline → tokens |
| `src/components/chat/ReasoningBlock.tsx` | Replace 5 constants + ~5 inline |
| `src/components/layout/SystemBanner.tsx` | ~10 inline → tokens |
| `src/components/layout/EditorPanel.tsx` | ~15 inline → tokens |
| `src/components/layout/LandingPage.tsx` | Replace 7 constants + ~5 inline |
| `src/components/layout/ContextBar.tsx` | 3 threshold functions + ~5 inline |
| `src/components/layout/TabInstance.tsx` | ~5 inline → tokens |
| `src/core/utils/splash.ts` | `BRAND_PURPLE`, `BRAND_RED`, `BRAND_SEGMENTS` |
| `src/core/utils/syntax.ts` | Regenerate `ThemeTokenStyle[]` from tokens |
| `src/boot.tsx` | 6 ANSI color constants → sync theme load |
| `src/hooks/useForgeMode.ts` | `MODE_COLORS` (optional — could stay fixed) |
| `src/core/tool-display.ts` | `CATEGORY_COLORS` (optional — could stay fixed) |

**Pattern for each component:**
```tsx
// Add at top of component:
const t = useTheme();

// Replace inline colors:
// Before: <text fg="#9B30FF">
// After:  <text fg={t.brand}>

// Before: <text fg="#333">
// After:  <text fg={t.border}>
```

### Step 8: Syntax Highlighting Theme Integration (`src/core/utils/syntax.ts`)

```ts
// Before: hardcoded theme array
// After: function that generates ThemeTokenStyle[] from ThemeTokens
export function buildSyntaxTheme(tokens: ThemeTokens): ThemeTokenStyle[] {
  return [
    { scope: ["default"], style: { foreground: tokens.textSecondary } },
    { scope: ["keyword"], style: { foreground: tokens.brand } },
    { scope: ["string"], style: { foreground: tokens.success } },
    { scope: ["comment"], style: { foreground: tokens.textMuted } },
    // ... map remaining scopes
  ];
}
```

Invalidate cached `_syntaxStyle` when theme changes.

---

## Custom Theme File Format (`~/.soulforge/themes.json`)

```json
{
  "solarized-dark": {
    "_extends": "dark",
    "brand": "#268bd2",
    "brandSecondary": "#dc322f",
    "bgPrimary": "#002b36",
    "bgSecondary": "#073642",
    "textPrimary": "#839496",
    "textSecondary": "#657b83",
    "border": "#586e75"
  },
  "catppuccin": {
    "_extends": "dark",
    "brand": "#cba6f7",
    "brandSecondary": "#f38ba8",
    "error": "#f38ba8",
    "success": "#a6e3a1",
    "warning": "#fab387",
    "bgPrimary": "#1e1e2e",
    "bgSecondary": "#181825",
    "bgElevated": "#313244",
    "textPrimary": "#cdd6f4",
    "textSecondary": "#a6adc8",
    "textMuted": "#6c7086",
    "border": "#45475a"
  }
}
```

Users only need to override the tokens they want to change. Everything else inherits from the `_extends` base (`"dark"` or `"light"`).

---

## Live Runtime Switching Flow

```
User types: /theme catppuccin
  → config.ts command handler calls applyTheme("catppuccin")
  → loader.ts reads themes.json, finds "catppuccin", merges with DARK_THEME
  → store.ts updates tokens in Zustand store
  → ALL components using useTheme() re-render instantly
  → saveGlobalConfig({ theme: { name: "catppuccin" } }) persists choice

User edits ~/.soulforge/themes.json in another terminal:
  → fs.watch fires in loader.ts
  → re-resolves current theme name with new file contents
  → store updates → all components re-render
```

---

## Background & Transparency

### Current State

The root `<box>` in App.tsx (line 842) has **NO `backgroundColor`**:
```tsx
<box flexDirection="column" height={termHeight}>
```
This means the app already renders with a transparent background by default — the terminal's
own background shows through wherever no component explicitly sets `bg`.

### Explicit Backgrounds (~10 spots)

| Source | Color | Usage |
|--------|-------|-------|
| `shared.tsx:3` | `POPUP_BG = "#111122"` | ALL modals/popups — used by ~15 modal files via `bg={POPUP_BG}` |
| `shared.tsx:4` | `POPUP_HL = "#1a1a3e"` | Popup selected/highlighted rows |
| `shared.tsx:78` | `#0a0812` | Overlay dimming layer (with 0.65 opacity) |
| `MessageList.tsx` | `#0a1218` | User message bubble backgrounds (3 usages) |
| `InputBox.tsx` | `#0d1520` / `#111` | Autocomplete dropdown / fuzzy search bg |
| `ReasoningBlock.tsx` / `DiffView.tsx` / `StructuredPlanView.tsx` | `#1a1a1a` | Elevated content blocks |
| `ChangedFiles.tsx` | `#111` | Changed files panel bg |
| `EditorPanel.tsx` | mode colors as bg | Vim mode indicators in header bar |
| `SystemBanner.tsx` | `#1a1028` / `#3a1010` | Banner bg (normal / error), fades to `#111` → `#000` |

`@opentui/core`'s `ScreenSegment` interface explicitly supports `bg: string | undefined`
where `undefined = default/transparent`.

### Transparency Implementation

All `bg*` tokens in `ThemeTokens` accept `"transparent"` as a value. A transparent preset:

```json
{
  "transparent": {
    "_extends": "dark",
    "bgApp": "transparent",
    "bgPopup": "transparent",
    "bgPopupHighlight": "transparent",
    "bgOverlay": "transparent",
    "bgPrimary": "transparent",
    "bgSecondary": "transparent",
    "bgElevated": "transparent",
    "bgInput": "transparent",
    "bgBanner": "transparent",
    "bgBannerError": "transparent",
    "bgUser": "transparent"
  }
}
```

For partial transparency (popups opaque, chat transparent):
```json
{
  "glass": {
    "_extends": "dark",
    "bgApp": "transparent",
    "bgUser": "transparent",
    "bgElevated": "transparent",
    "bgPopup": "#111122",
    "bgPopupHighlight": "#1a1a3e",
    "bgOverlay": "#0a0812",
    "bgInput": "#0d1520"
  }
}
```

### Solid Background Implementation

To add a solid app-wide background, add `backgroundColor` to the root `<box>` in App.tsx:
```tsx
const t = useTheme();
return (
  <box flexDirection="column" height={termHeight} backgroundColor={t.bgApp}>
```

When `bgApp` is `"transparent"` or undefined, @opentui renders no bg — terminal shows through.
When `bgApp` is a hex like `"#1a1a2e"`, the entire app gets that background.

### Readability Caveat

When backgrounds are transparent, text contrast depends on the user's terminal background.
Dark gray text (`#333`, `#444`, `#555`) becomes invisible on dark terminal backgrounds.
Light theme text would be invisible on light terminal backgrounds.
Users choosing transparent mode accept this tradeoff.

### Files to Modify for Background Support

| File | Backgrounds to replace |
|------|----------------------|
| `src/components/App.tsx:842` | Add `backgroundColor={t.bgApp}` to root `<box>` |
| `src/components/layout/shared.tsx:3-4` | `POPUP_BG` / `POPUP_HL` → `t.bgPopup` / `t.bgPopupHighlight` |
| `src/components/layout/shared.tsx:78` | Overlay `#0a0812` → `t.bgOverlay` |
| `src/components/chat/MessageList.tsx` | 3× `#0a1218` → `t.bgUser` |
| `src/components/chat/InputBox.tsx` | `#0d1520` / `#111` → `t.bgInput` / `t.bgSecondary` |
| `src/components/chat/ReasoningBlock.tsx` | `#1a1a1a` → `t.bgElevated` |
| `src/components/chat/DiffView.tsx` | `#1a1a1a` → `t.bgElevated` |
| `src/components/plan/StructuredPlanView.tsx` | 2× `#1a1a1a` → `t.bgElevated` |
| `src/components/layout/ChangedFiles.tsx` | `#111` → `t.bgSecondary` |
| `src/components/layout/SystemBanner.tsx` | `#1a1028` / `#3a1010` → `t.bgBanner` / `t.bgBannerError` |
| ALL modal files (~15) | Already use `POPUP_BG` — changes propagate from shared.tsx |

Note: Modal files (LlmSelector, CommandPicker, SessionPicker, ErrorLog, CompactionLog,
HelpPopup, InfoPopup, GitMenu, GitCommitModal, SkillSearch, RouterSettings, ProviderSettings,
EditorSettings, WebSearchSettings, ApiKeySettings, LspStatusPopup, LspInstallSearch,
RepoMapStatusPopup, SetupGuide) all import `POPUP_BG` from shared.tsx. Replacing the
constant with a theme hook in `PopupRow` and `Overlay` propagates to all of them automatically.

---

## Migration Checklist

- [ ] Create `src/core/theme/tokens.ts` — ThemeTokens type + DARK_THEME + LIGHT_THEME + TRANSPARENT_THEME
- [ ] Create `src/core/theme/store.ts` — useThemeStore + useTheme() + getThemeTokens()
- [ ] Create `src/core/theme/loader.ts` — resolveTheme() + applyTheme() + watchThemes()
- [ ] Create `src/core/theme/index.ts` — barrel exports
- [ ] Update `src/types/index.ts` — expand theme type to `{ name: string }`
- [ ] Update `src/config/index.ts` — default theme name to "dark"
- [ ] Add `/theme` command in `src/core/commands/config.ts`
- [ ] Wire `useConfigSync` to call `applyTheme()` on theme.name change
- [ ] Migrate `src/components/App.tsx` — replace ~11 colors
- [ ] Migrate `src/components/chat/MessageList.tsx` — replace ~15 colors
- [ ] Migrate `src/components/chat/ToolCallDisplay.tsx` — replace ~20 colors
- [ ] Migrate `src/components/chat/InputBox.tsx` — replace ~15 colors
- [ ] Migrate `src/components/chat/ReasoningBlock.tsx` — replace ~10 colors
- [ ] Migrate `src/components/layout/SystemBanner.tsx` — replace ~10 colors
- [ ] Migrate `src/components/layout/EditorPanel.tsx` — replace ~15 colors
- [ ] Migrate `src/components/layout/LandingPage.tsx` — replace ~12 colors
- [ ] Migrate `src/components/layout/ContextBar.tsx` — replace threshold functions + ~5 colors
- [ ] Migrate `src/components/layout/TabInstance.tsx` — replace ~5 colors
- [ ] Migrate `src/core/utils/splash.ts` — use tokens for brand colors
- [ ] Migrate `src/core/utils/syntax.ts` — generate theme from tokens
- [ ] Migrate `src/boot.tsx` — sync theme load for ANSI colors
- [ ] Decide on `MODE_COLORS` and `CATEGORY_COLORS` — keep fixed or make overridable
- [ ] Test light theme end-to-end
- [ ] Test custom theme from themes.json
- [ ] Test live reload on themes.json change
- [ ] Test `/theme` command switching
