import { createHash } from "node:crypto";

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
  return value;
}

export function canonicalEvidenceValue(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Evidence must be a JSON object");
  return sortValue({ ...value, evidenceDigest: "" });
}

export function canonicalEvidenceBytes(value) {
  return Buffer.from(JSON.stringify(canonicalEvidenceValue(value)), "utf8");
}

export function evidenceDigest(value) {
  return `sha256:${createHash("sha256").update(canonicalEvidenceBytes(value)).digest("hex")}`;
}
