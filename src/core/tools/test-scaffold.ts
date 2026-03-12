import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import type { ToolResult } from "../../types/index.js";
import { getIntelligenceRouter } from "../intelligence/index.js";
import { isForbidden } from "../security/forbidden.js";
import { emitFileEdited } from "./file-events.js";

type TestFramework = "vitest" | "jest" | "bun" | "pytest" | "go" | "cargo";

function detectTestFramework(cwd: string): TestFramework {
  if (existsSync(join(cwd, "bun.lock")) || existsSync(join(cwd, "bun.lockb"))) return "bun";
  if (existsSync(join(cwd, "vitest.config.ts")) || existsSync(join(cwd, "vitest.config.js")))
    return "vitest";
  if (existsSync(join(cwd, "jest.config.ts")) || existsSync(join(cwd, "jest.config.js")))
    return "jest";
  if (existsSync(join(cwd, "pytest.ini")) || existsSync(join(cwd, "pyproject.toml")))
    return "pytest";
  if (existsSync(join(cwd, "go.mod"))) return "go";
  if (existsSync(join(cwd, "Cargo.toml"))) return "cargo";
  if (existsSync(join(cwd, "package.json"))) return "vitest";
  return "vitest";
}

interface TestScaffoldArgs {
  file: string;
  framework?: TestFramework;
  output?: string;
}

export const testScaffoldTool = {
  name: "test_scaffold",
  description:
    "Generate a test file skeleton from a source file's exports. " +
    "Analyzes the file outline and creates describe/it blocks for each exported function/class.",
  execute: async (args: TestScaffoldArgs): Promise<ToolResult> => {
    try {
      const router = getIntelligenceRouter(process.cwd());
      const file = resolve(args.file);
      const language = router.detectLanguage(file);
      const framework = args.framework ?? detectTestFramework(process.cwd());

      const outline = await router.executeWithFallback(language, "getFileOutline", (b) =>
        b.getFileOutline ? b.getFileOutline(file) : Promise.resolve(null),
      );

      if (!outline) {
        return {
          success: false,
          output: "Could not analyze file — no backend available",
          error: "unsupported",
        };
      }

      const exports = outline.exports;
      if (exports.length === 0) {
        return {
          success: false,
          output: "No exports found in file",
          error: "no exports",
        };
      }

      const exportDetails = await Promise.all(
        exports.map(async (exp) => {
          const typeInfo = await router.executeWithFallback(language, "getTypeInfo", (b) =>
            b.getTypeInfo ? b.getTypeInfo(file, exp.name) : Promise.resolve(null),
          );
          return { name: exp.name, kind: exp.kind, type: typeInfo?.type };
        }),
      );

      // Generate test file
      const outputPath = args.output ?? inferTestPath(file);
      const relativePath = relative(dirname(outputPath), file).replace(/\\/g, "/");
      const importPath = relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
      const importPathNoExt = importPath.replace(/\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/, "");

      const lines: string[] = [];

      // Import statement
      const importNames = exports.filter((e) => !e.isDefault).map((e) => e.name);
      const defaultExport = exports.find((e) => e.isDefault);

      if (framework === "bun") {
        lines.push(`import { describe, it, expect } from "bun:test";`);
      } else if (framework === "vitest" || framework === "jest") {
        lines.push(`import { describe, it, expect } from "${framework}";`);
      }

      const importParts: string[] = [];
      if (defaultExport) {
        importParts.push(defaultExport.name === "default" ? "defaultExport" : defaultExport.name);
      }
      if (importNames.length > 0) {
        const namedPart = `{ ${importNames.join(", ")} }`;
        if (importParts.length > 0) {
          importParts.push(namedPart);
        } else {
          importParts.push(namedPart);
        }
      }

      if (importParts.length > 0) {
        const importSpec =
          defaultExport && importNames.length > 0
            ? `${importParts[0]}, ${importParts[1]}`
            : importParts.join(", ");
        lines.push(`import ${importSpec} from "${importPathNoExt}";`);
      }

      lines.push("");

      // Generate describe/it blocks
      const sourceBasename = basename(file, extname(file));
      lines.push(`describe("${sourceBasename}", () => {`);

      for (const exp of exportDetails) {
        if (exp.name === "default") continue;
        lines.push("");

        if (exp.kind === "function") {
          const typeHint = exp.type ? ` // ${exp.type}` : "";
          lines.push(`  describe("${exp.name}", () => {${typeHint}`);
          lines.push(`    it("should work correctly", () => {`);
          lines.push(`      // TODO: implement test`);
          lines.push(`      expect(${exp.name}).toBeDefined();`);
          lines.push(`    });`);
          lines.push(`  });`);
        } else if (exp.kind === "class") {
          lines.push(`  describe("${exp.name}", () => {`);
          lines.push(`    it("should be instantiable", () => {`);
          lines.push(`      // TODO: implement test`);
          lines.push(`      expect(${exp.name}).toBeDefined();`);
          lines.push(`    });`);
          lines.push(`  });`);
        } else {
          lines.push(`  it("should export ${exp.name}", () => {`);
          lines.push(`    expect(${exp.name}).toBeDefined();`);
          lines.push(`  });`);
        }
      }

      lines.push("});");
      lines.push("");

      const content = lines.join("\n");
      const resolvedOutput = resolve(outputPath);
      const blocked = isForbidden(resolvedOutput);
      if (blocked) {
        return {
          success: false,
          output: `Access denied: output path matches forbidden pattern "${blocked}"`,
          error: "forbidden",
        };
      }
      if (!resolvedOutput.startsWith(process.cwd())) {
        return {
          success: false,
          output: "Output path must be within the project directory",
          error: "path outside project",
        };
      }
      mkdirSync(dirname(resolvedOutput), { recursive: true });
      writeFileSync(resolvedOutput, content, "utf-8");
      emitFileEdited(resolvedOutput, content);

      return {
        success: true,
        output: `Generated test scaffold at ${outputPath}\n${String(exports.length)} export(s) → ${String(exportDetails.length)} test case(s)`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, output: msg, error: msg };
    }
  },
};

function inferTestPath(sourcePath: string): string {
  const dir = dirname(sourcePath);
  const base = basename(sourcePath, extname(sourcePath));
  const ext = extname(sourcePath);
  // Try __tests__ dir first, fallback to .test.ts in same dir
  const testsDir = join(dir, "__tests__");
  try {
    const { statSync } = require("node:fs");
    if (statSync(testsDir).isDirectory()) {
      return join(testsDir, `${base}.test${ext}`);
    }
  } catch {
    // __tests__ doesn't exist
  }
  return join(dir, `${base}.test${ext}`);
}
