import type { CapabilityDispatchResult, CapabilityInvocation, CapabilityPort, Diagnostic } from "./contracts.js";

export const PROVIDER_HOST_BLOCKER =
  "Production provider host/bootstrap failed: the project-local generated JavaScript Protocol/Pi-Dev host could not be started. The standalone CLI never enables a fake provider.";

export function providerHostUnavailableDiagnostic(error?: unknown): Diagnostic {
  const detail = error instanceof Error && error.message.trim() ? ` ${error.message.slice(0, 512)}` : "";
  return { code: "provider.host-unavailable", message: `${PROVIDER_HOST_BLOCKER}${detail}`, severity: "error" };
}

export interface DisposableCapabilityPort extends CapabilityPort { dispose(): Promise<void>; }

/** Load the generated project-local host. The host owns the real Protocol fabric and Pi-Dev registrations. */
export async function loadProductionCapabilityPort(options: { cwd: string; agentDir?: string }): Promise<DisposableCapabilityPort> {
  const module: any = await import(new URL("./provider-host.js", import.meta.url).href);
  const host = await module.createProductionProviderHost(options);
  const port: CapabilityPort = (await import("./protocol.js")).createPiProtocolCapabilityPort(host.fabric);
  let disposed = false;
  return {
    dispatch: port.dispatch,
    async dispose() {
      if (disposed) return;
      disposed = true;
      await host.dispose();
    },
  };
}

export function createUnavailableCapabilityPort(): CapabilityPort {
  return {
    async dispatch(_target: CapabilityInvocation["target"], _invocation: CapabilityInvocation): Promise<CapabilityDispatchResult> {
      throw new Error(PROVIDER_HOST_BLOCKER);
    },
  };
}
