import { resolve } from "node:path";
import type { ModelMessage, ProviderOptions } from "@ai-sdk/provider-utils";
import type { LanguageModel } from "ai";
import { stepCountIs, ToolLoopAgent, tool } from "ai";
import { z } from "zod";
import type {
  AgentFeatures,
  EditorIntegration,
  ForgeMode,
  InteractiveCallbacks,
} from "../../types/index.js";
import type { ContextManager } from "../context/manager.js";
import { EPHEMERAL_CACHE, isAnthropicNative } from "../llm/provider-options.js";
import {
  buildInteractiveTools,
  buildTools,
  PLAN_EXECUTION_TOOL_NAMES,
  RESTRICTED_TOOL_NAMES,
} from "../tools/index.js";
import { readFileTool } from "../tools/read-file.js";
import { renderTaskList } from "../tools/task-list.js";
import { normalizePath } from "./agent-bus.js";
import { repairToolCall, sanitizeMessages } from "./stream-options.js";
import { buildSubagentTools, type SharedCacheRef } from "./subagent-tools.js";

const RESTRICTED_MODES = new Set<ForgeMode>(["architect", "socratic", "challenge", "plan"]);

const PLAN_NUDGE_STEP = 10;
const PLAN_FORCE_STEP = 20;

function hasPlanToolCall(messages: ModelMessage[]): boolean {
  for (const msg of messages) {
    if (msg.role !== "assistant" || !Array.isArray(msg.content)) continue;
    for (const part of msg.content) {
      if (part.type === "tool-call" && part.toolName === "plan") return true;
    }
  }
  return false;
}

function buildForgePrepareStep(isPlanMode: boolean, drainSteering?: () => string | null) {
  // biome-ignore lint/suspicious/noExplicitAny: PrepareStepFunction generic is invariant
  return ({ stepNumber, messages }: { stepNumber: number; messages: ModelMessage[] }): any => {
    const sanitized = sanitizeMessages(messages);
    const result: {
      messages?: ModelMessage[];
      activeTools?: string[];
      toolChoice?: "required" | "auto";
      system?: string;
    } = {};

    if (sanitized !== messages) result.messages = sanitized;

    if (isPlanMode && stepNumber >= PLAN_NUDGE_STEP && !hasPlanToolCall(messages)) {
      if (stepNumber >= PLAN_FORCE_STEP) {
        result.activeTools = ["plan", "ask_user"];
        result.toolChoice = "required";
        result.system =
          "You have done enough research. Call plan NOW with everything you have. Do not read more files.";
      } else {
        result.system =
          "You have gathered substantial context. Start assembling the plan — call plan when ready.";
      }
    }

    // Inject task list so it survives compaction and is always visible
    const taskBlock = renderTaskList();
    if (taskBlock) {
      result.system = `${result.system ?? ""}\n\n${taskBlock}`.trim();
    }

    // Inject steering messages from queue (user typed while agent was running)
    if (stepNumber > 0 && drainSteering) {
      const allSteering: string[] = [];
      let next = drainSteering();
      while (next) {
        allSteering.push(next);
        next = drainSteering();
      }
      if (allSteering.length > 0) {
        const msgs = result.messages ?? [...messages];
        const combined = allSteering.join("\n\n");
        msgs.push({
          role: "user",
          content: [
            {
              type: "text",
              text: `IMPORTANT — the user just sent this while you were working. Prioritize this:\n\n${combined}`,
            },
          ],
        });
        result.messages = msgs;
      }
    }

    return Object.keys(result).length > 0 ? result : undefined;
  };
}

interface ForgeAgentOptions {
  model: LanguageModel;
  contextManager: ContextManager;
  forgeMode?: ForgeMode;
  interactive?: InteractiveCallbacks;
  editorIntegration?: EditorIntegration;
  subagentModels?: {
    exploration?: LanguageModel;
    coding?: LanguageModel;
    trivial?: LanguageModel;
    desloppify?: LanguageModel;
  };
  webSearchModel?: LanguageModel;
  onApproveWebSearch?: (query: string) => Promise<boolean>;
  onApproveFetchPage?: (url: string) => Promise<boolean>;
  onApproveOutsideCwd?: (toolName: string, path: string) => Promise<boolean>;
  onApproveDestructive?: (description: string) => Promise<boolean>;
  providerOptions?: ProviderOptions;
  headers?: Record<string, string>;
  codeExecution?: boolean;
  cwd?: string;
  sessionId?: string;
  sharedCacheRef?: SharedCacheRef;
  agentFeatures?: AgentFeatures;
  planExecution?: boolean;
  drainSteering?: () => string | null;
}

/**
 * Creates the main Forge ToolLoopAgent.
 * Factory function (not singleton) — model can change between turns (Ctrl+L).
 * Combines direct tools + subagent tools + optional interactive tools.
 *
 * For restricted modes (architect, socratic, challenge), activeTools limits
 * to read-only tools — the LLM physically cannot call edit/shell/git.
 *
 * Uses prepareCall for auto-recall: user message passed via callOptionsSchema
 * at .stream() time, memory search injected into instructions dynamically.
 */
export function createForgeAgent({
  model,
  contextManager,
  forgeMode = "default",
  interactive,
  editorIntegration,
  subagentModels,
  webSearchModel,
  onApproveWebSearch,
  onApproveFetchPage,
  onApproveOutsideCwd,
  onApproveDestructive,
  providerOptions,
  headers,
  codeExecution,
  cwd,
  sessionId,
  sharedCacheRef,
  agentFeatures,
  planExecution,
  drainSteering,
}: ForgeAgentOptions) {
  const isRestricted = RESTRICTED_MODES.has(forgeMode);
  const repoMap = contextManager.isRepoMapReady() ? contextManager.getRepoMap() : undefined;

  const modelId =
    typeof model === "object" && model !== null && "modelId" in model
      ? String((model as { modelId: string }).modelId)
      : "";
  const canUseCodeExecution = codeExecution && isAnthropicNative(modelId);

  const directTools = buildTools(undefined, editorIntegration, onApproveWebSearch, {
    codeExecution: canUseCodeExecution,
    webSearchModel,
    repoMap,
    onApproveFetchPage,
    onApproveOutsideCwd,
    onApproveDestructive,
  });

  const subagentTools = isRestricted
    ? {
        dispatch: buildSubagentTools({
          defaultModel: model,
          explorationModel: subagentModels?.exploration,
          webSearchModel,
          providerOptions,
          headers,
          onApproveWebSearch,
          onApproveFetchPage,
          readOnly: true,
          repoMap,
          sharedCacheRef,
          agentFeatures,
        }).dispatch,
      }
    : buildSubagentTools({
        defaultModel: model,
        explorationModel: subagentModels?.exploration,
        codingModel: subagentModels?.coding,
        trivialModel: subagentModels?.trivial,
        desloppifyModel: subagentModels?.desloppify,
        webSearchModel,
        providerOptions,
        headers,
        onApproveWebSearch,
        onApproveFetchPage,
        repoMap,
        sharedCacheRef,
        agentFeatures,
      });

  const cachedReadFile =
    sharedCacheRef && agentFeatures?.dispatchCache !== false
      ? wrapReadFileWithDispatchCache(directTools.read_file, sharedCacheRef)
      : directTools.read_file;

  const allTools = {
    ...directTools,
    read_file: cachedReadFile,
    ...subagentTools,
    ...(interactive ? buildInteractiveTools(interactive, { cwd, sessionId }) : {}),
  };

  const allToolNames = Object.keys(allTools) as (keyof typeof allTools)[];
  const restrictedSet = new Set(RESTRICTED_TOOL_NAMES);
  const planExecSet = new Set(PLAN_EXECUTION_TOOL_NAMES);
  const activeToolOverride = isRestricted
    ? allToolNames.filter((name) => restrictedSet.has(name))
    : planExecution
      ? allToolNames.filter((name) => planExecSet.has(name))
      : undefined;

  return new ToolLoopAgent({
    id: "forge",
    model,
    tools: allTools,
    callOptionsSchema: z.object({
      userMessage: z.string().optional(),
    }),
    instructions: {
      role: "system" as const,
      content: contextManager.buildSystemPrompt(),
      providerOptions: EPHEMERAL_CACHE,
    },
    prepareCall: ({ options: _options, ...settings }) => {
      return {
        ...settings,
        ...(activeToolOverride ? { activeTools: activeToolOverride } : {}),
      };
    },
    stopWhen: stepCountIs(500),
    prepareStep: buildForgePrepareStep(forgeMode === "plan", drainSteering),
    experimental_repairToolCall: repairToolCall,
    ...(providerOptions && Object.keys(providerOptions).length > 0 ? { providerOptions } : {}),
    ...(headers ? { headers } : {}),
  });
}

function wrapReadFileWithDispatchCache(
  _original: ReturnType<typeof buildTools>["read_file"],
  cacheRef: SharedCacheRef,
) {
  return tool({
    description: readFileTool.description,
    inputSchema: z.object({
      path: z.string().describe("File path to read"),
      startLine: z.number().optional().describe("Start line (1-indexed)"),
      endLine: z.number().optional().describe("End line (1-indexed)"),
    }),
    execute: async (args) => {
      const cache = cacheRef.current;
      if (cache) {
        const normalized = normalizePath(resolve(args.path));
        const cached = cache.files.get(normalized);
        if (cached != null && args.startLine == null && args.endLine == null) {
          const lines = cached.split("\n");
          const numbered = lines
            .map((line: string, i: number) => `${String(i + 1).padStart(4)}  ${line}`)
            .join("\n");
          return { success: true, output: `[from dispatch cache]\n${numbered}` };
        }
      }
      return readFileTool.execute(args);
    },
  });
}
