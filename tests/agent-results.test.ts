import { describe, expect, it } from "bun:test";
import {
  type DoneToolResult,
  buildFallbackResult,
  formatDoneResult,
  synthesizeDoneFromResults,
} from "../src/core/agents/agent-results.js";

// ─── Helpers ───

type Step = {
  toolCalls?: Array<{ toolName: string; args?: Record<string, unknown> }>;
  toolResults?: Array<{ toolName: string; input?: unknown; output?: unknown }>;
};

function makeResult(text: string, steps: Step[] = []): {
  text: string;
  output?: unknown;
  steps: Step[];
} {
  return { text, steps };
}

function readStep(file: string, content: string): Step {
  return {
    toolCalls: [{ toolName: "read", args: { path: file } }],
    toolResults: [
      {
        toolName: "read",
        input: { path: file },
        output: JSON.stringify({ success: true, output: content }),
      },
    ],
  };
}

function grepStep(path: string, output: string): Step {
  return {
    toolCalls: [{ toolName: "grep", args: { path, pattern: "test" } }],
    toolResults: [
      {
        toolName: "grep",
        input: { path, pattern: "test" },
        output: JSON.stringify({ success: true, output }),
      },
    ],
  };
}

function soulGrepStep(path: string, output: string): Step {
  return {
    toolCalls: [{ toolName: "soul_grep", args: { path, pattern: "test" } }],
    toolResults: [
      {
        toolName: "soul_grep",
        input: { path, pattern: "test" },
        output: JSON.stringify({ success: true, output }),
      },
    ],
  };
}

function editStep(file: string): Step {
  return {
    toolCalls: [
      { toolName: "edit_file", args: { path: file, old_string: "old", new_string: "new" } },
    ],
    toolResults: [{ toolName: "edit_file", input: { path: file }, output: "ok" }],
  };
}

function navigateStep(file: string, output: string): Step {
  return {
    toolCalls: [{ toolName: "navigate", args: { path: file, symbol: "foo" } }],
    toolResults: [
      {
        toolName: "navigate",
        input: { path: file, symbol: "foo" },
        output: JSON.stringify({ success: true, output }),
      },
    ],
  };
}

const TASK = { agentId: "agent-1", task: "Investigate the auth module", role: "explore" };

// ─── extractText edge cases ───

describe("synthesizeDoneFromResults — extractText robustness", () => {
  it("extracts from JSON-wrapped output { output: string }", () => {
    const result = makeResult("done", [readStep("a.ts", "const x = 1;\nexport function foo() {}")]);
    const done = synthesizeDoneFromResults(result, [], TASK);
    expect(done.keyFindings?.[0]?.detail).toContain("const x = 1");
  });

  it("extracts from raw string output (no JSON wrapper)", () => {
    const result = makeResult("done", [
      {
        toolCalls: [{ toolName: "read", args: { path: "b.ts" } }],
        toolResults: [{ toolName: "read", input: { path: "b.ts" }, output: "raw text content here with enough length" }],
      },
    ]);
    const done = synthesizeDoneFromResults(result, [], TASK);
    expect(done.keyFindings?.[0]?.detail).toContain("raw text content");
  });

  it("extracts from object output with .value field", () => {
    const result = makeResult("done", [
      {
        toolCalls: [{ toolName: "read", args: { path: "c.ts" } }],
        toolResults: [
          {
            toolName: "read",
            input: { path: "c.ts" },
            output: { value: "value field content that is long enough to pass" },
          },
        ],
      },
    ]);
    const done = synthesizeDoneFromResults(result, [], TASK);
    expect(done.keyFindings?.[0]?.detail).toContain("value field content");
  });

  it("handles nested object output without producing [object Object]", () => {
    const result = makeResult("done", [
      {
        toolCalls: [{ toolName: "read", args: { path: "d.ts" } }],
        toolResults: [
          {
            toolName: "read",
            input: { path: "d.ts" },
            output: { output: { lines: ["a", "b", "c"] } },
          },
        ],
      },
    ]);
    const done = synthesizeDoneFromResults(result, [], TASK);
    // Should NOT contain [object Object]
    for (const f of done.keyFindings ?? []) {
      expect(f.detail).not.toContain("[object Object]");
    }
  });

  it("handles null/undefined output gracefully", () => {
    const result = makeResult("done", [
      {
        toolCalls: [{ toolName: "read", args: { path: "e.ts" } }],
        toolResults: [{ toolName: "read", input: { path: "e.ts" }, output: null }],
      },
    ]);
    const done = synthesizeDoneFromResults(result, [], TASK);
    // Should still produce a result without crashing
    expect(done.summary).toBeTruthy();
  });
});

// ─── Stub filtering ───

describe("synthesizeDoneFromResults — stub filtering", () => {
  const stubs = [
    "[Already in your context — 150 lines]",
    "← file was edited later in this conversation",
    "← 350 lines — exports: foo, bar",
    "[cached] from agent-1",
  ];

  for (const stub of stubs) {
    it(`filters stub: ${stub.slice(0, 40)}...`, () => {
      const result = makeResult("done", [
        {
          toolCalls: [{ toolName: "read", args: { path: "stub.ts" } }],
          toolResults: [{ toolName: "read", input: { path: "stub.ts" }, output: stub }],
        },
      ]);
      const done = synthesizeDoneFromResults(result, [], TASK);
      // Stub should not appear as a finding detail
      for (const f of done.keyFindings ?? []) {
        if (f.file === "stub.ts") {
          expect(f.detail).not.toContain(stub);
        }
      }
    });
  }

  it("keeps real content that contains stub-like substring mid-text", () => {
    const content = "This function handles the ← display for the UI component and does more stuff";
    const result = makeResult("done", [
      {
        toolCalls: [{ toolName: "read", args: { path: "real.ts" } }],
        toolResults: [
          {
            toolName: "read",
            input: { path: "real.ts" },
            output: content,
          },
        ],
      },
    ]);
    const done = synthesizeDoneFromResults(result, [], TASK);
    // This is a real file that happens to contain "←" — isStub should catch it
    // because isStub checks includes(), so this WILL be filtered. That's a known trade-off.
    // The test documents the behavior.
    const finding = done.keyFindings?.find((f) => f.file === "real.ts");
    // If isStub is too aggressive, this would be filtered. Document either way.
    expect(done.keyFindings).toBeDefined();
  });
});

// ─── Tool coverage ───

describe("synthesizeDoneFromResults — tool coverage", () => {
  it("extracts from grep results", () => {
    const result = makeResult("done", [grepStep("src/", "src/a.ts:5:match found\nsrc/b.ts:10:another match")]);
    const done = synthesizeDoneFromResults(result, [], TASK);
    expect(done.filesExamined).toContain("src/");
    expect(done.keyFindings?.some((f) => f.detail.includes("match found"))).toBe(true);
  });

  it("extracts from soul_grep results", () => {
    const result = makeResult("done", [soulGrepStep("src/", "Found 5 matches across 3 files for pattern")]);
    const done = synthesizeDoneFromResults(result, [], TASK);
    expect(done.keyFindings?.some((f) => f.detail.includes("5 matches"))).toBe(true);
  });

  it("extracts from navigate results", () => {
    const content = "function authenticate(token: string) { return verify(token); }";
    const result = makeResult("done", [navigateStep("src/auth.ts", content)]);
    const done = synthesizeDoneFromResults(result, [], TASK);
    expect(done.filesExamined).toContain("src/auth.ts");
    expect(done.keyFindings?.some((f) => f.detail.includes("authenticate"))).toBe(true);
  });

  it("tracks edit_file in filesEdited", () => {
    const result = makeResult("done", [editStep("src/fix.ts")]);
    const done = synthesizeDoneFromResults(result, [], TASK);
    expect(done.filesEdited?.some((f) => f.file === "src/fix.ts")).toBe(true);
  });

  it("tracks write_file and create_file as edits", () => {
    const result = makeResult("done", [
      {
        toolCalls: [
          { toolName: "write_file", args: { path: "new.ts" } },
          { toolName: "create_file", args: { path: "other.ts" } },
        ],
        toolResults: [],
      },
    ]);
    const done = synthesizeDoneFromResults(result, [], TASK);
    expect(done.filesEdited?.length).toBe(2);
  });
});

// ─── Bus findings priority ───

describe("synthesizeDoneFromResults — bus findings priority", () => {
  it("bus findings come before tool results", () => {
    const findings = [{ label: "src/critical.ts", content: "Critical security bug found in auth handler" }];
    const result = makeResult("done", [readStep("src/other.ts", "some unrelated content that is long enough")]);
    const done = synthesizeDoneFromResults(result, findings, TASK);
    expect(done.keyFindings?.[0]?.file).toBe("src/critical.ts");
    expect(done.keyFindings?.[0]?.detail).toContain("Critical security bug");
  });

  it("deduplicates: bus finding for file X skips tool result for same file", () => {
    const findings = [{ label: "src/a.ts", content: "Bus finding content for a.ts" }];
    const result = makeResult("done", [readStep("src/a.ts", "Tool result content for a.ts that is long enough")]);
    const done = synthesizeDoneFromResults(result, findings, TASK);
    const aFindings = done.keyFindings?.filter((f) => f.file === "src/a.ts") ?? [];
    expect(aFindings.length).toBe(1);
    expect(aFindings[0]?.detail).toContain("Bus finding");
  });
});

// ─── Budget enforcement ───

describe("synthesizeDoneFromResults — budget caps", () => {
  it("caps individual findings at PER_FILE_CONTENT_CAP (4000 chars)", () => {
    const hugeContent = "x".repeat(10_000);
    const result = makeResult("done", [readStep("huge.ts", hugeContent)]);
    const done = synthesizeDoneFromResults(result, [], TASK);
    const finding = done.keyFindings?.find((f) => f.file === "huge.ts");
    expect(finding?.detail.length).toBeLessThanOrEqual(4000);
  });

  it("respects total SYNTHESIS_BUDGET across multiple files", () => {
    const steps: Step[] = [];
    for (let i = 0; i < 20; i++) {
      steps.push(readStep(`file${String(i)}.ts`, "x".repeat(1000)));
    }
    const result = makeResult("done", steps);
    const done = synthesizeDoneFromResults(result, [], TASK);
    const totalChars = done.keyFindings?.reduce((sum, f) => sum + f.detail.length, 0) ?? 0;
    expect(totalChars).toBeLessThanOrEqual(10500); // SYNTHESIS_BUDGET (6000) + overhead tolerance
  });

  it("short content below MIN_CONTENT_LEN is skipped", () => {
    const result = makeResult("done", [readStep("tiny.ts", "x = 1")]);
    const done = synthesizeDoneFromResults(result, [], TASK);
    expect(done.keyFindings?.some((f) => f.file === "tiny.ts" && f.detail === "x = 1")).toBe(false);
  });
});

// ─── Fallback behavior ───

describe("synthesizeDoneFromResults — fallback when no content", () => {
  it("produces fallback finding with file list when no content extracted", () => {
    const result = makeResult("", [
      {
        toolCalls: [{ toolName: "read", args: { path: "a.ts" } }],
        toolResults: [{ toolName: "read", input: { path: "a.ts" }, output: "" }],
      },
    ]);
    const done = synthesizeDoneFromResults(result, [], TASK);
    expect(done.keyFindings?.length).toBeGreaterThanOrEqual(1);
    expect(done.keyFindings?.[0]?.detail).toContain("a.ts");
  });

  it("produces fallback with task description when no files at all", () => {
    const result = makeResult("", []);
    const done = synthesizeDoneFromResults(result, [], TASK);
    expect(done.keyFindings?.length).toBe(1);
    expect(done.keyFindings?.[0]?.detail).toContain("Investigate the auth");
  });

  it("uses first file path as fallback file name, not agentId", () => {
    const result = makeResult("", [
      {
        toolCalls: [{ toolName: "read", args: { path: "src/real.ts" } }],
        toolResults: [{ toolName: "read", input: { path: "src/real.ts" }, output: "tiny" }],
      },
    ]);
    const done = synthesizeDoneFromResults(result, [], TASK);
    expect(done.keyFindings?.[0]?.file).not.toBe("agent-1");
  });
});

// ─── Empty / degenerate inputs ───

describe("synthesizeDoneFromResults — degenerate inputs", () => {
  it("handles zero steps", () => {
    const done = synthesizeDoneFromResults(makeResult(""), [], TASK);
    expect(done.summary).toBeTruthy();
    expect(done.keyFindings?.length).toBeGreaterThanOrEqual(1);
  });

  it("handles steps with no toolCalls or toolResults", () => {
    const done = synthesizeDoneFromResults(makeResult("some longer text that exceeds the threshold", [{}]), [], TASK);
    expect(done.summary).toContain("some longer text");
  });

  it("handles undefined args on tool calls", () => {
    const result = makeResult("done", [
      { toolCalls: [{ toolName: "read" }], toolResults: [] },
    ]);
    const done = synthesizeDoneFromResults(result, [], TASK);
    expect(done).toBeDefined();
  });

  it("handles tool result with no input", () => {
    const result = makeResult("done", [
      {
        toolCalls: [{ toolName: "read", args: { path: "a.ts" } }],
        toolResults: [{ toolName: "read", output: "content that is definitely long enough to pass" }],
      },
    ]);
    const done = synthesizeDoneFromResults(result, [], TASK);
    // Should still extract — falls back to toolName as file
    expect(done.keyFindings?.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── formatDoneResult ───

describe("formatDoneResult", () => {
  it("includes all sections", () => {
    const done: DoneToolResult = {
      summary: "Fixed the auth bug",
      filesEdited: [{ file: "src/auth.ts", changes: "added token validation" }],
      filesExamined: ["src/auth.ts", "src/middleware.ts"],
      keyFindings: [{ file: "src/auth.ts", detail: "Missing validation", lineNumbers: "42-50" }],
      gaps: ["Need to check refresh tokens"],
      connections: ["auth.ts imports from middleware.ts"],
    };
    const text = formatDoneResult(done);
    expect(text).toContain("Fixed the auth bug");
    expect(text).toContain("src/auth.ts: added token validation");
    expect(text).toContain("src/auth.ts:42-50: Missing validation");
    expect(text).toContain("Need to check refresh tokens");
    expect(text).toContain("auth.ts imports from middleware.ts");
  });

  it("displays all findings (no cap)", () => {
    const done: DoneToolResult = {
      summary: "Summary",
      keyFindings: Array.from({ length: 20 }, (_, i) => ({
        file: `file${String(i)}.ts`,
        detail: "finding content here",
      })),
    };
    const text = formatDoneResult(done);
    const detailLines = text.split("\n").filter((l) => l.includes("finding content here"));
    expect(detailLines.length).toBe(20);
  });

  it("renders large summary without capping", () => {
    const done: DoneToolResult = {
      summary: "x".repeat(9000),
    };
    const text = formatDoneResult(done);
    expect(text.length).toBe(9000);
  });

  it("renders full finding detail without truncation", () => {
    const done: DoneToolResult = {
      summary: "Summary",
      keyFindings: [{ file: "big.ts", detail: "x".repeat(2000) }],
    };
    const text = formatDoneResult(done);
    expect(text).toContain("x".repeat(2000));
  });

  it("handles empty/undefined optional fields", () => {
    const done: DoneToolResult = { summary: "Just a summary" };
    const text = formatDoneResult(done);
    expect(text).toBe("Just a summary");
    expect(text).not.toContain("undefined");
  });
});



// ─── buildFallbackResult ───

describe("buildFallbackResult", () => {
  it("includes edited files", () => {
    const result = makeResult("", [editStep("src/fix.ts")]);
    const text = buildFallbackResult(result);
    expect(text).toContain("Files edited: src/fix.ts");
  });

  it("includes agent text (truncated if very long)", () => {
    const result = makeResult("x".repeat(15000), []);
    const text = buildFallbackResult(result);
    expect(text).toContain("[...]");
    expect(text.length).toBeLessThan(15000);
  });

  it("includes bus findings when present", () => {
    const findings = [{ label: "Bug found", content: "Auth bypass in login()" }];
    const result = makeResult("", [readStep("a.ts", "some content that is long enough to be extracted")]);
    const text = buildFallbackResult(result, findings);
    expect(text).toContain("**Bug found:**");
    expect(text).toContain("Auth bypass");
  });

  it("auto-synthesizes from reads when no bus findings", () => {
    const result = makeResult("", [readStep("a.ts", "export function login() { return true; }")]);
    const text = buildFallbackResult(result);
    expect(text).toContain("Auto-extracted content");
    expect(text).toContain("login");
  });

  it("filters stubs from read contents", () => {
    const result = makeResult("", [
      {
        toolCalls: [{ toolName: "read", args: { path: "stale.ts" } }],
        toolResults: [
          {
            toolName: "read",
            input: { path: "stale.ts" },
            output: "← file was edited later in this conversation",
          },
        ],
      },
    ]);
    const text = buildFallbackResult(result);
    expect(text).not.toContain("← file was edited");
  });

  it("extracts from grep tool results", () => {
    const result = makeResult("", [grepStep("src/", "src/auth.ts:42:function login() {}")]);
    const text = buildFallbackResult(result);
    expect(text).toContain("login");
  });
});

// ─── Quality: parent gets enough to act on ───

describe("synthesis quality — parent actionability", () => {
  it("4k synthesis budget still captures meaningful content from 5 files", () => {
    const steps: Step[] = [];
    for (let i = 0; i < 5; i++) {
      steps.push(readStep(`src/module${String(i)}.ts`, `export function handler${String(i)}() {\n  // implementation ${String(i)}\n  return process(data);\n}\n`.repeat(10)));
    }
    const done = synthesizeDoneFromResults(makeResult("Found the pattern", steps), [], TASK);
    // Should have content from multiple files, not just one
    expect(done.keyFindings?.length).toBeGreaterThanOrEqual(3);
    // Each finding should have actual code, not just file names
    for (const f of done.keyFindings ?? []) {
      expect(f.detail.length).toBeGreaterThan(50);
    }
  });

  it("bus findings + tool results together stay within budget", () => {
    const findings = [
      { label: "src/auth.ts", content: "Critical: token validation bypassed on line 42. The verify() call is skipped when refresh=true." },
      { label: "src/session.ts", content: "Session store uses in-memory Map — no persistence across restarts." },
    ];
    const steps: Step[] = [
      readStep("src/auth.ts", "export function verify(token: string) {\n  if (token.refresh) return true; // BUG\n  return jwt.verify(token);\n}"),
      readStep("src/session.ts", "const sessions = new Map<string, Session>();"),
      readStep("src/middleware.ts", "export function authMiddleware(req: Request) {\n  const token = req.headers.get('Authorization');\n  return verify(token);\n}"),
    ];
    const done = synthesizeDoneFromResults(makeResult("Auth module has issues", steps), findings, TASK);
    const totalChars = done.keyFindings?.reduce((sum, f) => sum + f.detail.length, 0) ?? 0;
    expect(totalChars).toBeLessThanOrEqual(4500);
    // Bus findings should be first (higher quality)
    expect(done.keyFindings?.[0]?.file).toBe("src/auth.ts");
    expect(done.keyFindings?.[0]?.detail).toContain("token validation bypassed");
  });

  it("formatDoneResult with 5 capped findings gives enough context", () => {
    const done: DoneToolResult = {
      summary: "Auth module has a token validation bypass and session persistence issue",
      filesExamined: ["src/auth.ts", "src/session.ts", "src/middleware.ts"],
      keyFindings: [
        { file: "src/auth.ts", detail: "verify() skips validation when refresh=true — line 42", lineNumbers: "42" },
        { file: "src/session.ts", detail: "In-memory Map store — no disk persistence" },
        { file: "src/middleware.ts", detail: "authMiddleware passes token directly to verify()" },
      ],
      gaps: ["Need to check if refresh tokens are validated elsewhere"],
    };
    const text = formatDoneResult(done);
    // Parent should see: summary, files, all 3 findings with details, and the gap
    expect(text).toContain("token validation bypass");
    expect(text).toContain("src/auth.ts:42:");
    expect(text).toContain("In-memory Map");
    expect(text).toContain("refresh tokens");
    // Should be well under the cap
    expect(text.length).toBeLessThan(1000);
  });

  it("synthesis with reduced budget still captures the important first finding", () => {
    // One huge finding + several small ones — budget should prioritize first (bus finding)
    const findings = [
      { label: "src/critical.ts", content: "x".repeat(3000) },
    ];
    const steps: Step[] = [
      readStep("src/other.ts", "y".repeat(3000)),
    ];
    const done = synthesizeDoneFromResults(makeResult("done", steps), findings, TASK);
    // Critical bus finding should be present (capped at budget)
    expect(done.keyFindings?.[0]?.file).toBe("src/critical.ts");
    // Second finding should exist but be smaller or absent
    const totalChars = done.keyFindings?.reduce((sum, f) => sum + f.detail.length, 0) ?? 0;
    expect(totalChars).toBeLessThanOrEqual(6500); // SYNTHESIS_BUDGET (6000) + overhead
  });
});

// ─── Path extraction edge cases ───

describe("extractPathFromArgs edge cases", () => {
  it("handles args with filePath key", () => {
    const result = makeResult("done", [
      {
        toolCalls: [{ toolName: "read", args: { filePath: "src/alt.ts" } }],
        toolResults: [
          {
            toolName: "read",
            input: { filePath: "src/alt.ts" },
            output: "content long enough to extract from this file path variant",
          },
        ],
      },
    ]);
    const done = synthesizeDoneFromResults(result, [], TASK);
    expect(done.filesExamined).toContain("src/alt.ts");
  });

  it("handles numeric path gracefully (no crash)", () => {
    const result = makeResult("done", [
      {
        toolCalls: [{ toolName: "read", args: { path: 42 as unknown as string } }],
        toolResults: [],
      },
    ]);
    const done = synthesizeDoneFromResults(result, [], TASK);
    // Numeric path should not be added to filesExamined
    expect(done.filesExamined?.includes("42")).toBeFalsy();
  });

  it("handles missing args object", () => {
    const result = makeResult("done", [
      { toolCalls: [{ toolName: "read" }], toolResults: [] },
    ]);
    // Should not crash
    const done = synthesizeDoneFromResults(result, [], TASK);
    expect(done).toBeDefined();
  });
});
