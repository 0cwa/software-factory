import type { InvokeRequest, InvokeResult, ProtocolFabric } from "../../packages/pi-protocol/core/index.ts";

/** Test projection for assertions that do not inspect canonical receipts. */
export async function invokeResult(fabric: ProtocolFabric, request: InvokeRequest): Promise<InvokeResult> {
  return (await fabric.invokeTracked(request)).result;
}
