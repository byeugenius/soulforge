import { existsSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import type { MemoryDB } from "./db.js";

interface OldDecision {
  id: string;
  timestamp: number;
  summary: string;
  rationale: string;
  tags?: string[];
}

interface OldInvariant {
  name: string;
  rule: string;
  scope?: string;
}

interface OldConstraint {
  name: string;
  metric: string;
  limit: number;
  scope?: string;
  action: "warn" | "block";
}

export function migrateOldMemory(memoryDir: string, db: MemoryDB): { migrated: number } {
  let migrated = 0;

  const decisionsPath = join(memoryDir, "decisions.jsonl");
  if (existsSync(decisionsPath)) {
    try {
      const lines = readFileSync(decisionsPath, "utf-8").split("\n").filter(Boolean);
      for (const line of lines) {
        const d = JSON.parse(line) as OldDecision;
        const title = d.rationale
          ? `${d.summary} — ${d.rationale}`.slice(0, 120)
          : d.summary.slice(0, 120);
        db.write({
          id: d.id,
          title,
          category: "decision",
          tags: d.tags ?? [],
        });
        migrated++;
      }
    } catch {}
  }

  const invariantsPath = join(memoryDir, "invariants.json");
  if (existsSync(invariantsPath)) {
    try {
      const invariants = JSON.parse(readFileSync(invariantsPath, "utf-8")) as OldInvariant[];
      for (const inv of invariants) {
        const title = `${inv.name}: ${inv.rule}${inv.scope ? ` (${inv.scope})` : ""}`.slice(0, 120);
        db.write({
          title,
          category: "convention",
          tags: inv.scope ? [inv.scope] : [],
        });
        migrated++;
      }
    } catch {}
  }

  const constraintsPath = join(memoryDir, "constraints.json");
  if (existsSync(constraintsPath)) {
    try {
      const constraints = JSON.parse(readFileSync(constraintsPath, "utf-8")) as OldConstraint[];
      for (const c of constraints) {
        const title =
          `${c.name}: ${c.metric} ≤ ${String(c.limit)}${c.scope ? ` (${c.scope})` : ""} [${c.action}]`.slice(
            0,
            120,
          );
        db.write({
          title,
          category: "convention",
          tags: c.scope ? [c.scope] : [],
        });
        migrated++;
      }
    } catch {}
  }

  if (migrated > 0) {
    const backupDir = `${memoryDir}.bak`;
    if (!existsSync(backupDir)) {
      renameSync(memoryDir, backupDir);
    }
  }

  return { migrated };
}
