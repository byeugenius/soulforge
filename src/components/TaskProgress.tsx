import { TextAttributes } from "@opentui/core";
import { useEffect, useState } from "react";
import { icon } from "../core/icons.js";
import { onTaskChange, type Task, type TaskStatus } from "../core/tools/task-list.js";
import { Spinner } from "./shared.js";

const STATUS_ICONS: Record<TaskStatus, () => string> = {
  done: () => icon("check"),
  "in-progress": () => "",
  pending: () => icon("spinner"),
  blocked: () => "✗",
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  done: "#4a7",
  "in-progress": "#9B30FF",
  pending: "#555",
  blocked: "#f44",
};

const MAX_VISIBLE = 6;

interface TaskListProps {
  tasks: Task[];
  nested?: boolean;
}

export function TaskList({ tasks, nested }: TaskListProps) {
  if (tasks.length === 0) return null;

  const done = tasks.filter((t) => t.status === "done").length;

  if (nested) {
    return (
      <box flexDirection="column" paddingLeft={2}>
        {tasks.slice(0, MAX_VISIBLE).map((task) => (
          <box key={String(task.id)} gap={1} flexDirection="row">
            {task.status === "in-progress" ? (
              <Spinner />
            ) : (
              <text fg={STATUS_COLORS[task.status]}>{STATUS_ICONS[task.status]()}</text>
            )}
            <text
              fg={task.status === "in-progress" ? "#ccc" : STATUS_COLORS[task.status]}
              attributes={task.status === "in-progress" ? TextAttributes.BOLD : undefined}
              truncate
            >
              {task.title}
            </text>
          </box>
        ))}
        {tasks.length > MAX_VISIBLE && (
          <text fg="#555" paddingLeft={2}>
            +{String(tasks.length - MAX_VISIBLE)} more
          </text>
        )}
      </box>
    );
  }

  return (
    <box
      flexDirection="column"
      borderStyle="rounded"
      border={true}
      borderColor="#336"
      paddingX={1}
      width="100%"
    >
      <box gap={1} flexDirection="row">
        <text fg="#336" attributes={TextAttributes.BOLD}>
          {icon("plan")} Tasks
        </text>
        <text fg="#555">
          {String(done)}/{String(tasks.length)}
        </text>
      </box>
      {tasks.slice(0, MAX_VISIBLE).map((task) => (
        <box key={String(task.id)} gap={1} flexDirection="row">
          {task.status === "in-progress" ? (
            <Spinner />
          ) : (
            <text fg={STATUS_COLORS[task.status]}>{STATUS_ICONS[task.status]()}</text>
          )}
          <text
            fg={task.status === "in-progress" ? "#eee" : STATUS_COLORS[task.status]}
            attributes={task.status === "in-progress" ? TextAttributes.BOLD : undefined}
            truncate
          >
            {task.title}
          </text>
        </box>
      ))}
      {tasks.length > MAX_VISIBLE && (
        <text fg="#555">+{String(tasks.length - MAX_VISIBLE)} more</text>
      )}
    </box>
  );
}

export function TaskProgress() {
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => onTaskChange(setTasks), []);

  if (tasks.length === 0) return null;

  return <TaskList tasks={tasks} />;
}

export function useTaskList(): Task[] {
  const [tasks, setTasks] = useState<Task[]>([]);
  useEffect(() => onTaskChange(setTasks), []);
  return tasks;
}
