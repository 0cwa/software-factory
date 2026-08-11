import assert from "node:assert/strict";
import test from "node:test";
import { checkSchemaCompatibility } from "../src/pipeline/compatibility.ts";

test("primitive and numeric compatibility is directional", () => {
  assert.equal(checkSchemaCompatibility({ type: "string" }, { type: "string" }).kind, "compatible");
  assert.equal(checkSchemaCompatibility({ type: "integer" }, { type: "number" }).kind, "compatible");
  assert.equal(checkSchemaCompatibility({ type: "number" }, { type: "integer" }).kind, "incompatible");
  assert.equal(checkSchemaCompatibility({ type: "null" }, { type: "string" }).kind, "incompatible");
});

test("source enum must be a subset of destination enum", () => {
  assert.equal(checkSchemaCompatibility(
    { type: "string", enum: ["a"] },
    { type: "string", enum: ["a", "b"] },
  ).kind, "compatible");
  assert.equal(checkSchemaCompatibility(
    { type: "string", enum: ["a", "c"] },
    { type: "string", enum: ["a", "b"] },
  ).kind, "incompatible");
});

test("required objects and arrays are checked recursively", () => {
  assert.equal(checkSchemaCompatibility(
    { type: "object", required: ["x"], properties: { x: { type: "integer" } } },
    { type: "object", required: ["x"], properties: { x: { type: "number" } } },
  ).kind, "compatible");
  assert.equal(checkSchemaCompatibility(
    { type: "object", properties: { x: { type: "string" } } },
    { type: "object", required: ["x"], properties: { x: { type: "string" } } },
  ).kind, "incompatible");
  assert.equal(checkSchemaCompatibility(
    { type: "array", items: { type: "integer" } },
    { type: "array", items: { type: "number" } },
  ).kind, "compatible");
});

test("broad and generic schemas are runtime-only unknown", () => {
  assert.equal(checkSchemaCompatibility({}, { type: "string" }).kind, "unknown");
  assert.equal(checkSchemaCompatibility({ type: "object" }, { type: "object" }).kind, "unknown");
});
