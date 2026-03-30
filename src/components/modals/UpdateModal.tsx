import { TextAttributes } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { icon } from "../../core/icons.js";
import { useTheme } from "../../core/theme/index.js";
import { garble } from "../../core/utils/splash.js";
import { dismissVersion, getUpgradeCommand, performUpgrade } from "../../core/version.js";
import { useVersionStore } from "../../stores/version.js";
import { Overlay, POPUP_BG, PopupRow } from "../layout/shared.js";

type Phase = "info" | "upgrading" | "success" | "failed";

const UPGRADE_QUIPS = [
  "Heating the forge…",
  "Melting down the old version…",
  "Pouring molten code into the mold…",
  "Hammering out the bugs…",
  "Quenching in liquid nitrogen…",
  "Polishing the new blade…",
  "Enchanting with fresh runes…",
  "Consulting the package spirits…",
  "Negotiating with the registry gods…",
  "Bribing the dependency elves…",
  "Aligning the semantic versions…",
  "Reticulating splines…",
  "Convincing npm to cooperate…",
  "Performing arcane rituals…",
  "Almost there, forgemaster…",
];

const LATEST_QUIPS = [
  "The forge burns bright — you're on the cutting edge.",
  "No updates. The blade is already sharp.",
  "You're running the latest. The gods are pleased.",
  "Peak version achieved. Nothing to see here.",
  "Already forged to perfection.",
  "The scrolls confirm: you're up to date.",
  "No new runes to inscribe today.",
  "Your version is so fresh it's still warm.",
];

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const GHOST_FADE = ["░", "▒", "▓"];
const WISP = ["~∿~", "∿~∿", "·∿·", "∿·∿"];
const MAX_LOG = 50;
const BOLD = TextAttributes.BOLD;
const ITALIC = TextAttributes.ITALIC;
const DIM = TextAttributes.DIM;

// ── Helpers ────────────────────────────────────────────────────────

function trunc(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function Hr({ w, bg, fg }: { w: number; bg: string; fg: string }) {
  return (
    <PopupRow w={w}>
      <text bg={bg} fg={fg}>
        {"─".repeat(w - 4)}
      </text>
    </PopupRow>
  );
}

function Gap({ w, bg, n = 1 }: { w: number; bg: string; n?: number }) {
  const rows = [];
  for (let i = 0; i < n; i++)
    rows.push(
      <PopupRow key={i} w={w}>
        <text bg={bg}> </text>
      </PopupRow>,
    );
  return <>{rows}</>;
}

// ── Component ──────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
  onRestart: () => void;
}

export function UpdateModal({ visible, onClose, onRestart }: Props) {
  const t = useTheme();
  const { width: termCols, height: termRows } = useTerminalDimensions();
  const { current, latest, changelog, installMethod, updateAvailable } = useVersionStore();
  const [copied, setCopied] = useState(false);
  const [phase, setPhase] = useState<Phase>("info");
  const [quipIdx, setQuipIdx] = useState(0);
  const [spinIdx, setSpinIdx] = useState(0);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const upgrading = useRef(false);

  // Entrance animation
  const [tick, setTick] = useState(0);
  const prevVisible = useRef(false);
  useEffect(() => {
    if (visible && !prevVisible.current) {
      setTick(0);
      setPhase("info");
    }
    prevVisible.current = visible;
  }, [visible]);

  useEffect(() => {
    if (!visible || tick >= 12) return;
    const timer = setInterval(() => setTick((prev) => prev + 1), 60);
    return () => clearInterval(timer);
  }, [visible, tick]);

  const pw = Math.min(60, Math.floor(termCols * 0.85));
  const iw = pw - 2;
  const maxChangelog = Math.max(3, Math.floor(termRows * 0.3) - 8);
  const logH = Math.max(3, Math.min(6, Math.floor(termRows * 0.2)));
  const bg = POPUP_BG;

  // Animate spinner + cycle quips during upgrade
  useEffect(() => {
    if (phase !== "upgrading") return;
    const s = setInterval(() => setSpinIdx((i) => i + 1), 80);
    const q = setInterval(() => setQuipIdx((i) => (i + 1) % UPGRADE_QUIPS.length), 2500);
    return () => {
      clearInterval(s);
      clearInterval(q);
    };
  }, [phase]);

  const doUpgrade = useCallback(async () => {
    if (upgrading.current) return;
    upgrading.current = true;
    setPhase("upgrading");
    setLogLines([]);
    setErrorMsg("");
    setQuipIdx(0);

    const result = await performUpgrade(installMethod, (msg) => {
      setLogLines((prev) => {
        const next = [...prev, msg];
        return next.length > MAX_LOG ? next.slice(-MAX_LOG) : next;
      });
    });

    if (result.ok) {
      setPhase("success");
    } else {
      setPhase("failed");
      setErrorMsg(result.error ?? "Unknown error");
    }
    upgrading.current = false;
  }, [installMethod]);

  useKeyboard((evt) => {
    if (!visible) return;
    if (phase === "upgrading") return;

    if (phase === "success") {
      if (evt.name === "y" || evt.name === "return") {
        onRestart();
        return;
      }
      if (evt.name === "n" || evt.name === "escape") {
        setPhase("info");
        onClose();
        return;
      }
      return;
    }

    if (phase === "failed") {
      if (evt.name === "escape" || evt.name === "return") {
        setPhase("info");
        return;
      }
      return;
    }

    if (evt.name === "escape" || evt.name === "q") {
      onClose();
      return;
    }
    if (evt.name === "u" && updateAvailable && installMethod !== "binary") {
      doUpgrade();
      return;
    }
    if (evt.name === "d") {
      if (latest) dismissVersion(latest);
      onClose();
      return;
    }
    if (evt.name === "c") {
      try {
        const b64 = Buffer.from(getUpgradeCommand(installMethod)).toString("base64");
        process.stdout.write(`\x1b]52;c;${b64}\x07`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {}
    }
  });

  if (!visible) return null;

  const upgradeCmd = getUpgradeCommand(installMethod);
  const canAuto = installMethod !== "binary" && updateAvailable;
  const ghostIc = icon("ghost");
  const sparkle = icon("sparkle");
  const checkIc = icon("check");
  const errorIc = icon("error");
  const arrowIc = icon("arrow_right");

  // Entrance animation values
  const ghostChar = tick < GHOST_FADE.length ? (GHOST_FADE[tick] ?? "░") : ghostIc;
  const wispFrame = WISP[tick % WISP.length] ?? "";
  const titleReady = tick >= 4;
  const vCurrent = tick < 6 ? garble(`v${current}`) : `v${current}`;
  const vLatest = tick < 7 ? garble(`v${latest ?? current}`) : `v${latest ?? current}`;

  // ── Success: restart prompt ──────────────────────────────────────
  if (phase === "success") {
    return (
      <Overlay>
        <box flexDirection="column" borderStyle="rounded" border borderColor={t.success} width={pw}>
          <Gap w={iw} bg={bg} />
          <PopupRow w={iw}>
            <text bg={bg}>
              <span fg={t.success} attributes={BOLD}>
                {checkIc} Upgrade Complete!
              </span>
            </text>
          </PopupRow>
          <PopupRow w={iw}>
            <text bg={bg} fg={t.brandDim} attributes={DIM}>
              {"  "}∿~∿
            </text>
          </PopupRow>
          <Hr w={iw} bg={bg} fg={t.textFaint} />
          <Gap w={iw} bg={bg} />
          <PopupRow w={iw}>
            <text bg={bg}>
              <span fg={t.textPrimary}>{"  "}Successfully upgraded to </span>
              <span fg={t.success} attributes={BOLD}>
                v{latest}
              </span>
            </text>
          </PopupRow>
          <Gap w={iw} bg={bg} />
          <PopupRow w={iw}>
            <text bg={bg} fg={t.textSecondary} attributes={ITALIC}>
              {"  "}The forge has been retempered.
            </text>
          </PopupRow>
          <PopupRow w={iw}>
            <text bg={bg} fg={t.textMuted}>
              {"  "}Restart to wield the new blade?
            </text>
          </PopupRow>
          <Gap w={iw} bg={bg} />
          <Hr w={iw} bg={bg} fg={t.textFaint} />
          <PopupRow w={iw}>
            <text bg={bg} truncate>
              <span fg={t.success} attributes={BOLD}>
                {" "}
                {arrowIc} [y]
              </span>
              <span fg={t.textMuted}> restart now</span>
              <span fg={t.textFaint}>{"    "}</span>
              <span fg={t.textFaint}>[n]</span>
              <span fg={t.textMuted}> later</span>
            </text>
          </PopupRow>
        </box>
      </Overlay>
    );
  }

  // ── Upgrading: spinner + quips + live log ────────────────────────
  if (phase === "upgrading") {
    const spin = SPINNER[spinIdx % SPINNER.length];
    const quip = UPGRADE_QUIPS[quipIdx % UPGRADE_QUIPS.length] ?? "";
    const visibleLog = logLines.slice(-logH);

    return (
      <Overlay>
        <box flexDirection="column" borderStyle="rounded" border borderColor={t.brand} width={pw}>
          <Gap w={iw} bg={bg} />
          <PopupRow w={iw}>
            <text bg={bg} fg={t.brand} attributes={BOLD}>
              {ghostIc} Upgrading SoulForge…
            </text>
          </PopupRow>
          <PopupRow w={iw}>
            <text bg={bg} fg={t.brandDim} attributes={DIM}>
              {"  "}∿~∿
            </text>
          </PopupRow>
          <Hr w={iw} bg={bg} fg={t.textFaint} />
          <Gap w={iw} bg={bg} />
          <PopupRow w={iw}>
            <text bg={bg}>
              <span fg={t.brand}> {spin}</span>
              <span fg={t.brandAlt} attributes={ITALIC}>
                {" "}
                {trunc(quip, iw - 8)}
              </span>
            </text>
          </PopupRow>
          <Gap w={iw} bg={bg} />
          <Hr w={iw} bg={bg} fg={t.textFaint} />
          <box flexDirection="column" height={logH} overflow="hidden">
            {visibleLog.length === 0 ? (
              <PopupRow w={iw}>
                <text bg={bg} fg={t.textFaint}>
                  {"  "}Waiting for output…
                </text>
              </PopupRow>
            ) : (
              visibleLog.map((line, i) => (
                <PopupRow key={String(i)} w={iw}>
                  <text bg={bg} fg={i === visibleLog.length - 1 ? t.textSecondary : t.textFaint}>
                    {"  "}
                    {trunc(line, iw - 6)}
                  </text>
                </PopupRow>
              ))
            )}
          </box>
          <Hr w={iw} bg={bg} fg={t.textFaint} />
        </box>
      </Overlay>
    );
  }

  // ── Failed: error + manual command ───────────────────────────────
  if (phase === "failed") {
    return (
      <Overlay>
        <box
          flexDirection="column"
          borderStyle="rounded"
          border
          borderColor={t.brandSecondary}
          width={pw}
        >
          <Gap w={iw} bg={bg} />
          <PopupRow w={iw}>
            <text bg={bg} fg={t.brandSecondary} attributes={BOLD}>
              {errorIc} The Forge Sputtered
            </text>
          </PopupRow>
          <PopupRow w={iw}>
            <text bg={bg} fg={t.brandDim} attributes={DIM}>
              {"  "}∿~∿
            </text>
          </PopupRow>
          <Hr w={iw} bg={bg} fg={t.textFaint} />
          <Gap w={iw} bg={bg} />
          <PopupRow w={iw}>
            <text bg={bg} fg={t.brandSecondary}>
              {"  "}
              {trunc(errorMsg, iw - 6)}
            </text>
          </PopupRow>
          <Gap w={iw} bg={bg} />
          <PopupRow w={iw}>
            <text bg={bg} fg={t.textMuted} attributes={ITALIC}>
              {"  "}The spirits suggest a manual approach:
            </text>
          </PopupRow>
          <Gap w={iw} bg={bg} />
          <PopupRow w={iw}>
            <text bg={bg}>
              <span fg={t.textFaint}>
                {"    "}
                {arrowIc}{" "}
              </span>
              <span fg={t.brand} attributes={BOLD}>
                {trunc(upgradeCmd, iw - 10)}
              </span>
            </text>
          </PopupRow>
          <Gap w={iw} bg={bg} />
          <Hr w={iw} bg={bg} fg={t.textFaint} />
          <PopupRow w={iw}>
            <text bg={bg} fg={t.textMuted}>
              {" "}
              [esc] back
            </text>
          </PopupRow>
        </box>
      </Overlay>
    );
  }

  // ── Info: no update available (already on latest) ────────────────
  if (!updateAvailable) {
    const quip = LATEST_QUIPS[Math.floor(Date.now() / 60000) % LATEST_QUIPS.length] ?? "";

    return (
      <Overlay>
        <box flexDirection="column" borderStyle="rounded" border borderColor={t.brand} width={pw}>
          <Gap w={iw} bg={bg} />
          <PopupRow w={iw}>
            <text bg={bg}>
              <span fg={t.brand} attributes={BOLD}>
                {" "}
                {ghostChar}{" "}
              </span>
              <span fg={t.textPrimary} attributes={BOLD}>
                {titleReady ? "SoulForge" : garble("SoulForge")}
              </span>
            </text>
          </PopupRow>
          <PopupRow w={iw}>
            <text bg={bg} fg={t.brandDim} attributes={DIM}>
              {"   "}
              {wispFrame}
            </text>
          </PopupRow>
          <Hr w={iw} bg={bg} fg={t.textFaint} />
          <Gap w={iw} bg={bg} />
          <PopupRow w={iw}>
            <text bg={bg}>
              <span fg={t.textMuted}>
                {"  "}
                {icon("check")} Version{" "}
              </span>
              <span fg={t.success} attributes={BOLD}>
                {vCurrent}
              </span>
              <span fg={t.textFaint}> — latest</span>
            </text>
          </PopupRow>
          <PopupRow w={iw}>
            <text bg={bg}>
              <span fg={t.textMuted}>
                {"  "}
                {icon("wrench")} Via{" "}
              </span>
              <span fg={t.textSecondary}>{installMethod}</span>
            </text>
          </PopupRow>
          <Gap w={iw} bg={bg} />
          <Hr w={iw} bg={bg} fg={t.textFaint} />
          <Gap w={iw} bg={bg} />
          <PopupRow w={iw}>
            <text bg={bg} fg={t.brandAlt} attributes={ITALIC}>
              {"  "}
              {quip}
            </text>
          </PopupRow>
          <Gap w={iw} bg={bg} />
          <Hr w={iw} bg={bg} fg={t.textFaint} />
          <PopupRow w={iw}>
            <text bg={bg} fg={t.textFaint}>
              {" "}
              [esc] close
            </text>
          </PopupRow>
        </box>
      </Overlay>
    );
  }

  // ── Info: update available ───────────────────────────────────────
  return (
    <Overlay>
      <box flexDirection="column" borderStyle="rounded" border borderColor={t.success} width={pw}>
        <Gap w={iw} bg={bg} />
        <PopupRow w={iw}>
          <text bg={bg}>
            <span fg={t.success} attributes={BOLD}>
              {" "}
              {ghostChar}{" "}
            </span>
            <span fg={t.success} attributes={BOLD}>
              {titleReady ? `${sparkle} Update Available` : garble("Update Available")}
            </span>
          </text>
        </PopupRow>
        <PopupRow w={iw}>
          <text bg={bg} fg={t.brandDim} attributes={DIM}>
            {"   "}
            {wispFrame}
          </text>
        </PopupRow>
        <Hr w={iw} bg={bg} fg={t.textFaint} />
        <Gap w={iw} bg={bg} />

        {/* Version info with icons */}
        <PopupRow w={iw}>
          <text bg={bg}>
            <span fg={t.textMuted}>
              {"  "}
              {icon("clock")} Current{" "}
            </span>
            <span fg={t.textPrimary}>{vCurrent}</span>
          </text>
        </PopupRow>
        <PopupRow w={iw}>
          <text bg={bg}>
            <span fg={t.textMuted}>
              {"  "}
              {sparkle} Latest{" "}
            </span>
            <span fg={t.success} attributes={BOLD}>
              {vLatest}
            </span>
          </text>
        </PopupRow>
        <PopupRow w={iw}>
          <text bg={bg}>
            <span fg={t.textMuted}>
              {"  "}
              {icon("wrench")} Via{" "}
            </span>
            <span fg={t.textSecondary}>{installMethod}</span>
          </text>
        </PopupRow>
        <Gap w={iw} bg={bg} />

        {/* Changelog */}
        {changelog.length > 0 && (
          <>
            <Hr w={iw} bg={bg} fg={t.textFaint} />
            <Gap w={iw} bg={bg} />
            <PopupRow w={iw}>
              <text bg={bg} fg={t.brandAlt} attributes={BOLD}>
                {"  "}Versions since yours
              </text>
            </PopupRow>
            <Gap w={iw} bg={bg} />
            <box
              flexDirection="column"
              height={Math.min(changelog.length, maxChangelog)}
              overflow="hidden"
            >
              {changelog.slice(0, maxChangelog).map((entry, i) => (
                <PopupRow key={String(i)} w={iw}>
                  <text bg={bg}>
                    <span fg={t.brand}>{"    ◆ "}</span>
                    <span fg={t.textSecondary}>{trunc(entry, iw - 10)}</span>
                  </text>
                </PopupRow>
              ))}
            </box>
            {changelog.length > maxChangelog && (
              <PopupRow w={iw}>
                <text bg={bg} fg={t.textFaint}>
                  {"      "}… and {changelog.length - maxChangelog} more
                </text>
              </PopupRow>
            )}
            <Gap w={iw} bg={bg} />
          </>
        )}

        {/* Upgrade command */}
        <Hr w={iw} bg={bg} fg={t.textFaint} />
        <Gap w={iw} bg={bg} />
        <PopupRow w={iw}>
          <text bg={bg} fg={t.textMuted}>
            {"  "}
            {icon("terminal")} Upgrade command
          </text>
        </PopupRow>
        <PopupRow w={iw}>
          <text bg={bg}>
            <span fg={t.textFaint}>
              {"    "}
              {arrowIc}{" "}
            </span>
            <span fg={t.brand} attributes={BOLD}>
              {trunc(upgradeCmd, iw - 10)}
            </span>
          </text>
        </PopupRow>
        <Gap w={iw} bg={bg} />

        {/* Footer */}
        <Hr w={iw} bg={bg} fg={t.textFaint} />
        <PopupRow w={iw}>
          <text bg={bg} truncate>
            {canAuto && (
              <>
                <span fg={t.success} attributes={BOLD}>
                  {" "}
                  {arrowIc} [u]
                </span>
                <span fg={t.textMuted}> upgrade</span>
                <span fg={t.textFaint}>{"  "}</span>
              </>
            )}
            <span fg={copied ? t.success : t.textFaint}>{copied ? " ✓ copied" : " [c] copy"}</span>
            <span fg={t.textFaint}>{"  "}</span>
            <span fg={t.textFaint}>[d] dismiss</span>
            <span fg={t.textFaint}>{"  "}</span>
            <span fg={t.textFaint}>[esc]</span>
          </text>
        </PopupRow>
      </box>
    </Overlay>
  );
}
