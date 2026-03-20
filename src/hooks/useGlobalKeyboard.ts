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

    if (evt.ctrl && evt.name === "e") {
      toggleEditor();
      return;
    }
    if (focusMode === "editor") {
      if (evt.ctrl && evt.name === "c") {
        handleExit();
        return;
      }
      evt.preventDefault();
      evt.stopPropagation();
      return;
    }
    if (evt.ctrl && evt.name === "o") {
      useUIStore.getState().toggleCodeExpanded();
      return;
    }

    // Copy must be checked BEFORE snap-scroll (scroll can invalidate selection)
    if ((evt.ctrl || evt.super) && evt.name === "c") {
      const sel = renderer.getSelection();
      if (sel) {
        const text = sel.getSelectedText();
        if (text) {
          copyToClipboard(text);
          return;
        }
      }
      if (evt.ctrl && focusMode === "chat") return;
      if (evt.ctrl) handleExit();
      return;
    }

    if (evt.ctrl && evt.name === "x") {
      activeChatRef.current?.abort();
      return;
    }
    if (evt.ctrl && evt.name === "l") {
      useUIStore.getState().toggleModal("llmSelector");
      return;
    }
    if (evt.ctrl && evt.name === "s") {
      useUIStore.getState().toggleModal("skillSearch");
      return;
    }
    if (evt.ctrl && evt.name === "t") {
      useUIStore.getState().toggleReasoningExpanded();
      return;
    }
    if (evt.ctrl && evt.name === "d") {
      cycleMode();
      return;
    }
    if (evt.ctrl && evt.name === "g") {
      useUIStore.getState().toggleModal("gitMenu");
      return;
    }
    if (evt.ctrl && evt.name === "h") {
      useUIStore.getState().toggleModal("helpPopup");
      return;
    }
    if (evt.ctrl && evt.name === "p") {
      useUIStore.getState().toggleModal("sessionPicker");
      return;
    }
    if (evt.meta && evt.name === "r") {
      useUIStore.getState().toggleModal("errorLog");
      return;
    }
    if (evt.meta && evt.name === "t") {
      tabMgr.createTab();
      return;
    }
    if (evt.meta && evt.name === "w") {
      if (tabMgr.tabCount > 1) {
        tabMgr.closeTab(tabMgr.activeTabId);
      }
      return;
    }
    if ((evt.meta || evt.ctrl) && evt.name >= "1" && evt.name <= "9") {
      tabMgr.switchToIndex(Number(evt.name) - 1);
      return;
    }
    if (evt.meta && evt.name === "[") {
      tabMgr.prevTab();
      return;
    }
    if (evt.meta && evt.name === "]") {
      tabMgr.nextTab();
      return;
    }
  });
}
