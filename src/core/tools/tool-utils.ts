import type { ToolResult } from "../../types/index.js";

/**
 * Construct a failed ToolResult where output and error share the same message.
 */
export function toolError(msg: string): ToolResult {
  return { success: false, output: msg, error: msg };
}

/**
 * Construct a denied ToolResult (e.g. forbidden path, unapproved action).
 */
export function toolDenied(msg: string): ToolResult {
  return { success: false, output: msg, error: msg };
}
