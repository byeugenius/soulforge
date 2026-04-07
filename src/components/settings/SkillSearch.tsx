import { existsSync } from "node:fs";
import { join } from "node:path";
import { TextAttributes } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ContextManager } from "../../core/context/manager.js";
import {
  type InstalledSkill,
  installSkill,
  listInstalledSkills,
  listPopularSkills,
  loadSkill,
  removeInstalledSkill,
  type SkillSearchResult,
  searchSkills,
} from "../../core/skills/manager.js";
import { useTheme } from "../../core/theme/index.js";
import { usePopupScroll } from "../../hooks/usePopupScroll.js";
import { Popup, PopupRow, usePopupColors } from "../layout/shared.js";

const MAX_POPUP_WIDTH = 100;
const CHROME_ROWS = 9;

type Tab = "search" | "installed" | "active";
const TABS: Tab[] = ["search", "installed", "active"];
const TAB_LABELS: Record<Tab, string> = {
  search: "Search",
  installed: "Installed",
  active: "Active",
};

interface Props {
  visible: boolean;
  contextManager: ContextManager;
  onClose: () => void;
  onSystemMessage: (msg: string) => void;
}

function SearchSkillRow({
  skill,
  isSelected,
  isInstalled,
  isLoaded,
  innerW,
}: {
  skill: SkillSearchResult;
  isSelected: boolean;
  isInstalled: boolean;
  isLoaded: boolean;
  innerW: number;
}) {
  const t = useTheme();
  const { bg: popupBg, hl: popupHl } = usePopupColors();
  const bg = isSelected ? popupHl : popupBg;
  return (
    <PopupRow bg={bg} w={innerW}>
      <text bg={bg} fg={isSelected ? t.brand : t.textMuted}>
        {isSelected ? "› " : "  "}
      </text>
      {isLoaded ? (
        <text bg={bg} fg={t.info} attributes={TextAttributes.BOLD}>
          {"● "}
        </text>
      ) : isInstalled ? (
        <text bg={bg} fg={t.success} attributes={TextAttributes.BOLD}>
          {"✓ "}
        </text>
      ) : null}
      <text
        bg={bg}
        fg={isSelected ? t.brand : t.textSecondary}
        attributes={isSelected ? TextAttributes.BOLD : undefined}
      >
        {skill.skillId}
      </text>
      <text bg={bg} fg={t.textMuted}>
        {" "}
        {skill.source}
      </text>
      <text bg={bg} fg={t.textDim}>
        {" "}
        {skill.installs.toLocaleString()}↓
      </text>
    </PopupRow>
  );
}

function InstalledSkillRow({
  skill,
  isSelected,
  isLoaded,
  innerW,
}: {
  skill: InstalledSkill;
  isSelected: boolean;
  isLoaded: boolean;
  innerW: number;
}) {
  const t = useTheme();
  const { bg: popupBg, hl: popupHl } = usePopupColors();
  const bg = isSelected ? popupHl : popupBg;
  return (
    <PopupRow bg={bg} w={innerW}>
      <text bg={bg} fg={isSelected ? t.brand : t.textMuted}>
        {isSelected ? "› " : "  "}
      </text>
      <text
        bg={bg}
        fg={isSelected ? t.brand : t.textSecondary}
        attributes={isSelected ? TextAttributes.BOLD : undefined}
      >
        {skill.name}
      </text>
      <text bg={bg} fg={t.textMuted}>
        {" "}
        {skill.scope === "project" ? "(project)" : "(global)"}
      </text>
      {isLoaded && (
        <text bg={bg} fg={t.info} attributes={TextAttributes.BOLD}>
          {" "}
          ●
        </text>
      )}
    </PopupRow>
  );
}

function ActiveSkillRow({
  name,
  isSelected,
  innerW,
}: {
  name: string;
  isSelected: boolean;
  innerW: number;
}) {
  const t = useTheme();
  const { bg: popupBg, hl: popupHl } = usePopupColors();
  const bg = isSelected ? popupHl : popupBg;
  return (
    <PopupRow bg={bg} w={innerW}>
      <text bg={bg} fg={isSelected ? t.brand : t.textMuted}>
        {isSelected ? "› " : "  "}
      </text>
      <text bg={bg} fg={t.info} attributes={TextAttributes.BOLD}>
        {"● "}
      </text>
      <text
        bg={bg}
        fg={isSelected ? t.brand : t.textPrimary}
        attributes={isSelected ? TextAttributes.BOLD : undefined}
      >
        {name}
      </text>
    </PopupRow>
  );
}

function ScopeRow({
  label,
  description,
  isSelected,
  innerW,
}: {
  label: string;
  description: string;
  isSelected: boolean;
  innerW: number;
}) {
  const t = useTheme();
  const { bg: popupBg, hl: popupHl } = usePopupColors();
  const bg = isSelected ? popupHl : popupBg;
  return (
    <PopupRow bg={bg} w={innerW}>
      <text bg={bg} fg={isSelected ? t.brand : t.textMuted}>
        {isSelected ? "› " : "  "}
      </text>
      <text
        bg={bg}
        fg={isSelected ? t.brand : t.textSecondary}
        attributes={isSelected ? TextAttributes.BOLD : undefined}
      >
        {label}
      </text>
      <text bg={bg} fg={t.textMuted}>
        {" "}
        {description}
      </text>
    </PopupRow>
  );
}

export function SkillSearch({ visible, contextManager, onClose, onSystemMessage }: Props) {
  const t = useTheme();
  const { bg: popupBg, hl: popupHl } = usePopupColors();
  const [tab, setTab] = useState<Tab>("search");
  const [query, setQuery] = useState("");
  const [popular, setPopular] = useState<SkillSearchResult[]>([]);
  const [results, setResults] = useState<SkillSearchResult[]>([]);
  const [installed, setInstalled] = useState<InstalledSkill[]>([]);
  const [activeSkills, setActiveSkills] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [pendingInstall, setPendingInstall] = useState<SkillSearchResult | null>(null);
  const [scopeCursor, setScopeCursor] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isInProject = existsSync(join(process.cwd(), ".git"));
  const { width: termCols, height: termRows } = useTerminalDimensions();

  const containerRows = termRows - 2;
  const popupWidth = Math.min(MAX_POPUP_WIDTH, Math.floor(termCols * 0.8));
  const maxVisible = Math.max(4, Math.floor(containerRows * 0.8) - CHROME_ROWS);
  const innerW = popupWidth - 2;
  const { cursor, setCursor, scrollOffset, adjustScroll, resetScroll } = usePopupScroll(maxVisible);

  const filterQuery = query.toLowerCase().trim();

  const installedNames = new Set(installed.map((s) => s.name));

  const filteredInstalled = filterQuery
    ? installed.filter((s) => s.name.toLowerCase().includes(filterQuery))
    : installed;

  const filteredActive = filterQuery
    ? activeSkills.filter((s) => s.toLowerCase().includes(filterQuery))
    : activeSkills;

  const displayResults = query.trim() ? results : popular;

  const currentListLen = (() => {
    if (tab === "search") return displayResults.length;
    if (tab === "installed") return filteredInstalled.length;
    return filteredActive.length;
  })();

  const refreshInstalled = useCallback(() => {
    setInstalled(listInstalledSkills());
  }, []);

  const refreshActive = useCallback(() => {
    setActiveSkills(contextManager.getActiveSkills());
  }, [contextManager]);

  useEffect(() => {
    if (visible) {
      setTab("search");
      setQuery("");
      setResults([]);
      setCursor(0);
      refreshInstalled();
      refreshActive();
      listPopularSkills()
        .then((r) => setPopular(r))
        .catch(() => {});
    }
  }, [visible, setCursor, refreshActive, refreshInstalled]);

  useEffect(() => {
    if (!visible || tab !== "search") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }

    if (popular.length > 0) setPopular([]);

    setSearching(true);
    debounceRef.current = setTimeout(() => {
      searchSkills(query.trim())
        .then((r) => {
          setResults(r);
          setCursor(0);
        })
        .catch(() => {
          setResults([]);
        })
        .finally(() => setSearching(false));
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, visible, tab, popular.length, setCursor]);

  useEffect(() => {
    setQuery("");
    setResults([]);
    resetScroll();
    if (tab === "installed") refreshInstalled();
    if (tab === "active") refreshActive();
  }, [tab, resetScroll, refreshInstalled, refreshActive]);

  const doInstall = (skill: SkillSearchResult, global: boolean) => {
    setInstalling(true);
    installSkill(skill.source, skill.skillId, global)
      .then((result) => {
        if (result.installed) {
          onSystemMessage(
            `Skill "${result.name ?? skill.name}" installed ${global ? "globally" : "to project"}.`,
          );
        } else {
          onSystemMessage(`Failed to install "${skill.name}": ${result.error ?? "unknown error"}`);
        }
        refreshInstalled();
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        onSystemMessage(`Failed to install "${skill.name}": ${msg}`);
      })
      .finally(() => setInstalling(false));
  };

  const handleAction = () => {
    if (tab === "search") {
      const skill = displayResults[cursor];
      if (!skill || installing) return;
      if (isInProject) {
        setPendingInstall(skill);
        setScopeCursor(0);
      } else {
        doInstall(skill, true);
      }
    } else if (tab === "installed") {
      const skill = filteredInstalled[cursor];
      if (!skill) return;
      const content = loadSkill(skill.path);
      contextManager.addSkill(skill.name, content);
      onSystemMessage(`Skill "${skill.name}" loaded into AI context.`);
      refreshActive();
    } else {
      const name = filteredActive[cursor];
      if (!name) return;
      contextManager.removeSkill(name);
      onSystemMessage(`Skill "${name}" unloaded from AI context.`);
      refreshActive();
    }
  };

  const handleKeyboard = (evt: import("@opentui/core").KeyEvent) => {
    if (!visible) return;

    if (pendingInstall) {
      if (evt.name === "escape") {
        setPendingInstall(null);
        return;
      }
      if (evt.name === "up" || evt.name === "down") {
        setScopeCursor((prev) => (prev === 0 ? 1 : 0));
        return;
      }
      if (evt.name === "return") {
        const isGlobal = isInProject ? scopeCursor === 1 : true;
        doInstall(pendingInstall, isGlobal);
        setPendingInstall(null);
        return;
      }
      return;
    }

    if (evt.name === "escape") {
      onClose();
      return;
    }

    if (evt.name === "tab") {
      const idx = TABS.indexOf(tab);
      const next = TABS[(idx + 1) % TABS.length] as Tab;
      setTab(next);
      return;
    }

    if (evt.name === "up") {
      const len = currentListLen;
      setCursor((prev) => {
        const next = prev > 0 ? prev - 1 : Math.max(0, len - 1);
        adjustScroll(next);
        return next;
      });
      return;
    }
    if (evt.name === "down") {
      const len = currentListLen;
      setCursor((prev) => {
        const next = prev < len - 1 ? prev + 1 : 0;
        adjustScroll(next);
        return next;
      });
      return;
    }

    if (evt.name === "return") {
      handleAction();
      return;
    }

    if (evt.ctrl && evt.name === "d") {
      if (tab === "installed") {
        const skill = filteredInstalled[cursor];
        if (skill) {
          if (activeSkills.includes(skill.name)) {
            contextManager.removeSkill(skill.name);
          }
          if (removeInstalledSkill(skill)) {
            onSystemMessage(`Skill "${skill.name}" removed.`);
          } else {
            onSystemMessage(`Failed to remove "${skill.name}".`);
          }
          refreshInstalled();
          refreshActive();
          resetScroll();
        }
      } else if (tab === "active") {
        const name = filteredActive[cursor];
        if (name) {
          contextManager.removeSkill(name);
          onSystemMessage(`Skill "${name}" unloaded.`);
          refreshActive();
          resetScroll();
        }
      }
      return;
    }

    if (evt.name === "backspace" || evt.name === "delete") {
      setQuery((prev) => prev.slice(0, -1));
      resetScroll();
      return;
    }

    if (evt.name === "space") {
      setQuery((prev) => `${prev} `);
      resetScroll();
      return;
    }

    if (evt.name && evt.name.length === 1 && !evt.ctrl && !evt.meta) {
      setQuery((prev) => prev + evt.name);
      resetScroll();
    }
  };

  useKeyboard(handleKeyboard);

  if (!visible) return null;

  const tabIdx = TABS.indexOf(tab);
  const resultCountLabel =
    tab === "search"
      ? `${displayResults.length}`
      : tab === "installed"
        ? `${filteredInstalled.length}`
        : `${filteredActive.length}`;

  const footerHints = [
    { key: "\u2191\u2193", label: "nav" },
    {
      key: "\u23CE",
      label: tab === "search" ? "install" : tab === "installed" ? "load" : "unload",
    },
    ...(tab === "installed"
      ? [{ key: "^D", label: "remove" }]
      : tab === "active"
        ? [{ key: "^D", label: "unload" }]
        : []),
    { key: "tab", label: "tab" },
    { key: "esc", label: "close" },
  ];

  return (
    <Popup width={popupWidth} title={"\uDB82\uDD2A Skills"} footer={footerHints}>
      <PopupRow w={innerW}>
        {TABS.map((tabItem, i) => {
          const selected = i === tabIdx;
          return (
            <text key={tabItem} bg={popupBg}>
              {i > 0 ? (
                <span fg={t.textFaint} bg={popupBg}>
                  {" │ "}
                </span>
              ) : (
                ""
              )}
              <span
                fg={selected ? t.brand : t.textMuted}
                attributes={selected ? TextAttributes.BOLD : undefined}
                bg={selected ? popupHl : popupBg}
              >
                {selected ? ` ${TAB_LABELS[tabItem]} ` : ` ${TAB_LABELS[tabItem]} `}
              </span>
            </text>
          );
        })}
      </PopupRow>

      <PopupRow w={innerW}>
        <text fg={t.textFaint} bg={popupBg}>
          {"─".repeat(innerW - 4)}
        </text>
      </PopupRow>

      <PopupRow w={innerW} bg={popupHl}>
        <text fg={t.textMuted} bg={popupHl}>
          {"\uD83D\uDD0D "}
        </text>
        {query ? (
          <>
            <text fg={t.textPrimary} bg={popupHl}>
              {query}
            </text>
            <text fg={t.brand} bg={popupHl}>
              {"█"}
            </text>
          </>
        ) : (
          <>
            <text fg={t.brand} bg={popupHl}>
              {"█"}
            </text>
            <text fg={t.textMuted} bg={popupHl}>
              {tab === "search"
                ? "type to filter / search skills.sh..."
                : tab === "installed"
                  ? "type to filter installed..."
                  : "type to filter active..."}
            </text>
          </>
        )}
        <text fg={t.textDim} bg={popupHl}>
          {` (${resultCountLabel})`}
        </text>
      </PopupRow>
      <PopupRow w={innerW}>
        <text>{""}</text>
      </PopupRow>

      {tab === "search" && (
        <>
          <box
            flexDirection="column"
            height={Math.min(displayResults.length || 1, maxVisible)}
            overflow="hidden"
          >
            {searching ? (
              <PopupRow w={innerW}>
                <text fg={t.brand} bg={popupBg}>
                  searching...
                </text>
              </PopupRow>
            ) : displayResults.length === 0 ? (
              <PopupRow w={innerW}>
                <text fg={t.textMuted} bg={popupBg}>
                  {query ? "no results" : "loading popular skills..."}
                </text>
              </PopupRow>
            ) : (
              displayResults.slice(scrollOffset, scrollOffset + maxVisible).map((skill, i) => {
                const idx = scrollOffset + i;
                return (
                  <SearchSkillRow
                    key={skill.id}
                    skill={skill}
                    isSelected={idx === cursor}
                    isInstalled={
                      installedNames.has(skill.skillId) || installedNames.has(skill.name)
                    }
                    isLoaded={
                      activeSkills.includes(skill.skillId) || activeSkills.includes(skill.name)
                    }
                    innerW={innerW}
                  />
                );
              })
            )}
          </box>
          {displayResults.length > maxVisible && (
            <PopupRow w={innerW}>
              <text fg={t.textMuted} bg={popupBg}>
                {scrollOffset > 0 ? "↑ " : "  "}
                {String(cursor + 1)}/{String(displayResults.length)}
                {scrollOffset + maxVisible < displayResults.length ? " ↓" : ""}
              </text>
            </PopupRow>
          )}

          {pendingInstall && (
            <>
              <PopupRow w={innerW}>
                <text>{""}</text>
              </PopupRow>
              <PopupRow w={innerW}>
                <text fg={t.textPrimary} attributes={TextAttributes.BOLD} bg={popupBg}>
                  Install "{pendingInstall.skillId}" to:
                </text>
              </PopupRow>
              <ScopeRow
                label="Project"
                description=".agents/skills/ (this repo)"
                isSelected={scopeCursor === 0}
                innerW={innerW}
              />
              <ScopeRow
                label="Global"
                description="~/.agents/skills/ (all projects)"
                isSelected={scopeCursor === 1}
                innerW={innerW}
              />
            </>
          )}

          {installing && (
            <PopupRow w={innerW}>
              <text fg={t.brand} bg={popupBg}>
                installing...
              </text>
            </PopupRow>
          )}
        </>
      )}

      {tab === "installed" && (
        <>
          <box
            flexDirection="column"
            height={Math.min(filteredInstalled.length || 1, maxVisible)}
            overflow="hidden"
          >
            {filteredInstalled.length === 0 ? (
              <PopupRow w={innerW}>
                <text fg={t.textMuted} bg={popupBg}>
                  {query ? "no matching skills" : "no installed skills found"}
                </text>
              </PopupRow>
            ) : (
              filteredInstalled.slice(scrollOffset, scrollOffset + maxVisible).map((skill, i) => {
                const idx = scrollOffset + i;
                return (
                  <InstalledSkillRow
                    key={skill.path}
                    skill={skill}
                    isSelected={idx === cursor}
                    isLoaded={activeSkills.includes(skill.name)}
                    innerW={innerW}
                  />
                );
              })
            )}
          </box>
          {filteredInstalled.length > maxVisible && (
            <PopupRow w={innerW}>
              <text fg={t.textMuted} bg={popupBg}>
                {scrollOffset > 0 ? "↑ " : "  "}
                {String(cursor + 1)}/{String(filteredInstalled.length)}
                {scrollOffset + maxVisible < filteredInstalled.length ? " ↓" : ""}
              </text>
            </PopupRow>
          )}
        </>
      )}

      {tab === "active" && (
        <>
          <box
            flexDirection="column"
            height={Math.min(filteredActive.length || 1, maxVisible)}
            overflow="hidden"
          >
            {filteredActive.length === 0 ? (
              <PopupRow w={innerW}>
                <text fg={t.textMuted} bg={popupBg}>
                  {query ? "no matching skills" : "no active skills — load from Installed tab"}
                </text>
              </PopupRow>
            ) : (
              filteredActive.slice(scrollOffset, scrollOffset + maxVisible).map((name, i) => {
                const idx = scrollOffset + i;
                return (
                  <ActiveSkillRow
                    key={name}
                    name={name}
                    isSelected={idx === cursor}
                    innerW={innerW}
                  />
                );
              })
            )}
          </box>
          {filteredActive.length > maxVisible && (
            <PopupRow w={innerW}>
              <text fg={t.textMuted} bg={popupBg}>
                {scrollOffset > 0 ? "↑ " : "  "}
                {String(cursor + 1)}/{String(filteredActive.length)}
                {scrollOffset + maxVisible < filteredActive.length ? " ↓" : ""}
              </text>
            </PopupRow>
          )}
        </>
      )}
    </Popup>
  );
}
