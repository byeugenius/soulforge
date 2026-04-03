import { logBackgroundError } from "../../stores/errors.js";
import { projectTool } from "../tools/project.js";
import type { AgentBus, AgentTask } from "./agent-bus.js";
import { buildFallbackResult } from "./agent-results.js";
import { classifyTask } from "./agent-runner.js";
import { emitMultiAgentEvent } from "./subagent-events.js";
import { buildStepCallbacks, createAgent, type SubagentModels } from "./subagent-tools.js";

// ── De-sloppify ─────────────────────────────────────────────────────────
// Step 1: deterministic lint --fix (zero tokens)
// Step 2: LLM reviews for slop patterns the linter can't catch

const DESLOPPIFY_PROMPT = [
  "RULES (non-negotiable):",
  "1. You are a cleanup agent. Lint --fix already ran. Review for slop the linter missed.",
  "2. Do NOT emit text between tool calls. Call tools silently, then report ONCE at the end.",
  "3. Keep your report under 200 words. List files changed and what was removed.",
  "4. If the code is clean, report done immediately without reading.",
  "",
  "REMOVE:",
  "- Tests that verify language/framework behavior rather than business logic",
  "- Redundant type assertions the type system already enforces",
  "- Over-defensive error handling for impossible states",
  "- console.log/debug/print statements not part of the feature",
  "- Dead code: unused variables, unreachable branches, empty catch blocks",
  "",
  "KEEP (do NOT remove):",
  "- TODO/FIXME/SECTION/placeholder comments",
  "- Business logic, meaningful error handling, type annotations",
  "- Comments explaining non-obvious decisions",
  "",
  "WORKFLOW: read files with ranges around edited sections → multi_edit to fix slop → done.",
].join("\n");

export async function runDesloppify(
  bus: AgentBus,
  tasks: AgentTask[],
  models: SubagentModels,
  parentToolCallId: string,
  abortSignal?: AbortSignal,
): Promise<string | null> {
  if (models.agentFeatures?.desloppify !== true) return null;
  const codeAgents = tasks.filter((t) => t.role === "code");
  if (codeAgents.length === 0) return null;
  if (!models.desloppifyModel) return null;

  const editedFiles = bus.getEditedFiles();
  if (editedFiles.size === 0) return null;

  const editedPaths = [...editedFiles.keys()];

  const desloppifyModelId =
    typeof models.desloppifyModel === "object" && "modelId" in models.desloppifyModel
      ? String(models.desloppifyModel.modelId)
      : "unknown";

  emitMultiAgentEvent({
    parentToolCallId,
    type: "agent-start",
    agentId: "desloppify",
    role: "code",
    task: `cleanup ${String(editedPaths.length)} files`,
    totalAgents: tasks.length + 1,
    modelId: desloppifyModelId,
    tier: "ember",
  });

  try {
    // Step 1: deterministic lint --fix (zero tokens, instant)
    let lintResult = "";
    try {
      const lint = await projectTool.execute({ action: "lint", fix: true, timeout: 30_000 });
      if (!lint.success && lint.output) {
        const relevant = lint.output
          .split("\n")
          .filter((l: string) => editedPaths.some((p) => l.includes(p)));
        if (relevant.length > 0) lintResult = `\nLint issues after fix:\n${relevant.join("\n")}`;
      }
    } catch {}

    // Step 2: LLM cleanup pass
    // Invalidate bus file cache for edited files — code agents wrote new content
    // but the bus cache still has pre-edit versions. Without this, desloppify's
    // read tool returns stale content (or fails) from the bus cache wrapper.
    for (const p of editedPaths) {
      bus.invalidateFile(p, "desloppify");
    }

    const desloppifyTask: AgentTask = {
      agentId: "desloppify",
      role: "code",
      task: `${DESLOPPIFY_PROMPT}${lintResult}\n\nFiles to review:\n${editedPaths.map((p) => `- ${p}`).join("\n")}`,
      targetFiles: editedPaths,
    };

    bus.registerTasks([desloppifyTask]);

    const { agent } = await createAgent(
      { ...desloppifyTask, tier: "ember" },
      { ...models, emberModel: models.desloppifyModel },
      bus,
      parentToolCallId,
    );

    const callbacks = buildStepCallbacks(parentToolCallId, "desloppify", desloppifyModelId);
    // biome-ignore lint/suspicious/noExplicitAny: output schema may throw
    let result: any;
    try {
      result = await agent.generate({
        prompt: desloppifyTask.task,
        abortSignal,
        ...callbacks,
      });
    } catch (genErr: unknown) {
      const errWithSteps = genErr as { steps?: unknown[]; text?: string; totalUsage?: unknown };
      if (errWithSteps.steps && Array.isArray(errWithSteps.steps)) {
        result = {
          text: errWithSteps.text ?? "",
          output: undefined,
          steps: errWithSteps.steps,
          totalUsage: errWithSteps.totalUsage ?? { inputTokens: 0, outputTokens: 0 },
        };
        logBackgroundError(
          "desloppify",
          `Output schema failed: ${genErr instanceof Error ? genErr.message : String(genErr)}`,
        );
      } else {
        throw genErr;
      }
    }

    const agentText = typeof result.text === "string" ? result.text.trim() : "";
    const resultText = agentText.length > 20 ? agentText : buildFallbackResult(result);

    emitMultiAgentEvent({
      parentToolCallId,
      type: "agent-done",
      agentId: "desloppify",
      role: "code",
      task: `cleanup ${String(editedPaths.length)} files`,
      totalAgents: tasks.length + 1,
      tier: "ember",
    });

    if (resultText && resultText.length > 20) {
      return `\n\n### De-sloppify pass\n${resultText}`;
    }
    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logBackgroundError("desloppify", msg);
    emitMultiAgentEvent({
      parentToolCallId,
      type: "agent-error",
      agentId: "desloppify",
      role: "code",
      task: `cleanup ${String(editedPaths.length)} files`,
      totalAgents: tasks.length + 1,
      tier: "ember",
      error: msg,
    });
    return null;
  }
}

// ── Verifier ────────────────────────────────────────────────────────────
// Step 1: deterministic typecheck + test (zero tokens)
// Step 2: LLM checks logic correctness against the original task

const VERIFY_PROMPT = [
  "RULES (non-negotiable):",
  "1. You are a verification agent. You did NOT write this code — fresh eyes.",
  "2. Do NOT emit text between tool calls. Call tools silently, then report ONCE at the end.",
  "3. Read edited files with ranges around the changed sections, not full files.",
  "4. Each tool call round-trip resends the full conversation — batch reads, minimize steps.",
  "",
  "PROCESS:",
  "1. Check typecheck/test results below — errors are automatic FAIL",
  "2. Read each edited file (ranges around changes) and verify:",
  "   - Does the implementation match what the task asked for?",
  "   - Missing edge cases? Incorrect imports? Signature mismatches?",
  "3. If exports changed signatures, use navigate(references) to check one caller",
  "",
  "SKIP: formatting/style (handled by de-sloppify), typecheck/tests (results below).",
  "",
  "OUTPUT: End with exactly one of:",
  "  VERDICT: PASS — [one-line summary]",
  "  VERDICT: FAIL — [file:line, what's wrong]",
  "  VERDICT: PARTIAL — [what couldn't be verified]",
].join("\n");

export async function runVerifier(
  bus: AgentBus,
  tasks: AgentTask[],
  models: SubagentModels,
  parentToolCallId: string,
  abortSignal?: AbortSignal,
): Promise<string | null> {
  if (models.agentFeatures?.verifyEdits !== true) return null;
  const codeAgents = tasks.filter((t) => t.role === "code");
  if (codeAgents.length === 0) return null;

  const reviewModel = models.verifyModel ?? models.defaultModel;

  const editedFiles = bus.getEditedFiles();
  if (editedFiles.size === 0) return null;

  const editedPaths = [...editedFiles.keys()];

  const verifierModelId =
    typeof reviewModel === "object" && "modelId" in reviewModel
      ? String(reviewModel.modelId)
      : "unknown";

  const verifierModels = { ...models, sparkModel: reviewModel };
  const verifierTier = classifyTask(
    { agentId: "verifier", role: "explore", task: "" },
    verifierModels,
  );

  emitMultiAgentEvent({
    parentToolCallId,
    type: "agent-start",
    agentId: "verifier",
    role: "explore",
    task: `verify ${String(editedPaths.length)} edited files`,
    totalAgents: tasks.length + 1,
    modelId: verifierModelId,
    tier: verifierTier,
  });

  try {
    // Step 1: deterministic typecheck + test (zero tokens)
    const checkResults: string[] = [];
    try {
      const tc = await projectTool.execute({ action: "typecheck", timeout: 30_000 });
      if (!tc.success && tc.output) {
        const relevant = tc.output
          .split("\n")
          .filter((l: string) => editedPaths.some((p) => l.includes(p)));
        if (relevant.length > 0) {
          checkResults.push(`TYPECHECK FAILED:\n${relevant.join("\n")}`);
        } else {
          checkResults.push("Typecheck: passed (no errors in edited files)");
        }
      } else {
        checkResults.push("Typecheck: passed");
      }
    } catch {
      checkResults.push("Typecheck: unavailable");
    }

    try {
      const test = await projectTool.execute({ action: "test", timeout: 60_000 });
      if (!test.success && test.output) {
        checkResults.push(`TESTS FAILED:\n${test.output.slice(-500)}`);
      } else if (test.success) {
        checkResults.push("Tests: passed");
      }
    } catch {
      checkResults.push("Tests: unavailable");
    }

    // Step 2: LLM verification with context
    const taskContext = tasks
      .map((t) => {
        const r = bus.getResult(t.agentId);
        return r?.result ? `[${t.agentId}] task: ${t.task.split("\n")[0]?.slice(0, 200)}` : null;
      })
      .filter(Boolean)
      .join("\n");

    const verifyPrompt = [
      VERIFY_PROMPT,
      "",
      `--- Automated check results ---`,
      checkResults.join("\n"),
      "",
      `--- Files edited ---`,
      editedPaths.map((p) => `- ${p}`).join("\n"),
      "",
      `--- What was requested ---`,
      taskContext,
    ].join("\n");

    const verifyTask: AgentTask = {
      agentId: "verifier",
      role: "explore",
      task: verifyPrompt,
    };

    bus.registerTasks([verifyTask]);

    const { agent } = await createAgent(verifyTask, verifierModels, bus, parentToolCallId);

    const callbacks = buildStepCallbacks(parentToolCallId, "verifier", verifierModelId);
    // biome-ignore lint/suspicious/noExplicitAny: output schema may throw
    let result: any;
    try {
      result = await agent.generate({
        prompt: verifyTask.task,
        abortSignal,
        ...callbacks,
      });
    } catch (genErr: unknown) {
      const errWithSteps = genErr as { steps?: unknown[]; text?: string; totalUsage?: unknown };
      if (errWithSteps.steps && Array.isArray(errWithSteps.steps)) {
        result = {
          text: errWithSteps.text ?? "",
          output: undefined,
          steps: errWithSteps.steps,
          totalUsage: errWithSteps.totalUsage ?? { inputTokens: 0, outputTokens: 0 },
        };
        logBackgroundError(
          "verifier",
          `Output schema failed: ${genErr instanceof Error ? genErr.message : String(genErr)}`,
        );
      } else {
        throw genErr;
      }
    }

    const agentText = typeof result.text === "string" ? result.text.trim() : "";
    const resultText = agentText.length > 20 ? agentText : buildFallbackResult(result);

    emitMultiAgentEvent({
      parentToolCallId,
      type: "agent-done",
      agentId: "verifier",
      role: "explore",
      task: `verify ${String(editedPaths.length)} edited files`,
      totalAgents: tasks.length + 1,
      tier: verifierTier,
    });

    return `\n\n### Verification\n${resultText}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logBackgroundError("verifier", msg);
    emitMultiAgentEvent({
      parentToolCallId,
      type: "agent-error",
      agentId: "verifier",
      role: "explore",
      task: `verify ${String(editedPaths.length)} edited files`,
      totalAgents: tasks.length + 1,
      tier: verifierTier,
      error: msg,
    });
    return null;
  }
}
