import { resolve } from "node:path";
import type {
  CodeBlock,
  Diagnostic,
  ExportInfo,
  FileEdit,
  FileOutline,
  ImportInfo,
  IntelligenceBackend,
  Language,
  RefactorResult,
  SourceLocation,
  SymbolInfo,
  SymbolKind,
  TypeHierarchyResult,
  TypeInfo,
  UnusedItem,
} from "../types.js";

// Lazy import to avoid loading ts-morph until needed
type TsMorphModule = typeof import("ts-morph");
type Project = import("ts-morph").Project;
type SourceFile = import("ts-morph").SourceFile;
type Node = import("ts-morph").Node;

/** A single surgical AST operation — from micro-edit to full replacement. */
export interface SurgicalOperation {
  action: string;
  /** Symbol kind: function, class, interface, type, enum, variable, constant */
  target?: string;
  /** Symbol name to operate on */
  name?: string;
  /** Short value for surgical ops (type string, new name, boolean as string, etc.) */
  value?: string;
  /** Code body for body surgery / full replacement / new statements */
  newCode?: string;
  /** Statement index for insert_statement / remove_statement */
  index?: number;
}

/** Result from surgicalEdit() — before/after content for the CAS + undo pipeline. */
export type SurgicalResult =
  | { ok: true; before: string; after: string; details: string[] }
  | { ok: false; error: string };

let tsMorphModule: TsMorphModule | null = null;

async function getTsMorph(): Promise<TsMorphModule> {
  if (!tsMorphModule) {
    tsMorphModule = await import("ts-morph");
  }
  return tsMorphModule;
}

/**
 * ts-morph based backend (Tier 2) for TypeScript/JavaScript.
 * Full semantic analysis: definitions, references, diagnostics, rename, etc.
 * Falls back here when LSP is unavailable.
 */
export class TsMorphBackend implements IntelligenceBackend {
  readonly name = "ts-morph";
  readonly tier = 2;
  private project: Project | null = null;
  private cwd = "";

  supportsLanguage(language: Language): boolean {
    return language === "typescript" || language === "javascript";
  }

  async initialize(cwd: string): Promise<void> {
    this.cwd = cwd;
    // Project is created lazily on first use
  }

  dispose(): void {
    this.project = null;
  }

  async findDefinition(
    file: string,
    symbol: string,
    line?: number,
    column?: number,
  ): Promise<SourceLocation[] | null> {
    const sourceFile = await this.getSourceFile(file);
    if (!sourceFile) return null;

    const node = this.findNode(sourceFile, symbol, line, column);
    if (!node) return null;

    const ts = await getTsMorph();
    if (!ts.Node.isIdentifier(node)) {
      return null;
    }

    const defs = node.getDefinitionNodes();
    if (defs.length === 0) return null;

    return defs.map((d: import("ts-morph").Node) => ({
      file: d.getSourceFile().getFilePath(),
      line: d.getStartLineNumber(),
      column: d.getStart() - d.getStartLinePos() + 1,
    }));
  }

  async findReferences(
    file: string,
    symbol: string,
    line?: number,
    column?: number,
  ): Promise<SourceLocation[] | null> {
    const sourceFile = await this.getSourceFile(file);
    if (!sourceFile) return null;

    const node = this.findNode(sourceFile, symbol, line, column);
    if (!node) return null;

    const ts = await getTsMorph();
    if (!ts.Node.isIdentifier(node)) return null;

    const refs = node.findReferencesAsNodes();
    if (refs.length === 0) return null;

    return refs.map((r) => ({
      file: r.getSourceFile().getFilePath(),
      line: r.getStartLineNumber(),
      column: r.getStart() - r.getStartLinePos() + 1,
    }));
  }

  async findSymbols(file: string, query?: string): Promise<SymbolInfo[] | null> {
    const sourceFile = await this.getSourceFile(file);
    if (!sourceFile) return null;

    const symbols: SymbolInfo[] = [];
    const ts = await getTsMorph();

    // Functions
    for (const fn of sourceFile.getFunctions()) {
      const name = fn.getName();
      if (!name) continue;
      if (query && !name.toLowerCase().includes(query.toLowerCase())) continue;
      symbols.push({
        name,
        kind: "function",
        location: {
          file: resolve(file),
          line: fn.getStartLineNumber(),
          column: 1,
          endLine: fn.getEndLineNumber(),
        },
      });
    }

    // Classes
    for (const cls of sourceFile.getClasses()) {
      const name = cls.getName();
      if (!name) continue;
      if (query && !name.toLowerCase().includes(query.toLowerCase())) continue;
      symbols.push({
        name,
        kind: "class",
        location: {
          file: resolve(file),
          line: cls.getStartLineNumber(),
          column: 1,
          endLine: cls.getEndLineNumber(),
        },
      });
    }

    // Interfaces
    for (const iface of sourceFile.getInterfaces()) {
      const name = iface.getName();
      if (query && !name.toLowerCase().includes(query.toLowerCase())) continue;
      symbols.push({
        name,
        kind: "interface",
        location: {
          file: resolve(file),
          line: iface.getStartLineNumber(),
          column: 1,
          endLine: iface.getEndLineNumber(),
        },
      });
    }

    // Type aliases
    for (const ta of sourceFile.getTypeAliases()) {
      const name = ta.getName();
      if (query && !name.toLowerCase().includes(query.toLowerCase())) continue;
      symbols.push({
        name,
        kind: "type",
        location: {
          file: resolve(file),
          line: ta.getStartLineNumber(),
          column: 1,
          endLine: ta.getEndLineNumber(),
        },
      });
    }

    // Enums
    for (const en of sourceFile.getEnums()) {
      const name = en.getName();
      if (query && !name.toLowerCase().includes(query.toLowerCase())) continue;
      symbols.push({
        name,
        kind: "enum",
        location: {
          file: resolve(file),
          line: en.getStartLineNumber(),
          column: 1,
          endLine: en.getEndLineNumber(),
        },
      });
    }

    // Variable declarations (const/let)
    for (const stmt of sourceFile.getVariableStatements()) {
      for (const decl of stmt.getDeclarations()) {
        const name = decl.getName();
        if (query && !name.toLowerCase().includes(query.toLowerCase())) continue;
        const isConst = stmt.getDeclarationKind() === ts.VariableDeclarationKind.Const;
        symbols.push({
          name,
          kind: isConst ? "constant" : "variable",
          location: {
            file: resolve(file),
            line: decl.getStartLineNumber(),
            column: 1,
            endLine: decl.getEndLineNumber(),
          },
        });
      }
    }

    return symbols;
  }

  async findImports(file: string): Promise<ImportInfo[] | null> {
    const sourceFile = await this.getSourceFile(file);
    if (!sourceFile) return null;

    return sourceFile.getImportDeclarations().map((imp) => {
      const specifiers: string[] = [];
      const defaultImport = imp.getDefaultImport();
      if (defaultImport) specifiers.push(defaultImport.getText());

      for (const named of imp.getNamedImports()) {
        specifiers.push(named.getName());
      }

      const namespaceImport = imp.getNamespaceImport();

      return {
        source: imp.getModuleSpecifierValue(),
        specifiers,
        isDefault: !!defaultImport,
        isNamespace: !!namespaceImport,
        location: {
          file: resolve(file),
          line: imp.getStartLineNumber(),
          column: 1,
          endLine: imp.getEndLineNumber(),
        },
      };
    });
  }

  async findExports(file: string): Promise<ExportInfo[] | null> {
    const sourceFile = await this.getSourceFile(file);
    if (!sourceFile) return null;

    const exports: ExportInfo[] = [];

    for (const exp of sourceFile.getExportedDeclarations()) {
      const [name, decls] = exp;
      for (const decl of decls) {
        let kind: SymbolKind = "variable";
        const ts = await getTsMorph();
        if (ts.Node.isFunctionDeclaration(decl)) kind = "function";
        else if (ts.Node.isClassDeclaration(decl)) kind = "class";
        else if (ts.Node.isInterfaceDeclaration(decl)) kind = "interface";
        else if (ts.Node.isTypeAliasDeclaration(decl)) kind = "type";
        else if (ts.Node.isEnumDeclaration(decl)) kind = "enum";

        exports.push({
          name,
          isDefault: name === "default",
          kind,
          location: {
            file: resolve(file),
            line: decl.getStartLineNumber(),
            column: 1,
            endLine: decl.getEndLineNumber(),
          },
        });
      }
    }

    return exports;
  }

  async getDiagnostics(file: string): Promise<Diagnostic[] | null> {
    const sourceFile = await this.getSourceFile(file);
    if (!sourceFile) return null;

    const project = this.getProject();
    if (!project) return null;

    const preDiags = project
      .getPreEmitDiagnostics()
      .filter((d) => d.getSourceFile()?.getFilePath() === sourceFile.getFilePath());

    const ts = await getTsMorph();

    return preDiags.map((d) => {
      const start = d.getStart();
      let line = 1;
      let column = 1;
      if (start !== undefined) {
        const lineAndCol = sourceFile.getLineAndColumnAtPos(start);
        line = lineAndCol.line;
        column = lineAndCol.column;
      }

      const catMap: Record<number, Diagnostic["severity"]> = {
        [ts.DiagnosticCategory.Error]: "error",
        [ts.DiagnosticCategory.Warning]: "warning",
        [ts.DiagnosticCategory.Suggestion]: "hint",
        [ts.DiagnosticCategory.Message]: "info",
      };

      return {
        file: resolve(file),
        line,
        column,
        severity: catMap[d.getCategory()] ?? "error",
        message: d.getMessageText().toString(),
        code: d.getCode(),
        source: "typescript",
      };
    });
  }

  async getTypeInfo(
    file: string,
    symbol: string,
    line?: number,
    column?: number,
  ): Promise<TypeInfo | null> {
    const sourceFile = await this.getSourceFile(file);
    if (!sourceFile) return null;

    const node = this.findNode(sourceFile, symbol, line, column);
    if (!node) return null;

    const nodeType = node.getType();

    return {
      symbol,
      type: nodeType.getText(node),
      documentation: this.getNodeDocumentation(node),
    };
  }

  async getFileOutline(file: string): Promise<FileOutline | null> {
    const [symbols, imports, exports] = await Promise.all([
      this.findSymbols(file),
      this.findImports(file),
      this.findExports(file),
    ]);

    if (!symbols) return null;

    const language = this.detectLang(file);

    return {
      file: resolve(file),
      language,
      symbols,
      imports: imports ?? [],
      exports: exports ?? [],
    };
  }

  async readSymbol(
    file: string,
    symbolName: string,
    symbolKind?: SymbolKind,
  ): Promise<CodeBlock | null> {
    const sourceFile = await this.getSourceFile(file);
    if (!sourceFile) return null;

    const ts = await getTsMorph();
    const language = this.detectLang(file);

    // Search through different declaration types
    const candidates: Node[] = [];

    if (!symbolKind || symbolKind === "function") {
      candidates.push(...sourceFile.getFunctions().filter((f) => f.getName() === symbolName));
    }
    if (!symbolKind || symbolKind === "class") {
      candidates.push(...sourceFile.getClasses().filter((c) => c.getName() === symbolName));
    }
    if (!symbolKind || symbolKind === "interface") {
      candidates.push(...sourceFile.getInterfaces().filter((i) => i.getName() === symbolName));
    }
    if (!symbolKind || symbolKind === "type") {
      candidates.push(...sourceFile.getTypeAliases().filter((t) => t.getName() === symbolName));
    }
    if (!symbolKind || symbolKind === "enum") {
      candidates.push(...sourceFile.getEnums().filter((e) => e.getName() === symbolName));
    }
    if (!symbolKind || symbolKind === "variable" || symbolKind === "constant") {
      for (const stmt of sourceFile.getVariableStatements()) {
        for (const decl of stmt.getDeclarations()) {
          if (decl.getName() === symbolName) {
            candidates.push(stmt);
          }
        }
      }
    }

    const target = candidates[0];
    if (!target) return null;

    let kind: SymbolKind = "unknown";
    if (ts.Node.isFunctionDeclaration(target)) kind = "function";
    else if (ts.Node.isClassDeclaration(target)) kind = "class";
    else if (ts.Node.isInterfaceDeclaration(target)) kind = "interface";
    else if (ts.Node.isTypeAliasDeclaration(target)) kind = "type";
    else if (ts.Node.isEnumDeclaration(target)) kind = "enum";
    else if (ts.Node.isVariableStatement(target)) kind = "variable";

    return {
      content: target.getFullText().trimStart(),
      location: {
        file: resolve(file),
        line: target.getStartLineNumber(),
        column: 1,
        endLine: target.getEndLineNumber(),
      },
      symbolName,
      symbolKind: kind,
      language,
    };
  }

  async readScope(file: string, startLine: number, endLine?: number): Promise<CodeBlock | null> {
    const sourceFile = await this.getSourceFile(file);
    if (!sourceFile) return null;

    const language = this.detectLang(file);
    const fullText = sourceFile.getFullText();
    const lines = fullText.split("\n");
    const startIdx = Math.max(0, startLine - 1);
    const endIdx = endLine
      ? Math.min(endLine - 1, lines.length - 1)
      : Math.min(startIdx + 50, lines.length - 1);

    const blockContent = lines.slice(startIdx, endIdx + 1).join("\n");

    return {
      content: blockContent,
      location: {
        file: resolve(file),
        line: startLine,
        column: 1,
        endLine: endIdx + 1,
      },
      language,
    };
  }

  async rename(
    file: string,
    symbol: string,
    newName: string,
    line?: number,
    column?: number,
  ): Promise<RefactorResult | null> {
    const sourceFile = await this.getSourceFile(file);
    if (!sourceFile) return null;

    const node = this.findNode(sourceFile, symbol, line, column);
    if (!node) return null;

    const ts = await getTsMorph();
    if (!ts.Node.isIdentifier(node)) return null;

    // Collect all files that will be affected before rename
    const refs = node.findReferencesAsNodes();
    const affectedFiles = new Set<string>();
    for (const ref of refs) {
      affectedFiles.add(ref.getSourceFile().getFilePath());
    }
    affectedFiles.add(sourceFile.getFilePath());

    // Get content before rename
    const beforeContent = new Map<string, string>();
    for (const filePath of affectedFiles) {
      const sf = this.getProject()?.getSourceFile(filePath);
      if (sf) beforeContent.set(filePath, sf.getFullText());
    }

    // Perform rename
    node.rename(newName);

    // Collect edits
    const edits: FileEdit[] = [];
    for (const filePath of affectedFiles) {
      const sf = this.getProject()?.getSourceFile(filePath);
      const before = beforeContent.get(filePath);
      if (sf && before) {
        const after = sf.getFullText();
        if (before !== after) {
          edits.push({
            file: filePath,
            oldContent: before,
            newContent: after,
          });
        }
      }
    }

    return {
      edits,
      description: `Renamed '${symbol}' to '${newName}' in ${String(edits.length)} file(s)`,
    };
  }

  async extractFunction(
    file: string,
    startLine: number,
    endLine: number,
    functionName: string,
  ): Promise<RefactorResult | null> {
    const sourceFile = await this.getSourceFile(file);
    if (!sourceFile) return null;

    const ts = await getTsMorph();
    const fullText = sourceFile.getFullText();
    const lines = fullText.split("\n");
    const startIdx = Math.max(0, startLine - 1);
    const endIdx = Math.min(endLine - 1, lines.length - 1);

    const extractedLines = lines.slice(startIdx, endIdx + 1);
    const extractedCode = extractedLines.join("\n");
    const indent = (extractedLines[0] ?? "").match(/^(\s*)/)?.[1] ?? "";

    // Analyze the extracted range to find referenced outer-scope variables
    const startPos = sourceFile.compilerNode.getPositionOfLineAndCharacter(startIdx, 0);
    const endPos = sourceFile.compilerNode.getPositionOfLineAndCharacter(
      endIdx,
      (lines[endIdx] ?? "").length,
    );

    const params: string[] = [];
    const paramNames = new Set<string>();

    // Walk descendants in the range and find identifiers referencing outer scope
    sourceFile.forEachDescendant((node) => {
      if (!ts.Node.isIdentifier(node)) return;
      const nodeStart = node.getStart();
      if (nodeStart < startPos || nodeStart > endPos) return;

      const name = node.getText();
      if (paramNames.has(name)) return;

      // Check if this identifier is defined outside the range
      const defs = node.getDefinitionNodes();
      for (const def of defs) {
        const defStart = def.getStartLineNumber();
        if (def.getSourceFile() === sourceFile && (defStart < startLine || defStart > endLine)) {
          // It's an outer variable — add as parameter
          const nodeType = node.getType();
          const typeText = nodeType.getText(node);
          params.push(`${name}: ${typeText}`);
          paramNames.add(name);
          break;
        }
      }
    });

    // Detect return value from last expression
    const lastLine = extractedLines[extractedLines.length - 1]?.trim() ?? "";
    const hasReturn = lastLine.startsWith("return ");
    const paramList = params.join(", ");
    const argList = [...paramNames].join(", ");

    const newFunc = `\nfunction ${functionName}(${paramList}) {\n${extractedCode}\n}\n`;
    const callExpr = hasReturn
      ? `${indent}return ${functionName}(${argList});`
      : `${indent}${functionName}(${argList});`;

    const newLines = [...lines];
    newLines.splice(startIdx, endIdx - startIdx + 1, callExpr);
    const newContent = `${newLines.join("\n")}\n${newFunc}`;

    return {
      edits: [
        {
          file: resolve(file),
          oldContent: fullText,
          newContent,
        },
      ],
      description: `Extracted lines ${String(startLine)}-${String(endLine)} into function '${functionName}(${paramList})'`,
    };
  }

  async extractVariable(
    file: string,
    startLine: number,
    endLine: number,
    variableName: string,
  ): Promise<RefactorResult | null> {
    const sourceFile = await this.getSourceFile(file);
    if (!sourceFile) return null;

    const fullText = sourceFile.getFullText();
    const lines = fullText.split("\n");
    const startIdx = Math.max(0, startLine - 1);
    const endIdx = Math.min(endLine - 1, lines.length - 1);

    const extractedCode = lines
      .slice(startIdx, endIdx + 1)
      .join("\n")
      .trim();
    const indent = (lines[startIdx] ?? "").match(/^(\s*)/)?.[1] ?? "";

    const declaration = `${indent}const ${variableName} = ${extractedCode};`;
    const replacement = `${indent}${variableName}`;

    const newLines = [...lines];
    newLines.splice(startIdx, endIdx - startIdx + 1, declaration, replacement);

    return {
      edits: [
        {
          file: resolve(file),
          oldContent: fullText,
          newContent: newLines.join("\n"),
        },
      ],
      description: `Extracted lines ${String(startLine)}-${String(endLine)} into variable '${variableName}'`,
    };
  }

  async findImplementation(
    file: string,
    symbol: string,
    line?: number,
    column?: number,
  ): Promise<SourceLocation[] | null> {
    const sourceFile = await this.getSourceFile(file);
    if (!sourceFile) return null;

    const node = this.findNode(sourceFile, symbol, line, column);
    if (!node) return null;

    const ts = await getTsMorph();
    if (!ts.Node.isIdentifier(node)) return null;

    const impls = node.getImplementations();
    if (impls.length === 0) return null;

    return impls.map((impl) => {
      const sf = impl.getSourceFile();
      const pos = sf.getLineAndColumnAtPos(impl.getTextSpan().getStart());
      return {
        file: sf.getFilePath(),
        line: pos.line,
        column: pos.column,
      };
    });
  }

  async getTypeHierarchy(
    file: string,
    symbol: string,
    line?: number,
    column?: number,
  ): Promise<TypeHierarchyResult | null> {
    const sourceFile = await this.getSourceFile(file);
    if (!sourceFile) return null;

    const node = this.findNode(sourceFile, symbol, line, column);
    if (!node) return null;

    const ts = await getTsMorph();
    const parent = ts.Node.isIdentifier(node) ? node.getParent() : node;
    if (!parent) return null;

    const item = {
      name: symbol,
      kind: "function" as SourceLocation["file"] extends string ? "class" : "unknown" as never,
      file: resolve(file),
      line: node.getStartLineNumber(),
    };

    const supertypes: TypeHierarchyResult["supertypes"] = [];
    const subtypes: TypeHierarchyResult["subtypes"] = [];

    if (ts.Node.isClassDeclaration(parent)) {
      item.kind = "class" as never;
      // Supertypes
      const baseClass = parent.getBaseClass();
      if (baseClass) {
        supertypes.push({
          name: baseClass.getName() ?? "anonymous",
          kind: "class",
          file: baseClass.getSourceFile().getFilePath(),
          line: baseClass.getStartLineNumber(),
        });
      }
      for (const impl of parent.getImplements()) {
        const typeNode = impl.getExpression();
        const defs = ts.Node.isIdentifier(typeNode) ? typeNode.getDefinitionNodes() : [];
        for (const def of defs) {
          supertypes.push({
            name: typeNode.getText(),
            kind: "interface",
            file: def.getSourceFile().getFilePath(),
            line: def.getStartLineNumber(),
          });
        }
      }
      // Subtypes — find classes that extend this one
      const refs = parent.getNameNode()?.findReferencesAsNodes() ?? [];
      for (const ref of refs) {
        const refParent = ref.getParent();
        if (refParent && ts.Node.isHeritageClause(refParent.getParent() ?? refParent)) {
          const classDecl = refParent.getParent()?.getParent();
          if (classDecl && ts.Node.isClassDeclaration(classDecl)) {
            subtypes.push({
              name: classDecl.getName() ?? "anonymous",
              kind: "class",
              file: classDecl.getSourceFile().getFilePath(),
              line: classDecl.getStartLineNumber(),
            });
          }
        }
      }
    } else if (ts.Node.isInterfaceDeclaration(parent)) {
      item.kind = "interface" as never;
      // Supertypes
      for (const ext of parent.getExtends()) {
        const typeNode = ext.getExpression();
        const defs = ts.Node.isIdentifier(typeNode) ? typeNode.getDefinitionNodes() : [];
        for (const def of defs) {
          supertypes.push({
            name: typeNode.getText(),
            kind: "interface",
            file: def.getSourceFile().getFilePath(),
            line: def.getStartLineNumber(),
          });
        }
      }
      // Subtypes — find implementors
      const refs = parent.getNameNode().findReferencesAsNodes();
      for (const ref of refs) {
        const refParent = ref.getParent();
        if (refParent && ts.Node.isHeritageClause(refParent.getParent() ?? refParent)) {
          const container = refParent.getParent()?.getParent();
          if (container && ts.Node.isClassDeclaration(container)) {
            subtypes.push({
              name: container.getName() ?? "anonymous",
              kind: "class",
              file: container.getSourceFile().getFilePath(),
              line: container.getStartLineNumber(),
            });
          }
        }
      }
    } else {
      return null;
    }

    return { item, supertypes, subtypes };
  }

  async findUnused(file: string): Promise<UnusedItem[] | null> {
    const sourceFile = await this.getSourceFile(file);
    if (!sourceFile) return null;

    const ts = await getTsMorph();
    const unused: UnusedItem[] = [];

    // Check unused imports
    for (const imp of sourceFile.getImportDeclarations()) {
      const defaultImport = imp.getDefaultImport();
      if (defaultImport) {
        const refs = defaultImport.findReferencesAsNodes();
        // Only the declaration itself = unused
        if (refs.length <= 1) {
          unused.push({
            name: defaultImport.getText(),
            kind: "import",
            file: resolve(file),
            line: imp.getStartLineNumber(),
          });
        }
      }
      for (const named of imp.getNamedImports()) {
        const nameNode = named.getAliasNode();
        const effectiveNode = nameNode ?? named.getNameNode();
        const refs =
          "findReferencesAsNodes" in effectiveNode
            ? (effectiveNode as import("ts-morph").Identifier).findReferencesAsNodes()
            : [];
        if (refs.length <= 1) {
          unused.push({
            name: named.getName(),
            kind: "import",
            file: resolve(file),
            line: imp.getStartLineNumber(),
          });
        }
      }
    }

    // Check unused exports — see if exported symbol is imported anywhere
    const project = this.getProject();
    if (project) {
      for (const [name, decls] of sourceFile.getExportedDeclarations()) {
        if (name === "default") continue;
        const decl = decls[0];
        if (!decl) continue;
        const nameNode = ts.Node.isIdentifier(decl)
          ? decl
          : "getNameNode" in decl && typeof decl.getNameNode === "function"
            ? (decl.getNameNode() as Node | undefined)
            : null;
        if (!nameNode || !ts.Node.isIdentifier(nameNode)) continue;

        const refs = nameNode.findReferencesAsNodes();
        const externalRefs = refs.filter((r) => r.getSourceFile() !== sourceFile);
        if (externalRefs.length === 0) {
          unused.push({
            name,
            kind: "export",
            file: resolve(file),
            line: decl.getStartLineNumber(),
          });
        }
      }
    }

    return unused.length > 0 ? unused : null;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Surgical AST Mutation Engine — inspired by JS Typer thesis (Ouail Bni)
  // 100% ts-morph: locate by AST, mutate by AST, serialize by AST.
  // Zero string matching. Zero line math. Zero oldString.
  // ═══════════════════════════════════════════════════════════════════════

  /** All supported surgical actions — 65+ operations covering 100% of ts-morph's mutation surface */
  static readonly SURGICAL_ACTIONS = [
    // ── Tier 1: Surgical micro-edits (1-10 tokens) ──
    "set_type",
    "set_return_type",
    "set_value",
    "set_initializer",
    "remove_initializer",
    "set_async",
    "set_generator",
    "set_export",
    "set_default_export",
    "set_abstract",
    "set_static",
    "set_readonly",
    "set_scope",
    "set_optional",
    "set_overrides",
    "set_ambient",
    "set_const_enum",
    "rename",
    "remove",
    "add_parameter",
    "remove_parameter",
    "set_declaration_kind",
    // ── Tier 2: Body surgery (10-100 tokens) ──
    "set_body",
    "add_statement",
    "insert_statement",
    "remove_statement",
    "add_property",
    "remove_property",
    "add_method",
    "remove_method",
    "add_member",
    "remove_member",
    "add_constructor",
    "add_getter",
    "add_setter",
    "add_decorator",
    "remove_decorator",
    "add_overload",
    "set_extends",
    "remove_extends",
    "add_implements",
    "remove_implements",
    "add_type_parameter",
    "add_extends",
    "add_jsdoc",
    "remove_jsdoc",
    "unwrap",
    "set_structure",
    "extract_interface",
    // ── Tier 3: Full replacement ──
    "replace",
    // ── File-level operations ──
    "add_import",
    "remove_import",
    "add_named_import",
    "remove_named_import",
    "set_module_specifier",
    "add_export_declaration",
    "add_namespace",
    "organize_imports",
    "fix_missing_imports",
    "fix_unused",
    "add_function",
    "add_class",
    "add_interface",
    "add_type_alias",
    "add_enum",
    "add_variable",
    "insert_text",
  ] as const;

  /**
   * Execute one or more surgical AST operations atomically.
   * All operations run against the same source file in sequence.
   * If any operation fails, the source file is NOT saved (atomic rollback).
   */
  async surgicalEdit(file: string, operations: SurgicalOperation[]): Promise<SurgicalResult> {
    const sourceFile = await this.getSourceFile(file);
    if (!sourceFile) return { ok: false, error: `Could not parse file: ${file}` };

    const ts = await getTsMorph();
    const before = sourceFile.getFullText();
    const details: string[] = [];

    for (let i = 0; i < operations.length; i++) {
      const op = operations[i] as SurgicalOperation;
      const label =
        operations.length > 1 ? `Op ${String(i + 1)}/${String(operations.length)}: ` : "";

      try {
        const detail = await this.executeSurgicalOp(sourceFile, op, ts);
        details.push(`${label}${detail}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        // Rollback: revert source file to original content
        sourceFile.replaceWithText(before);
        return { ok: false, error: `${label}${msg}\nNO edits were applied (atomic rollback).` };
      }
    }

    const after = sourceFile.getFullText();

    // If nothing changed, report it
    if (before === after) {
      return { ok: false, error: "No changes produced by the operations." };
    }

    // Refresh so subsequent reads see updated content
    sourceFile.refreshFromFileSystemSync();

    return { ok: true, before, after, details };
  }

  /**
   * Execute a single surgical operation. Throws on failure.
   * Returns a human-readable description of what was done.
   */
  private async executeSurgicalOp(
    sf: SourceFile,
    op: SurgicalOperation,
    ts: TsMorphModule,
  ): Promise<string> {
    const action = op.action;

    // ── File-level operations (no target/name needed) ──
    switch (action) {
      case "organize_imports":
        sf.organizeImports();
        return "Organized imports";

      case "fix_missing_imports":
        sf.fixMissingImports();
        return "Fixed missing imports";

      case "fix_unused":
        sf.fixUnusedIdentifiers();
        return "Fixed unused identifiers";

      case "add_import": {
        if (!op.value) throw new Error("add_import requires value (module specifier)");
        const namedImports = op.newCode
          ?.split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        sf.addImportDeclaration({
          moduleSpecifier: op.value,
          ...(namedImports && namedImports.length > 0 ? { namedImports } : {}),
          ...(op.name ? { defaultImport: op.name } : {}),
        });
        const specDesc = namedImports?.length ? `{ ${namedImports.join(", ")} }` : (op.name ?? "*");
        return `Added import ${specDesc} from "${op.value}"`;
      }

      case "remove_import": {
        if (!op.value) throw new Error("remove_import requires value (module specifier)");
        const imp = sf.getImportDeclaration(op.value);
        if (!imp) throw new Error(`Import "${op.value}" not found`);
        imp.remove();
        return `Removed import from "${op.value}"`;
      }

      case "add_function": {
        if (!op.newCode) throw new Error("add_function requires newCode");
        sf.addStatements(op.newCode);
        return `Added function${op.name ? ` "${op.name}"` : ""}`;
      }

      case "add_class": {
        if (!op.newCode) throw new Error("add_class requires newCode");
        sf.addStatements(op.newCode);
        return `Added class${op.name ? ` "${op.name}"` : ""}`;
      }

      case "add_interface": {
        if (!op.newCode) throw new Error("add_interface requires newCode");
        sf.addStatements(op.newCode);
        return `Added interface${op.name ? ` "${op.name}"` : ""}`;
      }

      case "add_type_alias": {
        if (!op.newCode) throw new Error("add_type_alias requires newCode");
        sf.addStatements(op.newCode);
        return `Added type alias${op.name ? ` "${op.name}"` : ""}`;
      }

      case "add_enum": {
        if (!op.newCode) throw new Error("add_enum requires newCode");
        sf.addStatements(op.newCode);
        return `Added enum${op.name ? ` "${op.name}"` : ""}`;
      }

      case "add_variable": {
        if (!op.newCode) throw new Error("add_variable requires newCode");
        sf.addStatements(op.newCode);
        return `Added variable${op.name ? ` "${op.name}"` : ""}`;
      }

      case "add_named_import": {
        if (!op.value) throw new Error("add_named_import requires value (module specifier)");
        if (!op.newCode)
          throw new Error("add_named_import requires newCode (import names, comma-separated)");
        const imp = sf.getImportDeclaration(op.value);
        if (!imp) throw new Error(`Import from "${op.value}" not found — use add_import first`);
        const names = op.newCode
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        for (const n of names) imp.addNamedImport(n);
        return `Added { ${names.join(", ")} } to import from "${op.value}"`;
      }

      case "remove_named_import": {
        if (!op.value) throw new Error("remove_named_import requires value (module specifier)");
        if (!op.name) throw new Error("remove_named_import requires name (import name to remove)");
        const rimp = sf.getImportDeclaration(op.value);
        if (!rimp) throw new Error(`Import from "${op.value}" not found`);
        const namedImp = rimp.getNamedImports().find((n) => n.getName() === op.name);
        if (!namedImp)
          throw new Error(`Named import "${op.name}" not found in import from "${op.value}"`);
        namedImp.remove();
        return `Removed "${op.name}" from import from "${op.value}"`;
      }

      case "set_module_specifier": {
        if (!op.value)
          throw new Error("set_module_specifier requires value (old module specifier)");
        if (!op.newCode)
          throw new Error("set_module_specifier requires newCode (new module specifier)");
        const simp = sf.getImportDeclaration(op.value);
        if (!simp) throw new Error(`Import from "${op.value}" not found`);
        simp.setModuleSpecifier(op.newCode);
        return `Changed import path "${op.value}" → "${op.newCode}"`;
      }

      case "insert_text": {
        if (!op.newCode) throw new Error("insert_text requires newCode");
        const insertIdx = op.index ?? 0;
        sf.insertStatements(insertIdx, op.newCode);
        return `Inserted text at statement index ${String(insertIdx)}`;
      }

      case "add_export_declaration": {
        if (!op.value) throw new Error("add_export_declaration requires value (module specifier)");
        const namedExports = op.newCode
          ?.split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        sf.addExportDeclaration({
          moduleSpecifier: op.value,
          ...(namedExports && namedExports.length > 0 ? { namedExports } : {}),
        });
        const expDesc = namedExports?.length ? `{ ${namedExports.join(", ")} }` : "*";
        return `Added export ${expDesc} from "${op.value}"`;
      }

      case "add_namespace": {
        if (!op.name) throw new Error("add_namespace requires name");
        sf.addModule({ name: op.name, statements: op.newCode });
        return `Added namespace "${op.name}"`;
      }
    }

    // ── Symbol-targeted operations (require target + name) ──
    if (!op.target || !op.name) {
      throw new Error(`Action "${action}" requires target and name`);
    }

    // Locate the symbol
    const node = this.findSymbolNode(sf, op.target, op.name, ts);
    if (!node) {
      const available = this.listSymbolsOfKind(sf, op.target, ts);
      const hint =
        available.length > 0
          ? `\nAvailable ${op.target}s:\n${available.map((s) => `  ${s}`).join("\n")}`
          : `\nNo ${op.target}s found.`;
      throw new Error(`Symbol not found: ${op.target} "${op.name}".${hint}`);
    }

    switch (action) {
      // ── Tier 1: Surgical micro-edits ──

      case "set_type": {
        if (!op.value) throw new Error("set_type requires value");
        if ("setType" in node && typeof node.setType === "function") {
          (node as { setType: (t: string) => void }).setType(op.value);
          return `Set type of ${op.target} "${op.name}" → ${op.value}`;
        }
        // For variable declarations, drill into the declaration
        if (ts.Node.isVariableStatement(node)) {
          const decl = node.getDeclarations().find((d) => d.getName() === op.name);
          if (decl) {
            decl.setType(op.value);
            return `Set type of variable "${op.name}" → ${op.value}`;
          }
        }
        throw new Error(`Cannot set type on ${op.target} "${op.name}"`);
      }

      case "set_return_type": {
        if (!op.value) throw new Error("set_return_type requires value");
        if ("setReturnType" in node && typeof node.setReturnType === "function") {
          (node as { setReturnType: (t: string) => void }).setReturnType(op.value);
          return `Set return type of ${op.target} "${op.name}" → ${op.value}`;
        }
        throw new Error(`Cannot set return type on ${op.target} "${op.name}"`);
      }

      case "set_value": {
        if (op.value === undefined) throw new Error("set_value requires value");
        if (ts.Node.isEnumDeclaration(node)) {
          // set_value on enum targets a member: op.value = "memberName=newValue"
          const [memberName, memberValue] = op.value.split("=").map((s) => s.trim());
          if (!memberName)
            throw new Error("set_value on enum requires value format: memberName=newValue");
          const member = node.getMember(memberName);
          if (!member) throw new Error(`Enum member "${memberName}" not found in "${op.name}"`);
          if (memberValue !== undefined)
            member.setValue(Number.isNaN(Number(memberValue)) ? memberValue : Number(memberValue));
          return `Set enum "${op.name}".${memberName} = ${String(memberValue)}`;
        }
        throw new Error(`set_value not supported on ${op.target}`);
      }

      case "set_initializer": {
        if (!op.value) throw new Error("set_initializer requires value");
        if (ts.Node.isVariableStatement(node)) {
          const decl = node.getDeclarations().find((d) => d.getName() === op.name);
          if (decl) {
            decl.setInitializer(op.value);
            return `Set initializer of "${op.name}" → ${op.value}`;
          }
        }
        if ("setInitializer" in node && typeof node.setInitializer === "function") {
          (node as { setInitializer: (v: string) => void }).setInitializer(op.value);
          return `Set initializer of "${op.name}" → ${op.value}`;
        }
        throw new Error(`Cannot set initializer on ${op.target} "${op.name}"`);
      }

      case "set_async": {
        if ("setIsAsync" in node && typeof node.setIsAsync === "function") {
          const val = op.value !== "false";
          (node as { setIsAsync: (v: boolean) => void }).setIsAsync(val);
          return `Set ${op.target} "${op.name}" async → ${String(val)}`;
        }
        throw new Error(`Cannot set async on ${op.target} "${op.name}"`);
      }

      case "set_generator": {
        if ("setIsGenerator" in node && typeof node.setIsGenerator === "function") {
          const val = op.value !== "false";
          (node as { setIsGenerator: (v: boolean) => void }).setIsGenerator(val);
          return `Set ${op.target} "${op.name}" generator → ${String(val)}`;
        }
        throw new Error(`Cannot set generator on ${op.target} "${op.name}"`);
      }

      case "set_export": {
        if ("setIsExported" in node && typeof node.setIsExported === "function") {
          const val = op.value !== "false";
          (node as { setIsExported: (v: boolean) => void }).setIsExported(val);
          return `Set ${op.target} "${op.name}" exported → ${String(val)}`;
        }
        throw new Error(`Cannot set export on ${op.target} "${op.name}"`);
      }

      case "set_default_export": {
        if ("setIsDefaultExport" in node && typeof node.setIsDefaultExport === "function") {
          const val = op.value !== "false";
          (node as { setIsDefaultExport: (v: boolean) => void }).setIsDefaultExport(val);
          return `Set ${op.target} "${op.name}" default export → ${String(val)}`;
        }
        throw new Error(`Cannot set default export on ${op.target} "${op.name}"`);
      }

      case "rename": {
        if (!op.value) throw new Error("rename requires value (new name)");
        if ("rename" in node && typeof node.rename === "function") {
          (node as { rename: (n: string) => void }).rename(op.value);
          return `Renamed ${op.target} "${op.name}" → "${op.value}"`;
        }
        // For variable statements, rename the declaration
        if (ts.Node.isVariableStatement(node)) {
          const decl = node.getDeclarations().find((d) => d.getName() === op.name);
          if (decl) {
            const nameNode = decl.getNameNode();
            if (ts.Node.isIdentifier(nameNode)) {
              nameNode.rename(op.value);
              return `Renamed variable "${op.name}" → "${op.value}"`;
            }
          }
        }
        throw new Error(`Cannot rename ${op.target} "${op.name}"`);
      }

      case "remove": {
        const line = node.getStartLineNumber();
        if ("remove" in node && typeof node.remove === "function") {
          (node as { remove: () => void }).remove();
          return `Removed ${op.target} "${op.name}" (was at line ${String(line)})`;
        }
        throw new Error(`Cannot remove ${op.target} "${op.name}"`);
      }

      case "set_optional": {
        const val = op.value !== "false";
        if ("setHasQuestionToken" in node && typeof node.setHasQuestionToken === "function") {
          (node as { setHasQuestionToken: (v: boolean) => void }).setHasQuestionToken(val);
          return `Set ${op.target} "${op.name}" optional → ${String(val)}`;
        }
        throw new Error(`Cannot set optional on ${op.target} "${op.name}"`);
      }

      case "add_parameter": {
        if (!op.value) throw new Error("add_parameter requires value (name: type)");
        if ("addParameter" in node && typeof node.addParameter === "function") {
          const [pName, pType] = op.value.split(":").map((s) => s.trim());
          (
            node as {
              addParameter: (p: {
                name: string;
                type?: string;
                hasQuestionToken?: boolean;
              }) => void;
            }
          ).addParameter({ name: pName ?? op.value, ...(pType ? { type: pType } : {}) });
          return `Added parameter "${op.value}" to ${op.target} "${op.name}"`;
        }
        throw new Error(`Cannot add parameter to ${op.target} "${op.name}"`);
      }

      case "remove_parameter": {
        if (!op.value) throw new Error("remove_parameter requires value (parameter name)");
        if ("getParameters" in node && typeof node.getParameters === "function") {
          const params = (
            node as { getParameters: () => Array<{ getName: () => string; remove: () => void }> }
          ).getParameters();
          const param = params.find((p) => p.getName() === op.value);
          if (!param)
            throw new Error(`Parameter "${op.value}" not found in ${op.target} "${op.name}"`);
          param.remove();
          return `Removed parameter "${op.value}" from ${op.target} "${op.name}"`;
        }
        throw new Error(`Cannot remove parameter from ${op.target} "${op.name}"`);
      }

      // ── Tier 2: Body surgery ──

      case "set_body": {
        if (!op.newCode) throw new Error("set_body requires newCode");
        if ("setBodyText" in node && typeof node.setBodyText === "function") {
          (node as { setBodyText: (t: string) => void }).setBodyText(op.newCode);
          return `Set body of ${op.target} "${op.name}"`;
        }
        throw new Error(
          `Cannot set body on ${op.target} "${op.name}" — no body (arrow fn? interface?)`,
        );
      }

      case "add_statement": {
        if (!op.newCode) throw new Error("add_statement requires newCode");
        if ("addStatements" in node && typeof node.addStatements === "function") {
          (node as { addStatements: (s: string) => void }).addStatements(op.newCode);
          return `Added statement to ${op.target} "${op.name}"`;
        }
        throw new Error(`Cannot add statement to ${op.target} "${op.name}"`);
      }

      case "insert_statement": {
        if (!op.newCode) throw new Error("insert_statement requires newCode");
        const idx = op.index ?? 0;
        if ("insertStatements" in node && typeof node.insertStatements === "function") {
          (node as { insertStatements: (i: number, s: string) => void }).insertStatements(
            idx,
            op.newCode,
          );
          return `Inserted statement at index ${String(idx)} in ${op.target} "${op.name}"`;
        }
        throw new Error(`Cannot insert statement in ${op.target} "${op.name}"`);
      }

      case "remove_statement": {
        const idx = op.index ?? 0;
        if ("removeStatement" in node && typeof node.removeStatement === "function") {
          (node as { removeStatement: (i: number) => void }).removeStatement(idx);
          return `Removed statement at index ${String(idx)} from ${op.target} "${op.name}"`;
        }
        throw new Error(`Cannot remove statement from ${op.target} "${op.name}"`);
      }

      case "add_property": {
        if (!op.newCode)
          throw new Error("add_property requires newCode (name: type or name = value)");
        if (ts.Node.isInterfaceDeclaration(node)) {
          // Parse "propName: propType" or "propName?: propType"
          const optional = op.newCode.includes("?:");
          const [pName, pType] = op.newCode
            .replace("?:", ":")
            .split(":")
            .map((s) => s.trim());
          node.addProperty({ name: pName ?? op.newCode, type: pType, hasQuestionToken: optional });
          return `Added property "${pName}" to interface "${op.name}"`;
        }
        if (ts.Node.isClassDeclaration(node)) {
          node.addProperty({
            name: op.newCode.split(/[=:]/)[0]?.trim() ?? op.newCode,
          } as Parameters<typeof node.addProperty>[0]);
          // Use replaceWithText on the last property to set the full declaration
          const props = node.getProperties();
          const last = props[props.length - 1];
          if (last) last.replaceWithText(op.newCode);
          return `Added property to class "${op.name}"`;
        }
        throw new Error(`Cannot add property to ${op.target} "${op.name}"`);
      }

      case "remove_property": {
        if (!op.value) throw new Error("remove_property requires value (property name)");
        if (ts.Node.isInterfaceDeclaration(node)) {
          const prop = node.getProperty(op.value);
          if (!prop) throw new Error(`Property "${op.value}" not found in interface "${op.name}"`);
          prop.remove();
          return `Removed property "${op.value}" from interface "${op.name}"`;
        }
        if (ts.Node.isClassDeclaration(node)) {
          const prop = node.getProperty(op.value);
          if (!prop) throw new Error(`Property "${op.value}" not found in class "${op.name}"`);
          prop.remove();
          return `Removed property "${op.value}" from class "${op.name}"`;
        }
        throw new Error(`Cannot remove property from ${op.target} "${op.name}"`);
      }

      case "add_method": {
        if (!op.newCode) throw new Error("add_method requires newCode");
        if (ts.Node.isClassDeclaration(node)) {
          // Parse method name from newCode for structured insertion (fixes indentation)
          // Try to extract "methodName(" pattern from the raw text
          const methodMatch = op.newCode.match(/(?:async\s+)?(\w+)\s*\(/);
          if (methodMatch) {
            // Use structured addMethod for correct indentation, then replace body
            const methodName = methodMatch[1] ?? "method";
            const method = node.addMethod({ name: methodName });
            method.replaceWithText(op.newCode);
          } else {
            // Fallback: raw member insertion
            node.addMember(op.newCode);
          }
          return `Added method to class "${op.name}"`;
        }
        if (ts.Node.isInterfaceDeclaration(node)) {
          // For interfaces, use structured addMethod then replace for correct indentation
          const sigMatch = op.newCode.match(/(\w+)\s*\(/);
          if (sigMatch) {
            const sigName = sigMatch[1] ?? "method";
            const sig = node.addMethod({ name: sigName });
            sig.replaceWithText(op.newCode);
          } else {
            node.addMember(op.newCode);
          }
          return `Added method signature to interface "${op.name}"`;
        }
        throw new Error(`Cannot add method to ${op.target} "${op.name}"`);
      }

      case "add_member": {
        if (!op.newCode) throw new Error("add_member requires newCode");
        if (ts.Node.isEnumDeclaration(node)) {
          // Parse "MemberName = value" or just "MemberName"
          const eqIdx = op.newCode.indexOf("=");
          if (eqIdx >= 0) {
            const mName = op.newCode.slice(0, eqIdx).trim();
            const mVal = op.newCode.slice(eqIdx + 1).trim();
            node.addMember({
              name: mName,
              value: Number.isNaN(Number(mVal)) ? mVal : Number(mVal),
            });
          } else {
            node.addMember({ name: op.newCode.trim() });
          }
          return `Added member to enum "${op.name}"`;
        }
        if ("addMember" in node && typeof node.addMember === "function") {
          (node as { addMember: (s: string) => void }).addMember(op.newCode);
          return `Added member to ${op.target} "${op.name}"`;
        }
        throw new Error(`Cannot add member to ${op.target} "${op.name}"`);
      }

      case "remove_member": {
        if (!op.value) throw new Error("remove_member requires value (member name)");
        if (ts.Node.isEnumDeclaration(node)) {
          const member = node.getMember(op.value);
          if (!member) throw new Error(`Member "${op.value}" not found in enum "${op.name}"`);
          member.remove();
          return `Removed member "${op.value}" from enum "${op.name}"`;
        }
        if (ts.Node.isClassDeclaration(node)) {
          const method = node.getMethod(op.value);
          if (method) {
            method.remove();
            return `Removed method "${op.value}" from class "${op.name}"`;
          }
          const prop = node.getProperty(op.value);
          if (prop) {
            prop.remove();
            return `Removed property "${op.value}" from class "${op.name}"`;
          }
          throw new Error(`Member "${op.value}" not found in class "${op.name}"`);
        }
        throw new Error(`Cannot remove member from ${op.target} "${op.name}"`);
      }

      // ── Class-specific: inheritance, constructors, accessors, abstract ──

      case "set_extends": {
        if (!op.value) throw new Error("set_extends requires value (base class/interface name)");
        if (ts.Node.isClassDeclaration(node)) {
          node.setExtends(op.value);
          return `Set class "${op.name}" extends ${op.value}`;
        }
        throw new Error(`Cannot set extends on ${op.target} "${op.name}"`);
      }

      case "remove_extends": {
        if (ts.Node.isClassDeclaration(node)) {
          node.removeExtends();
          return `Removed extends from class "${op.name}"`;
        }
        throw new Error(`Cannot remove extends from ${op.target} "${op.name}"`);
      }

      case "add_implements": {
        if (!op.value)
          throw new Error("add_implements requires value (interface name(s), comma-separated)");
        if (ts.Node.isClassDeclaration(node)) {
          const ifaces = op.value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          node.addImplements(ifaces);
          return `Added implements ${ifaces.join(", ")} to class "${op.name}"`;
        }
        throw new Error(`Cannot add implements to ${op.target} "${op.name}"`);
      }

      case "remove_implements": {
        if (op.index === undefined) throw new Error("remove_implements requires index");
        if (ts.Node.isClassDeclaration(node)) {
          node.removeImplements(op.index);
          return `Removed implements at index ${String(op.index)} from class "${op.name}"`;
        }
        throw new Error(`Cannot remove implements from ${op.target} "${op.name}"`);
      }

      case "add_constructor": {
        if (ts.Node.isClassDeclaration(node)) {
          const ctor = node.addConstructor({});
          if (op.newCode) ctor.setBodyText(op.newCode);
          return `Added constructor to class "${op.name}"`;
        }
        throw new Error(`Cannot add constructor to ${op.target} "${op.name}"`);
      }

      case "add_getter": {
        if (!op.value) throw new Error("add_getter requires value (getter name)");
        if (ts.Node.isClassDeclaration(node)) {
          node.addGetAccessor({
            name: op.value,
            statements: op.newCode ? [op.newCode] : [],
          });
          return `Added getter "${op.value}" to class "${op.name}"`;
        }
        throw new Error(`Cannot add getter to ${op.target} "${op.name}"`);
      }

      case "add_setter": {
        if (!op.value) throw new Error("add_setter requires value (setter name)");
        if (ts.Node.isClassDeclaration(node)) {
          // Parse parameter from newCode if provided: "paramName: paramType"
          const paramParts = op.newCode?.split(":").map((s) => s.trim());
          const paramName = paramParts?.[0] ?? "value";
          const paramType = paramParts?.[1];
          node.addSetAccessor({
            name: op.value,
            parameters: [{ name: paramName, ...(paramType ? { type: paramType } : {}) }],
          });
          return `Added setter "${op.value}" to class "${op.name}"`;
        }
        throw new Error(`Cannot add setter to ${op.target} "${op.name}"`);
      }

      case "set_abstract": {
        const val = op.value !== "false";
        if ("setIsAbstract" in node && typeof node.setIsAbstract === "function") {
          (node as { setIsAbstract: (v: boolean) => void }).setIsAbstract(val);
          return `Set ${op.target} "${op.name}" abstract → ${String(val)}`;
        }
        throw new Error(`Cannot set abstract on ${op.target} "${op.name}"`);
      }

      case "set_static": {
        const val = op.value !== "false";
        if ("setIsStatic" in node && typeof node.setIsStatic === "function") {
          (node as { setIsStatic: (v: boolean) => void }).setIsStatic(val);
          return `Set "${op.name}" static → ${String(val)}`;
        }
        throw new Error(`Cannot set static on ${op.target} "${op.name}"`);
      }

      case "set_readonly": {
        const val = op.value !== "false";
        if ("setIsReadonly" in node && typeof node.setIsReadonly === "function") {
          (node as { setIsReadonly: (v: boolean) => void }).setIsReadonly(val);
          return `Set "${op.name}" readonly → ${String(val)}`;
        }
        throw new Error(`Cannot set readonly on ${op.target} "${op.name}"`);
      }

      case "set_scope": {
        if (!op.value) throw new Error("set_scope requires value (public/protected/private)");
        if ("setScope" in node && typeof node.setScope === "function") {
          (node as { setScope: (s: unknown) => void }).setScope(op.value as unknown);
          return `Set scope of "${op.name}" → ${op.value}`;
        }
        throw new Error(`Cannot set scope on ${op.target} "${op.name}"`);
      }

      case "set_overrides": {
        const val = op.value !== "false";
        if ("setHasOverrideKeyword" in node && typeof node.setHasOverrideKeyword === "function") {
          (node as { setHasOverrideKeyword: (v: boolean) => void }).setHasOverrideKeyword(val);
          return `Set "${op.name}" override → ${String(val)}`;
        }
        throw new Error(`Cannot set override on ${op.target} "${op.name}"`);
      }

      case "set_ambient": {
        const val = op.value !== "false";
        if ("setHasDeclareKeyword" in node && typeof node.setHasDeclareKeyword === "function") {
          (node as { setHasDeclareKeyword: (v: boolean) => void }).setHasDeclareKeyword(val);
          return `Set ${op.target} "${op.name}" ambient (declare) → ${String(val)}`;
        }
        throw new Error(`Cannot set ambient on ${op.target} "${op.name}"`);
      }

      case "set_const_enum": {
        if (ts.Node.isEnumDeclaration(node)) {
          const val = op.value !== "false";
          node.setIsConstEnum(val);
          return `Set enum "${op.name}" const → ${String(val)}`;
        }
        throw new Error(`set_const_enum only works on enums, not ${op.target}`);
      }

      case "remove_initializer": {
        if (ts.Node.isVariableStatement(node)) {
          const decl = node.getDeclarations().find((d) => d.getName() === op.name);
          if (decl && "removeInitializer" in decl) {
            (decl as { removeInitializer: () => void }).removeInitializer();
            return `Removed initializer from "${op.name}"`;
          }
        }
        if ("removeInitializer" in node && typeof node.removeInitializer === "function") {
          (node as { removeInitializer: () => void }).removeInitializer();
          return `Removed initializer from "${op.name}"`;
        }
        throw new Error(`Cannot remove initializer from ${op.target} "${op.name}"`);
      }

      case "set_declaration_kind": {
        if (!op.value) throw new Error("set_declaration_kind requires value (const/let/var)");
        if (ts.Node.isVariableStatement(node)) {
          const kindMap: Record<string, unknown> = {
            const: ts.VariableDeclarationKind.Const,
            let: ts.VariableDeclarationKind.Let,
            var: ts.VariableDeclarationKind.Var,
          };
          const dk = kindMap[op.value];
          if (!dk)
            throw new Error(`Invalid declaration kind "${op.value}" — use const, let, or var`);
          node.setDeclarationKind(dk as import("ts-morph").VariableDeclarationKind);
          return `Set declaration kind of "${op.name}" → ${op.value}`;
        }
        throw new Error(`Cannot set declaration kind on ${op.target} "${op.name}"`);
      }

      case "add_decorator": {
        if (!op.value)
          throw new Error("add_decorator requires value (decorator text, e.g. @Injectable())");
        if ("addDecorator" in node && typeof node.addDecorator === "function") {
          // Strip leading @ if present
          const decoratorName = op.value.startsWith("@") ? op.value.slice(1) : op.value;
          // Split "Name(args)" into name and arguments
          const parenIdx = decoratorName.indexOf("(");
          if (parenIdx >= 0) {
            const name = decoratorName.slice(0, parenIdx);
            const args = decoratorName.slice(parenIdx + 1, -1);
            (
              node as { addDecorator: (d: { name: string; arguments: string[] }) => void }
            ).addDecorator({ name, arguments: args ? [args] : [] });
          } else {
            (node as { addDecorator: (d: { name: string }) => void }).addDecorator({
              name: decoratorName,
            });
          }
          return `Added decorator @${decoratorName} to ${op.target} "${op.name}"`;
        }
        throw new Error(`Cannot add decorator to ${op.target} "${op.name}"`);
      }

      case "remove_decorator": {
        if (!op.value) throw new Error("remove_decorator requires value (decorator name)");
        if ("getDecorators" in node && typeof node.getDecorators === "function") {
          const decorators = (
            node as { getDecorators: () => Array<{ getName: () => string; remove: () => void }> }
          ).getDecorators();
          const dec = decorators.find((d) => d.getName() === op.value);
          if (!dec)
            throw new Error(`Decorator "${op.value}" not found on ${op.target} "${op.name}"`);
          dec.remove();
          return `Removed decorator @${op.value} from ${op.target} "${op.name}"`;
        }
        throw new Error(`Cannot remove decorator from ${op.target} "${op.name}"`);
      }

      case "add_type_parameter": {
        if (!op.value)
          throw new Error(
            "add_type_parameter requires value (e.g. T, T extends Base, T = Default)",
          );
        if ("addTypeParameter" in node && typeof node.addTypeParameter === "function") {
          // Parse "T extends Constraint = Default"
          const parts = op.value.split(/\s+extends\s+/);
          const name = (parts[0] ?? op.value).trim();
          let constraint: string | undefined;
          let defaultType: string | undefined;
          if (parts[1]) {
            const defParts = parts[1].split(/\s*=\s*/);
            constraint = defParts[0]?.trim();
            defaultType = defParts[1]?.trim();
          }
          (
            node as {
              addTypeParameter: (p: {
                name: string;
                constraint?: string;
                default?: string;
              }) => void;
            }
          ).addTypeParameter({ name, constraint, default: defaultType });
          return `Added type parameter <${op.value}> to ${op.target} "${op.name}"`;
        }
        throw new Error(`Cannot add type parameter to ${op.target} "${op.name}"`);
      }

      case "add_extends": {
        if (!op.value) throw new Error("add_extends requires value (interface/type name)");
        if (ts.Node.isInterfaceDeclaration(node)) {
          node.addExtends(op.value);
          return `Added extends ${op.value} to interface "${op.name}"`;
        }
        throw new Error(
          `Cannot add extends to ${op.target} "${op.name}" — use set_extends for classes`,
        );
      }

      case "remove_method": {
        if (!op.value) throw new Error("remove_method requires value (method name)");
        if (ts.Node.isClassDeclaration(node)) {
          const method = node.getMethod(op.value);
          if (!method) throw new Error(`Method "${op.value}" not found in class "${op.name}"`);
          method.remove();
          return `Removed method "${op.value}" from class "${op.name}"`;
        }
        if (ts.Node.isInterfaceDeclaration(node)) {
          const method = node.getMethod(op.value);
          if (!method) throw new Error(`Method "${op.value}" not found in interface "${op.name}"`);
          method.remove();
          return `Removed method "${op.value}" from interface "${op.name}"`;
        }
        throw new Error(`Cannot remove method from ${op.target} "${op.name}"`);
      }

      case "add_overload": {
        if (!op.newCode) throw new Error("add_overload requires newCode (overload signature)");
        if ("addOverload" in node && typeof node.addOverload === "function") {
          (
            node as {
              addOverload: (s: {
                returnType?: string;
                parameters?: Array<{ name: string; type?: string }>;
              }) => void;
            }
          ).addOverload({});
          // Replace the overload with the raw text for maximum flexibility
          if (ts.Node.isFunctionDeclaration(node)) {
            const overloads = node.getOverloads();
            const last = overloads[overloads.length - 1];
            if (last) last.replaceWithText(op.newCode);
          }
          return `Added overload to ${op.target} "${op.name}"`;
        }
        throw new Error(`Cannot add overload to ${op.target} "${op.name}"`);
      }

      case "add_jsdoc": {
        if (!op.newCode) throw new Error("add_jsdoc requires newCode (description text)");
        if ("addJsDoc" in node && typeof node.addJsDoc === "function") {
          (node as { addJsDoc: (d: { description: string }) => void }).addJsDoc({
            description: op.newCode,
          });
          return `Added JSDoc to ${op.target} "${op.name}"`;
        }
        throw new Error(`Cannot add JSDoc to ${op.target} "${op.name}"`);
      }

      case "remove_jsdoc": {
        if ("getJsDocs" in node && typeof node.getJsDocs === "function") {
          const docs = (node as { getJsDocs: () => Array<{ remove: () => void }> }).getJsDocs();
          if (docs.length === 0) throw new Error(`No JSDoc found on ${op.target} "${op.name}"`);
          // Remove the last JSDoc (most recent), or all if value is "all"
          if (op.value === "all") {
            for (const doc of docs) doc.remove();
            return `Removed all ${String(docs.length)} JSDoc(s) from ${op.target} "${op.name}"`;
          }
          const last = docs[docs.length - 1];
          if (last) last.remove();
          return `Removed JSDoc from ${op.target} "${op.name}"`;
        }
        throw new Error(`Cannot remove JSDoc from ${op.target} "${op.name}"`);
      }

      case "unwrap": {
        if ("unwrap" in node && typeof node.unwrap === "function") {
          (node as { unwrap: () => void }).unwrap();
          return `Unwrapped ${op.target} "${op.name}" (replaced with its body)`;
        }
        throw new Error(
          `Cannot unwrap ${op.target} "${op.name}" — only functions and namespaces support unwrap`,
        );
      }

      // ── Structures: declarative bulk mutation ──

      case "set_structure": {
        if (!op.newCode) throw new Error("set_structure requires newCode (JSON structure object)");
        if ("set" in node && typeof node.set === "function") {
          try {
            const structure = JSON.parse(op.newCode);
            (node as { set: (s: Record<string, unknown>) => void }).set(structure);
            return `Applied structure to ${op.target} "${op.name}"`;
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            throw new Error(`Invalid structure JSON: ${msg}`);
          }
        }
        throw new Error(`Cannot set structure on ${op.target} "${op.name}"`);
      }

      case "extract_interface": {
        if (!ts.Node.isClassDeclaration(node)) {
          throw new Error(`extract_interface only works on classes, not ${op.target}`);
        }
        const ifaceName = op.value ?? `I${op.name}`;
        const structure = node.extractInterface(ifaceName);
        sf.addInterface(structure);
        return `Extracted interface "${ifaceName}" from class "${op.name}"`;
      }

      // ── Tier 3: Full replacement ──

      case "replace": {
        if (!op.newCode) throw new Error("replace requires newCode");
        const startLine = node.getStartLineNumber();
        const endLine = node.getEndLineNumber();
        node.replaceWithText(op.newCode);
        const newLineCount = op.newCode.split("\n").length;
        return `Replaced ${op.target} "${op.name}" (lines ${String(startLine)}-${String(endLine)} → ${String(startLine)}-${String(startLine + newLineCount - 1)})`;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  /**
   * Find a symbol node by target kind and name.
   * Supports "method" target with "ClassName.methodName" or just "methodName" (searches all classes).
   * Supports "property" target with "ClassName.propName" or just "propName".
   * Returns the AST node or null.
   */
  private findSymbolNode(
    sf: SourceFile,
    target: string,
    name: string,
    _ts: TsMorphModule,
  ): Node | null {
    if (target === "function") {
      // First try top-level function
      const fn = sf.getFunction(name);
      if (fn) return fn;
      // Also search class methods — "target: function" should find methods too
      // This fixes the "class methods not addressable" gap
      for (const cls of sf.getClasses()) {
        const method = cls.getMethod(name);
        if (method) return method;
      }
      return null;
    }
    if (target === "method") {
      // Support "ClassName.methodName" or just "methodName"
      if (name.includes(".")) {
        const [className, methodName] = name.split(".");
        const cls = sf.getClass(className ?? "");
        if (!cls) return null;
        return cls.getMethod(methodName ?? "") ?? cls.getProperty(methodName ?? "") ?? null;
      }
      // Search all classes for the method
      for (const cls of sf.getClasses()) {
        const method = cls.getMethod(name);
        if (method) return method;
      }
      return null;
    }
    if (target === "property") {
      // Support "ClassName.propName" or "InterfaceName.propName" or just "propName"
      if (name.includes(".")) {
        const [ownerName, propName] = name.split(".");
        const cls = sf.getClass(ownerName ?? "");
        if (cls) return cls.getProperty(propName ?? "") ?? null;
        const iface = sf.getInterface(ownerName ?? "");
        if (iface) return iface.getProperty(propName ?? "") ?? null;
        return null;
      }
      // Search all classes and interfaces
      for (const cls of sf.getClasses()) {
        const prop = cls.getProperty(name);
        if (prop) return prop;
      }
      for (const iface of sf.getInterfaces()) {
        const prop = iface.getProperty(name);
        if (prop) return prop;
      }
      return null;
    }
    if (target === "class") {
      return sf.getClass(name) ?? null;
    }
    if (target === "interface") {
      return sf.getInterface(name) ?? null;
    }
    if (target === "type") {
      return sf.getTypeAlias(name) ?? null;
    }
    if (target === "enum") {
      return sf.getEnum(name) ?? null;
    }
    if (target === "variable" || target === "constant") {
      for (const stmt of sf.getVariableStatements()) {
        for (const decl of stmt.getDeclarations()) {
          if (decl.getName() === name) return stmt;
        }
      }
    }
    return null;
  }

  private listSymbolsOfKind(sourceFile: SourceFile, kind: string, ts: TsMorphModule): string[] {
    const names: string[] = [];
    if (kind === "function") {
      for (const f of sourceFile.getFunctions()) {
        const n = f.getName();
        if (n) names.push(`${kind} "${n}" (line ${String(f.getStartLineNumber())})`);
      }
      // Also list class methods when searching for functions
      for (const cls of sourceFile.getClasses()) {
        const className = cls.getName() ?? "anonymous";
        for (const m of cls.getMethods()) {
          names.push(
            `method "${className}.${m.getName()}" (line ${String(m.getStartLineNumber())})`,
          );
        }
      }
    }
    if (kind === "method") {
      for (const cls of sourceFile.getClasses()) {
        const className = cls.getName() ?? "anonymous";
        for (const m of cls.getMethods()) {
          names.push(
            `method "${className}.${m.getName()}" (line ${String(m.getStartLineNumber())})`,
          );
        }
      }
    }
    if (kind === "property") {
      for (const cls of sourceFile.getClasses()) {
        const className = cls.getName() ?? "anonymous";
        for (const p of cls.getProperties()) {
          names.push(
            `property "${className}.${p.getName()}" (line ${String(p.getStartLineNumber())})`,
          );
        }
      }
      for (const iface of sourceFile.getInterfaces()) {
        for (const p of iface.getProperties()) {
          names.push(
            `property "${iface.getName()}.${p.getName()}" (line ${String(p.getStartLineNumber())})`,
          );
        }
      }
    }
    if (kind === "class") {
      for (const c of sourceFile.getClasses()) {
        const n = c.getName();
        if (n) names.push(`${kind} "${n}" (line ${String(c.getStartLineNumber())})`);
      }
    }
    if (kind === "interface") {
      for (const i of sourceFile.getInterfaces()) {
        names.push(`${kind} "${i.getName()}" (line ${String(i.getStartLineNumber())})`);
      }
    }
    if (kind === "type") {
      for (const t of sourceFile.getTypeAliases()) {
        names.push(`${kind} "${t.getName()}" (line ${String(t.getStartLineNumber())})`);
      }
    }
    if (kind === "enum") {
      for (const e of sourceFile.getEnums()) {
        names.push(`${kind} "${e.getName()}" (line ${String(e.getStartLineNumber())})`);
      }
    }
    if (kind === "variable" || kind === "constant") {
      for (const stmt of sourceFile.getVariableStatements()) {
        const isConst = stmt.getDeclarationKind() === ts.VariableDeclarationKind.Const;
        for (const decl of stmt.getDeclarations()) {
          names.push(
            `${isConst ? "constant" : "variable"} "${decl.getName()}" (line ${String(stmt.getStartLineNumber())})`,
          );
        }
      }
    }
    return names;
  }

  private getProject(): Project | null {
    return this.project;
  }

  private async ensureProject(): Promise<Project> {
    if (this.project) return this.project;

    const ts = await getTsMorph();
    const tsconfigPath = resolve(this.cwd, "tsconfig.json");

    try {
      this.project = new ts.Project({
        tsConfigFilePath: tsconfigPath,
        skipAddingFilesFromTsConfig: false,
      });
    } catch {
      // No tsconfig — create a standalone project
      this.project = new ts.Project({
        compilerOptions: {
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
          strict: true,
          jsx: ts.ts.JsxEmit.ReactJSX,
          esModuleInterop: true,
          skipLibCheck: true,
          allowJs: true,
        },
      });
    }

    return this.project;
  }

  private async getSourceFile(file: string): Promise<SourceFile | null> {
    const project = await this.ensureProject();
    const absPath = resolve(file);

    let sourceFile = project.getSourceFile(absPath);
    if (!sourceFile) {
      try {
        sourceFile = project.addSourceFileAtPath(absPath);
      } catch {
        return null;
      }
    }

    return sourceFile;
  }

  private findNode(
    sourceFile: SourceFile,
    symbol: string,
    line?: number,
    column?: number,
  ): Node | null {
    if (line && column) {
      const pos = sourceFile.compilerNode.getPositionOfLineAndCharacter(line - 1, column - 1);
      return sourceFile.getDescendantAtPos(pos) ?? null;
    }

    // Search by name — find first identifier matching the symbol
    const found = sourceFile.forEachDescendant((node) => {
      const ts = tsMorphModule;
      if (!ts) return undefined;
      if (ts.Node.isIdentifier(node) && node.getText() === symbol) {
        return node;
      }
      return undefined;
    });

    return found ?? null;
  }

  private getNodeDocumentation(node: Node): string | undefined {
    const ts = tsMorphModule;
    if (!ts) return undefined;

    // Check if the node or its parent has JSDoc
    const target = ts.Node.isIdentifier(node) ? node.getParent() : node;
    if (!target) return undefined;

    if ("getJsDocs" in target && typeof target.getJsDocs === "function") {
      const jsDocs = target.getJsDocs() as Array<{ getDescription(): string }>;
      if (jsDocs.length > 0) {
        return jsDocs.map((d) => d.getDescription()).join("\n");
      }
    }

    return undefined;
  }

  private detectLang(file: string): Language {
    const dot = file.lastIndexOf(".");
    if (dot === -1) return "unknown";
    const ext = file.slice(dot);
    if ([".ts", ".tsx", ".mts", ".cts"].includes(ext)) return "typescript";
    if ([".js", ".jsx", ".mjs", ".cjs"].includes(ext)) return "javascript";
    return "unknown";
  }
}
