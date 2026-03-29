-- SoulForge default neovim config (LazyVim distribution)
-- Only loaded when user has no ~/.config/nvim/init.{lua,vim}
-- Data isolated via NVIM_APPNAME=soulforge → ~/.local/share/soulforge/

local o = vim.o
local opt = vim.opt

-- ─── Leader key (must be set before lazy) ───
vim.g.mapleader = " "
vim.g.maplocalleader = "\\"

-- ─── Embedded mode: suppress all prompts before plugins load ───
vim.opt.shortmess:append("aAIcCFsWqtTo")
vim.o.more = false
vim.o.cmdheight = 1

-- ─── Bootstrap lazy.nvim ───
local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not vim.uv.fs_stat(lazypath) then
  local out = vim.fn.system({
    "git", "clone", "--filter=blob:none",
    "https://github.com/folke/lazy.nvim.git",
    "--branch=stable",
    lazypath,
  })
  if vim.v.shell_error ~= 0 then
    vim.api.nvim_echo({
      { "Failed to clone lazy.nvim:\n", "ErrorMsg" },
      { out, "WarningMsg" },
    }, true, {})
    return
  end
end
vim.opt.rtp:prepend(lazypath)

-- ─── Mason tools (shared between mason.nvim and mason-tool-installer) ───
local mason_tools = {
  -- Web (JS/TS)
  "typescript-language-server",
  "eslint-lsp",
  "biome",
  "tailwindcss-language-server",
  "css-lsp",
  "html-lsp",
  "emmet-language-server",
  "svelte-language-server",
  "vue-language-server",
  "graphql-language-service-cli",
  "astro-language-server",
  -- Python
  "pyright",
  "ruff",
  -- Rust
  "rust-analyzer",
  -- Go
  "gopls",
  -- C/C++
  "clangd",
  -- Lua
  "lua-language-server",
  -- Shell
  "bash-language-server",
  -- Data / Config
  "json-lsp",
  "yaml-language-server",
  "taplo",
  -- Docker
  "dockerfile-language-server",
  "docker-compose-language-service",
  -- Markdown
  "marksman",
  -- SQL
  "sqlls",
  -- Formatters
  "prettier",
  "shfmt",
  "stylua",
  "black",
  "isort",
  -- Linters
  "shellcheck",
}

-- ─── Setup LazyVim ───
require("lazy").setup({
  spec = {
    { "LazyVim/LazyVim", import = "lazyvim.plugins" },

    -- ── Disable GPL-3.0 plugin (incompatible with BUSL-1.1) ──
    { "akinsho/bufferline.nvim", enabled = false },

    -- ── Theme: Catppuccin Mocha ──
    {
      "catppuccin/nvim",
      name = "catppuccin",
      lazy = false,
      priority = 1000,
      opts = {
        flavour = "mocha",
        transparent_background = true,
        integrations = {
          bufferline = true,
          gitsigns = true,
          indent_blankline = { enabled = true },
          mini = { enabled = true },
          native_lsp = {
            enabled = true,
            underlines = {
              errors = { "undercurl" },
              hints = { "undercurl" },
              warnings = { "undercurl" },
              information = { "undercurl" },
            },
          },
          neotree = true,
          noice = true,
          notify = true,
          treesitter = true,
          which_key = true,
        },
      },
    },

    -- ── Dashboard: SoulForge branding ──
    {
      "folke/snacks.nvim",
      opts = {
        dashboard = {
          preset = {
            header = table.concat({
              "",
              "  ███████╗ ██████╗ ██╗   ██╗██╗     ███████╗ ██████╗ ██████╗  ██████╗ ███████╗",
              "  ██╔════╝██╔═══██╗██║   ██║██║     ██╔════╝██╔═══██╗██╔══██╗██╔════╝ ██╔════╝",
              "  ███████╗██║   ██║██║   ██║██║     █████╗  ██║   ██║██████╔╝██║  ███╗█████╗  ",
              "  ╚════██║██║   ██║██║   ██║██║     ██╔══╝  ██║   ██║██╔══██╗██║   ██║██╔══╝  ",
              "  ███████║╚██████╔╝╚██████╔╝███████╗██║     ╚██████╔╝██║  ██║╚██████╔╝███████╗",
              "  ╚══════╝ ╚═════╝  ╚═════╝ ╚══════╝╚═╝      ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝",
              "",
              "                     ⚡ Graph-Powered Code Intelligence",
              "",
            }, "\n"),
          },
        },
      },
    },

    -- ── Mason: ensure LSP servers + formatters + linters ──
    {
      "mason-org/mason.nvim",
      opts = { ensure_installed = mason_tools },
    },

    -- ── Mason Tool Installer (headless bootstrap + auto-install on start) ──
    {
      "WhoIsSethDaniel/mason-tool-installer.nvim",
      dependencies = { "mason-org/mason.nvim" },
      lazy = false,
      opts = {
        ensure_installed = mason_tools,
        auto_update = false,
        run_on_start = true,
        start_delay = 1000,
        debounce_hours = 24,
      },
    },

    -- ── Tree-sitter: ensure common parsers ──
    {
      "nvim-treesitter/nvim-treesitter",
      opts = {
        ensure_installed = {
          "typescript", "tsx", "javascript", "json", "json5", "jsonc",
          "html", "css", "scss", "graphql", "svelte", "vue",
          "rust", "go", "c", "cpp", "zig",
          "lua", "python", "ruby", "bash",
          "markdown", "markdown_inline", "yaml", "toml", "dockerfile",
          "sql", "prisma",
          "vim", "vimdoc", "regex", "query", "diff",
          "git_config", "gitcommit", "gitignore",
        },
      },
    },

    -- ── Gitsigns: custom signs ──
    {
      "lewis6991/gitsigns.nvim",
      opts = {
        signs = {
          add          = { text = "▎" },
          change       = { text = "▎" },
          delete       = { text = "▁" },
          topdelete    = { text = "▔" },
          changedelete = { text = "▎" },
        },
      },
    },
  },

  defaults = {
    lazy = false,
    version = false,
  },
  install = {
    colorscheme = { "catppuccin", "tokyonight", "habamax" },
  },
  checker = { enabled = false },
  change_detection = { enabled = false },
  performance = {
    rtp = {
      disabled_plugins = {
        "gzip", "tarPlugin", "tohtml", "tutor", "zipPlugin",
      },
    },
  },
})

-- ─── Auto-close Lazy UI (embedded mode — user shouldn't need to press q) ───
-- Close the Lazy floating window after install/sync/update finishes
for _, event in ipairs({ "LazyInstall", "LazySync", "LazyUpdate" }) do
  vim.api.nvim_create_autocmd("User", {
    pattern = event,
    callback = function()
      vim.defer_fn(function()
        for _, win in ipairs(vim.api.nvim_list_wins()) do
          if vim.api.nvim_win_is_valid(win) then
            local buf = vim.api.nvim_win_get_buf(win)
            if vim.bo[buf].filetype == "lazy" then
              pcall(vim.api.nvim_win_close, win, true)
            end
          end
        end
      end, 2000)
    end,
  })
end

-- ─── Post-plugin overrides (embedded mode + sane defaults for non-vim users) ───

-- Display — predictable line numbers, no relative (confuses non-vim users)
o.number = true
o.relativenumber = false
o.cursorline = true
o.signcolumn = "yes"
o.wrap = true
o.linebreak = true
o.breakindent = true
opt.breakindentopt = { "shift:2" }
o.showbreak = "↪ "
o.conceallevel = 0
o.cmdheight = 1
o.fillchars = "eob: "
o.pumheight = 12
o.scrolloff = 8
o.sidescrolloff = 8

-- Indentation — 2-space tabs (web-dev friendly)
o.tabstop = 2
o.shiftwidth = 2
o.expandtab = true
o.smartindent = true
o.shiftround = true

-- Search — case-insensitive unless uppercase used
o.ignorecase = true
o.smartcase = true

-- Behavior (embedded mode — suppress all prompts, clipboard integration)
o.swapfile = false
o.clipboard = "unnamedplus"
o.mouse = "a"
o.splitright = true
o.splitbelow = true
o.confirm = true
o.undofile = true
o.updatetime = 300
opt.shortmess:append("aAIcCFsWqtTo")
o.more = false
o.inccommand = "split"
o.completeopt = "menuone,noselect,popup"

-- Make window separators visible
vim.api.nvim_set_hl(0, "WinSeparator", { fg = "#333333", bg = "NONE" })

-- ─── VS Code muscle memory keybindings ───

-- Save with Ctrl+S (works in all modes)
vim.keymap.set({ "n", "i", "v" }, "<C-s>", "<cmd>write<CR><Esc>", { silent = true, desc = "Save file" })

-- Undo with Ctrl+Z in insert mode
vim.keymap.set("i", "<C-z>", "<cmd>undo<CR>", { silent = true, desc = "Undo" })

-- jk to exit insert mode (beginner escape hatch)
vim.keymap.set("i", "jk", "<Esc>", { silent = true, desc = "Exit insert mode" })

-- Stay in visual mode when indenting
vim.keymap.set("v", "<", "<gv", { silent = true })
vim.keymap.set("v", ">", ">gv", { silent = true })

-- Move lines up/down in visual mode (Alt+j/k)
vim.keymap.set("v", "J", ":m '>+1<CR>gv=gv", { silent = true })
vim.keymap.set("v", "K", ":m '<-2<CR>gv=gv", { silent = true })

-- ─── SoulForge autocmds ───

-- Auto-reload files changed on disk
vim.api.nvim_create_autocmd({ "FocusGained", "BufEnter", "CursorHold" }, {
  pattern = "*",
  command = "silent! checktime",
})

-- Highlight on yank (visual feedback when copying)
vim.api.nvim_create_autocmd("TextYankPost", {
  callback = function()
    pcall(vim.highlight.on_yank, { higroup = "IncSearch", timeout = 200 })
  end,
})

-- Restore cursor position when reopening files
vim.api.nvim_create_autocmd("BufReadPost", {
  callback = function()
    local mark = vim.api.nvim_buf_get_mark(0, '"')
    local lines = vim.api.nvim_buf_line_count(0)
    if mark[1] > 0 and mark[1] <= lines then
      pcall(vim.api.nvim_win_set_cursor, 0, mark)
    end
  end,
})

-- Trim trailing whitespace on save
vim.api.nvim_create_autocmd("BufWritePre", {
  callback = function()
    local ft = vim.bo.filetype
    if ft == "diff" or ft == "mail" then return end
    local pos = vim.api.nvim_win_get_cursor(0)
    vim.cmd([[silent! %s/\s\+$//e]])
    pcall(vim.api.nvim_win_set_cursor, 0, pos)
  end,
})

-- Notify SoulForge on buffer write (repo map live updates)
vim.api.nvim_create_autocmd("BufWritePost", {
  callback = function()
    local path = vim.api.nvim_buf_get_name(0)
    if path and path ~= "" then
      pcall(vim.rpcnotify, 0, "soulforge:file_written", path)
    end
  end,
})
