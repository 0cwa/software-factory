declare module "@kybernetria/pi-protocol/core" {
  export type StandardProtocolEffect =
    | "fs.read" | "fs.write" | "db.read" | "db.write" | "network.read" | "network.send"
    | "process.spawn" | "model.call" | "protocol.invoke" | "external.transaction" | "system.configure";

  export interface ProtocolPrincipal {
    readonly id: string;
    readonly kind: "host" | "user" | "agent" | "system";
  }

  export interface ProtocolGrant {
    readonly targets: readonly string[];
    readonly effects?: readonly StandardProtocolEffect[];
    readonly maxDepth?: number;
    readonly maxInvocations?: number;
  }

  export interface InvokeAsOptions {
    readonly grant: ProtocolGrant;
    readonly deadline?: number;
    readonly signal?: AbortSignal;
  }

  export interface InvocationReceiptSummary {
    readonly schemaVersion: 1;
    readonly invocationId: string;
    readonly revision: number;
    readonly state: "requested" | "rejected" | "started" | "outcome_unknown" | "succeeded" | "failed" | "cancelled";
    readonly traceId: string;
    readonly spanId: string;
    readonly parentInvocationId?: string;
    readonly target: string;
    readonly registrationId?: string;
    readonly generation?: number;
    readonly contractDigest?: string;
    readonly requestedAt: number;
    readonly startedAt?: number;
    readonly endedAt?: number;
    readonly durationMs?: number;
    readonly outcomeCode?: string;
    readonly effectsMayHaveOccurred: boolean;
    readonly childInvocationIds: readonly string[];
    readonly externalAudit: "not_configured" | "pending" | "accepted" | "queued" | "failed" | "dropped";
  }

  export type InvokeTrackedResult =
    | { readonly ok: true; readonly output: unknown; readonly result: unknown; readonly receipt: InvocationReceiptSummary }
    | { readonly ok: false; readonly error: { readonly code: string; readonly message: string }; readonly result: unknown; readonly receipt: InvocationReceiptSummary };

  export interface ProtocolFabric {
    mintPrincipal(id: string, kind?: ProtocolPrincipal["kind"]): ProtocolPrincipal;
    invokeAs(principal: ProtocolPrincipal, target: string, input: unknown, options: InvokeAsOptions): Promise<InvokeTrackedResult>;
  }
}
