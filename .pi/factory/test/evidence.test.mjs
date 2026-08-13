import assert from "node:assert/strict";
import test from "node:test";
import { canonicalEvidenceBytes, evidenceDigest } from "../scripts/evidence.mjs";
import { CANDIDATE_ALLOWLIST, CANDIDATE_EVIDENCE_PATH, unexpectedCandidatePaths } from "../scripts/candidate-digest.mjs";

test("evidence digest uses recursive key sorting and a blank self-field", () => {
  const left = { z: { b: 2, a: 1 }, a: [{ y: 2, x: 1 }], evidenceDigest: "old" };
  const right = { a: [{ x: 1, y: 2 }], z: { a: 1, b: 2 }, evidenceDigest: "different" };
  assert.deepEqual(canonicalEvidenceBytes(left), canonicalEvidenceBytes(right));
  assert.equal(evidenceDigest(left), evidenceDigest(right));
  assert.match(evidenceDigest(left), /^sha256:[a-f0-9]{64}$/);
});

test("candidate hygiene permits only the candidate allowlist and the pre-existing unrelated owner prefix", () => {
  assert.ok(CANDIDATE_ALLOWLIST.includes(CANDIDATE_EVIDENCE_PATH));
  assert.deepEqual(unexpectedCandidatePaths([
    "README.md",
    CANDIDATE_EVIDENCE_PATH,
    "pressure-loss-k-factor-research/new-source.pdf",
  ]), []);
  assert.deepEqual(unexpectedCandidatePaths([".pi/factory/unexpected.txt"]), [".pi/factory/unexpected.txt"]);
  assert.deepEqual(unexpectedCandidatePaths(["pressure-loss-k-factor-research", "unexpected.txt"]), ["unexpected.txt"]);
});
