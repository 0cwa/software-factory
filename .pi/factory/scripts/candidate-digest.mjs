import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export const CANDIDATE_BASE_HEAD = "d527770";
export const CANDIDATE_EVIDENCE_PATH = ".pi/factory/evidence/standalone-live-v1.json";
export const CANDIDATE_UNRELATED_PREFIXES = Object.freeze(["pressure-loss-k-factor-research/"]);
export const CANDIDATE_ALLOWLIST = Object.freeze([
  "README.md",
  "package.json",
  "pnpm-lock.yaml",
  "docs/adr/0002-sf1-cli-application-boundary.md",
  ".pi/factory/README.md",
  ".pi/factory/package.json",
  ".pi/factory/prompts/plan-change-architect.md",
  ".pi/factory/prompts/plan-change-scout.md",
  ".pi/factory/prompts/protocol-awareness.md",
  ".pi/factory/provider/pi.agents.json",
  ".pi/factory/provider/pi-dev.protocol.json",
  ".pi/factory/provider/prompts/architect.md",
  ".pi/factory/provider/prompts/scout.md",
  ".pi/factory/provider/source-lock.json",
  ".pi/factory/scripts/build-provider.mjs",
  ".pi/factory/scripts/candidate-digest.mjs",
  ".pi/factory/scripts/evidence.mjs",
  ".pi/factory/scripts/provider-host.ts",
  ".pi/factory/scripts/verify-evidence.mjs",
  ".pi/factory/scripts/verify-provider.mjs",
  ".pi/factory/src/application.ts",
  ".pi/factory/src/catalog.ts",
  ".pi/factory/src/cli.ts",
  ".pi/factory/src/contracts.ts",
  ".pi/factory/src/environment.ts",
  ".pi/factory/src/handoff.ts",
  ".pi/factory/src/index.ts",
  ".pi/factory/src/pi-protocol-core.d.ts",
  ".pi/factory/src/production.ts",
  ".pi/factory/src/protocol.ts",
  ".pi/factory/src/runtime.ts",
  ".pi/factory/src/workflow.ts",
  ".pi/factory/test/application.test.mjs",
  ".pi/factory/test/evidence.test.mjs",
  ".pi/factory/test/package-shape.test.mjs",
  ".pi/factory/test/runtime.test.mjs",
  ".pi/factory/test/workflow.test.mjs",
  ".pi/factory/tsconfig.json",
  ".pi/factory/workflows/plan-change.json",
  CANDIDATE_EVIDENCE_PATH,
]);

export function isUnrelatedCandidatePath(path) {
  return CANDIDATE_UNRELATED_PREFIXES.some((prefix) => path === prefix.slice(0, -1) || path.startsWith(prefix));
}

export function unexpectedCandidatePaths(paths) {
  const allowed = new Set(CANDIDATE_ALLOWLIST);
  return [...new Set(paths)].filter((path) => !allowed.has(path) && !isUnrelatedCandidatePath(path)).sort();
}

function digest(bytes) { return `sha256:${createHash("sha256").update(bytes).digest("hex")}`; }
export async function candidateTreeDigest(repositoryRoot) {
  const rows = [];
  for (const path of [...CANDIDATE_ALLOWLIST].filter((candidate) => candidate !== CANDIDATE_EVIDENCE_PATH).sort()) {
    const bytes = await readFile(join(repositoryRoot, path));
    rows.push(Buffer.from(`F\0${path}\0${bytes.byteLength}\0`, "utf8"), bytes, Buffer.from("\0\n", "utf8"));
  }
  return digest(Buffer.concat(rows));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify({ baseHead: CANDIDATE_BASE_HEAD, allowlist: CANDIDATE_ALLOWLIST, candidateTreeDigest: await candidateTreeDigest(resolve(new URL("../../..", import.meta.url).pathname)) }, null, 2));
}
