import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { ScrollBoxRenderable } from "@opentui/core";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { ContextManager, type SharedContextResources } from "../core/context/manager.js";
import { icon } from "../core/icons.js";
import type { ProviderStatus } from "../core/llm/provider.js";
import type { SessionManager } from "../core/sessions/manager.js";
import type { PrerequisiteStatus } from "../core/setup/prerequisites.js";
import { planFileName } from "../core/tools/index.js";
import {
  type ChatInstance,
  type TabState,
  useChat,
  type WorkspaceSnapshot,
} from "../hooks/useChat.js";
import type { TabActivity } from "../hooks/useTabs.js";
import { useStatusBarStore } from "../stores/statusbar.js";
import { useUIStore } from "../stores/ui.js";
import type { AppConfig, ChatMessage, EditorIntegration } from "../types/index.js";
import { AnimatedBorder } from "./AnimatedBorder.js";
import { ChangedFilesBar, ChangesPanel } from "./ChangedFiles.js";
import { InputBox } from "./InputBox.js";
import { LandingPage } from "./LandingPage.js";
import { LoadingStatus } from "./LoadingStatus.js";
import { CodeExpandedProvider } from "./Markdown.js";
import { RAIL_BORDER, StaticMessage } from "./MessageList.js";
import { PlanProgress } from "./PlanProgress.js";
import { PlanReviewPrompt } from "./PlanReviewPrompt.js";
import { QuestionPrompt } from "./QuestionPrompt.js";
import { StreamSegmentList } from "./StreamSegmentList.js";
import { SystemBanner } from "./SystemBanner.js";
import { TaskProgress, useTaskList } from "./TaskProgress.js";

export interface TabInstanceProps {
  tabId: string;
  visible: boolean;
  effectiveConfig: AppConfig;
  sharedResources: SharedContextResources;
  sessionManager: SessionManager;
  cwd: string;
  openEditorWithFile: (file: string) => void;
  openEditor: () => void;
  onSuspend: (opts: { command: string; args?: string[]; noAltScreen?: boolean }) => void;
  onCommand: (input: string, chat: ChatInstance) => void;
  onExit: () => void;
  registerChat: (id: string, chat: ChatInstance) => void;
  unregisterChat: (id: string) => void;
  setTabActivity: (id: string, activity: Partial<TabActivity>) => void;
  autoLabel: (id: string, firstMessage: string) => void;
  initialState?: TabState;
  editorVisible: boolean;
  focusMode: "chat" | "editor";
  anyModalOpen: boolean;
  bootProviders: ProviderStatus[];
  bootPrereqs: PrerequisiteStatus[];
  getWorkspaceSnapshot: () => WorkspaceSnapshot;
  editorIntegration?: EditorIntegration;
  forgeMode: import("../types/index.js").ForgeMode;
}

const MAX_RENDERED = 60;

export function TabInstance({
  tabId,
  visible,
  effectiveConfig,
  sharedResources,
  sessionManager,
  cwd,
  openEditorWithFile,
  openEditor,
  onSuspend,
  onCommand,
  onExit,
  registerChat,
  unregisterChat,
  setTabActivity,
  autoLabel,
  initialState,
  editorVisible,
  focusMode,
  anyModalOpen,
  bootProviders,
  bootPrereqs,
  getWorkspaceSnapshot,
  editorIntegration,
  forgeMode,
}: TabInstanceProps) {
  const scrollRef = useRef<ScrollBoxRenderable>(null);

  // Per-tab ContextManager sharing expensive resources
  const contextManager = useMemo(
    () => new ContextManager(cwd, sharedResources),
    [cwd, sharedResources],
  );

  // Sync shared state into per-tab ContextManager
  useEffect(() => {
    contextManager.setForgeMode(forgeMode);
  }, [forgeMode, contextManager]);

  useEffect(() => {
    if (editorIntegration) contextManager.setEditorIntegration(editorIntegration);
  }, [editorIntegration, contextManager]);

  useEffect(() => {
    if (effectiveConfig.repoMap !== undefined)
      contextManager.setRepoMapEnabled(effectiveConfig.repoMap);
  }, [effectiveConfig.repoMap, contextManager]);

  useEffect(() => {
    contextManager.setTaskRouter(effectiveConfig.taskRouter);
  }, [effectiveConfig.taskRouter, contextManager]);

  // Per-tab useChat instance
  const chat = useChat({
    effectiveConfig,
    contextManager,
    sessionManager,
    cwd,
    openEditorWithFile,
    openEditor,
    onSuspend,
    initialState,
    getWorkspaceSnapshot: () => getWorkspaceSnapshot(),
    visible,
  });

  // Sync coAuthorCommits from config
  useEffect(() => {
    if (effectiveConfig.coAuthorCommits !== undefined)
      chat.setCoAuthorCommits(effectiveConfig.coAuthorCommits);
  }, [effectiveConfig.coAuthorCommits, chat.setCoAuthorCommits]);

  // Register/unregister chat instance with tab manager
  useEffect(() => {
    registerChat(tabId, chat);
    return () => unregisterChat(tabId);
  }, [tabId, chat, registerChat, unregisterChat]);

  // Sync status bar when this tab is active
  useEffect(() => {
    if (visible) {
      useStatusBarStore.getState().setTokenUsage(chat.tokenUsage);
    }
  }, [visible, chat.tokenUsage]);

  // Report loading state to tab manager
  const prevLoading = useRef(chat.isLoading);
  useEffect(() => {
    setTabActivity(tabId, { isLoading: chat.isLoading });
    // Mark unread if loading finished while tab is in background
    if (prevLoading.current && !chat.isLoading && !visible) {
      setTabActivity(tabId, { hasUnread: true });
    }
    prevLoading.current = chat.isLoading;
  }, [chat.isLoading, tabId, setTabActivity, visible]);

  // Auto-label tab from first user message
  // biome-ignore lint/correctness/useExhaustiveDependencies: narrow trigger
  useEffect(() => {
    const firstUser = chat.messages.find((m) => m.role === "user");
    if (firstUser) autoLabel(tabId, firstUser.content);
  }, [chat.messages.length]);

  // Cleanup / dispose on unmount
  useEffect(() => {
    return () => contextManager.dispose();
  }, [contextManager]);

  // Derived state
  const isStreaming = chat.streamSegments.length > 0 || chat.liveToolCalls.length > 0;

  const nonSystemCount = useMemo(() => {
    let count = 0;
    for (const m of chat.messages) {
      if (m.role !== "system" || m.showInChat) count++;
    }
    return count;
  }, [chat.messages]);

  const hasContent = nonSystemCount > 0 || isStreaming;

  const { codeExpanded, changesExpanded } = useUIStore(
    useShallow((s) => ({ codeExpanded: s.codeExpanded, changesExpanded: s.changesExpanded })),
  );
  const chatStyle = useUIStore((s) => s.chatStyle);
  const showReasoning = useUIStore((s) => s.showReasoning);
  const reasoningExpanded = useUIStore((s) => s.reasoningExpanded);

  const showPlanProgress = !!chat.activePlan;
  const tasks = useTaskList();

  const hasChangedFiles = useMemo(() => {
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      const msg = chat.messages[i];
      if (msg?.role !== "assistant" || !msg.toolCalls) continue;
      for (const tc of msg.toolCalls) {
        if (tc.name === "edit_file" && tc.result?.success) return true;
      }
    }
    return false;
  }, [chat.messages]);

  const visibleMessages = useMemo(() => {
    const msgs = chat.messages;
    const keep = (m: ChatMessage) => m.role !== "system" || m.showInChat;
    if (nonSystemCount <= MAX_RENDERED) return msgs.filter(keep);
    const result: typeof msgs = [];
    for (let i = msgs.length - 1; i >= 0 && result.length < MAX_RENDERED; i--) {
      if (keep(msgs[i] as ChatMessage)) result.push(msgs[i] as (typeof msgs)[0]);
    }
    result.reverse();
    return result;
  }, [chat.messages, nonSystemCount]);
  const hiddenCount = nonSystemCount - visibleMessages.length;

  // Trim old tool results
  // biome-ignore lint/correctness/useExhaustiveDependencies: narrow trigger
  useEffect(() => {
    const TRIM_THRESHOLD = 50;
    const KEEP_RECENT = 30;
    if (chat.messages.length < TRIM_THRESHOLD) return;
    const trimCount = chat.messages.length - KEEP_RECENT;
    let changed = false;
    const updated = chat.messages.map((msg, i) => {
      if (i >= trimCount || !msg.toolCalls) return msg;
      let tcChanged = false;
      const newToolCalls = msg.toolCalls.map((tc) => {
        if (tc.result && tc.result.output.length > 200) {
          tcChanged = true;
          return {
            ...tc,
            result: { ...tc.result, output: `${tc.result.output.slice(0, 100)}…[trimmed]` },
          };
        }
        return tc;
      });
      if (!tcChanged) return msg;
      changed = true;
      return { ...msg, toolCalls: newToolCalls };
    });
    if (changed) chat.setMessages(updated);
  }, [chat.messages.length]);

  const cleanupPlanFile = useCallback(() => {
    try {
      const p = join(cwd, ".soulforge", "plans", planFileName(chat.sessionId));
      if (existsSync(p)) unlinkSync(p);
    } catch {}
  }, [cwd, chat.sessionId]);

  const handleInputSubmit = useCallback(
    async (input: string) => {
      if (input.startsWith("/")) {
        onCommand(input, chat);
        return;
      }
      chat.handleSubmit(input);
    },
    [chat, onCommand],
  );

  const isFocused = visible && focusMode === "chat" && !anyModalOpen;

  return (
    <box
      visible={visible}
      flexDirection="column"
      flexGrow={editorVisible ? 0 : 1}
      flexShrink={editorVisible ? 1 : 0}
      width={editorVisible ? "40%" : "100%"}
    >
      <SystemBanner messages={chat.messages} expanded={codeExpanded} />

      {!hasContent ? (
        <LandingPage bootProviders={bootProviders} bootPrereqs={bootPrereqs} />
      ) : (
        <box flexGrow={1} flexShrink={1} minHeight={0} flexDirection="row">
          <AnimatedBorder active={isStreaming}>
            <scrollbox
              ref={scrollRef}
              stickyScroll={true}
              stickyStart="bottom"
              flexGrow={1}
              flexShrink={1}
              minHeight={0}
              style={{ contentOptions: { justifyContent: "flex-end" } }}
            >
              <CodeExpandedProvider value={codeExpanded}>
                {hiddenCount > 0 && (
                  <box paddingX={1} marginBottom={1}>
                    <text fg="#444">
                      ── {String(hiddenCount)} earlier message{hiddenCount > 1 ? "s" : ""} ──
                    </text>
                  </box>
                )}
                {visibleMessages.map((msg) => (
                  <StaticMessage
                    key={msg.id}
                    msg={msg}
                    chatStyle={chatStyle}
                    diffStyle={effectiveConfig.diffStyle}
                    showReasoning={showReasoning}
                    reasoningExpanded={reasoningExpanded}
                    animate={false}
                  />
                ))}
                {isStreaming && (
                  <box paddingX={1} flexShrink={0} marginBottom={1}>
                    <box
                      flexDirection="column"
                      border={["left"]}
                      borderColor="#9B30FF"
                      customBorderChars={RAIL_BORDER}
                      paddingLeft={2}
                    >
                      <box>
                        <text fg="#9B30FF">{icon("ai")} Forge</text>
                      </box>
                      <StreamSegmentList
                        segments={chat.streamSegments}
                        toolCalls={chat.liveToolCalls}
                        streaming={chat.isLoading}
                        verbose={effectiveConfig.verbose === true}
                        diffStyle={effectiveConfig.diffStyle}
                        showReasoning={showReasoning}
                        reasoningExpanded={reasoningExpanded}
                      />
                    </box>
                  </box>
                )}
              </CodeExpandedProvider>
              <LoadingStatus
                isLoading={chat.isLoading}
                isCompacting={chat.isCompacting}
                queueCount={chat.messageQueue.length}
              />
            </scrollbox>
          </AnimatedBorder>
          {changesExpanded && <ChangesPanel messages={chat.messages} cwd={cwd} />}
        </box>
      )}

      {chat.pendingPlanReview ? (
        <box flexShrink={0} paddingX={1}>
          <PlanReviewPrompt
            isActive={isFocused}
            plan={chat.pendingPlanReview.plan}
            planFile={chat.pendingPlanReview.planFile}
            onAccept={() => {
              chat.pendingPlanReview?.resolve("execute");
              cleanupPlanFile();
            }}
            onClearAndImplement={() => {
              chat.pendingPlanReview?.resolve("clear_execute");
              cleanupPlanFile();
            }}
            onRevise={(feedback) => {
              chat.pendingPlanReview?.resolve(feedback);
            }}
            onCancel={() => {
              chat.pendingPlanReview?.resolve("cancel");
              cleanupPlanFile();
            }}
          />
        </box>
      ) : chat.pendingQuestion ? (
        <>
          <box flexShrink={0} paddingX={1}>
            <QuestionPrompt question={chat.pendingQuestion} isActive={isFocused} />
          </box>
          {showPlanProgress && chat.activePlan && (
            <box flexShrink={0} paddingX={1}>
              <PlanProgress plan={chat.activePlan} tasks={tasks} />
            </box>
          )}
          {!showPlanProgress && tasks.length > 0 && (
            <box flexShrink={0} paddingX={1}>
              <TaskProgress />
            </box>
          )}
          {hasChangedFiles && (
            <box flexShrink={0} paddingX={1}>
              <ChangedFilesBar messages={chat.messages} />
            </box>
          )}
        </>
      ) : (
        <>
          {showPlanProgress && chat.activePlan && (
            <box flexShrink={0} paddingX={1}>
              <PlanProgress plan={chat.activePlan} tasks={tasks} />
            </box>
          )}
          {!showPlanProgress && tasks.length > 0 && (
            <box flexShrink={0} paddingX={1}>
              <TaskProgress />
            </box>
          )}
          {hasChangedFiles && (
            <box flexShrink={0} paddingX={1}>
              <ChangedFilesBar messages={chat.messages} />
            </box>
          )}
          {chat.messageQueue.length > 0 && (
            <box flexDirection="column" flexShrink={0} paddingX={1} marginBottom={1}>
              {chat.messageQueue.map((q, i) => (
                <box
                  key={`q-${String(i)}-${String(q.queuedAt)}`}
                  flexDirection="column"
                  border={["left"]}
                  borderColor="#444"
                  customBorderChars={RAIL_BORDER}
                  paddingLeft={2}
                  paddingRight={1}
                  paddingY={1}
                >
                  <box flexDirection="row">
                    <text fg="#444">You</text>
                    <text fg="#333"> · queued</text>
                  </box>
                  <text fg="#666">{q.content}</text>
                </box>
              ))}
            </box>
          )}
          <box flexShrink={0} zIndex={10}>
            <InputBox
              onSubmit={handleInputSubmit}
              isLoading={chat.isLoading}
              isCompacting={chat.isCompacting}
              isFocused={isFocused}
              cwd={cwd}
              onExit={onExit}
              onQueue={(msg) =>
                chat.setMessageQueue((prev) =>
                  prev.length >= 5 ? prev : [...prev, { content: msg, queuedAt: Date.now() }],
                )
              }
              queueCount={chat.messageQueue.length}
            />
          </box>
        </>
      )}
    </box>
  );
}
