import type { Selection } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import type { MutableRefObject } from "react";
import { selectIsAnyModalOpen, useUIStore } from "../stores/ui.js";
import type { ChatInstance } from "./useChat.js";
import type { UseTabsReturn } from "./useTabs.js";

interface GlobalKeyboardParams {
  shutdownPhase: number;
  handleExit: () => void;
  toggleEditor: () => void;
  focusMode: "chat" | "editor";
  renderer: { getSelection: () => Selection | null };
  copyToClipboard: (text: string) => void;
  activeChatRef: MutableRefObject<ChatInstance | null>;
  cycleMode: () => void;
  tabMgr: UseTabsReturn;
}

export function useGlobalKeyboard({
  shutdownPhase,
  handleExit,
  toggleEditor,
  focusMode,
  renderer,
  copyToClipboard,
  activeChatRef,
  cycleMode,
  tabMgr,
}: GlobalKeyboardParams): void {
  useKeyboard((evt) => {
    if (shutdownPhase >= 0) return;
    if (selectIsAnyModalOpen(useUIStore.getState())) {
      if (evt.ctrl && evt.name === "c") {
        handleExit();
      }
      evt.stopPropagation();
      return;
    }

    // Helper: consume a shortcut — execute the action and stop event propagation
    // so child components (InputBox, etc.) never see global shortcuts.
    const consume = (action: () => void) => {
      action();
      evt.stopPropagation();
      evt.preventDefault();
    };

    if (evt.ctrl && evt.name === "e") return consume(() => toggleEditor());
    if (focusMode === "editor") {
      if (evt.ctrl && evt.name === "c") {
        handleExit();
        return;
      }
      evt.preventDefault();
      evt.stopPropagation();
      return;
    }
    if (evt.ctrl && evt.name === "o")
      return consume(() => useUIStore.getState().toggleAllExpanded());

    // Copy must be checked BEFORE snap-scroll (scroll can invalidate selection)
    if ((evt.ctrl || evt.super) && evt.name === "c") {
      const sel = renderer.getSelection();
      if (sel) {
        const text = sel.getSelectedText();
        if (text) return consume(() => copyToClipboard(text));
      }
      if (evt.ctrl && focusMode === "chat") return;
      if (evt.ctrl) handleExit();
      return;
    }

    if (evt.ctrl && evt.name === "x") return consume(() => activeChatRef.current?.abort());
    if (evt.ctrl && evt.name === "l")
      return consume(() => useUIStore.getState().toggleModal("llmSelector"));
    if (evt.ctrl && evt.name === "s")
      return consume(() => useUIStore.getState().toggleModal("skillSearch"));
    if (evt.ctrl && evt.name === "t") return consume(() => tabMgr.createTab());
    if (evt.ctrl && evt.name === "d") return consume(() => cycleMode());
    if (evt.ctrl && evt.name === "g")
      return consume(() => useUIStore.getState().toggleModal("gitMenu"));
    if (evt.ctrl && evt.name === "h")
      return consume(() => useUIStore.getState().toggleModal("helpPopup"));
    if (evt.ctrl && evt.name === "p")
      return consume(() => useUIStore.getState().toggleModal("sessionPicker"));
    if (evt.meta && evt.name === "r")
      return consume(() => useUIStore.getState().toggleModal("errorLog"));
    if (evt.ctrl && evt.name === "w")
      return consume(() => {
        if (tabMgr.tabCount > 1) tabMgr.closeTab(tabMgr.activeTabId);
      });
    if ((evt.meta || evt.ctrl) && evt.name >= "1" && evt.name <= "9") {
      return consume(() => tabMgr.switchToIndex(Number(evt.name) - 1));
    }
    if (evt.ctrl && evt.name === "[") return consume(() => tabMgr.prevTab());
    if (evt.ctrl && evt.name === "]") return consume(() => tabMgr.nextTab());
  });
}
