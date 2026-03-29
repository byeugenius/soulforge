import { create } from "zustand";

interface ToolsState {
  disabledTools: Set<string>;
  agentManaged: boolean;
  toggleTool: (name: string) => void;
  toggleAgentManaged: () => void;
}

export const useToolsStore = create<ToolsState>()((set) => ({
  disabledTools: new Set<string>(["request_tools", "release_tools"]),
  agentManaged: false,
  toggleTool: (name) =>
    set((s) => {
      const next = new Set(s.disabledTools);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return { disabledTools: next };
    }),
  toggleAgentManaged: () =>
    set((s) => {
      const next = !s.agentManaged;
      const tools = new Set(s.disabledTools);
      if (next) {
        tools.delete("request_tools");
        tools.delete("release_tools");
      } else {
        tools.add("request_tools");
        tools.add("release_tools");
      }
      return { agentManaged: next, disabledTools: tools };
    }),
}));
