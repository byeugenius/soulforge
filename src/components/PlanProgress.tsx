import { TextAttributes } from "@opentui/core";
import { icon } from "../core/icons.js";
import type { Task } from "../core/tools/task-list.js";
import type { Plan, PlanStepStatus } from "../types/index.js";
import { Spinner } from "./shared.js";
import { TaskList } from "./TaskProgress.js";

const STATUS_ICONS: Record<PlanStepStatus, () => string> = {
  done: () => icon("check"),
  active: () => "",
  pending: () => icon("spinner"),
  skipped: () => icon("skip"),
};

const STATUS_COLORS: Record<PlanStepStatus, string> = {
  done: "#4a7",
  active: "#9B30FF",
  pending: "#555",
  skipped: "#444",
};

const MAX_VISIBLE = 5;

interface Props {
  plan: Plan;
  tasks?: Task[];
}

export function PlanProgress({ plan, tasks }: Props) {
  const done = plan.steps.filter((s) => s.status === "done").length;
  const hasTasks = tasks && tasks.length > 0;

  return (
    <box
      flexDirection="column"
      borderStyle="rounded"
      border={true}
      borderColor="#8B5CF6"
      paddingX={1}
      width="100%"
    >
      <box gap={1} flexDirection="row">
        <text fg="#8B5CF6" attributes={TextAttributes.BOLD}>
          {icon("plan")} {plan.title}
        </text>
        <text fg="#555">
          {String(done)}/{String(plan.steps.length)}
        </text>
      </box>
      {plan.steps.slice(0, MAX_VISIBLE).map((step) => (
        <box key={step.id} flexDirection="column">
          <box gap={1} flexDirection="row">
            {step.status === "active" ? (
              <Spinner />
            ) : (
              <text fg={STATUS_COLORS[step.status]}>{STATUS_ICONS[step.status]()}</text>
            )}
            <text
              fg={step.status === "active" ? "#eee" : STATUS_COLORS[step.status]}
              attributes={step.status === "active" ? TextAttributes.BOLD : undefined}
            >
              {step.label}
            </text>
          </box>
          {step.status === "active" && hasTasks && <TaskList tasks={tasks} nested />}
        </box>
      ))}
      {plan.steps.length > MAX_VISIBLE && (
        <text fg="#555">+{String(plan.steps.length - MAX_VISIBLE)} more</text>
      )}
    </box>
  );
}
