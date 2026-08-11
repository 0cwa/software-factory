import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { ensureProtocolFabric } from "./fabric.ts";
import { registerProtocolTool, type ProtocolToolRegistrationTarget } from "./tool/index.ts";

export default function protocolToolExtension(pi: ExtensionAPI): void {
  registerProtocolTool(pi as ProtocolToolRegistrationTarget, ensureProtocolFabric());
}
