import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { ensureProtocolFabric } from "@kybernetria/pi-protocol/core";
export default async function piPipelineEngineExtension(pi: ExtensionAPI): Promise<void> {
  let PipelineService: typeof import("./src/pipeline/service.ts").PipelineService;
  let registerManagementNode: typeof import("./src/protocol/registration.ts").registerManagementNode;
  try {
    ({ PipelineService } = await import("./src/pipeline/service.ts"));
    ({ registerManagementNode } = await import("./src/protocol/registration.ts"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("node:async_hooks") || !message.includes("Unsupported module specifier")) throw error;
    pi.registerCommand("pipeline-status", {
      description: "Show why the pipeline engine is unavailable in this host",
      handler: async (_args, ctx) => ctx.ui.notify("Pipeline engine is disabled: this host does not support node:async_hooks.", "warning"),
    });
    return;
  }

  const fabric = ensureProtocolFabric();
  const service = new PipelineService(fabric);
  const managementRegistration = registerManagementNode(fabric, service);
  try {
    await service.initialize();
  } catch (error) {
    await managementRegistration.dispose();
    await service.dispose();
    throw error;
  }
  pi.on("session_shutdown", async () => {
    await service.dispose();
    await managementRegistration.dispose();
  });
}
