import { getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Text, truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { normalizeProtocolToolInput } from "./actions.ts";
import type { ProtocolToolInput, ProtocolToolThemeLike } from "./types.ts";
import type { ProtocolViewModel } from "./view-model.ts";

export function renderProtocolCall(
  input: ProtocolToolInput,
  theme: ProtocolToolThemeLike,
  previous?: unknown,
): Text {
  let prepared: ProtocolToolInput;
  try { prepared = normalizeProtocolToolInput(input); } catch { prepared = { op: "list" }; }
  const op = prepared.op ?? (prepared.target ? "call" : "list");
  const suffix = prepared.target ? ` ${prepared.target.slice(0, 256)}` : prepared.query ? ` ${prepared.query.slice(0, 240)}` : "";
  const session = prepared.session?.id ? ` [${prepared.session.id.slice(0, 128)} ${prepared.session.mode ?? "ephemeral"}]` : "";
  const text = theme.fg("toolTitle", theme.bold("protocol ")) + theme.fg("accent", op) + theme.fg("muted", `${suffix}${session}`);
  if (previous instanceof Text) { previous.setText(text); return previous; }
  return new Text(text, 0, 0);
}

export function renderProtocolViewModel(
  view: ProtocolViewModel,
  theme: ProtocolToolThemeLike,
  options: { expanded?: boolean },
  previous?: unknown,
): Container {
  if (previous instanceof ProtocolViewComponent) {
    previous.setView(view, theme, Boolean(options.expanded));
    return previous;
  }
  return new ProtocolViewComponent(view, theme, Boolean(options.expanded));
}

class ProtocolViewComponent extends Container {
  private view: ProtocolViewModel;
  private theme: ProtocolToolThemeLike;
  private expanded: boolean;

  constructor(view: ProtocolViewModel, theme: ProtocolToolThemeLike, expanded: boolean) {
    super();
    this.view = view;
    this.theme = theme;
    this.expanded = expanded;
    this.rebuild();
  }

  setView(view: ProtocolViewModel, theme: ProtocolToolThemeLike, expanded: boolean): void {
    if (this.view === view && this.theme === theme && this.expanded === expanded) return;
    this.view = view;
    this.theme = theme;
    this.expanded = expanded;
    this.rebuild();
  }

  override render(width: number): string[] {
    const safeWidth = Math.max(1, width);
    return super.render(safeWidth).flatMap((line) =>
      wrapTextWithAnsi(line, safeWidth).map((wrapped) => truncateToWidth(wrapped, safeWidth, ""))
    );
  }

  override invalidate(): void {
    super.invalidate();
    this.rebuild();
  }

  private rebuild(): void {
    this.clear();
    const { view, theme } = this;
    if (view.kind === "discovery") {
      this.addChild(new Text(view.body ?? "", 0, 0));
      return;
    }

    const status = statusPresentation(view.state);
    const target = view.target ?? "protocol capability";
    this.addChild(new Text(
      `${theme.fg(status.color, status.icon)} ${theme.fg("accent", target)}${view.state ? theme.fg("muted", ` ${view.state.replace("_", " ")}`) : ""}`,
      0,
      0,
    ));
    if (view.state === "outcome_unknown") {
      this.addChild(new Text(theme.fg("warning", "Effects may have occurred; inspect the receipt before retrying."), 0, 0));
    }
    if (this.expanded && (view.trace.length > 1 || view.traceTruncated)) {
      this.addChild(new Text(theme.fg("toolTitle", theme.bold("causal calls")), 0, 0));
      for (const row of view.trace) {
        const rowStatus = statusPresentation(row.status === "succeeded" ? "completed" : row.status);
        const duration = row.durationMs === undefined ? "" : ` ${row.durationMs}ms`;
        const caller = row.caller ? `${row.caller} → ` : "";
        this.addChild(new Text(
          `${"  ".repeat(row.depth)}${theme.fg(rowStatus.color, rowStatus.icon)} ${theme.fg("muted", caller)}${theme.fg("accent", row.target)}${theme.fg("muted", duration)}${row.errorCode ? theme.fg("error", ` ${row.errorCode}`) : ""}`,
          0,
          0,
        ));
      }
      if (view.traceTruncated) this.addChild(new Text(theme.fg("muted", "… causal trace truncated"), 0, 0));
    }
    if (this.expanded) for (const fact of view.executorFacts) {
      this.addChild(new Text(`${theme.fg("accent", "executor:")} ${theme.fg("muted", fact)}`, 0, 0));
    }
    if (view.progress) {
      this.addChild(new Text(theme.fg("muted", view.progress), 0, 0));
      if (view.progressTruncated) this.addChild(new Text(theme.fg("muted", "… progress truncated"), 0, 0));
    }
    if (view.output) {
      if (this.expanded && view.outputFormat === "markdown") {
        this.addChild(new Markdown(view.output, 0, 0, getMarkdownTheme()));
      } else {
        const prefix = this.expanded ? "" : theme.fg("muted", "output: ");
        this.addChild(new Text(`${prefix}${theme.fg("toolOutput", view.output)}`, 0, 0));
      }
    }
  }
}

function statusPresentation(state: ProtocolViewModel["state"] | "succeeded" | "failed" | "aborted"): {
  icon: string;
  color: string;
} {
  if (state === "completed" || state === "succeeded") return { icon: "✓", color: "success" };
  if (state === "failed") return { icon: "✗", color: "error" };
  if (state === "aborted" || state === "outcome_unknown") return { icon: state === "outcome_unknown" ? "?" : "■", color: "warning" };
  return { icon: "↗", color: "warning" };
}
