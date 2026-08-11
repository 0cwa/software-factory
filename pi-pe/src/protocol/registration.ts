import { fileURLToPath } from "node:url";
import type { ProtocolFabric, ProtocolRegistration } from "@kybernetria/pi-protocol/core";
import type { PipelineService } from "../pipeline/service.ts";
import { createManagementHandlers } from "./handlers.ts";
import { loadManagementProtocol } from "./manifest.ts";

export function registerManagementNode(fabric: ProtocolFabric, service: PipelineService): ProtocolRegistration {
  const definition = loadManagementProtocol();
  return fabric.install(definition, {
    handlers: createManagementHandlers(fabric, service, definition.manifest.node.id),
  }, {
    packageId: "pi-pe",
    packageVersion: "0.1.0",
    sourcePath: fileURLToPath(new URL("../..", import.meta.url)),
  });
}
