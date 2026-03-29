# Themes

SoulForge ships with 22 builtin themes and supports custom themes with hot reload.

## Quick Start

Press `/theme` or `Ctrl+K` → search "theme" to open the theme picker. Themes preview live as you navigate.

## Builtin Themes

### Dark

| Theme | Description |
|-------|-------------|
| `dark` | SoulForge default |
| `solarized-dark` | Ethan Schoonover's classic |
| `catppuccin` | Catppuccin Mocha |
| `catppuccin-frappe` | Catppuccin Frappe |
| `catppuccin-macchiato` | Catppuccin Macchiato |
| `gruvbox-dark` | Retro groove |
| `tokyo-night` | Tokyo Night |
| `tokyonight-storm` | Tokyo Night Storm |
| `dracula` | Dracula |
| `nord` | Arctic, north-bluish |
| `one-dark` | Atom One Dark |
| `rose-pine` | All natural pine |
| `kanagawa` | Inspired by Katsushika Hokusai |
| `github-dark` | GitHub Dark |
| `everforest-dark` | Comfortable green |
| `ayu-dark` | Ayu Dark |
| `nightfox` | Nightfox |

### Light

| Theme | Description |
|-------|-------------|
| `light` | Clean light theme |
| `catppuccin-latte` | Catppuccin Latte |
| `one-light` | Atom One Light |
| `github-light` | GitHub Light |

## Config

Theme is saved globally in `~/.soulforge/config.json`:

```json
{
  "theme": {
    "name": "catppuccin",
    "transparent": true
  }
}
```

| Field | Description |
|-------|-------------|
| `name` | Theme ID (builtin or custom) |
| `transparent` | Make background transparent (for terminal background bleed-through) |

Toggle transparency with `Tab` in the theme picker.

## Custom Themes

Create your own theme by adding a JSON file to `~/.soulforge/themes/`:

```bash
mkdir -p ~/.soulforge/themes
```

### Example: custom theme

`~/.soulforge/themes/my-theme.json`:

```json
{
  "_extends": "dark",
  "_label": "My Theme",
  "_description": "A custom dark theme",
  "_variant": "dark",
  "brand": "#ff6600",
  "brand-secondary": "#ff0040",
  "brand-dim": "#993d00",
  "bg-primary": "#1a1a2e",
  "bg-elevated": "#16213e",
  "text-primary": "#e0e0e0",
  "text-muted": "#888888",
  "success": "#00ff88",
  "error": "#ff4444",
  "warning": "#ffaa00",
  "info": "#4488ff"
}
```

The file name (minus `.json`) becomes the theme ID. This theme appears as "My Theme" in the picker.

### Metadata Fields

| Field | Description |
|-------|-------------|
| `_extends` | Inherit from a builtin theme (default: `dark`). Only override the tokens you want to change. |
| `_label` | Display name in the theme picker |
| `_description` | Description shown in the picker |
| `_variant` | `"dark"` or `"light"` — controls light/dark indicator in the picker |

### Token Reference

Tokens use kebab-case in JSON files (auto-converted to camelCase internally). The full list:

**Brand**
- `brand` — primary brand color (used for highlights, active elements)
- `brand-secondary` — secondary brand color
- `brand-dim` — dimmed brand variant
- `brand-alt` — alternative brand color

**Backgrounds**
- `bg-primary` — main background
- `bg-elevated` — panels, popups, modals
- `bg-sunken` — recessed areas

**Text**
- `text-primary` — main text
- `text-secondary` — secondary text
- `text-muted` — muted text
- `text-dim` — dimmed text
- `text-faint` — faintest text

**Borders**
- `border` — default border color
- `border-dim` — subtle borders

**Status**
- `success` — success indicators
- `error` — error indicators
- `warning` — warning indicators
- `info` — info indicators

**Diff**
- `diff-add` — added lines
- `diff-remove` — removed lines
- `diff-change` — changed lines

### Legacy Format

You can also define multiple themes in a single file at `~/.soulforge/themes.json`:

```json
{
  "my-theme": {
    "_extends": "dark",
    "brand": "#ff6600"
  },
  "another-theme": {
    "_extends": "light",
    "brand": "#0066ff"
  }
}
```

## Hot Reload

Theme files are watched for changes. Edit a custom theme file and the UI updates instantly — no restart needed. This applies to both `~/.soulforge/themes.json` and individual files in `~/.soulforge/themes/`.
