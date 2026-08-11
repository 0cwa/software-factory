import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { ensureProtocolFabric } from "@kybernetria/pi-protocol/core";
import { createAgentExecutors } from "./protocol/agents.ts";
import { MANIFEST_BASE_DIR, protocolDefinition } from "./src/runtime/manifest.ts";

export default function piDevExtension(pi: ExtensionAPI): void {
  const fabric = ensureProtocolFabric();
  const registration = fabric.install(protocolDefinition, {
    agents: createAgentExecutors(),
  }, {
    packageId: "pi-dev",
    packageVersion: "0.1.0",
    sourcePath: MANIFEST_BASE_DIR,
  });
  pi.on("session_shutdown", async () => { await registration.dispose(); });
}
