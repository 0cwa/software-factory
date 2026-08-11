import assert from "node:assert/strict";
import { createProtocolFabric } from "../packages/pi-protocol/core/index.ts";
import { createPiSdkAgentExecutor, type PiSdkAgentSessionLike } from "../packages/pi-protocol/sdk/index.ts";
import { createProtocolTool } from "../packages/pi-protocol/tool/index.ts";
import { installTestNode } from "./helpers/install-test-node.ts";

class StreamingSession implements PiSdkAgentSessionLike {
  readonly model = { provider: "fixture", id: "streamer" };
  readonly thinkingLevel = "medium";
  private listeners = new Set<(event: any) => void>();
  subscribe(listener: (event: any) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  async prompt(text: string): Promise<void> {
    for (const listener of this.listeners) listener({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: text } });
  }
  dispose(): void {}
}

const fabric = createProtocolFabric();
installTestNode(fabric, {
  node: {
    nodeId: "alpha_tool_projection",
    purpose: "Exercise canonical Pi projection",
    provides: [
      {
        name: "echo",
        description: "Echo text",
        inputSchema: { type: "object", required: ["text"], properties: { text: { type: "string" } }, additionalProperties: false },
        outputSchema: { type: "object", required: ["text"], properties: { text: { type: "string" } }, additionalProperties: false },
        execution: { type: "handler", handler: "echo" },
      },
      {
        name: "stream",
        description: "Stream text through a private agent",
        inputSchema: { type: "object", required: ["text"], properties: { text: { type: "string" } }, additionalProperties: false },
        outputSchema: { type: "string" },
        execution: { type: "agent", agent: "stream" },
      },
    ],
  },
  handlers: { echo: (input) => input },
  agentExecutors: {
    stream: createPiSdkAgentExecutor({
      createSession: () => new StreamingSession(),
      toPrompt: (input) => (input as { text: string }).text,
    }),
  },
});

const tool = createProtocolTool(fabric);
const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text };

const list = await tool.execute("list", { op: "list" });
assert.match(list.content[0]?.text ?? "", /alpha_tool_projection/);
assert.ok(!(list.content[0]?.text ?? "").includes("inputSchema"));

const node = await tool.execute("node", { op: "describe", target: "alpha_tool_projection" });
assert.match(node.content[0]?.text ?? "", /alpha_tool_projection\.echo/);
assert.ok(!(node.content[0]?.text ?? "").includes("inputSchema"));

const provide = await tool.execute("provide", { op: "describe", target: "alpha_tool_projection.echo" });
assert.match(provide.content[0]?.text ?? "", /inputSchema/);
assert.match(provide.content[0]?.text ?? "", /outputSchema/);

const called = await tool.execute("call", { target: "alpha_tool_projection.echo", input: { text: "hello" } });
assert.equal(called.content[0]?.text, "hello");
const details = called.details as any;
assert.equal(details.schemaVersion, 1);
assert.equal(details.op, "call");
assert.equal(details.action, undefined);
assert.equal(details.result.ok, true);
assert.match(details.receipt.invocationId, /^invocation_/);
assert.ok(details.trace.events.every((event: any) => event.schemaVersion === 1));
assert.ok(details.trace.events.every((event: any) => !("inputPreview" in event) && !("outputPreview" in event)));

const updates: any[] = [];
const streamed = await tool.execute(
  "stream",
  { target: "alpha_tool_projection.stream", input: { text: "streamed" } },
  undefined,
  (update) => updates.push(update),
);
assert.equal(streamed.content[0]?.text, "streamed");
assert.ok(updates.length >= 1);
assert.equal(updates[0].details.trace.executionEvents[0].type, "executor.session");
assert.ok(updates.some((update) => update.details.trace.executionEvents.some((event: any) => event.type === "executor.output_delta")));
assert.equal((streamed.details as any).trace.executionEvents[0].type, "executor.session");

const callComponent = tool.renderCall?.({ target: "alpha_tool_projection.echo", input: { text: "hello" } }, theme) as { render(width: number): string[] };
assert.match(callComponent.render(100).join("\n"), /protocol call alpha_tool_projection\.echo/);
const resultComponent = tool.renderResult?.(called, {}, theme, { args: { target: "alpha_tool_projection.echo" } }) as { render(width: number): string[] };
assert.match(resultComponent.render(100).join("\n"), /alpha_tool_projection\.echo/);
assert.match(resultComponent.render(100).join("\n"), /hello/);

const rejected = await tool.execute("old", { action: "invoke", request: {} } as never);
assert.match(rejected.content[0]?.text ?? "", /INVALID_REQUEST/);
assert.throws(() => tool.prepareArguments?.({ action: "registry" }), /unsupported fields/);

console.log("canonical Pi tool discovery, schema inspection, invocation, streaming, and rendering work");
