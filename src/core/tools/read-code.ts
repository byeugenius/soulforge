import { resolve } from "node:path";
import type { ToolResult } from "../../types/index.js";
import { getIntelligenceRouter } from "../intelligence/index.js";
import type { SymbolKind } from "../intelligence/types.js";
import { isForbidden } from "../security/forbidden.js";

type ReadTarget = "function" | "class" | "type" | "interface" | "variable" | "enum" | "scope";

interface ReadCodeArgs {
  target: ReadTarget;
  name?: string;
  file: string;
  startLine?: number;
  endLine?: number;
}

export const readCodeTool = {
  name: "read_code",
  description:
    "Read a specific function, class, type, or interface by name from a file. " +
    "Returns ONLY that symbol's code. More precise and token-efficient than read_file for targeted reading.",
  execute: async (args: ReadCodeArgs): Promise<ToolResult> => {
    try {
      const router = getIntelligenceRouter(process.cwd());
      const file = resolve(args.file);
      const blocked = isForbidden(file);
      if (blocked) {
        return {
          success: false,
          output: `Access denied: "${file}" matches forbidden pattern "${blocked}"`,
          error: "forbidden",
        };
      }
      const language = router.detectLanguage(file);

      if (args.target === "scope") {
        const startLine = args.startLine;
        if (!startLine) {
          return {
            success: false,
            output: "startLine is required for scope",
            error: "missing startLine",
          };
        }

        const tracked = await router.executeWithFallbackTracked(language, "readScope", (b) =>
          b.readScope ? b.readScope(file, startLine, args.endLine) : Promise.resolve(null),
        );

        if (!tracked) {
          return { success: false, output: "Could not read scope", error: "failed" };
        }

        const block = tracked.value;
        const range = block.location.endLine
          ? `${String(block.location.line)}-${String(block.location.endLine)}`
          : String(block.location.line);
        return {
          success: true,
          output: `${file}:${range}\n\n${block.content}`,
          backend: tracked.backend,
        };
      }

      // Symbol-based targets
      const name = args.name;
      if (!name) {
        return {
          success: false,
          output: `name is required for target '${args.target}'`,
          error: "missing name",
        };
      }

      const kindMap: Record<string, SymbolKind> = {
        function: "function",
        class: "class",
        type: "type",
        interface: "interface",
        variable: "variable",
        enum: "enum",
      };

      let tracked = await router.executeWithFallbackTracked(language, "readSymbol", (b) =>
        b.readSymbol ? b.readSymbol(file, name, kindMap[args.target]) : Promise.resolve(null),
      );

      if (!tracked) {
        tracked = await router.executeWithFallbackTracked(language, "readSymbol", (b) =>
          b.readSymbol ? b.readSymbol(file, name) : Promise.resolve(null),
        );
      }

      if (!tracked) {
        return {
          success: false,
          output: `'${name}' not found in ${file}`,
          error: "not found",
        };
      }

      const block = tracked.value;
      const range = block.location.endLine
        ? `${String(block.location.line)}-${String(block.location.endLine)}`
        : String(block.location.line);
      const header = block.symbolKind ? `${block.symbolKind} ${block.symbolName ?? name}` : name;
      return {
        success: true,
        output: `${header} — ${file}:${range}\n\n${block.content}`,
        backend: tracked.backend,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, output: msg, error: msg };
    }
  },
};
