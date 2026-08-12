import type { CapabilityDispatchResult, CapabilityInvocation, CapabilityPort, Diagnostic } from "./contracts.js";

export const PROVIDER_HOST_BLOCKER =
  "Production provider host/bootstrap is unavailable: Pi Protocol v4.0.0 exposes ./core as TypeScript, which plain Node cannot import. Resolve Kybernetria/pi-protocol#5 (https://github.com/Kybernetria/pi-protocol/issues/5) or embed the CLI with an injected host composition. The standalone CLI never enables a fake provider.";

export function providerHostUnavailableDiagnostic(): Diagnostic {
  return { code: "provider.host-unavailable", message: PROVIDER_HOST_BLOCKER, severity: "error" };
}

/**
 * The standalone package deliberately has no provider bootstrap. A host may
 * compose the application with an injected CapabilityPort instead.
 */
export function loadProductionCapabilityPort(): CapabilityPort {
  throw new Error(PROVIDER_HOST_BLOCKER);
}

export function createUnavailableCapabilityPort(): CapabilityPort {
  return {
    async dispatch(_target: CapabilityInvocation["target"], _invocation: CapabilityInvocation): Promise<CapabilityDispatchResult> {
      throw new Error(PROVIDER_HOST_BLOCKER);
    },
  };
}
