import { TextAttributes } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useCallback, useEffect, useState } from "react";
import { icon } from "../../core/icons.js";
import type { BackendProbeResult, HealthCheckResult } from "../../core/intelligence/router.js";
import { type ThemeTokens, useTheme } from "../../core/theme/index.js";
import { Popup, POPUP_BG, PopupRow, useSpinnerFrame } from "../layout/shared.js";

const CHROME_ROWS = 6;
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

interface Props {
  visible: boolean;
  onClose: () => void;
  runHealthCheck: (
    onProgress: (partial: HealthCheckResult) => void,
  ) => Promise<HealthCheckResult | null>;
}

function statusBadge(
  br: BackendProbeResult,
  running: boolean,
  spinnerCh: string,
  t: ThemeTokens,
): { ch: string; color: string } {
  if (!br.supports) return { ch: "○", color: t.textMuted };
  if (br.initError) return { ch: "✗", color: t.error };
  if (br.probes.length === 0 && running) return { ch: spinnerCh, color: t.amber };
  const allPass =
    br.probes.length > 0 &&
    br.probes.every((p) => p.status === "pass" || p.status === "unsupported");
  if (allPass) return { ch: "●", color: t.success };
  if (br.probes.some((p) => p.status === "pass")) return { ch: "◐", color: t.warning };
  if (br.probes.length === 0) return { ch: "◌", color: t.amber };
  return { ch: "✗", color: t.error };
}

interface Line {
  type: "header" | "probe" | "spacer" | "text";
  label?: string;
  desc?: string;
  color?: string;
  descColor?: string;
}

function buildLines(
  result: HealthCheckResult,
  running: boolean,
  spinnerCh: string,
  t: ThemeTokens,
): Line[] {
  const lines: Line[] = [];

  for (let bi = 0; bi < result.backends.length; bi++) {
    const br = result.backends[bi];
    if (!br) continue;
    const s = statusBadge(br, running, spinnerCh, t);

    if (bi > 0) lines.push({ type: "spacer" });

    lines.push({
      type: "header",
      label: `${s.ch} ${br.backend} (tier ${String(br.tier)})`,
      color: s.color,
    });

    if (!br.supports) {
      lines.push({
        type: "text",
        label: "  does not support this language",
        color: t.textMuted,
      });
    } else if (br.initError) {
      lines.push({
        type: "text",
        label: `  init failed: ${br.initError.slice(0, 50)}`,
        color: t.error,
      });
    } else if (br.probes.length === 0) {
      lines.push({ type: "text", label: "  waiting…", color: t.textMuted });
    } else {
      for (const probe of br.probes) {
        const pIcon =
          probe.status === "pass"
            ? "✓"
            : probe.status === "empty"
              ? "○"
              : probe.status === "unsupported"
                ? "—"
                : probe.status === "timeout"
                  ? "⏱"
                  : "✗";
        const pColor =
          probe.status === "pass"
            ? t.success
            : probe.status === "empty"
              ? t.warning
              : probe.status === "unsupported"
                ? t.textMuted
                : t.error;
        const timing = probe.ms !== undefined ? ` ${String(probe.ms)}ms` : "";
        const desc =
          probe.status === "error"
            ? `${pIcon} ${(probe.error ?? "").slice(0, 30)}`
            : `${pIcon} ${probe.status}${timing}`;
        lines.push({
          type: "probe",
          label: probe.operation,
          desc,
          color: t.textSecondary,
          descColor: pColor,
        });
      }
    }
  }

  return lines;
}

export function DiagnosePopup({ visible, onClose, runHealthCheck }: Props) {
  const { width: termCols, height: termRows } = useTerminalDimensions();
  const [result, setResult] = useState<HealthCheckResult | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useTheme();
  const spinnerFrame = useSpinnerFrame();

  const popupWidth = Math.min(64, Math.floor(termCols * 0.8));
  const innerW = popupWidth - 2;
  const labelW = 28;
  const spinnerCh = SPINNER[spinnerFrame % SPINNER.length] ?? "⠋";
  const containerRows = termRows - 2;
  const maxVisible = Math.max(6, Math.floor(containerRows * 0.8) - CHROME_ROWS);

  const lines = result ? buildLines(result, running, spinnerCh, t) : [];

  const run = useCallback(() => {
    setRunning(true);
    setError(null);
    setResult(null);
    setScrollOffset(0);

    const timeout = setTimeout(() => {
      setRunning(false);
      setError("Health check timed out");
    }, 90_000);

    runHealthCheck((partial) => {
      setResult({ ...partial });
    })
      .then((final) => {
        clearTimeout(timeout);
        setRunning(false);
        if (final) setResult(final);
        else if (!error) setError("Intelligence router not initialized");
      })
      .catch((err) => {
        clearTimeout(timeout);
        setRunning(false);
        setError(err instanceof Error ? err.message : String(err));
      });
  }, [runHealthCheck, error]);

  useEffect(() => {
    if (visible) run();
  }, [visible, run]);

  useKeyboard((evt) => {
    if (!visible) return;
    if (evt.name === "escape") {
      onClose();
      return;
    }
    if (evt.name === "up") {
      setScrollOffset((prev) => Math.max(0, prev - 1));
      return;
    }
    if (evt.name === "down") {
      setScrollOffset((prev) => Math.min(Math.max(0, lines.length - maxVisible), prev + 1));
      return;
    }
    if (evt.name === "r") run();
  });

  if (!visible) return null;

  return (
    <Popup
      width={popupWidth}
      title="Health Check"
      icon={icon("brain")}
      headerRight={
        <>
          {result ? (
            <text bg={POPUP_BG} fg={t.textMuted}>
              {"  "}
              {result.language} · {result.probeFile.split("/").pop()}
            </text>
          ) : null}
        </>
      }
      footer={[
        { key: "↑↓", label: "scroll" },
        { key: "r", label: "re-run" },
        { key: "esc", label: "close" },
      ]}
    >
      <box
        flexDirection="column"
        height={Math.min(Math.max(1, lines.length), maxVisible)}
        overflow="hidden"
      >
        {lines.length > 0 ? (
          lines.slice(scrollOffset, scrollOffset + maxVisible).map((line, vi) => {
            const key = String(vi + scrollOffset);
            switch (line.type) {
              case "header":
                return (
                  <PopupRow key={key} w={innerW}>
                    <text
                      bg={POPUP_BG}
                      fg={line.color ?? t.brandAlt}
                      attributes={TextAttributes.BOLD}
                    >
                      {line.label ?? ""}
                    </text>
                  </PopupRow>
                );
              case "probe":
                return (
                  <PopupRow key={key} w={innerW}>
                    <text bg={POPUP_BG} fg={line.color ?? t.textSecondary}>
                      {"  "}
                      {(line.label ?? "").padEnd(labelW).slice(0, labelW)}
                    </text>
                    <text bg={POPUP_BG} fg={line.descColor ?? t.textMuted}>
                      {line.desc ?? ""}
                    </text>
                  </PopupRow>
                );
              case "text":
                return (
                  <PopupRow key={key} w={innerW}>
                    <text bg={POPUP_BG} fg={line.color ?? t.textMuted}>
                      {line.label ?? ""}
                    </text>
                  </PopupRow>
                );
              case "spacer":
                return (
                  <PopupRow key={key} w={innerW}>
                    <text bg={POPUP_BG}>{""}</text>
                  </PopupRow>
                );
              default:
                return null;
            }
          })
        ) : (
          <PopupRow w={innerW}>
            <text bg={POPUP_BG} fg={error ? t.brandSecondary : t.amber}>
              {error ?? `${spinnerCh} initializing…`}
            </text>
          </PopupRow>
        )}
      </box>

      {lines.length > maxVisible && (
        <PopupRow w={innerW}>
          <text fg={t.textMuted} bg={POPUP_BG}>
            {scrollOffset > 0 ? "↑ " : "  "}
            {scrollOffset + 1}-{Math.min(scrollOffset + maxVisible, lines.length)}/{lines.length}
            {scrollOffset + maxVisible < lines.length ? " ↓" : ""}
          </text>
        </PopupRow>
      )}
    </Popup>
  );
}
