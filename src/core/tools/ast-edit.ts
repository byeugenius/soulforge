import { readFile, stat as statAsync, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ToolResult } from "../../types/index.js";
import { analyzeFile } from "../analysis/complexity.js";
import { markToolWrite, reloadBuffer } from "../editor/instance.js";
import type { SurgicalOperation } from "../intelligence/backends/ts-morph.js";
import { TsMorphBackend } from "../intelligence/backends/ts-morph.js";
import { isForbidden } from "../security/forbidden.js";
import { formatMetricDelta } from "./edit-file.js";
import { pushEdit } from "./edit-stack.js";
import { emitFileEdited } from "./file-events.js";
import {
  appendAutoFormatResult,
  appendCloneHints,
  appendPostEditDiagnostics,
  startPreEditDiagnostics,
} from "./post-edit-helpers.js";

const SUPPORTED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mts",
  ".cts",
  ".mjs",
  ".cjs",
]);

function isSupportedFile(filePath: string): boolean {
  const dot = filePath.lastIndexOf(".");
  if (dot === -1) return false;
  return SUPPORTED_EXTENSIONS.has(filePath.slice(dot));
}

interface AstEditArgs {
  path: string;
  // Single operation (flat args)
  action?: string;
  target?: string;
  name?: string;
  value?: string;
  newCode?: string;
  index?: number;
  // Multi-operation atomic mode
  operations?: SurgicalOperation[];
  tabId?: string;
}

/** Shared backend instance — lazily initialized, reused across calls. */
let _backend: TsMorphBackend | null = null;

function getBackend(cwd: string): TsMorphBackend {
  if (!_backend) {
    _backend = new TsMorphBackend();
    _backend.initialize(cwd);
  }
  return _backend;
}

/**
 * 100% ts-morph surgical AST editing for TypeScript/JavaScript files.
 * Inspired by the JS Typer thesis (Ouail Bni & Artur Matusiak).
 *
 * Three tiers of operations — from micro-edit to full replacement:
 *
 * Tier 1 — Surgical (1-10 tokens): set_type, set_return_type, set_initializer,
 *   set_async, set_export, rename, remove, add_parameter, remove_parameter, set_optional
 *
 * Tier 2 — Body surgery (10-100 tokens): set_body, add_statement, insert_statement,
 *   remove_statement, add_property, remove_property, add_method, add_member, remove_member
 *
 * Tier 3 — Full replacement: replace (whole symbol)
 *
 * File-level: add_import, remove_import, organize_imports, fix_missing_imports, fix_unused,
 *   add_function, add_class, add_interface, add_type_alias, add_enum
 *
 * Zero string matching. Zero line math. Zero oldString.
 * ts-morph handles locate → mutate → serialize entirely.
 */
export const astEditTool = {
  name: "ast_edit",
  description:
    "[Experimental] AST-addressed edit for TS/JS files. Locates symbols by target+name, replaces entire body with newCode. " +
    "No oldString needed — ts-morph AST finds the exact location and handles replacement. " +
    "Single symbol: pass target, name, newCode. " +
    "Multiple symbols (atomic): pass symbols array [{target, name, newCode}, ...]. " +
    "All-or-nothing: if any symbol lookup fails, zero edits are applied.",
  execute: async (args: AstEditArgs): Promise<ToolResult> => {
    try {
      const filePath = resolve(args.path);

      const blocked = isForbidden(filePath);
      if (blocked) {
        const msg = `Access denied: "${args.path}" matches forbidden pattern "${blocked}".`;
        return { success: false, output: msg, error: msg };
      }

      if (!isSupportedFile(filePath)) {
        const msg = `ast_edit only supports TS/JS files. Use edit_file for "${args.path}".`;
        return { success: false, output: msg, error: "unsupported file type" };
      }

      // Normalize: flat single-op args OR operations array
      let ops: SurgicalOperation[];
      if (args.operations && args.operations.length > 0) {
        ops = args.operations;
      } else if (args.action) {
        ops = [
          {
            action: args.action,
            target: args.target,
            name: args.name,
            value: args.value,
            newCode: args.newCode,
            index: args.index,
          },
        ];
      } else {
        const msg =
          "Provide action (+ target/name/value/newCode) for a single operation, " +
          "or an operations array for multiple atomic operations.";
        return { success: false, output: msg, error: "missing parameters" };
      }

      try {
        await statAsync(filePath);
      } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException).code;
        const msg =
          code === "EACCES" || code === "EPERM"
            ? `Permission denied: ${filePath}`
            : `File not found: ${filePath}`;
        return { success: false, output: msg, error: msg };
      }

      // CAS: snapshot disk content before ts-morph touches anything
      const contentOnDisk = await readFile(filePath, "utf-8");

      const cwd = process.cwd();
      const backend = getBackend(cwd);

      // Delegate entirely to ts-morph surgical engine
      const result = await backend.surgicalEdit(filePath, ops);

      if (!result.ok) {
        return {
          success: false,
          output: result.error,
          error: "surgical edit failed",
        };
      }

      const { before, after: updated, details } = result;

      // CAS: verify ts-morph's view matches disk (stale project cache detection)
      if (contentOnDisk !== before) {
        const msg = "File content diverged (ts-morph cache stale). Re-read and retry.";
        return { success: false, output: msg, error: "stale cache" };
      }
      // CAS: verify no concurrent modification since our snapshot
      const currentOnDisk = await readFile(filePath, "utf-8");
      if (currentOnDisk !== contentOnDisk) {
        const msg = "File was modified concurrently since last read. Re-read and retry.";
        return { success: false, output: msg, error: "concurrent modification" };
      }

      // Write with full undo + diagnostics pipeline
      const beforeMetrics = analyzeFile(before);
      const afterMetrics = analyzeFile(updated);
      const diagsPromise = startPreEditDiagnostics(filePath);

      pushEdit(filePath, before, updated, args.tabId);
      await writeFile(filePath, updated, "utf-8");
      markToolWrite(filePath);
      emitFileEdited(filePath, updated);

      reloadBuffer(filePath, 1).catch(() => {});

      const deltas = [
        formatMetricDelta("lines", beforeMetrics.lineCount, afterMetrics.lineCount),
        formatMetricDelta("imports", beforeMetrics.importCount, afterMetrics.importCount),
      ].filter(Boolean);

      let output: string;
      if (details.length === 1) {
        output = `Edited ${filePath} → ${details[0]}`;
      } else {
        output = `Applied ${String(details.length)} AST operations to ${filePath}:\n${details.map((d: string) => `  • ${d}`).join("\n")}`;
      }
      if (deltas.length > 0) output += ` (${deltas.join(", ")})`;

      output = await appendAutoFormatResult(filePath, updated, output, args.tabId);
      output = await appendPostEditDiagnostics(diagsPromise, filePath, output);
      output = await appendCloneHints(filePath, output);

      return { success: true, output };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, output: msg, error: msg };
    }
  },
};
