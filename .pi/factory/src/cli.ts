#!/usr/bin/env node

import { createCliApplication, escapeHuman, EXIT_CODES, renderApplicationResult, type WorkflowView } from "./application.js";

interface ParsedCommand {
  readonly name: "show" | "validate" | "run" | "inspect" | "abandon";
  readonly request?: string | undefined;
  readonly runId?: string | undefined;
  readonly format: WorkflowView;
  readonly json: boolean;
}

function usageError(message: string): Error { return new Error(`${message}\nUsage: factory workflow show plan-change [--format text|mermaid|json] [--json]\n       factory workflow validate plan-change [--json]\n       factory run plan-change --request <text-or-file> [--json]\n       factory inspect <run-id> [--json]\n       factory abandon <run-id> [--json]`); }
function parse(argv: readonly string[]): ParsedCommand {
  const json = argv.includes("--json");
  const values = argv.filter((item) => item !== "--json");
  if (values[0] === "workflow" && values[2] === "plan-change") {
    if (values[1] !== "show" && values[1] !== "validate") throw usageError("Unknown workflow command");
    let format: WorkflowView = "text";
    for (let index = 3; index < values.length; index += 1) {
      if (values[1] !== "show" || values[index] !== "--format" || index + 1 >= values.length || !["text", "mermaid", "json"].includes(values[index + 1] as string)) throw usageError("Malformed workflow options");
      format = values[index + 1]! as WorkflowView;
      index += 1;
    }
    return { name: values[1] as "show" | "validate", format, json };
  }
  if (values[0] === "run" && values[1] === "plan-change") {
    if (values.length !== 4 || values[2] !== "--request" || values[3]!.length === 0) throw usageError("run requires exactly one --request value");
    return { name: "run", request: values[3]!, format: "text", json };
  }
  if (values[0] === "inspect" || values[0] === "abandon") {
    if (values.length !== 2 || values[1]!.length === 0) throw usageError(`${values[0]} requires exactly one run id`);
    return { name: values[0], runId: values[1]!, format: "text", json };
  }
  throw usageError("Unknown command");
}

async function main(): Promise<void> {
  const json = process.argv.slice(2).includes("--json");
  try {
    const command = parse(process.argv.slice(2));
    const abortController = new AbortController();
    const abort = () => abortController.abort();
    process.once("SIGINT", abort);
    process.once("SIGTERM", abort);
    const application = await createCliApplication(process.cwd(), abortController.signal);
    const result = command.name === "show"
      ? await application.showWorkflow(command.format)
      : command.name === "validate"
        ? await application.validateWorkflow()
        : command.name === "run"
          ? await application.runPlanChange(command.request as string)
          : command.name === "inspect"
            ? await application.inspectRun(command.runId as string)
            : await application.abandonRun(command.runId as string);
    process.removeListener("SIGINT", abort);
    process.removeListener("SIGTERM", abort);
    process.stdout.write(renderApplicationResult(result, command.json, command.format === "json" && !command.json));
    process.exitCode = result.exitCode;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Malformed command";
    const result = { command: "cli" as const, ok: false, exitCode: EXIT_CODES.usage, data: {}, diagnostics: [{ code: "cli.usage", message, severity: "error" as const }] };
    process.stdout.write(json ? `${JSON.stringify(result)}\n` : `${escapeHuman(message)}\n`);
    process.exitCode = EXIT_CODES.usage;
  }
}

await main();
