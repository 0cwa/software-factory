import type { ProtocolFabric, ProtocolHandler } from "@kybernetria/pi-protocol/core";
import { MANAGEMENT_OUTPUT_MAX_BYTES } from "../config.ts";
import { PipelineError } from "../errors.ts";
import type { PipelineService } from "../pipeline/service.ts";
import { catalogProvides, describeTarget, type CatalogFilter } from "./catalog.ts";

export function createManagementHandlers(fabric: ProtocolFabric, service: PipelineService, nodeId: string): Record<string, ProtocolHandler> {
  return {
    catalog: async (input) => bound(catalogProvides(fabric, nodeId, asRecord(input) as CatalogFilter)),
    describe_target: async (input) => {
      const target = requiredString(asRecord(input), "target");
      const description = describeTarget(fabric, nodeId, target);
      if (!description) throw new PipelineError("DEPENDENCY_NOT_FOUND", `target is not registered: ${target}`);
      return bound(description);
    },
    validate_pipeline: async (input) => bound(await service.validate(asRecord(input).spec)),
    save_pipeline: async (input) => {
      const request = asRecord(input);
      return bound(await service.save(request.spec, { allowRuntimeOnly: request.allowRuntimeOnly === true }));
    },
    get_pipeline: async (input) => {
      const id = requiredString(asRecord(input), "id");
      const pipeline = service.get(id);
      if (!pipeline) throw new PipelineError("PIPELINE_NOT_FOUND", `pipeline not found: ${id}`);
      return bound(pipeline);
    },
    list_pipelines: async () => bound({ pipelines: service.list() }),
    delete_pipeline: async (input) => {
      const request = asRecord(input);
      return bound(await service.delete(requiredString(request, "id"), request.confirm === true));
    },
    run_pipeline: async (input, context) => {
      const request = asRecord(input);
      const id = requiredString(request, "id");
      try {
        const result = await service.run(id, request.input, context);
        return bound({ status: "succeeded", output: result.output, details: result.details });
      } catch (error) {
        if (!(error instanceof PipelineError)) throw error;
        return bound({
          status: error.code === "PIPELINE_ABORTED" ? "aborted" : "failed",
          error: { code: error.code, message: stripCode(error.message) },
          details: error.details?.execution ?? error.details ?? {},
        });
      }
    },
    dry_run_mapping: async (input) => {
      const request = asRecord(input);
      return bound(await service.dryRun({
        ...(typeof request.id === "string" ? { id: request.id } : {}),
        ...(request.spec !== undefined ? { spec: request.spec } : {}),
        pipelineInput: request.pipelineInput,
        ...(isRecord(request.stepOutputs) ? { stepOutputs: request.stepOutputs } : {}),
      }));
    },
    reload_pipelines: async () => bound({ pipelines: await service.reload() }),
  };
}

function bound<T>(value: T): T | { truncated: true; totalBytes: number; preview: string } {
  let text: string;
  try {
    text = JSON.stringify(value);
  } catch (error) {
    throw new PipelineError("PIPELINE_INVALID", `management output is not serializable: ${error instanceof Error ? error.message : String(error)}`);
  }
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes <= MANAGEMENT_OUTPUT_MAX_BYTES) return value;
  return {
    truncated: true,
    totalBytes: bytes,
    preview: Buffer.from(text).subarray(0, MANAGEMENT_OUTPUT_MAX_BYTES - 256).toString("utf8"),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new PipelineError("PIPELINE_INVALID", "management input must be an object");
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: Record<string, unknown>, key: string): string {
  const selected = value[key];
  if (typeof selected !== "string" || !selected.trim()) throw new PipelineError("PIPELINE_INVALID", `${key} must be a non-empty string`);
  return selected;
}

function stripCode(message: string): string {
  return message.replace(/^\[[A-Z_]+\]\s*/, "");
}
