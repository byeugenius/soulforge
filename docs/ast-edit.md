# `ast_edit` — Surgical AST editing for TypeScript/JavaScript

`ast_edit` is SoulForge's **AST-native edit tool** for TypeScript and JavaScript. Instead of matching text, it addresses symbols directly — by kind and name — and mutates the AST.

No `oldString`. No line math. No whitespace failures.

## Why

Text-based editing breaks for predictable reasons:

- `oldString` doesn't match because of tabs vs spaces, escape handling, trailing whitespace.
- Ambiguous matches ("found 3 occurrences") — pure text can't disambiguate identical patterns.
- Sequential edits shift line numbers; tracking offsets is error-prone.
- Every edit requires the LLM to emit the original code verbatim, even when the change is tiny.

For a 50-line function where only the return type changes, text-based edits force the agent to emit ~100 lines of `oldString` + `newString`. The actual change is five characters.

`ast_edit` skips all of this. It locates symbols through the AST and mutates them with structured operations.

## The one-liner

```typescript
// Make a function async
ast_edit({ path: "src/api.ts", action: "set_async", target: "function", name: "fetchUser", value: "true" })

// Change a return type
ast_edit({ path: "src/api.ts", action: "set_return_type", target: "function", name: "fetchUser", value: "Promise<User>" })

// Add a parameter
ast_edit({ path: "src/api.ts", action: "add_parameter", target: "function", name: "fetchUser", value: "cache: boolean" })
```

One token of state + one token of type. Compare that to sending 50+ lines of context with `edit_file`.

## Three tiers

Operations fall into three tiers by token cost and scope.

### Tier 1 — Micro-edits (1-10 tokens)

Surgical changes to a single attribute of a symbol.

| Action | Effect |
|--------|--------|
| `set_type` | Change a variable/property/parameter's type annotation |
| `set_return_type` | Change a function's return type |
| `set_initializer` / `remove_initializer` | Set or clear an initializer |
| `set_value` | Set an enum member's value |
| `set_async` / `set_generator` | Toggle `async` / `generator` |
| `set_export` / `set_default_export` | Toggle `export` / `export default` |
| `set_abstract` / `set_static` / `set_readonly` | Toggle class-member modifiers |
| `set_scope` | Set `public` / `protected` / `private` |
| `set_optional` | Toggle `?` on parameters and properties |
| `set_overrides` | Toggle `override` |
| `set_ambient` | Toggle `declare` |
| `set_const_enum` | Toggle `const enum` |
| `rename` | Rename a symbol (references updated locally) |
| `remove` | Remove the entire declaration |
| `add_parameter` / `remove_parameter` | Function/method parameters |
| `set_declaration_kind` | `const` / `let` / `var` |

### Tier 2 — Body surgery (10-100 tokens)

Structural changes to a symbol's contents.

| Action | Effect |
|--------|--------|
| `set_body` | Replace a function/method body (keeps signature and JSDoc) |
| `add_statement` / `insert_statement` / `remove_statement` | Statement-level edits inside a body |
| `add_property` / `remove_property` | Interface/class properties |
| `add_method` / `remove_method` | Class methods — inserted with correct indentation |
| `add_constructor` / `add_getter` / `add_setter` | Class members |
| `add_member` / `remove_member` | Enum members, type-literal members |
| `add_decorator` / `remove_decorator` | Decorators on classes, methods, parameters |
| `add_overload` | Function overload signatures |
| `set_extends` / `remove_extends` / `add_extends` | Class/interface inheritance |
| `add_implements` / `remove_implements` | Class `implements` list |
| `add_type_parameter` | Generic type parameters |
| `add_jsdoc` / `remove_jsdoc` | JSDoc blocks |
| `unwrap` | Replace a function/namespace with its body contents |
| `set_structure` | Declarative bulk mutation (merge a partial structure) |
| `extract_interface` | Auto-generate an interface from a class's public surface |

### Tier 3 — Full replacement

| Action | Effect |
|--------|--------|
| `replace` | Replace a whole symbol (body + signature) with new source |

### File-level

Operations that target the file, not a specific symbol.

| Action | Effect |
|--------|--------|
| `add_import` / `remove_import` | Import declarations |
| `add_named_import` / `remove_named_import` | Named imports on an existing import |
| `set_module_specifier` | Change an import path (`"./old"` → `"./new"`) |
| `add_export_declaration` | `export { X } from "..."` |
| `add_namespace` | Namespace/module declarations |
| `organize_imports` | Sort and dedupe imports |
| `fix_missing_imports` | Auto-add imports for unresolved identifiers |
| `fix_unused` | Remove unused identifiers |
| `add_function` / `add_class` / `add_interface` / `add_type_alias` / `add_enum` / `add_variable` | Append a new top-level declaration |
| `insert_text` | Insert a statement at a specific index |

## Targets

Most operations take a `target` — the symbol kind to locate.

| Target | Addressable by |
|--------|----------------|
| `function` | `name` — top-level functions. Also falls through to class methods if no match. |
| `class` | `name` |
| `interface` | `name` |
| `type` | `name` |
| `enum` | `name` |
| `variable` / `constant` | `name` |
| `method` | `"ClassName.methodName"` or `"methodName"` (searches all classes) |
| `property` | `"ClassName.propName"` or `"propName"` |

## Single op vs atomic batch

### Single operation — flat args

```typescript
ast_edit({
  path: "src/api.ts",
  action: "set_return_type",
  target: "function",
  name: "fetchUser",
  value: "Promise<User>",
})
```

### Multiple operations — `operations` array, atomic

All-or-nothing: if any operation fails, zero edits are applied.

```typescript
ast_edit({
  path: "src/api.ts",
  operations: [
    { action: "set_async", target: "function", name: "fetchUser", value: "true" },
    { action: "set_return_type", target: "function", name: "fetchUser", value: "Promise<User>" },
    { action: "add_parameter", target: "function", name: "fetchUser", value: "cache: boolean" },
    { action: "add_import", value: "./types", newCode: "User" },
  ],
})
```

Mix any operations — micro-edits, body changes, imports — on the same file in one atomic call.

## Supported files

`.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, `.cts`, `.mjs`, `.cjs`. For anything else, use `edit_file` or `multi_edit`.

## Safety

- **Concurrent-modification detection**: if the file changed on disk since the tool snapshot, the edit is rejected with no write.
- **Atomic rollback**: a failed operation in a batch reverts the entire batch.
- **Undo stack**: `undo_edit` reverts `ast_edit` writes the same way it reverts `edit_file`.
- **Pre/post diagnostics**: new type errors or warnings introduced by the edit are reported back to the agent.
- **Auto-format**: the file is formatted after the write.
- **Forbidden-file guard**: matches the same allow-list as `edit_file`.

## When to reach for `edit_file` or `multi_edit` instead

- **Non-TS/JS files** — JSON, YAML, Markdown, config.
- **Sub-statement text tweaks** — flipping a comparison operator, editing a string literal, adjusting a condition inside a function. These don't map to an AST action.
- **Unusual shapes** — if `ast_edit` errors on a particular structure, fall back to text editing.

For everything else in TS/JS — especially micro-edits and whole-symbol rewrites — `ast_edit` is cheaper, more accurate, and more concise.

## Relationship to other tools

| Dimension | `ast_edit` | `edit_file` / `multi_edit` |
|-----------|-----------|---------------------------|
| **Languages** | TS/JS only | Any text file |
| **Addressing** | AST: symbol kind + name | Text: `oldString` + `lineStart` |
| **Micro-edit cost** | 1-10 tokens | 50+ tokens (must emit `oldString`) |
| **Failure mode** | "Symbol not found" (clear) | "oldString mismatch" (fuzzy) |
| **Atomic batch** | `operations` array | `edits` array |

`ast_edit` complements `rename_symbol` and `move_symbol`: those operate across files, `ast_edit` operates within one file.

## Credits

The AST-first editing approach is inspired by my (Ouail Bni) Master's thesis in Computer Science [**Typed vs Untyped Programming Languages**](https://www.diva-portal.org/smash/record.jsf?pid=diva2%3A1690910&dswid=-6127) (co-authored with Artur Matusiak, 2022) and its reference implementation [JS Typer](https://github.com/proxysoul/Javascript-Typer), which demonstrated that programmatic JS→TS transformation could be done entirely through ts-morph AST mutations rather than string manipulation.
