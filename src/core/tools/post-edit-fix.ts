import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { getIntelligenceRouter } from "../intelligence/index.js";
import type { RefactorResult } from "../intelligence/types.js";
import { pushEdit } from "./edit-stack.js";
import { emitFileEdited } from "./file-events.js";

/**
 * Post-edit auto-fix: runs LSP source actions on a file after edits.
 * Same as VS Code's "organize imports on save" + "fix all on save".
 *
 * - source.organizeImports → removes unused imports, sorts
 * - source.fixAll → removes unused variables, auto-fixes diagnostics
 *
 * Returns list of actions applied (empty if nothing changed).
 */
export async function autoFixFile(filePath: string): Promise<string[]> {
  const absPath = resolve(filePath);
  const router = getIntelligenceRouter(process.cwd());
  const language = router.detectLanguage(absPath);
  const applied: string[] = [];

  // 1. Organize imports
  const organizeResult = await router.executeWithFallback(language, "organizeImports", (b) =>
    b.organizeImports ? b.organizeImports(absPath) : Promise.resolve(null),
  );
  if (organizeResult) {
    applyRefactorEdits(organizeResult);
    applied.push("organizeImports");
  }

  // 2. Fix all (unused vars, auto-fixable diagnostics)
  const fixResult = await router.executeWithFallback(language, "fixAll", (b) =>
    b.fixAll ? b.fixAll(absPath) : Promise.resolve(null),
  );
  if (fixResult) {
    applyRefactorEdits(fixResult);
    applied.push("fixAll");
  }

  return applied;
}

/**
 * Auto-fix multiple files in parallel. Best-effort — failures are silently skipped.
 * Returns map of file → actions applied.
 */
export async function autoFixFiles(filePaths: string[]): Promise<Map<string, string[]>> {
  const results = new Map<string, string[]>();
  const unique = [...new Set(filePaths.map((f) => resolve(f)))];

  await Promise.all(
    unique.map(async (file) => {
      try {
        const actions = await autoFixFile(file);
        if (actions.length > 0) results.set(file, actions);
      } catch {
        // Best-effort
      }
    }),
  );

  return results;
}

function applyRefactorEdits(result: RefactorResult): void {
  for (const edit of result.edits) {
    try {
      const current = readFileSync(edit.file, "utf-8");
      if (current === edit.newContent) continue;
      pushEdit(edit.file, current);
      writeFileSync(edit.file, edit.newContent, "utf-8");
      emitFileEdited(edit.file, edit.newContent);
    } catch {
      // Skip files that can't be written
    }
  }
}
