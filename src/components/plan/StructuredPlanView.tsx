import { TextAttributes } from "@opentui/core";
import type { PlanOutput } from "../../types/index.js";

const BORDER = "#333";
const TITLE_COLOR = "#00BFFF";
const SECTION_COLOR = "#8B5CF6";
const FILE_PATH_COLOR = "#ccc";
const STEP_NUM_COLOR = "#8B5CF6";
const TEXT_COLOR = "#bbb";
const CHECK_COLOR = "#4a7";

const ACTION_COLORS: Record<string, string> = {
  create: "#4a7",
  modify: "#c89030",
  delete: "#a55",
};
const ACTION_ICONS: Record<string, string> = {
  create: "+",
  modify: "~",
  delete: "-",
};
const SYMBOL_ACTION_COLORS: Record<string, string> = {
  add: "#4a7",
  modify: "#c89030",
  remove: "#a55",
  rename: "#5af",
};

const MAX_VISIBLE = 5;

interface Props {
  plan: PlanOutput;
  result?: string;
  planFile?: string;
}

export function StructuredPlanView({ plan, result, planFile }: Props) {
  const files = plan.files ?? [];
  const steps = plan.steps ?? [];
  const verification = plan.verification ?? [];
  const context = plan.context ?? "";

  let resolvedFile = planFile;
  if (!resolvedFile && result) {
    try {
      const parsed = JSON.parse(result);
      if (typeof parsed.file === "string") resolvedFile = parsed.file as string;
    } catch {
      // result may not be JSON
    }
  }

  const isCancelled = result?.includes("cancelled by user");
  const isRevised = result?.startsWith("User wants changes to the plan:");
  const reviseFeedback =
    isRevised && result ? result.replace("User wants changes to the plan: ", "") : null;
  const isRejected = isCancelled || isRevised;

  const borderColor = isRejected ? "#222" : BORDER;
  const titleColor = isRejected ? "#555" : TITLE_COLOR;

  if (isRejected) {
    return (
      <box
        flexDirection="column"
        flexShrink={0}
        border
        borderStyle="rounded"
        borderColor={borderColor}
      >
        <box
          height={1}
          flexShrink={0}
          paddingX={1}
          backgroundColor="#1a1a1a"
          alignSelf="flex-start"
          marginTop={-1}
        >
          <text truncate>
            <span fg={titleColor}>{"\uF0CB"}</span>{" "}
            <span fg={titleColor} attributes={TextAttributes.BOLD}>
              {plan.title}
            </span>
            {resolvedFile ? (
              <>
                <span fg="#333"> ─ </span>
                <span fg="#444">{resolvedFile}</span>
              </>
            ) : null}
          </text>
        </box>
        <box paddingX={1}>
          {isCancelled ? (
            <text fg="#f44">✗ Plan cancelled</text>
          ) : (
            <text>
              <span fg="#FF8C00">↻ Revision requested: </span>
              <span fg="#bbb">{reviseFeedback}</span>
            </text>
          )}
        </box>
      </box>
    );
  }

  return (
    <box flexDirection="column" flexShrink={0} border borderStyle="rounded" borderColor={BORDER}>
      <box
        height={1}
        flexShrink={0}
        paddingX={1}
        backgroundColor="#1a1a1a"
        alignSelf="flex-start"
        marginTop={-1}
      >
        <text truncate>
          <span fg={TITLE_COLOR}>{"\uF0CB"}</span>{" "}
          <span fg={TITLE_COLOR} attributes={TextAttributes.BOLD}>
            {plan.title}
          </span>
          {resolvedFile ? (
            <>
              <span fg="#333"> ─ </span>
              <span fg="#555">{resolvedFile}</span>
            </>
          ) : null}
        </text>
      </box>

      {context && (
        <box flexDirection="column" paddingX={1}>
          <text fg={SECTION_COLOR} attributes={TextAttributes.BOLD}>
            Context
          </text>
          {context.split("\n").map((line, i) => (
            <text key={`ctx-${String(i)}`} fg={TEXT_COLOR}>
              {line}
            </text>
          ))}
        </box>
      )}

      {files.length > 0 && (
        <box flexDirection="column" paddingX={1} marginTop={context ? 1 : 0}>
          <text>
            <span fg={SECTION_COLOR} attributes={TextAttributes.BOLD}>
              Files
            </span>
            <span fg="#555"> ({String(files.length)})</span>
          </text>
          {files.slice(0, MAX_VISIBLE).map((f) => (
            <box key={f.path} flexDirection="column">
              <text>
                <span fg={ACTION_COLORS[f.action] ?? "#888"}>{ACTION_ICONS[f.action] ?? "?"} </span>
                <span fg={FILE_PATH_COLOR}>{f.path}</span>
              </text>
              <text fg="#777">
                {"   "}
                {f.description}
              </text>
              {f.symbols?.map((s, si) => (
                <text key={`${f.path}-s${String(si)}`} fg="#666">
                  {"     "}
                  <span fg={SYMBOL_ACTION_COLORS[s.action] ?? "#888"}>{s.action}</span>{" "}
                  <span fg="#aaa">{s.name}</span>
                  <span fg="#555"> ({s.kind})</span>
                </text>
              ))}
            </box>
          ))}
          {files.length > MAX_VISIBLE && (
            <text fg="#555">+{String(files.length - MAX_VISIBLE)} more</text>
          )}
        </box>
      )}

      {steps.length > 0 && (
        <box flexDirection="column" paddingX={1} marginTop={files.length > 0 || context ? 1 : 0}>
          <text>
            <span fg={SECTION_COLOR} attributes={TextAttributes.BOLD}>
              Steps
            </span>
            <span fg="#555"> ({String(steps.length)})</span>
          </text>
          {steps.slice(0, MAX_VISIBLE).map((s, i) => (
            <text key={s.id}>
              <span fg={STEP_NUM_COLOR}>{String(i + 1)}. </span>
              <span fg={TEXT_COLOR}>{s.label}</span>
            </text>
          ))}
          {steps.length > MAX_VISIBLE && (
            <text fg="#555">+{String(steps.length - MAX_VISIBLE)} more</text>
          )}
        </box>
      )}

      {verification.length > 0 && (
        <box flexDirection="column" paddingX={1} marginTop={1}>
          <text fg={SECTION_COLOR} attributes={TextAttributes.BOLD}>
            Verification
          </text>
          {verification.map((v, i) => (
            <text key={`v-${String(i)}`}>
              <span fg={CHECK_COLOR}>{"✓ "}</span>
              <span fg={TEXT_COLOR}>{v}</span>
            </text>
          ))}
        </box>
      )}
    </box>
  );
}
