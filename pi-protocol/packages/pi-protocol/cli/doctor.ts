import { ensureProtocolFabric, getProtocolHostDiagnostics } from "../fabric.ts";
import type { ProtocolFabric } from "../types.ts";
import { getProtocolAgentSessionDiagnostics } from "../sdk/session-cache.ts";

export interface ProtocolDoctorReport {
  readonly schemaVersion: 1;
  readonly ok: boolean;
  readonly host?: ReturnType<typeof getProtocolHostDiagnostics>;
  readonly fabric: ReturnType<ProtocolFabric["diagnostics"]>;
  readonly audit: ReturnType<ProtocolFabric["auditDiagnostics"]>;
  readonly sessions: ReturnType<typeof getProtocolAgentSessionDiagnostics>;
  readonly issues: readonly { severity: "error" | "warning"; code: string; message: string }[];
}

export function diagnoseProtocolRuntime(fabric: ProtocolFabric = ensureProtocolFabric()): ProtocolDoctorReport {
  const host = getProtocolHostDiagnostics();
  const diagnostics = fabric.diagnostics();
  const audit = fabric.auditDiagnostics();
  const sessions = getProtocolAgentSessionDiagnostics();
  const issues: Array<{ severity: "error" | "warning"; code: string; message: string }> = [];
  if (!host) issues.push({ severity: "error", code: "HOST_ABI_MISSING", message: "Compatible protocol host ABI is not installed" });
  if (host && new Set(host.runtimeCopies.map((copy) => copy.packageVersion)).size > 1) issues.push({ severity: "error", code: "RUNTIME_VERSION_SPLIT", message: "Loaded protocol package copies disagree on version" });
  if (diagnostics.registrations.some((registration) => !registration.contractDigest || registration.generation < 1)) issues.push({ severity: "error", code: "REGISTRATION_ALIGNMENT", message: "Registration is missing generation or contract digest" });
  if (diagnostics.registrations.some((registration) => registration.draining && registration.inFlight === 0)) issues.push({ severity: "warning", code: "DRAIN_STALLED", message: "A registration is draining without in-flight calls" });
  if (audit.sinkFailures > 0 || audit.sinkDropped > 0) issues.push({ severity: "warning", code: "AUDIT_DEGRADED", message: `Audit sink failures=${audit.sinkFailures}, dropped=${audit.sinkDropped}` });
  if (audit.observerDropped > 0 || audit.observerFailures > 0) issues.push({ severity: "warning", code: "OBSERVER_DEGRADED", message: `Observer failures=${audit.observerFailures}, dropped=${audit.observerDropped}` });
  return Object.freeze({
    schemaVersion: 1,
    ok: !issues.some((issue) => issue.severity === "error"),
    ...(host ? { host } : {}),
    fabric: diagnostics,
    audit,
    sessions,
    issues: Object.freeze(issues.map((issue) => Object.freeze({ ...issue }))),
  });
}

export async function runDoctorCli(argv = process.argv.slice(2)): Promise<number> {
  const report = diagnoseProtocolRuntime();
  if (argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`${report.ok ? "PASS" : "FAIL"} Pi Protocol runtime doctor`);
    console.log(`  host ABI: ${report.host?.abiVersion ?? "missing"}`);
    console.log(`  runtime copies: ${report.host?.runtimeCopies.length ?? 0}`);
    console.log(`  registrations: ${report.fabric.registrations.length}`);
    console.log(`  admission: ${report.fabric.admission.active} active / ${report.fabric.admission.queued} queued`);
    console.log(`  sessions: ${report.sessions.sessionCount}`);
    for (const issue of report.issues) console.log(`  ${issue.severity.toUpperCase()} ${issue.code}: ${issue.message}`);
  }
  return report.ok ? 0 : 1;
}
