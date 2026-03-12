import { relative } from "node:path";
import type { ToolResult } from "../../types";
import type { RepoMap } from "../intelligence/repo-map.js";
import { isForbidden } from "../security/forbidden.js";

type ImpactAction = "dependents" | "dependencies" | "cochanges" | "blast_radius";

interface SoulImpactArgs {
  action: ImpactAction;
  file: string;
}

export const soulImpactTool = {
  name: "soul_impact",
  description:
    "Dependency graph traversal and impact analysis. All data from the indexed repo map — zero token cost.\n" +
    "Actions:\n" +
    "- dependents: files that import from this file (who breaks if this changes?)\n" +
    "- dependencies: files this file imports (what does it rely on?)\n" +
    "- cochanges: files that historically change together in git commits (related by behavior, not imports)\n" +
    "- blast_radius: combined view — dependents + cochanges + blast count. Use for 'what is affected if I change X?'",

  createExecute: (repoMap?: RepoMap) => {
    return async (args: SoulImpactArgs): Promise<ToolResult> => {
      if (!repoMap?.isReady) {
        return { success: false, output: "Repo map not ready.", error: "not ready" };
      }

      if (isForbidden(args.file) !== null) {
        return {
          success: false,
          output: `Access denied: "${args.file}" is blocked for security.`,
          error: "forbidden",
        };
      }

      const cwd = process.cwd();
      const relPath = args.file.startsWith("/") ? relative(cwd, args.file) : args.file;

      switch (args.action) {
        case "dependents":
          return showDependents(repoMap, relPath);
        case "dependencies":
          return showDependencies(repoMap, relPath);
        case "cochanges":
          return showCoChanges(repoMap, relPath);
        case "blast_radius":
          return showBlastRadius(repoMap, relPath);
        default:
          return {
            success: false,
            output: `Unknown action: ${String(args.action)}`,
            error: "invalid",
          };
      }
    };
  },
};

function showDependents(repoMap: RepoMap, relPath: string): ToolResult {
  const dependents = repoMap.getFileDependents(relPath);
  if (dependents.length === 0) {
    return { success: true, output: `No files depend on "${relPath}" (or file not indexed).` };
  }

  const lines = [
    `${String(dependents.length)} files import from "${relPath}":\n`,
    ...dependents.filter((d) => isForbidden(d.path) === null).map((d) => `  ${d.path}`),
  ];

  return { success: true, output: lines.join("\n") };
}

function showDependencies(repoMap: RepoMap, relPath: string): ToolResult {
  const deps = repoMap.getFileDependencies(relPath);
  if (deps.length === 0) {
    return {
      success: true,
      output: `"${relPath}" has no tracked dependencies (or file not indexed).`,
    };
  }

  const lines = [
    `"${relPath}" imports from ${String(deps.length)} files:\n`,
    ...deps.filter((d) => isForbidden(d.path) === null).map((d) => `  ${d.path}`),
  ];

  return { success: true, output: lines.join("\n") };
}

function showCoChanges(repoMap: RepoMap, relPath: string): ToolResult {
  const cochanges = repoMap.getFileCoChanges(relPath);
  if (cochanges.length === 0) {
    return { success: true, output: `No co-change partners found for "${relPath}".` };
  }

  const lines = [
    `Files that historically change together with "${relPath}":\n`,
    ...cochanges
      .filter((c) => isForbidden(c.path) === null)
      .map((c) => `  ${c.path} (${String(c.count)} co-commits)`),
  ];

  return { success: true, output: lines.join("\n") };
}

function showBlastRadius(repoMap: RepoMap, relPath: string): ToolResult {
  const dependents = repoMap.getFileDependents(relPath);
  const cochanges = repoMap.getFileCoChanges(relPath);
  const blastCount = repoMap.getFileBlastRadius(relPath);
  const symbols = repoMap.getFileSymbols(relPath);

  if (dependents.length === 0 && cochanges.length === 0 && symbols.length === 0) {
    return { success: true, output: `"${relPath}" not found in repo map index.` };
  }

  const allAffected = new Set<string>();
  for (const d of dependents) allAffected.add(d.path);
  for (const c of cochanges) allAffected.add(c.path);

  const lines = [
    `Blast radius for "${relPath}":\n`,
    `  Direct dependents: ${String(blastCount)}`,
    `  Co-change partners: ${String(cochanges.length)}`,
    `  Total affected files: ${String(allAffected.size)}`,
  ];

  if (symbols.length > 0) {
    lines.push(`\nExported symbols (${String(symbols.length)}):`);
    for (const s of symbols) {
      lines.push(`  ${s.kind} ${s.name}`);
    }
  }

  if (dependents.length > 0) {
    lines.push(`\nDirect dependents (${String(dependents.length)}):`);
    for (const d of dependents.filter((d) => isForbidden(d.path) === null).slice(0, 20)) {
      lines.push(`  ${d.path}`);
    }
    if (dependents.length > 20) lines.push(`  ... and ${String(dependents.length - 20)} more`);
  }

  if (cochanges.length > 0) {
    const coOnly = cochanges.filter(
      (c) => !dependents.some((d) => d.path === c.path) && isForbidden(c.path) === null,
    );
    if (coOnly.length > 0) {
      lines.push(`\nCo-change only (related by git history, not imports):`);
      for (const c of coOnly.slice(0, 10)) {
        lines.push(`  ${c.path} (${String(c.count)} co-commits)`);
      }
    }
  }

  return { success: true, output: lines.join("\n") };
}
