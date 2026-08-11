import assert from "node:assert/strict";
import { createProtocolFabric } from "../packages/pi-protocol/index.ts";
import { createProtocolTool } from "../packages/pi-protocol/tool/index.ts";
import type { ProtocolToolExecutionResult, ProtocolToolThemeLike } from "../packages/pi-protocol/tool/types.ts";

const ansiTheme: ProtocolToolThemeLike = {
  fg(_color, text) {
    return `\x1b[38;5;45m${text}\x1b[39m`;
  },
  bold(text) {
    return `\x1b[1m${text}\x1b[22m`;
  },
};

const longUrl = `https://search.example.test/result/${"very-long-unbroken-path-segment-".repeat(300)}`;
const fetchedText = [
  "## realistic search/fetch output",
  `   ${longUrl}`,
  ...Array.from({ length: 300 }, (_, index) => `Fetched paragraph ${index}: useful extracted content ${"detail ".repeat(12)}`),
].join("\n");

const baseEvent = {
  schemaVersion: 1 as const,
  invocationId: "invocation-renderer",
  traceId: "trace-renderer",
  spanId: "span-renderer",
  target: "pi-search-extension.fetch_content",
};
const details = {
  ok: true,
  schemaVersion: 1,
  op: "call",
  state: "completed",
  toolCallId: "protocol_completed_renderer_regression",
  result: {
    ok: true,
    nodeId: "pi-search-extension",
    provide: "fetch_content",
    output: { ok: true, isError: false, text: fetchedText },
  },
  trace: {
    events: [
      { ...baseEvent, eventId: "event-1", sequence: 1, type: "invocation.started", occurredAt: 1 },
      { ...baseEvent, eventId: "event-2", sequence: 2, type: "invocation.succeeded", occurredAt: 2, durationMs: 842 },
    ],
    executionEvents: [
      { schemaVersion: 1, type: "executor.session", traceId: "trace-renderer", spanId: "span-renderer", model: "provider/search-model", thinkingLevel: "high" },
      { schemaVersion: 1, type: "executor.output_delta", traceId: "trace-renderer", spanId: "span-renderer", textDelta: fetchedText },
    ],
  },
};
const result = {
  content: [{ type: "text", text: fetchedText }],
  details,
} as unknown as ProtocolToolExecutionResult;
const input = { target: "pi-search-extension.fetch_content", input: { url: longUrl } };
const before = JSON.stringify(result);
const tool = createProtocolTool(createProtocolFabric());

const boundedSearchCall = tool.renderCall?.({ op: "search", query: "query ".repeat(20_000) }, ansiTheme) as {
  render(width: number): string[];
};
assert.ok(boundedSearchCall.render(240).length <= 5, "oversized search calls have a source-line bound");
assert.ok(stripAnsi(boundedSearchCall.render(240).join("\n")).trimEnd().length <= 500, "oversized search query scalars are clipped");
const boundedCallerCall = tool.renderCall?.({
  target: `node.${"provide".repeat(20_000)}`,
  input: {},
}, ansiTheme) as { render(width: number): string[] };
assert.ok(stripAnsi(boundedCallerCall.render(240).join("\n")).trimEnd().length <= 2_000, "oversized caller scalars are clipped");

let component = tool.renderResult?.(result, { expanded: false, isPartial: false }, ansiTheme, { args: input }) as {
  render(width: number): string[];
};
const collapsedLines = component.render(80);
const collapsedText = stripAnsi(collapsedLines.join("\n"));
assert.ok(collapsedText.includes("pi-search-extension.fetch_content"), "collapsed rendering keeps trace target/status");
assert.ok(collapsedText.includes("output: ## realistic search/fetch output"), "collapsed rendering keeps an output preview");
assert.ok(collapsedLines.length <= 8, "collapsed rendering stays compact even with long fetched output");
assert.ok(collapsedText.length < 1_000, "collapsed rendering has a hard display bound");

const initialComponent = component;
const initialCollapsedLines = collapsedLines;
for (let index = 0; index < 250; index++) {
  component = tool.renderResult?.(result, { expanded: false, isPartial: false }, ansiTheme, {
    args: input,
    lastComponent: component,
  }) as typeof component;
  assert.equal(component, initialComponent, "rerenders reuse one mutable component");
  assert.deepEqual(component.render(80), initialCollapsedLines, "idempotent updates retain stable Pi-native output");
}

component = tool.renderResult?.(result, { expanded: true, isPartial: false }, ansiTheme, {
  args: input,
  lastComponent: component,
}) as typeof component;
const expandedLines = component.render(80);
const expandedText = stripAnsi(expandedLines.join("\n"));
assert.equal(component, initialComponent, "expanded rendering reuses the existing component");
assert.ok(expandedText.includes("pi-search-extension.fetch_content"));
assert.ok(expandedText.includes("provider/search-model (high)"), "expanded rendering preserves useful runtime trace data");
assert.ok(expandedText.includes("… [truncated]"), "expanded output reports its explicit bound");
assert.ok(expandedText.length < 25_000, "expanded rendering remains bounded after line wrapping");
const expandedSourceLines = component.render(240).map(stripAnsi);
assert.ok(expandedSourceLines.length <= 240, "the expanded source-line limit includes its truncation marker");
let finalOutputStart = -1;
for (let index = expandedSourceLines.length - 1; index >= 0; index--) {
  if (expandedSourceLines[index]?.includes("## realistic search/fetch output")) {
    finalOutputStart = index;
    break;
  }
}
assert.ok(finalOutputStart >= 0);
assert.ok(expandedSourceLines.length - finalOutputStart <= 120, "the output-specific line limit includes its truncation marker");

const crowdedResult = structuredClone(result) as ProtocolToolExecutionResult;
const crowdedDetails = crowdedResult.details as typeof details;
(crowdedDetails.trace as { events: Array<Record<string, unknown>> }).events = Array.from({ length: 80 }, (_, index) => ({
  schemaVersion: 1,
  eventId: `event-${index}`,
  sequence: index,
  type: "invocation.succeeded",
  occurredAt: index,
  invocationId: `invocation-${index}`,
  ...(index ? { parentInvocationId: `invocation-${index - 1}` } : {}),
  traceId: "trace-crowded",
  spanId: `span-${index}`,
  target: `nested-node-${index}.search`,
  durationMs: index,
}));
(crowdedDetails.trace as { executionEvents: Array<Record<string, unknown>> }).executionEvents = Array.from(
  { length: 300 },
  (_, index) => ({
    schemaVersion: 1,
    type: "executor.output_delta",
    traceId: "trace-crowded",
    spanId: "span-16",
    textDelta: `delta-${index} ${"y".repeat(200)}`,
  }),
);
const crowdedCollapsed = tool.renderResult?.(crowdedResult, { expanded: false, isPartial: false }, ansiTheme, { args: input }) as {
  render(width: number): string[];
};
const crowdedCollapsedText = stripAnsi(crowdedCollapsed.render(240).join("\n"));
assert.ok(crowdedCollapsedText.includes("output: ## realistic search/fetch output"), "trace truncation cannot hide collapsed output");
assert.ok(crowdedCollapsed.render(240).length <= 8, "collapsed source lines include truncation diagnostics in their bound");
const crowdedExpanded = tool.renderResult?.(crowdedResult, { expanded: true, isPartial: true }, ansiTheme, { args: input }) as {
  render(width: number): string[];
};
const crowdedExpandedText = stripAnsi(crowdedExpanded.render(240).join("\n"));
assert.ok(crowdedExpandedText.includes("progress truncated"), "global progress clipping is explicit");
assert.ok(crowdedExpandedText.includes("causal trace truncated"), "causal row clipping is explicit");

const firstExpandedLines = component.render(80);
for (let index = 0; index < 100; index++) {
  component = tool.renderResult?.(result, { expanded: true, isPartial: false }, ansiTheme, {
    args: input,
    lastComponent: component,
  }) as typeof component;
  assert.equal(component, initialComponent);
  assert.deepEqual(component.render(80), firstExpandedLines, "expanded rerenders do not append output or wrapped lines");
}
assert.equal(JSON.stringify(result), before, "rendering must not mutate canonical result details");

const cyclicResult = structuredClone(result) as ProtocolToolExecutionResult;
const cyclicDetails = cyclicResult.details as typeof details;
(cyclicDetails.trace as { events: Array<Record<string, unknown>> }).events = [{
  ...cyclicDetails.trace.events[1]!,
  invocationId: "cycle-invocation",
  parentInvocationId: "cycle-invocation",
}];
const cyclicComponent = tool.renderResult?.(cyclicResult, { expanded: true, isPartial: false }, ansiTheme, { args: input }) as {
  render(width: number): string[];
};
assert.ok(stripAnsi(cyclicComponent.render(80).join("\n")).includes("causal trace truncated"), "cyclic canonical traces terminate with a diagnostic");

console.log("protocol canonical call rendering is compact, bounded, immutable, and stable across rerenders");

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}
