import type { ProtocolManifestV1 } from "@kybernetria/pi-protocol/contract";
import { parseProtocolManifest } from "@kybernetria/pi-protocol/contract";
import type { ProtocolFabric, ProtocolHandler, ProtocolRegistration } from "@kybernetria/pi-protocol/core";
import type { PipelineExecutor } from "../pipeline/execute.ts";
import { GENERATED_RUN_PROVIDE } from "../schemas.ts";
import type { PipelineRuntimeSnapshot } from "../types.ts";

export function registerGeneratedPipeline(
  fabric: ProtocolFabric,
  manifest: ProtocolManifestV1,
  snapshot: PipelineRuntimeSnapshot,
  executor: PipelineExecutor,
): ProtocolRegistration {
  const definition = parseProtocolManifest(manifest);
  return fabric.install(definition, bindings(snapshot, executor), {
    packageId: `pi-pe/generated/${snapshot.spec.id}`,
    packageVersion: snapshot.spec.version,
    buildId: definition.contractDigest,
  });
}

export async function replaceGeneratedPipeline(
  registration: ProtocolRegistration,
  manifest: ProtocolManifestV1,
  snapshot: PipelineRuntimeSnapshot,
  executor: PipelineExecutor,
): Promise<void> {
  await registration.replace(
    parseProtocolManifest(manifest),
    bindings(snapshot, executor),
  );
}

function bindings(snapshot: PipelineRuntimeSnapshot, executor: PipelineExecutor) {
  const handler: ProtocolHandler = async (input, context) => (await executor.execute(snapshot, input, context)).output;
  return { handlers: { [GENERATED_RUN_PROVIDE]: handler } };
}
