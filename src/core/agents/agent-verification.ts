import { logBackgroundError } from "../../stores/errors.js";
import { projectTool } from "../tools/project.js";
import type { AgentBus, AgentTask } from "./agent-bus.js";
import { buildFallbackResult } from "./agent-results.js";
import { emitMultiAgentEvent } from "./subagent-events.js";
import { buildStepCallbacks, createAgent, type SubagentModels } from "./subagent-tools.js";

export const DESLOPPIFY_PROMPT = [
  "You are a cleanup agent. Review the files that were just edited and remove:",
  "- Tests that verify language/framework behavior rather than business logic",
  "- Redundant type checks the type system already enforces",
  "- Over-defensive error handling for impossible states",
  "- console.log/debug statements",
  "- Commented-out code",
  "- Unnecessary empty lines or formatting noise",
  "",
  "Keep all business logic tests and meaningful error handling.",
  "Run typecheck/lint after cleanup to verify nothing breaks.",
  "If the code is already clean, call done immediately.",
].join("\n");

export async function runDesloppify(
  bus: AgentBus,
  tasks: AgentTask[],
  models: SubagentModels,
  parentToolCallId: string,
  abortSignal?: AbortSignal,
): Promise<string | null> {
  if (models.agentFeatures?.desloppify === false) return null;
  const codeAgents = tasks.filter((t) => t.role === "code");
  if (codeAgents.length === 0) return null;
  if (!models.desloppifyModel) return null;

  const editedFiles = bus.getEditedFiles();
  if (editedFiles.size === 0) return null;

  const editedPaths = [...editedFiles.keys()];

  emitMultiAgentEvent({
    parentToolCallId,
    type: "agent-start",
    agentId: "desloppify",
    role: "code",
    task: `cleanup ${String(editedPaths.length)} files`,
    totalAgents: tasks.length + 1,
    modelId:
      typeof models.desloppifyModel === "object" && "modelId" in models.desloppifyModel
        ? String(models.desloppifyModel.modelId)
        : "unknown",
    tier: "desloppify",
  });

  try {
    const agentContext = tasks
      .map((t) => {
        const r = bus.getResult(t.agentId);
        return r?.result ? `[${t.agentId}] ${t.role}: ${r.result.slice(0, 2000)}` : null;
      })
      .filter(Boolean)
      .join("\n\n");
    const contextSection = agentContext
      ? `\n\nAgent context (why these edits were made):\n${agentContext}`
      : "";
    const desloppifyTask: AgentTask = {
      agentId: "desloppify",
      role: "code",
      task: `${DESLOPPIFY_PROMPT}\n\nFiles to review:\n${editedPaths.map((p) => `- ${p}`).join("\n")}${contextSection}`,
    };

    bus.registerTasks([desloppifyTask]);

    const { agent } = createAgent(
      { ...desloppifyTask, tier: "standard" },
      { ...models, codingModel: models.desloppifyModel },
      bus,
      parentToolCallId,
    );

    const callbacks = buildStepCallbacks(parentToolCallId, "desloppify");
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
        const { logBackgroundError } = await import("../../stores/errors.js");
        logBackgroundError(
          "desloppify",
          `Output schema failed: ${genErr instanceof Error ? genErr.message : String(genErr)}`,
        );
      } else {
        throw genErr;
      }
    }

    const resultText = buildFallbackResult(result);

    emitMultiAgentEvent({
      parentToolCallId,
      type: "agent-done",
      agentId: "desloppify",
      role: "code",
      task: `cleanup ${String(editedPaths.length)} files`,
      totalAgents: tasks.length + 1,
      tier: "desloppify",
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
      error: msg,
    });
    return null;
  }
}

export const VERIFY_PROMPT = [
  "You are a verification specialist. Your job is not to confirm the implementation works — it is to try to break it.",
  "",
  "RECOGNIZE YOUR RATIONALIZATIONS:",
  '- "The code looks correct" — reading is not verification. Run typecheck/lint/tests.',
  '- "The tests pass" — the implementer is an LLM. Its tests may be circular or mock-heavy. Verify independently.',
  '- "This is probably fine" — probably is not verified. Check it.',
  "",
  "PROCESS:",
  "1. Read each edited file with read_file (target + name) to understand what changed",
  "2. Run project typecheck — type errors in edited files are automatic FAIL",
  "3. Run project lint — lint errors in edited files are FAIL",
  "4. Run project test if tests exist — failures are FAIL",
  "5. Check for logic issues: missing error handling, race conditions, broken imports, unused variables",
  "6. Check the changes make sense in context: read callers/importers of modified exports",
  "",
  "OUTPUT: End your done call summary with exactly one of:",
  "  VERDICT: PASS",
  "  VERDICT: FAIL — [specific issues]",
  "  VERDICT: PARTIAL — [what could not be verified and why]",
  "",
  "PASS means you ran checks and found no issues. FAIL means you found concrete problems. PARTIAL means tooling was unavailable.",
  "If the code is trivial (config change, comment, rename) and typecheck passes, PASS quickly.",
].join("\n");

export async function runVerifier(
  bus: AgentBus,
  tasks: AgentTask[],
  models: SubagentModels,
  parentToolCallId: string,
  abortSignal?: AbortSignal,
): Promise<string | null> {
  if (models.agentFeatures?.verifyEdits === false) return null;
  const codeAgents = tasks.filter((t) => t.role === "code");
  if (codeAgents.length === 0) return null;

  const reviewModel = models.verifyModel ?? models.explorationModel ?? models.defaultModel;

  const editedFiles = bus.getEditedFiles();
  if (editedFiles.size === 0) return null;

  const editedPaths = [...editedFiles.keys()];

  emitMultiAgentEvent({
    parentToolCallId,
    type: "agent-start",
    agentId: "verifier",
    role: "explore",
    task: `verify ${String(editedPaths.length)} edited files`,
    totalAgents: tasks.length + 1,
    modelId:
      typeof reviewModel === "object" && "modelId" in reviewModel
        ? String(reviewModel.modelId)
        : "unknown",
    tier: "standard",
  });

  try {
    const verifyContext = tasks
      .map((t) => {
        const r = bus.getResult(t.agentId);
        return r?.result ? `[${t.agentId}] ${t.role}: ${r.result.slice(0, 2000)}` : null;
      })
      .filter(Boolean)
      .join("\n\n");
    const verifyContextSection = verifyContext
      ? `\n\nWhat the code agents did:\n${verifyContext}`
      : "";
    const verifyTask: AgentTask = {
      agentId: "verifier",
      role: "explore",
      task: `${VERIFY_PROMPT}\n\nFiles edited by code agents:\n${editedPaths.map((p) => `- ${p}`).join("\n")}${verifyContextSection}`,
    };

    bus.registerTasks([verifyTask]);

    const { agent } = createAgent(
      verifyTask,
      { ...models, explorationModel: reviewModel },
      bus,
      parentToolCallId,
    );

    const callbacks = buildStepCallbacks(parentToolCallId, "verifier");
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
        const { logBackgroundError } = await import("../../stores/errors.js");
        logBackgroundError(
          "verifier",
          `Output schema failed: ${genErr instanceof Error ? genErr.message : String(genErr)}`,
        );
      } else {
        throw genErr;
      }
    }

    const resultText = buildFallbackResult(result);

    emitMultiAgentEvent({
      parentToolCallId,
      type: "agent-done",
      agentId: "verifier",
      role: "explore",
      task: `verify ${String(editedPaths.length)} edited files`,
      totalAgents: tasks.length + 1,
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
      error: msg,
    });
    return null;
  }
}

export async function runEvaluator(
  bus: AgentBus,
  tasks: AgentTask[],
  parentToolCallId: string,
): Promise<string | null> {
  const codeAgents = tasks.filter((t) => t.role === "code");
  if (codeAgents.length === 0) return null;

  const editedFiles = bus.getEditedFiles();
  if (editedFiles.size === 0) return null;

  emitMultiAgentEvent({
    parentToolCallId,
    type: "dispatch-eval",
    totalAgents: tasks.length,
  });

  try {
    const result = await projectTool.execute({
      action: "typecheck",
      timeout: 30_000,
    });

    if (result.success) return null;
    if (
      !result.output ||
      result.output === "No typecheck command detected for this project. Use shell to run manually."
    )
      return null;

    const editedPaths = [...editedFiles.keys()];
    const relevantErrors = result.output
      .split("\n")
      .filter((l: string) => editedPaths.some((p) => l.includes(p)));

    if (relevantErrors.length === 0) return null;

    return `\n\n### Post-dispatch validation\n⚠ Errors in edited files:\n${relevantErrors.join("\n")}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logBackgroundError("post-dispatch-eval", msg);
    return null;
  }
}
