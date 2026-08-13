import { randomUUID } from "node:crypto";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { ensureProtocolFabric, type InvokeAsOptions, type InvokeTrackedResult, type ProtocolFabric, type ProtocolPrincipal } from "@kybernetria/pi-protocol/core";
import { parseProtocolManifest } from "@kybernetria/pi-protocol/contract";
import type { ProtocolDefinition, ProtocolRegistration, ProtocolGrant } from "@kybernetria/pi-protocol/core";
import { createAgentExecutors } from "@factory/pi-dev-agents";
import { protocolDefinition } from "@factory/pi-dev-manifest";
import projectedManifest from "@factory/projected-manifest" with { type: "json" };

const NODE_ID = "pi_dev";
const WORKER_MARKER = "factory-provider-worker-v1";
const MAX_IPC_MESSAGE_BYTES = 512 * 1024;
const WORKER_READY_TIMEOUT_MS = 30_000;
const WORKER_DISPOSE_TIMEOUT_MS = 5_000;

type WorkerRequest =
  | { readonly type: "invoke"; readonly id: string; readonly principal: ProtocolPrincipal; readonly target: string; readonly input: unknown; readonly grant: ProtocolGrant; readonly deadline?: number }
  | { readonly type: "cancel"; readonly id: string }
  | { readonly type: "dispose"; readonly id: string };
type WorkerResponse =
  | { readonly type: "ready"; readonly registrationId: string; readonly contractDigest: string; readonly fullContractDigest: string }
  | { readonly type: "result"; readonly id: string; readonly result: InvokeTrackedResult }
  | { readonly type: "disposed"; readonly id: string }
  | { readonly type: "error"; readonly id?: string; readonly message: string };

function assertIpcSize(value: unknown): void {
  const bytes = Buffer.byteLength(JSON.stringify(value), "utf8");
  if (bytes > MAX_IPC_MESSAGE_BYTES) throw new Error("Provider IPC message exceeds its bounded size");
}

async function createWorkerRuntime(cwd: string, agentDir?: string): Promise<{ fabric: ProtocolFabric; registration: ProtocolRegistration; fullContractDigest: string }> {
  const definition = parseProtocolManifest(JSON.stringify(projectedManifest)) as ProtocolDefinition;
  if (definition.manifest.node.id !== NODE_ID) throw new Error("Projected Pi-Dev provider node identity is invalid");
  const fabric = ensureProtocolFabric({ defaultDeadlineMs: 300_000, maxConcurrentInvocations: 2, maxQueuedInvocations: 2 });
  const executors = createAgentExecutors(cwd, agentDir);
  const registration = fabric.install(definition, {
    agents: { scout: executors.scout, architect: executors.architect },
  }, {
    packageId: "pi-dev",
    packageVersion: "67f46824b44605093c8b945e50d7ad499d04c060",
    sourcePath: "archive://Kybernetria/pi-dev@67f46824b44605093c8b945e50d7ad499d04c060",
    buildId: "pi-dev-67f46824b44605093c8b945e50d7ad499d04c060-protocol-v4.0.0",
  });
  const registered = fabric.registry().nodes.find((node) => node.nodeId === NODE_ID);
  if (!registered || registered.provides.length !== 2 || registered.provides.some((provide) => !["scout", "architect"].includes(provide.name))) {
    await registration.dispose();
    throw new Error("Pi-Dev deployment registration is not the exact scout/architect projection");
  }
  return { fabric, registration, fullContractDigest: protocolDefinition.contractDigest };
}

async function runWorker(): Promise<void> {
  if (!parentPort) throw new Error("Provider worker has no parent port");
  const cwd = typeof workerData?.cwd === "string" ? workerData.cwd : process.cwd();
  const agentDir = typeof workerData?.agentDir === "string" ? workerData.agentDir : undefined;
  let runtime: Awaited<ReturnType<typeof createWorkerRuntime>> | undefined;
  const cancellations = new Map<string, AbortController>();
  try {
    runtime = await createWorkerRuntime(cwd, agentDir);
    parentPort.postMessage({ type: "ready", registrationId: runtime.registration.registrationId, contractDigest: runtime.registration.contractDigest, fullContractDigest: runtime.fullContractDigest } satisfies WorkerResponse);
    parentPort.on("message", async (message: WorkerRequest) => {
      try {
        assertIpcSize(message);
        if (message.type === "cancel") {
          cancellations.get(message.id)?.abort();
          return;
        }
        if (message.type === "dispose") {
          await runtime?.registration.dispose();
          parentPort?.postMessage({ type: "disposed", id: message.id } satisfies WorkerResponse);
          return;
        }
        const controller = new AbortController();
        cancellations.set(message.id, controller);
        try {
          const principal = runtime!.fabric.mintPrincipal(message.principal.id, message.principal.kind);
          const result = await runtime!.fabric.invokeAs(principal, message.target, message.input, { grant: message.grant, ...(message.deadline === undefined ? {} : { deadline: message.deadline }), signal: controller.signal });
          assertIpcSize(result);
          parentPort?.postMessage({ type: "result", id: message.id, result } satisfies WorkerResponse);
        } finally {
          cancellations.delete(message.id);
        }
      } catch (error) {
        parentPort?.postMessage({ type: "error", id: "id" in message ? message.id : undefined, message: error instanceof Error ? error.message : String(error) } satisfies WorkerResponse);
      }
    });
  } catch (error) {
    parentPort.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) } satisfies WorkerResponse);
  }
}

interface WorkerFabric extends Pick<ProtocolFabric, "mintPrincipal" | "invokeAs"> {
  requestDispose(): Promise<void>;
  terminate(): Promise<void>;
  registrationId: string;
  contractDigest: string;
  fullContractDigest: string;
}

async function createWorkerFabric(cwd: string, agentDir?: string): Promise<WorkerFabric> {
  const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { marker: WORKER_MARKER, cwd, ...(agentDir ? { agentDir } : {}) } });
  const pending = new Map<string, { resolve(value: InvokeTrackedResult): void; reject(error: unknown): void; cancelled: boolean }>();
  let readyResolve!: (value: WorkerFabric) => void;
  let readyReject!: (error: unknown) => void;
  let ready = false;
  let startupFailed = false;
  const readyPromise = new Promise<WorkerFabric>((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const failPending = (error: Error): void => {
    if (!ready) {
      startupFailed = true;
      readyReject(error);
    }
    for (const [id, entry] of pending) {
      pending.delete(id);
      if (!entry.cancelled) entry.reject(error);
    }
  };
  worker.on("message", (message: WorkerResponse) => {
    try { assertIpcSize(message); } catch (error) { failPending(error instanceof Error ? error : new Error(String(error))); return; }
    if (message.type === "ready") {
      if (startupFailed) return;
      ready = true;
      const fabric: WorkerFabric = {
        registrationId: message.registrationId,
        contractDigest: message.contractDigest,
        fullContractDigest: message.fullContractDigest,
        mintPrincipal: (id, kind) => ({ id, kind }),
        invokeAs: (principal, target, input, options = {}) => {
          const id = randomUUID();
          const entry = { cancelled: false, resolve: undefined as unknown as (value: InvokeTrackedResult) => void, reject: undefined as unknown as (error: unknown) => void };
          const result = new Promise<InvokeTrackedResult>((resolve, reject) => { entry.resolve = resolve; entry.reject = reject; });
          pending.set(id, entry);
          const cancel = () => {
            if (entry.cancelled) return;
            entry.cancelled = true;
            try { worker.postMessage({ type: "cancel", id } satisfies WorkerRequest); } catch { /* worker loss is handled below */ }
            entry.resolve({ ok: false, error: { code: "OUTCOME_UNKNOWN", message: "Provider invocation was cancelled after dispatch" }, receipt: undefined } as InvokeTrackedResult);
            pending.delete(id);
          };
          if (options.signal?.aborted) cancel();
          else options.signal?.addEventListener("abort", cancel, { once: true });
          try {
            assertIpcSize({ type: "invoke", id, principal, target, input, grant: options.grant, deadline: options.deadline });
            worker.postMessage({ type: "invoke", id, principal, target, input, grant: options.grant, ...(options.deadline === undefined ? {} : { deadline: options.deadline }) } satisfies WorkerRequest);
          } catch (error) {
            options.signal?.removeEventListener("abort", cancel);
            pending.delete(id);
            entry.reject(error);
          }
          return result.finally(() => options.signal?.removeEventListener("abort", cancel));
        },
        async requestDispose() {
          const id = randomUUID();
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("Provider worker disposal deadline exceeded")), WORKER_DISPOSE_TIMEOUT_MS);
            const listener = (response: WorkerResponse): void => {
              if (response.type !== "disposed" || response.id !== id) return;
              clearTimeout(timer);
              worker.off("message", listener);
              resolve();
            };
            worker.on("message", listener);
            try { worker.postMessage({ type: "dispose", id } satisfies WorkerRequest); }
            catch (error) { clearTimeout(timer); worker.off("message", listener); reject(error); }
          });
        },
        async terminate() {
          try { await worker.terminate(); } finally { failPending(new Error("Provider worker terminated")); }
        },
      };
      readyResolve(fabric);
      return;
    }
    if (message.type === "result") {
      const entry = pending.get(message.id);
      if (!entry || entry.cancelled) return;
      pending.delete(message.id);
      entry.resolve(message.result);
      return;
    }
    if (message.type === "error") {
      if (message.id) {
        const entry = pending.get(message.id);
        if (entry && !entry.cancelled) { pending.delete(message.id); entry.reject(new Error(message.message)); }
      } else failPending(new Error(message.message));
    }
  });
  worker.on("error", (error) => failPending(error));
  worker.on("exit", (code) => {
    if (!ready) failPending(new Error(`Provider worker exited before readiness with code ${code}`));
    else if (code !== 0) failPending(new Error(`Provider worker exited with code ${code}`));
  });
  const timeout = setTimeout(() => failPending(new Error("Provider worker readiness deadline exceeded")), WORKER_READY_TIMEOUT_MS);
  try { return await readyPromise; } finally {
    clearTimeout(timeout);
    if (!ready) {
      worker.removeAllListeners("message");
      worker.removeAllListeners("error");
      worker.removeAllListeners("exit");
      await worker.terminate();
      pending.clear();
    }
  }
}

export interface ProductionProviderHost {
  readonly fabric: Pick<ProtocolFabric, "mintPrincipal" | "invokeAs">;
  readonly registrationId: string;
  readonly contractDigest: string;
  readonly fullContractDigest: string;
  dispose(): Promise<void>;
}

export async function createProductionProviderHost(options: { cwd: string; agentDir?: string }): Promise<ProductionProviderHost> {
  const worker = await createWorkerFabric(options.cwd, options.agentDir);
  let disposed = false;
  return {
    fabric: worker,
    registrationId: worker.registrationId,
    contractDigest: worker.contractDigest,
    fullContractDigest: worker.fullContractDigest,
    async dispose() {
      if (disposed) return;
      disposed = true;
      try { /* The worker's registration owns all sessions and is disposed before termination. */
        await worker.requestDispose();
      } finally { await worker.terminate(); }
    },
  };
}

if (!isMainThread && workerData?.marker === WORKER_MARKER) void runWorker();
