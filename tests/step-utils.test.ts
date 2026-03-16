import { describe, expect, it } from "bun:test";
import type { ModelMessage } from "@ai-sdk/provider-utils";
import {
	buildPrepareStep,
	buildSymbolLookup,
	compactOldToolResults,
	KEEP_RECENT_MESSAGES,
	type PrepareStepOptions,
} from "../src/core/agents/step-utils.js";

const LONG_CONTENT = Array.from(
	{ length: 100 },
	(_, i) => `     ${String(i + 1)}\tconst x${String(i)} = ${String(i)};`,
).join("\n");

function assistantToolCall(
	calls: Array<{ id: string; name: string; input: Record<string, unknown> }>,
): ModelMessage {
	return {
		role: "assistant",
		content: calls.map((c) => ({
			type: "tool-call" as const,
			toolCallId: c.id,
			toolName: c.name,
			input: c.input,
		})),
	};
}

function toolResult(
	results: Array<{ id: string; name: string; output: unknown }>,
): ModelMessage {
	return {
		role: "tool",
		content: results.map((r) => ({
			type: "tool-result" as const,
			toolCallId: r.id,
			toolName: r.name,
			output: { type: "text" as const, value: r.output } as never,
		})),
	};
}

function buildPaddedConversation(
	first: {
		id: string;
		name: string;
		input: Record<string, unknown>;
		output: unknown;
	},
	paddingCount?: number,
): ModelMessage[] {
	const needed = paddingCount ?? Math.ceil(KEEP_RECENT_MESSAGES / 2) + 1;
	const msgs: ModelMessage[] = [
		assistantToolCall([
			{ id: first.id, name: first.name, input: first.input },
		]),
		toolResult([
			{ id: first.id, name: first.name, output: first.output },
		]),
	];
	for (let i = 1; i < needed; i++) {
		const id = `pad-${String(i)}`;
		msgs.push(
			assistantToolCall([
				{ id, name: "read_file", input: { path: `/pad${String(i)}.ts` } },
			]),
		);
		msgs.push(
			toolResult([{ id, name: "read_file", output: LONG_CONTENT }]),
		);
	}
	return msgs;
}

function resultText(
	msgs: ModelMessage[],
	msgIdx: number,
	partIdx = 0,
): string {
	const msg = msgs[msgIdx];
	if (!msg || msg.role !== "tool" || !Array.isArray(msg.content)) {
		throw new Error(
			`Message at index ${String(msgIdx)} is not a tool-result message`,
		);
	}
	const part = msg.content[partIdx] as { output: unknown };
	if (typeof part.output === "string") return part.output;
	if (part.output && typeof part.output === "object") {
		const obj = part.output as Record<string, unknown>;
		if (typeof obj.value === "string") return obj.value;
	}
	return JSON.stringify(part.output);
}

function makeSteps(totalTokens: number) {
	return [{ usage: { inputTokens: totalTokens, outputTokens: 0 } }];
}

const TOOLS = {
	read_file: {},
	read_code: {},
	grep: {},
	glob: {},
	edit_file: {},
	done: {},
};

function callPrepareStep(
	opts: PrepareStepOptions,
	stepArgs: {
		stepNumber: number;
		messages: ModelMessage[];
		steps?: Array<{ usage: { inputTokens: number; outputTokens: number } }>;
	},
) {
	const fn = buildPrepareStep(opts);
	const result = fn({
		stepNumber: stepArgs.stepNumber,
		messages: stepArgs.messages,
		steps: (stepArgs.steps ?? []) as never,
		model: {} as never,
		experimental_context: undefined,
	});
	return result as
		| { messages?: ModelMessage[]; toolChoice?: string; activeTools?: string[]; system?: string }
		| undefined;
}

// ---------------------------------------------------------------------------
// pruning rules
// ---------------------------------------------------------------------------

describe("pruning rules", () => {
	it("does not compact when message count <= KEEP_RECENT_MESSAGES", () => {
		const msgs: ModelMessage[] = [
			assistantToolCall([
				{ id: "1", name: "read_file", input: { path: "/a.ts" } },
			]),
			toolResult([{ id: "1", name: "read_file", output: LONG_CONTENT }]),
		];
		const result = callPrepareStep(
			{ role: "explore", allTools: TOOLS },
			{ stepNumber: 3, messages: msgs },
		);
		expect(resultText(result!.messages!, 1)).toBe(LONG_CONTENT);
	});

	it("does not compact at step 2 even with enough messages", () => {
		const msgs = buildPaddedConversation({
			id: "1",
			name: "read_file",
			input: { path: "/a.ts" },
			output: LONG_CONTENT,
		});
		const result = callPrepareStep(
			{ role: "explore", allTools: TOOLS },
			{ stepNumber: 2, messages: msgs },
		);
		expect(result?.messages).toBeDefined();
		const hasAnyPruned = JSON.stringify(result!.messages).includes("[pruned]");
		expect(hasAnyPruned).toBe(false);
	});

	it("compacts at step 3 when messages exceed threshold", () => {
		const msgs = buildPaddedConversation({
			id: "1",
			name: "read_file",
			input: { path: "/a.ts" },
			output: LONG_CONTENT,
		});
		const result = callPrepareStep(
			{ role: "explore", allTools: TOOLS },
			{ stepNumber: 3, messages: msgs },
		);
		expect(result?.messages).toBeDefined();
		expect(resultText(result!.messages!, 1)).toContain("[pruned]");
	});

	it("preserves recent messages within KEEP_RECENT_MESSAGES window", () => {
		const msgs = buildPaddedConversation({
			id: "1",
			name: "read_file",
			input: { path: "/a.ts" },
			output: LONG_CONTENT,
		});
		const result = callPrepareStep(
			{ role: "explore", allTools: TOOLS },
			{ stepNumber: 3, messages: msgs },
		);
		const lastToolIdx = result!.messages!.length - 1;
		expect(resultText(result!.messages!, lastToolIdx)).toBe(LONG_CONTENT);
	});

	it("preserves short results (<= 200 chars)", () => {
		const msgs = buildPaddedConversation({
			id: "1",
			name: "read_file",
			input: { path: "/a.ts" },
			output: "short",
		});
		const result = callPrepareStep(
			{ role: "explore", allTools: TOOLS },
			{ stepNumber: 3, messages: msgs },
		);
		expect(resultText(result!.messages!, 1)).toBe("short");
	});
});

// ---------------------------------------------------------------------------
// summary formats
// ---------------------------------------------------------------------------

describe("summary formats", () => {
	it("read_file: exact format with line count", () => {
		const msgs = buildPaddedConversation({
			id: "1",
			name: "read_file",
			input: { path: "/a.ts" },
			output: LONG_CONTENT,
		});
		const result = callPrepareStep(
			{ role: "explore", allTools: TOOLS },
			{ stepNumber: 3, messages: msgs },
		);
		expect(resultText(result!.messages!, 1)).toBe("[pruned] 100 lines");
	});

	it("read_file with symbols: exact format", () => {
		const symbolLookup = (p: string) =>
			p === "/a.ts"
				? [
						{ name: "Foo", kind: "class", isExported: true },
						{ name: "bar", kind: "function", isExported: true },
					]
				: [];
		const msgs = buildPaddedConversation({
			id: "1",
			name: "read_file",
			input: { path: "/a.ts" },
			output: LONG_CONTENT,
		});
		const result = callPrepareStep(
			{ role: "explore", allTools: TOOLS, symbolLookup },
			{ stepNumber: 3, messages: msgs },
		);
		expect(resultText(result!.messages!, 1)).toBe(
			"[pruned] 100 lines — exports: Foo, bar",
		);
	});

	it("read_code uses same format as read_file", () => {
		const msgs = buildPaddedConversation({
			id: "1",
			name: "read_code",
			input: { file: "/a.ts" },
			output: LONG_CONTENT,
		});
		const result = callPrepareStep(
			{ role: "explore", allTools: TOOLS },
			{ stepNumber: 3, messages: msgs },
		);
		expect(resultText(result!.messages!, 1)).toBe("[pruned] 100 lines");
	});

	it("grep: includes pattern in summary", () => {
		const grepOutput = "a:1:x\n".repeat(42);
		const msgs = buildPaddedConversation({
			id: "1",
			name: "grep",
			input: { pattern: "x" },
			output: grepOutput,
		});
		const result = callPrepareStep(
			{ role: "explore", allTools: TOOLS },
			{ stepNumber: 3, messages: msgs },
		);
		const text = resultText(result!.messages!, 1);
		expect(text).toStartWith("[pruned] 42 matches");
		expect(text).toContain('"x"');
	});

	it("glob: includes pattern in summary", () => {
		const globOutput = Array.from(
			{ length: 25 },
			(_, i) => `src/f${String(i)}.ts`,
		).join("\n");
		const msgs = buildPaddedConversation({
			id: "1",
			name: "glob",
			input: { pattern: "**/*.ts" },
			output: globOutput,
		});
		const result = callPrepareStep(
			{ role: "explore", allTools: TOOLS },
			{ stepNumber: 3, messages: msgs },
		);
		const text = resultText(result!.messages!, 1);
		expect(text).toStartWith("[pruned] 25 files");
		expect(text).toContain("**/*.ts");
	});

	it("shell: includes command and status in summary", () => {
		const output = "some output line with enough content\n".repeat(30);
		const msgs = buildPaddedConversation({
			id: "1",
			name: "shell",
			input: { command: "ls -la src/" },
			output,
		});
		const result = callPrepareStep(
			{ role: "explore", allTools: { ...TOOLS, shell: {} } },
			{ stepNumber: 3, messages: msgs },
		);
		const text = resultText(result!.messages!, 1);
		expect(text).toStartWith("[pruned]");
		expect(text).toContain("ls -la src/");
	});

	it("dispatch with ### Files Edited", () => {
		const output =
			"## Audit\n**3/3** agents completed.\n" +
			"Details about what was done. ".repeat(10) +
			"\n### Files Edited\nsrc/a.ts, src/b.ts\n### Done";
		const msgs = buildPaddedConversation({
			id: "1",
			name: "dispatch",
			input: {},
			output,
		});
		const result = callPrepareStep(
			{ role: "explore", allTools: { ...TOOLS, dispatch: {} } },
			{ stepNumber: 3, messages: msgs },
		);
		const text = resultText(result!.messages!, 1);
		expect(text).toStartWith("[pruned] dispatch completed");
		expect(text).toContain("edited: src/a.ts, src/b.ts");
		expect(text).toContain("3/3 agents");
	});

	it("dispatch without ### Files Edited includes agents", () => {
		const output = `## My Dispatch\n**2/2** agents completed.\n### ✓ Agent: reader-1 (explore)\nTask: read stuff\n${"x".repeat(300)}`;
		const msgs = buildPaddedConversation({
			id: "1",
			name: "dispatch",
			input: {},
			output,
		});
		const result = callPrepareStep(
			{ role: "explore", allTools: { ...TOOLS, dispatch: {} } },
			{ stepNumber: 3, messages: msgs },
		);
		const text = resultText(result!.messages!, 1);
		expect(text).toStartWith("[pruned] dispatch completed");
		expect(text).toContain("My Dispatch");
		expect(text).toContain("2/2 agents");
		expect(text).toContain("reader-1 (explore)");
	});

	it("generic fallback for navigate/analyze/web_search/fetch_page", () => {
		for (const toolName of [
			"navigate",
			"analyze",
			"web_search",
			"fetch_page",
		]) {
			const output = "some result line with enough content\n".repeat(30);
			const msgs = buildPaddedConversation({
				id: "1",
				name: toolName,
				input: {},
				output,
			});
			const result = callPrepareStep(
				{ role: "explore", allTools: { ...TOOLS, [toolName]: {} } },
				{ stepNumber: 3, messages: msgs },
			);
			const text = resultText(result!.messages!, 1);
			expect(text).toMatch(/^\[pruned\] \d+ lines, \d+ chars$/);
		}
	});

	it("handles raw string output from extractText", () => {
		const msgs: ModelMessage[] = [
			assistantToolCall([
				{ id: "1", name: "shell", input: { command: "ls" } },
			]),
			{
				role: "tool",
				content: [
					{
						type: "tool-result" as const,
						toolCallId: "1",
						toolName: "shell",
						output: LONG_CONTENT as never,
					},
				],
			},
		];
		for (let i = 0; i < Math.ceil(KEEP_RECENT_MESSAGES / 2) + 1; i++) {
			const id = `pad-${String(i)}`;
			msgs.push(
				assistantToolCall([
					{
						id,
						name: "read_file",
						input: { path: `/p${String(i)}.ts` },
					},
				]),
			);
			msgs.push(
				toolResult([{ id, name: "read_file", output: LONG_CONTENT }]),
			);
		}
		const result = callPrepareStep(
			{ role: "explore", allTools: { ...TOOLS, shell: {} } },
			{ stepNumber: 3, messages: msgs },
		);
		expect(resultText(result!.messages!, 1)).toContain("[pruned]");
	});

	it("handles {output: string} format from extractText", () => {
		const msgs: ModelMessage[] = [
			assistantToolCall([
				{ id: "1", name: "shell", input: { command: "ls" } },
			]),
			{
				role: "tool",
				content: [
					{
						type: "tool-result" as const,
						toolCallId: "1",
						toolName: "shell",
						output: { output: LONG_CONTENT } as never,
					},
				],
			},
		];
		for (let i = 0; i < Math.ceil(KEEP_RECENT_MESSAGES / 2) + 1; i++) {
			const id = `pad-${String(i)}`;
			msgs.push(
				assistantToolCall([
					{
						id,
						name: "read_file",
						input: { path: `/p${String(i)}.ts` },
					},
				]),
			);
			msgs.push(
				toolResult([{ id, name: "read_file", output: LONG_CONTENT }]),
			);
		}
		const result = callPrepareStep(
			{ role: "explore", allTools: { ...TOOLS, shell: {} } },
			{ stepNumber: 3, messages: msgs },
		);
		expect(resultText(result!.messages!, 1)).toContain("[pruned]");
	});
});

// ---------------------------------------------------------------------------
// preservation rules
// ---------------------------------------------------------------------------

describe("preservation rules", () => {
	it("preserves edit_file/write_file/create_file results", () => {
		for (const toolName of ["edit_file", "write_file", "create_file"]) {
			const msgs = buildPaddedConversation({
				id: "1",
				name: toolName,
				input: { path: "/a.ts" },
				output: LONG_CONTENT,
			});
			const result = callPrepareStep(
				{ role: "code", allTools: { ...TOOLS, [toolName]: {} } },
				{ stepNumber: 3, messages: msgs },
			);
			expect(resultText(result!.messages!, 1)).toBe(LONG_CONTENT);
		}
	});

	it("preserves non-summarizable tools (e.g. done)", () => {
		const msgs = buildPaddedConversation({
			id: "1",
			name: "done",
			input: {},
			output: LONG_CONTENT,
		});
		const result = callPrepareStep(
			{ role: "explore", allTools: TOOLS },
			{ stepNumber: 3, messages: msgs },
		);
		expect(resultText(result!.messages!, 1)).toBe(LONG_CONTENT);
	});

	it("multi-part tool result: prunes read_file, keeps edit_file in same message", () => {
		const msgs: ModelMessage[] = [
			{
				role: "assistant",
				content: [
					{
						type: "tool-call" as const,
						toolCallId: "r",
						toolName: "read_file",
						input: { path: "/a.ts" },
					},
					{
						type: "tool-call" as const,
						toolCallId: "e",
						toolName: "edit_file",
						input: { path: "/b.ts" },
					},
				],
			},
			{
				role: "tool",
				content: [
					{
						type: "tool-result" as const,
						toolCallId: "r",
						toolName: "read_file",
						output: {
							type: "text" as const,
							value: LONG_CONTENT,
						} as never,
					},
					{
						type: "tool-result" as const,
						toolCallId: "e",
						toolName: "edit_file",
						output: {
							type: "text" as const,
							value: LONG_CONTENT,
						} as never,
					},
				],
			},
		];
		for (let i = 0; i < Math.ceil(KEEP_RECENT_MESSAGES / 2) + 1; i++) {
			const id = `pad-${String(i)}`;
			msgs.push(
				assistantToolCall([
					{
						id,
						name: "read_file",
						input: { path: `/pad${String(i)}.ts` },
					},
				]),
			);
			msgs.push(
				toolResult([{ id, name: "read_file", output: LONG_CONTENT }]),
			);
		}

		const result = callPrepareStep(
			{ role: "code", allTools: TOOLS },
			{ stepNumber: 3, messages: msgs },
		);
		expect(resultText(result!.messages!, 1, 0)).toBe("[pruned] 100 lines");
		expect(resultText(result!.messages!, 1, 1)).toBe(LONG_CONTENT);
	});
});

// ---------------------------------------------------------------------------
// symbol enrichment
// ---------------------------------------------------------------------------

describe("symbol enrichment", () => {
	it("truncates symbol list beyond 8 entries", () => {
		const symbolLookup = (p: string) =>
			p === "/big.ts"
				? Array.from({ length: 12 }, (_, i) => ({
						name: `Sym${String(i)}`,
						kind: "function",
						isExported: true,
					}))
				: [];

		const msgs = buildPaddedConversation({
			id: "1",
			name: "read_file",
			input: { path: "/big.ts" },
			output: LONG_CONTENT,
		});
		const result = callPrepareStep(
			{ role: "explore", allTools: TOOLS, symbolLookup },
			{ stepNumber: 3, messages: msgs },
		);
		const text = resultText(result!.messages!, 1);
		expect(text).toContain("Sym0");
		expect(text).toContain("Sym7");
		expect(text).toContain("+4");
		expect(text).not.toContain("Sym8");
	});

	it("handles throwing symbolLookup gracefully", () => {
		const symbolLookup = () => {
			throw new Error("DB not ready");
		};
		const msgs = buildPaddedConversation({
			id: "1",
			name: "read_file",
			input: { path: "/a.ts" },
			output: LONG_CONTENT,
		});
		const result = callPrepareStep(
			{ role: "explore", allTools: TOOLS, symbolLookup },
			{ stepNumber: 3, messages: msgs },
		);
		expect(resultText(result!.messages!, 1)).toBe("[pruned] 100 lines");
	});

	it("resolves read_code 'file' input key", () => {
		const symbolLookup = (p: string) =>
			p === "/models.ts"
				? [{ name: "User", kind: "interface", isExported: true }]
				: [];
		const msgs = buildPaddedConversation({
			id: "1",
			name: "read_code",
			input: { file: "/models.ts", target: "interface" },
			output: LONG_CONTENT,
		});
		const result = callPrepareStep(
			{ role: "explore", allTools: TOOLS, symbolLookup },
			{ stepNumber: 3, messages: msgs },
		);
		expect(resultText(result!.messages!, 1)).toBe(
			"[pruned] 100 lines — exports: User",
		);
	});

	it("resolves 'filePath' input key variant", () => {
		const symbolLookup = (p: string) =>
			p === "/utils.ts"
				? [{ name: "helper", kind: "function", isExported: true }]
				: [];
		const msgs = buildPaddedConversation({
			id: "1",
			name: "read_file",
			input: { filePath: "/utils.ts" },
			output: LONG_CONTENT,
		});
		const result = callPrepareStep(
			{ role: "explore", allTools: TOOLS, symbolLookup },
			{ stepNumber: 3, messages: msgs },
		);
		expect(resultText(result!.messages!, 1)).toBe(
			"[pruned] 100 lines — exports: helper",
		);
	});

	it("sanitization before compaction does not break symbol lookup", () => {
		const symbolLookup = (absPath: string) =>
			absPath === "/project/src/a.ts"
				? [{ name: "Foo", kind: "class", isExported: true }]
				: [];

		const msgs = buildPaddedConversation({
			id: "1",
			name: "read_file",
			input: { path: "/project/src/a.ts" },
			output: LONG_CONTENT,
		});

		const result = callPrepareStep(
			{ role: "explore", allTools: TOOLS, symbolLookup },
			{ stepNumber: 3, messages: msgs },
		);
		expect(resultText(result!.messages!, 1)).toContain("exports: Foo");
	});

	it("symbol lookup with malformed input falls back to no symbols", () => {
		const symbolLookup = (absPath: string) =>
			absPath === "/a.ts"
				? [{ name: "Bar", kind: "function", isExported: true }]
				: [];

		const msgs: ModelMessage[] = [
			{
				role: "assistant",
				content: [
					{
						type: "tool-call" as const,
						toolCallId: "bad",
						toolName: "read_file",
						input: "/a.ts" as never,
					},
				],
			},
			toolResult([
				{ id: "bad", name: "read_file", output: LONG_CONTENT },
			]),
		];
		for (
			let i = 1;
			i <= Math.ceil(KEEP_RECENT_MESSAGES / 2) + 1;
			i++
		) {
			const id = `pad-${String(i)}`;
			msgs.push(
				assistantToolCall([
					{
						id,
						name: "read_file",
						input: { path: `/pad${String(i)}.ts` },
					},
				]),
			);
			msgs.push(
				toolResult([{ id, name: "read_file", output: LONG_CONTENT }]),
			);
		}

		const result = callPrepareStep(
			{ role: "explore", allTools: TOOLS, symbolLookup },
			{ stepNumber: 3, messages: msgs },
		);
		const summary = resultText(result!.messages!, 1);
		expect(summary).toBe("[pruned] 100 lines");
		const part = (result!.messages![0]!.content as Array<{ input: unknown }>)[0];
		expect(part?.input).toEqual({});
	});
});

// ---------------------------------------------------------------------------
// buildPrepareStep — step gating & cache control
// ---------------------------------------------------------------------------

describe("buildPrepareStep — step gating", () => {
	it("forces toolChoice: required on step 0", () => {
		const result = callPrepareStep(
			{ role: "explore", allTools: TOOLS },
			{ stepNumber: 0, messages: [] },
		);
		expect(result?.toolChoice).toBe("required");
	});

	it("returns messages on step 1 with empty messages (semantic prune runs)", () => {
		const result = callPrepareStep(
			{ role: "explore", allTools: TOOLS },
			{ stepNumber: 1, messages: [] },
		);
		expect(result?.messages).toEqual([]);
	});
});

describe("buildPrepareStep — cache control", () => {
	it("sets ephemeral cache on penultimate message at step > 0", () => {
		const msgs: ModelMessage[] = [
			{ role: "user", content: [{ type: "text", text: "hello" }] },
			assistantToolCall([
				{ id: "1", name: "read_file", input: { path: "/a.ts" } },
			]),
			toolResult([{ id: "1", name: "read_file", output: "short" }]),
		];
		callPrepareStep(
			{ role: "explore", allTools: TOOLS },
			{ stepNumber: 1, messages: msgs },
		);
		const penultimate = msgs[msgs.length - 2];
		expect(penultimate?.providerOptions?.anthropic).toEqual({
			cacheControl: { type: "ephemeral" },
		});
	});

	it("does not set cache on step 0", () => {
		const msgs: ModelMessage[] = [
			{ role: "user", content: [{ type: "text", text: "hello" }] },
		];
		callPrepareStep(
			{ role: "explore", allTools: TOOLS },
			{ stepNumber: 0, messages: msgs },
		);
		expect(msgs[0]?.providerOptions).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// buildPrepareStep — token budgets
// ---------------------------------------------------------------------------

describe("buildPrepareStep — token budgets", () => {
	it("explore: warns at 60k tokens", () => {
		const result = callPrepareStep(
			{ role: "explore", allTools: TOOLS },
			{ stepNumber: 1, messages: [], steps: makeSteps(61_000) },
		);
		expect(result?.system).toContain("running low on token budget");
		expect(result?.system).toContain("Wrap up");
		expect(result?.activeTools).toBeDefined();
		expect(result?.activeTools).not.toContain("edit_file");
	});

	it("explore: forces done at 70k tokens", () => {
		const result = callPrepareStep(
			{ role: "explore", allTools: TOOLS },
			{ stepNumber: 1, messages: [], steps: makeSteps(71_000) },
		);
		expect(result?.activeTools).toEqual(["done"]);
		expect(result?.toolChoice).toBe("required");
		expect(result?.system).toContain("Token budget exhausted");
	});

	it("code: warns at 120k tokens", () => {
		const result = callPrepareStep(
			{ role: "code", allTools: TOOLS },
			{ stepNumber: 1, messages: [], steps: makeSteps(121_000) },
		);
		expect(result?.system).toContain("running low on token budget");
		expect(result?.system).toContain("Finish your current edit");
	});

	it("code: forces done at 135k tokens", () => {
		const result = callPrepareStep(
			{ role: "code", allTools: TOOLS },
			{ stepNumber: 1, messages: [], steps: makeSteps(136_000) },
		);
		expect(result?.activeTools).toEqual(["done"]);
		expect(result?.toolChoice).toBe("required");
	});

	it("no warning below threshold", () => {
		const result = callPrepareStep(
			{ role: "explore", allTools: TOOLS },
			{ stepNumber: 1, messages: [], steps: makeSteps(10_000) },
		);
		expect(result?.system).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// buildPrepareStep — input sanitization
// ---------------------------------------------------------------------------

describe("buildPrepareStep — input sanitization", () => {
	it("replaces non-dict tool-call inputs with {}", () => {
		const msgs: ModelMessage[] = [
			{
				role: "assistant",
				content: [
					{
						type: "tool-call" as const,
						toolCallId: "bad",
						toolName: "read_file",
						input: "not-a-dict" as never,
					},
				],
			},
			toolResult([{ id: "bad", name: "read_file", output: "result" }]),
		];
		const result = callPrepareStep(
			{ role: "explore", allTools: TOOLS },
			{ stepNumber: 1, messages: msgs },
		);
		const part = (result!.messages![0]!.content as Array<{ input: unknown }>)[0];
		expect(part?.input).toEqual({});
		const origPart = (msgs[0]!.content as Array<{ input: unknown }>)[0];
		expect(origPart?.input).toBe("not-a-dict");
	});

	it("preserves valid dict inputs", () => {
		const input = { path: "/a.ts" };
		const msgs: ModelMessage[] = [
			assistantToolCall([{ id: "ok", name: "read_file", input }]),
			toolResult([{ id: "ok", name: "read_file", output: "result" }]),
		];
		callPrepareStep(
			{ role: "explore", allTools: TOOLS },
			{ stepNumber: 1, messages: msgs },
		);
		const part = (msgs[0]!.content as Array<{ input: unknown }>)[0];
		expect(part?.input).toEqual(input);
	});
});

// ---------------------------------------------------------------------------
// buildSymbolLookup
// ---------------------------------------------------------------------------

describe("buildSymbolLookup", () => {
	it("returns undefined when no repoMap", () => {
		expect(buildSymbolLookup(undefined)).toBeUndefined();
	});

	it("returns empty array when not ready", () => {
		const lookup = buildSymbolLookup({
			isReady: false,
			getCwd: () => "/project",
			getFileSymbols: () => [
				{ name: "X", kind: "class", isExported: true },
			],
		});
		expect(lookup!("/project/src/a.ts")).toEqual([]);
	});

	it("strips cwd prefix for relative path lookup", () => {
		let calledWith = "";
		const lookup = buildSymbolLookup({
			isReady: true,
			getCwd: () => "/project",
			getFileSymbols: (rel: string) => {
				calledWith = rel;
				return [];
			},
		});
		lookup!("/project/src/models.ts");
		expect(calledWith).toBe("src/models.ts");
	});

	it("passes through non-cwd paths unchanged", () => {
		let calledWith = "";
		const lookup = buildSymbolLookup({
			isReady: true,
			getCwd: () => "/project",
			getFileSymbols: (rel: string) => {
				calledWith = rel;
				return [];
			},
		});
		lookup!("/other/src/a.ts");
		expect(calledWith).toBe("/other/src/a.ts");
	});
});

describe("compactOldToolResults + stripBookkeepingTools — audit conversation simulation", () => {
	// Simulates the actual audit conversation from audit_issue.json
	// 299 tool calls, 6 dispatches, 76 update_plan_step, 98 read_file

	function makeContent(chars: number): string {
		const line = "const x = someFunctionCall({ key: 'value', nested: { deep: true } });\n";
		const repeats = Math.ceil(chars / line.length);
		return Array.from({ length: repeats }, () => line)
			.join("")
			.slice(0, chars);
	}

	function buildMultiToolStep(
		calls: Array<{
			id: string;
			name: string;
			input: Record<string, unknown>;
			outputChars: number;
		}>,
	): [ModelMessage, ModelMessage] {
		return [
			assistantToolCall(calls.map((c) => ({ id: c.id, name: c.name, input: c.input }))),
			toolResult(
				calls.map((c) => ({ id: c.id, name: c.name, output: makeContent(c.outputChars) })),
			),
		];
	}

	function buildAuditSession(): ModelMessage[] {
		const msgs: ModelMessage[] = [];

		// Turn 1: user asks for audit
		msgs.push({ role: "user", content: [{ type: "text", text: "audit the whole project" }] });

		// Step 1: 3 dispatches (155k + 80k + 78k chars)
		const [a1, t1] = buildMultiToolStep([
			{ id: "d1", name: "dispatch", input: { objective: "audit" }, outputChars: 10000 },
			{ id: "d2", name: "dispatch", input: { objective: "deep-dive" }, outputChars: 6000 },
			{ id: "d3", name: "dispatch", input: { objective: "final" }, outputChars: 5000 },
		]);
		msgs.push(a1, t1);

		// Turn 2: user says "fix it"
		msgs.push({ role: "user", content: [{ type: "text", text: "fix the bugs" }] });

		// Step 2: reads + soul tools
		const [a2, t2] = buildMultiToolStep([
			{ id: "sg1", name: "soul_grep", input: { pattern: "style={{" }, outputChars: 2000 },
			{ id: "sg2", name: "soul_grep", input: { pattern: "useState<any>" }, outputChars: 1500 },
			{ id: "rc1", name: "read_code", input: { target: "function", name: "FeedScreen", file: "app/index.tsx" }, outputChars: 3000 },
			{ id: "rf1", name: "read_file", input: { path: "hooks/useSocial.ts" }, outputChars: 4000 },
		]);
		msgs.push(a2, t2);

		// Step 3: update_plan_step spam + edits
		const step3Calls: Array<{ id: string; name: string; input: Record<string, unknown>; outputChars: number }> = [];
		for (let i = 1; i <= 9; i++) {
			step3Calls.push(
				{ id: `ups-a-${i}`, name: "update_plan_step", input: { stepId: `step-${i}`, status: "active" }, outputChars: 48 },
				{ id: `ups-d-${i}`, name: "update_plan_step", input: { stepId: `step-${i}`, status: "done" }, outputChars: 46 },
			);
			if (i <= 5) {
				step3Calls.push(
					{ id: `rf-${i}`, name: "read_file", input: { path: `src/file${i}.ts` }, outputChars: 2000 },
					{ id: `ef-${i}`, name: "edit_file", input: { path: `src/file${i}.ts`, oldString: "x", newString: "y" }, outputChars: 30 },
				);
			}
		}
		const [a3, t3] = buildMultiToolStep(step3Calls);
		msgs.push(a3, t3);

		// Step 4: more reads and edits
		const [a4, t4] = buildMultiToolStep([
			{ id: "rf-10", name: "read_file", input: { path: "src/app.tsx" }, outputChars: 3000 },
			{ id: "ef-10", name: "edit_file", input: { path: "src/app.tsx", oldString: "a", newString: "b" }, outputChars: 25 },
			{ id: "rf-11", name: "read_file", input: { path: "src/utils.ts" }, outputChars: 1500 },
		]);
		msgs.push(a4, t4);

		// Step 5: recent — should stay in full
		const [a5, t5] = buildMultiToolStep([
			{ id: "rf-12", name: "read_file", input: { path: "src/recent.ts" }, outputChars: 2000 },
			{ id: "ef-12", name: "edit_file", input: { path: "src/recent.ts", oldString: "c", newString: "d" }, outputChars: 30 },
		]);
		msgs.push(a5, t5);

		return msgs;
	}

	it("measures total chars before and after pruning", () => {
		const msgs = buildAuditSession();

		const pruned = compactOldToolResults(msgs);

		const charsBefore = msgs.reduce((sum, m) => {
			if (m.role !== "tool" || !Array.isArray(m.content)) return sum;
			for (const part of m.content) {
				const p = part as { output?: unknown };
				if (typeof p.output === "string") sum += p.output.length;
				else if (p.output && typeof p.output === "object") {
					const v = (p.output as Record<string, unknown>).value;
					if (typeof v === "string") sum += v.length;
				}
			}
			return sum;
		}, 0);

		const charsAfter = pruned.reduce((sum, m) => {
			if (m.role !== "tool" || !Array.isArray(m.content)) return sum;
			for (const part of m.content) {
				const p = part as { output?: unknown };
				if (typeof p.output === "string") sum += p.output.length;
				else if (p.output && typeof p.output === "object") {
					const v = (p.output as Record<string, unknown>).value;
					if (typeof v === "string") sum += v.length;
				}
			}
			return sum;
		}, 0);

		const savings = ((charsBefore - charsAfter) / charsBefore) * 100;

		console.log("\n=== AUDIT SESSION PRUNING ===");
		console.log(`Messages: ${String(msgs.length)}`);
		console.log(`Before: ${String(charsBefore)} chars`);
		console.log(`After:  ${String(charsAfter)} chars`);
		console.log(`Savings: ${savings.toFixed(1)}%\n`);

		// Should save at least 70% — dispatches + old reads are huge
		expect(savings).toBeGreaterThan(70);
	});

	it("update_plan_step results are tiny but accumulate — stripping removes them", () => {
		const msgs = buildAuditSession();

		// Count UPS tool-call parts across all assistant messages
		let upsCallCount = 0;
		for (const m of msgs) {
			if (m.role !== "assistant" || !Array.isArray(m.content)) continue;
			for (const part of m.content) {
				if (
					typeof part === "object" &&
					part !== null &&
					"type" in part &&
					(part as { type: string }).type === "tool-call" &&
					"toolName" in part &&
					(part as { toolName: string }).toolName === "update_plan_step"
				) {
					upsCallCount++;
				}
			}
		}

		// Count UPS result parts
		let upsResultCount = 0;
		for (const m of msgs) {
			if (m.role !== "tool" || !Array.isArray(m.content)) continue;
			for (const part of m.content) {
				if (
					typeof part === "object" &&
					part !== null &&
					"type" in part &&
					(part as { type: string }).type === "tool-result" &&
					"toolName" in part &&
					(part as { toolName: string }).toolName === "update_plan_step"
				) {
					upsResultCount++;
				}
			}
		}

		expect(upsCallCount).toBe(18); // 9 active + 9 done
		expect(upsResultCount).toBe(18);

		console.log(`UPS calls: ${String(upsCallCount)}, results: ${String(upsResultCount)}`);
		console.log("These are stripped by forge prepareStep (not by compactOldToolResults)");
	});

	it("dispatch results pruned to one-liners, edit results preserved", () => {
		const msgs = buildAuditSession();
		const pruned = compactOldToolResults(msgs);

		// msg[2] is the tool result for 3 dispatches — should be pruned
		const dispatchMsg = pruned[2];
		expect(dispatchMsg).toBeDefined();
		if (dispatchMsg && Array.isArray(dispatchMsg.content)) {
			for (const part of dispatchMsg.content) {
				const p = part as { toolName?: string; output?: unknown };
				if (p.toolName === "dispatch") {
					let text = "";
					if (typeof p.output === "string") text = p.output;
					else if (p.output && typeof p.output === "object") {
						const v = (p.output as Record<string, unknown>).value;
						if (typeof v === "string") text = v;
					}
					expect(text).toStartWith("[pruned]");
					expect(text.length).toBeLessThan(300);
				}
			}
		}

		// Recent edit results should be preserved
		const lastToolMsg = pruned[pruned.length - 1];
		expect(lastToolMsg).toBeDefined();
		if (lastToolMsg && Array.isArray(lastToolMsg.content)) {
			for (const part of lastToolMsg.content) {
				const p = part as { toolName?: string; output?: unknown };
				if (p.toolName === "edit_file") {
					let text = "";
					if (typeof p.output === "string") text = p.output;
					else if (p.output && typeof p.output === "object") {
						const v = (p.output as Record<string, unknown>).value;
						if (typeof v === "string") text = v;
					}
					expect(text).not.toStartWith("[pruned]");
				}
			}
		}
	});

	it("recent messages kept in full regardless of size", () => {
		const msgs = buildAuditSession();
		const pruned = compactOldToolResults(msgs);

		// Last KEEP_RECENT_MESSAGES messages should be identical
		const cutoff = msgs.length - KEEP_RECENT_MESSAGES;
		for (let i = Math.max(0, cutoff); i < msgs.length; i++) {
			expect(pruned[i]).toBe(msgs[i]);
		}
	});
});

describe("compactOldToolResults — realistic audit data", () => {
	const DISPATCH_OUTPUT = [
		"## Comprehensive project audit",
		"**8/8** agents completed successfully.",
		"",
		"### ✓ Agent: app-layout (explore)",
		"Task: Read the main app layouts and navigation structure.",
		"",
		"```tsx",
		"export default function RootLayout() {",
		"  const [loaded] = useFonts({ Nunito_400Regular, Nunito_700Bold });",
		"  return (",
		"    <ThemeProvider>",
		"      <Stack screenOptions={{ headerShown: false }}>",
		"        <Stack.Screen name='(tabs)' />",
		"      </Stack>",
		"    </ThemeProvider>",
		"  );",
		"}",
		"```",
		"",
		...Array.from({ length: 200 }, (_, i) => `Line ${String(i + 20)} of audit findings...`),
		"",
		"### Files Edited",
		"- `src/hooks/useSocial.ts` — app-layout",
		"- `src/components/PostCard.tsx` — auth-screens",
		"",
		"### Cache",
		"Files: 5 hits, 0 waits, 41 misses | Tools: 3 hits, 0 waits, 27 misses",
	].join("\n");

	const READ_FILE_OUTPUT = Array.from(
		{ length: 350 },
		(_, i) => `     ${String(i + 1)}\t${i === 0 ? "import { useState } from 'react';" : `const line${String(i)} = ${String(i)};`}`,
	).join("\n");

	const SOUL_GREP_OUTPUT = Array.from(
		{ length: 45 },
		(_, i) => `src/components/file${String(i)}.tsx:${String(i * 10 + 5)}: style={{ fontSize: ${String(12 + (i % 5))} }}`,
	).join("\n");

	function buildAuditConversation(): ModelMessage[] {
		const msgs: ModelMessage[] = [
			{ role: "user", content: [{ type: "text", text: "audit the whole project" }] },
			assistantToolCall([
				{ id: "dispatch-1", name: "dispatch", input: { objective: "audit" } },
			]),
			toolResult([
				{ id: "dispatch-1", name: "dispatch", output: DISPATCH_OUTPUT },
			]),
			assistantToolCall([
				{ id: "grep-1", name: "soul_grep", input: { pattern: "style={{" } },
				{ id: "read-1", name: "read_file", input: { path: "src/hooks/useSocial.ts" } },
			]),
			toolResult([
				{ id: "grep-1", name: "soul_grep", output: SOUL_GREP_OUTPUT },
				{ id: "read-1", name: "read_file", output: READ_FILE_OUTPUT },
			]),
			// Padding to push old results beyond KEEP_RECENT_MESSAGES
			assistantToolCall([
				{ id: "edit-1", name: "edit_file", input: { path: "src/hooks/useSocial.ts", oldString: "x", newString: "y" } },
			]),
			toolResult([
				{ id: "edit-1", name: "edit_file", output: "Edit applied successfully" },
			]),
			assistantToolCall([
				{ id: "edit-2", name: "edit_file", input: { path: "src/components/PostCard.tsx", oldString: "a", newString: "b" } },
			]),
			toolResult([
				{ id: "edit-2", name: "edit_file", output: "Edit applied successfully" },
			]),
			assistantToolCall([
				{ id: "read-2", name: "read_file", input: { path: "src/app.tsx" } },
			]),
			toolResult([
				{ id: "read-2", name: "read_file", output: "const App = () => <div />;" },
			]),
		];
		return msgs;
	}

	it("prunes old dispatch results to one-liner", () => {
		const msgs = buildAuditConversation();
		const pruned = compactOldToolResults(msgs);

		const dispatchResult = resultText(pruned, 2);
		expect(dispatchResult).toStartWith("[pruned] dispatch completed");
		expect(dispatchResult.length).toBeLessThan(300);
	});

	it("prunes old soul_grep results", () => {
		const msgs = buildAuditConversation();
		const pruned = compactOldToolResults(msgs);

		const grepResult = resultText(pruned, 4, 0);
		expect(grepResult).toStartWith("[pruned]");
		expect(grepResult).toContain("44");
		expect(grepResult.length).toBeLessThan(100);
	});

	it("prunes old read_file results", () => {
		const msgs = buildAuditConversation();
		const pruned = compactOldToolResults(msgs);

		const readResult = resultText(pruned, 4, 1);
		expect(readResult).toStartWith("[pruned]");
		expect(readResult).toContain("350 lines");
		expect(readResult.length).toBeLessThan(200);
	});

	it("preserves edit_file results (never pruned)", () => {
		const msgs = buildAuditConversation();
		const pruned = compactOldToolResults(msgs);

		const editResult = resultText(pruned, 6);
		expect(editResult).toBe("Edit applied successfully");
	});

	it("preserves recent messages in full", () => {
		const msgs = buildAuditConversation();
		const pruned = compactOldToolResults(msgs);

		const recentRead = resultText(pruned, 10);
		expect(recentRead).toBe("const App = () => <div />;");
	});

	it("before vs after: shows token savings", () => {
		const msgs = buildAuditConversation();
		const pruned = compactOldToolResults(msgs);

		const beforeChars = msgs.reduce((sum, m) => {
			if (m.role !== "tool" || !Array.isArray(m.content)) return sum;
			for (const part of m.content) {
				const p = part as { output?: unknown };
				if (typeof p.output === "string") sum += p.output.length;
				else if (p.output && typeof p.output === "object") {
					const v = (p.output as Record<string, unknown>).value;
					if (typeof v === "string") sum += v.length;
				}
			}
			return sum;
		}, 0);

		const afterChars = pruned.reduce((sum, m) => {
			if (m.role !== "tool" || !Array.isArray(m.content)) return sum;
			for (const part of m.content) {
				const p = part as { output?: unknown };
				if (typeof p.output === "string") sum += p.output.length;
				else if (p.output && typeof p.output === "object") {
					const v = (p.output as Record<string, unknown>).value;
					if (typeof v === "string") sum += v.length;
				}
			}
			return sum;
		}, 0);

		const savings = ((beforeChars - afterChars) / beforeChars) * 100;

		console.log("\n=== PRUNING BEFORE vs AFTER ===");
		console.log(`Before: ${String(beforeChars)} chars in tool results`);
		console.log(`After:  ${String(afterChars)} chars in tool results`);
		console.log(`Savings: ${savings.toFixed(1)}%`);
		console.log();

		for (let i = 0; i < pruned.length; i++) {
			const m = pruned[i];
			if (!m || m.role !== "tool" || !Array.isArray(m.content)) continue;
			for (const part of m.content) {
				const p = part as { toolName?: string; output?: unknown };
				let text = "";
				if (typeof p.output === "string") text = p.output;
				else if (p.output && typeof p.output === "object") {
					const v = (p.output as Record<string, unknown>).value;
					if (typeof v === "string") text = v;
				}
				const orig = msgs[i];
				let origText = "";
				if (orig && Array.isArray(orig.content)) {
					for (const op of orig.content) {
						const o = op as { toolCallId?: string; output?: unknown };
						const tp = part as { toolCallId?: string };
						if (o.toolCallId === tp.toolCallId) {
							if (typeof o.output === "string") origText = o.output;
							else if (o.output && typeof o.output === "object") {
								const v = (o.output as Record<string, unknown>).value;
								if (typeof v === "string") origText = v;
							}
						}
					}
				}
				const changed = text !== origText;
				console.log(`  [msg ${String(i)}] ${p.toolName ?? "?"}: ${changed ? "PRUNED" : "kept"} — ${String(origText.length)} → ${String(text.length)} chars${changed ? ` (${text.slice(0, 80)}...)` : ""}`);
			}
		}

		expect(savings).toBeGreaterThan(80);
	});
});
