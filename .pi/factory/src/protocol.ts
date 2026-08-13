import type {
  InvocationReceiptSummary,
  InvokeAsOptions,
  InvokeTrackedResult,
  ProtocolFabric,
  ProtocolGrant,
  ProtocolPrincipal,
} from "@kybernetria/pi-protocol/core";
import type {
  CapabilityDispatchResult,
  CapabilityInvocation,
  CapabilityPort,
  Diagnostic,
} from "./contracts.js";

const FACTORY_PRINCIPAL_ID = "workflow:software-factory";
const FACTORY_PRINCIPAL_KIND = "agent" as const;
const CAPABILITY_TARGETS = new Set(["pi_dev.scout", "pi_dev.architect"]);
const SCOUT_EFFECTS = ["fs.read", "model.call"] as const;
const ARCHITECT_EFFECTS = ["fs.read", "model.call", "protocol.invoke"] as const;
const MAX_DIAGNOSTIC_CHARS = 256;

/** The deliberately small public surface required from a host Protocol fabric. */
export type PublicProtocolFabric = Pick<ProtocolFabric, "mintPrincipal" | "invokeAs">;

function diagnostic(code: string): Diagnostic {
  return {
    code: code.slice(0, MAX_DIAGNOSTIC_CHARS),
    message: `Pi Protocol invocation ${code.slice(0, MAX_DIAGNOSTIC_CHARS)}.`,
    severity: "error",
  };
}

function receiptFor(result: InvokeTrackedResult): InvocationReceiptSummary {
  return result.receipt;
}

function failureCode(result: Extract<InvokeTrackedResult, { ok: false }>): string {
  return typeof result.error.code === "string" && result.error.code.length > 0
    ? result.error.code
    : "EXECUTION_FAILED";
}

function mapResult(result: InvokeTrackedResult): CapabilityDispatchResult {
  if (result.ok) return { status: "succeeded", output: result.output, receipt: receiptFor(result) };

  const code = failureCode(result);
  if (code === "OUTCOME_UNKNOWN") {
    return { status: "outcome_unknown", diagnostics: [diagnostic(code)], receipt: receiptFor(result) };
  }
  return { status: "failed", diagnostics: [diagnostic(code)], receipt: receiptFor(result) };
}

export function createPiProtocolCapabilityPort(fabric: PublicProtocolFabric): CapabilityPort {
  const principal: ProtocolPrincipal = fabric.mintPrincipal(FACTORY_PRINCIPAL_ID, FACTORY_PRINCIPAL_KIND);

  return {
    async dispatch(target: CapabilityInvocation["target"], invocation: CapabilityInvocation): Promise<CapabilityDispatchResult> {
      if (!CAPABILITY_TARGETS.has(target)) throw new TypeError(`Unsupported Protocol target: ${target}`);
      const grant: ProtocolGrant = target === "pi_dev.architect"
        ? { targets: ["pi_dev.architect", "pi_dev.scout"], effects: ARCHITECT_EFFECTS, maxDepth: 4, maxInvocations: 16 }
        : { targets: ["pi_dev.scout"], effects: SCOUT_EFFECTS, maxDepth: 0, maxInvocations: 1 };
      const options: InvokeAsOptions = {
        grant,
        ...(invocation.signal ? { signal: invocation.signal } : {}),
        ...(invocation.deadline === undefined ? {} : { deadline: invocation.deadline }),
      };
      const result = await fabric.invokeAs(principal, target, invocation.input, options);
      return mapResult(result);
    },
  };
}
