import assert from "node:assert/strict";
import test from "node:test";
import { assertNonConflictingPointers, getPointer, MISSING, parseJsonPointer, setPointer } from "../src/pipeline/pointers.ts";

test("RFC 6901 pointers resolve escapes, arrays, null, and missing values", () => {
  const value = { "a/b": { "~key": [null, "ok"] } };
  assert.equal(getPointer(value, "/a~1b/~0key/1"), "ok");
  assert.equal(getPointer(value, "/a~1b/~0key/0"), null);
  assert.equal(getPointer(value, "/a~1b/missing"), MISSING);
  assert.throws(() => parseJsonPointer("/bad~2escape"), /Malformed/);
  assert.throws(() => getPointer({ items: [] }, "/items/01"), /canonical/);
  assert.throws(() => getPointer({ items: [] }, "/items/0"), /outside bounds/);
  assert.throws(() => getPointer({ item: "text" }, "/item/nested"), /non-container/);
});

test("destination pointers construct nested objects and arrays", () => {
  const value: Record<string, unknown> = {};
  setPointer(value, "/items/0/name", "first");
  setPointer(value, "/items/1/name", "second");
  assert.deepEqual(value, { items: [{ name: "first" }, { name: "second" }] });
  assert.throws(() => setPointer({}, "/items/2", "sparse"), /outside/);
});

test("destination pointers reject pollution and conflicts", () => {
  for (const pointer of ["/__proto__/polluted", "/constructor/x", "/safe/prototype/x"]) {
    assert.throws(() => setPointer({}, pointer, true), /Unsafe/);
  }
  assert.throws(() => assertNonConflictingPointers(["/a", "/a"]), /Conflicting/);
  assert.throws(() => assertNonConflictingPointers(["/a", "/a/b"]), /Conflicting/);
  assert.doesNotThrow(() => assertNonConflictingPointers(["/a/b", "/a/c"]));
  assert.equal(({} as { polluted?: unknown }).polluted, undefined);
});
