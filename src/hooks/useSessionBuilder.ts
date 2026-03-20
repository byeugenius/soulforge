import type { SessionMeta, TabMeta } from "../core/sessions/types.js";
import type { ChatMessage } from "../types/index.js";
import type { WorkspaceSnapshot } from "./useChat.js";

interface BuildParams {
  sessionId: string;
  title: string;
  cwd: string;
  snapshot: WorkspaceSnapshot;
  currentTabMessages: ChatMessage[];
}

export function buildSessionMeta({
  sessionId,
  title,
  cwd,
  snapshot,
  currentTabMessages,
}: BuildParams): { meta: SessionMeta; tabMessages: Map<string, ChatMessage[]> } {
  const tabMessages = new Map<string, ChatMessage[]>();
  const tabs: TabMeta[] = [];

  for (const tabState of snapshot.tabStates) {
    const isActiveTab = tabState.id === snapshot.activeTabId;
    const msgs = isActiveTab
      ? currentTabMessages
      : tabState.messages.filter((m) => m.role !== "system" || m.showInChat);
    tabMessages.set(tabState.id, msgs);

    tabs.push({
      id: tabState.id,
      label: tabState.label,
      activeModel: tabState.activeModel,
      sessionId: tabState.sessionId,
      planMode: tabState.planMode,
      planRequest: tabState.planRequest,
      coAuthorCommits: tabState.coAuthorCommits,
      tokenUsage: tabState.tokenUsage,
      messageRange: { startLine: 0, endLine: msgs.length },
    });
  }

  const allMsgs = [...tabMessages.values()].flat();
  const startedAt = allMsgs[0]?.timestamp ?? Date.now();

  const meta: SessionMeta = {
    id: sessionId,
    title,
    cwd,
    startedAt,
    updatedAt: Date.now(),
    activeTabId: snapshot.activeTabId,
    forgeMode: snapshot.forgeMode,
    tabs,
  };

  return { meta, tabMessages };
}
