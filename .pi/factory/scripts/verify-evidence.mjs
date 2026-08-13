import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { candidateTreeDigest, CANDIDATE_ALLOWLIST, CANDIDATE_BASE_HEAD, unexpectedCandidatePaths, CANDIDATE_EVIDENCE_PATH } from "./candidate-digest.mjs";
import { evidenceDigest } from "./evidence.mjs";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(new URL("../../..", import.meta.url).pathname);
async function gitPaths(args) {
  const result = await execFileAsync("git", args, { cwd: repositoryRoot, maxBuffer: 4 * 1024 * 1024, encoding: "utf8" });
  return result.stdout.split("\n").map((path) => path.trim()).filter(Boolean);
}
const changedPaths = [
  ...(await gitPaths(["diff", "--name-only", "--diff-filter=ACDMRTUXB", CANDIDATE_BASE_HEAD])),
  ...(await gitPaths(["ls-files", "--others", "--exclude-standard"])),
];
const unexpectedPaths = unexpectedCandidatePaths(changedPaths);
if (unexpectedPaths.length) throw new Error(`Unexpected candidate paths: ${unexpectedPaths.join(", ")}`);
const evidencePath = resolve(new URL("../evidence/standalone-live-v1.json", import.meta.url).pathname);
if (!changedPaths.includes(CANDIDATE_EVIDENCE_PATH)) throw new Error("Evidence self-file is not present in the working-tree path set");
const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
if (evidence.evidenceDigest !== evidenceDigest(evidence)) throw new Error("Evidence canonical digest mismatch");
if (evidence.git?.baseHead !== CANDIDATE_BASE_HEAD && evidence.git?.baseHead !== "d527770") throw new Error("Evidence is not bound to the approved base HEAD");
const actualCandidateDigest = await candidateTreeDigest(repositoryRoot);
if (evidence.candidateTreeDigest !== actualCandidateDigest) throw new Error(`Candidate tree digest mismatch: expected ${actualCandidateDigest}`);
if (JSON.stringify(evidence.candidateAllowlist) !== JSON.stringify(CANDIDATE_ALLOWLIST)) throw new Error("Evidence candidate allowlist differs from the verifier allowlist");
if (evidence.git?.head || evidence.git?.clean !== undefined) throw new Error("Evidence must not claim a temporary or clean Git head");
console.log(`evidence verified: ${evidence.evidenceId}; candidate ${actualCandidateDigest}`);
