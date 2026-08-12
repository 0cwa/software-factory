import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("exports the deployable package entry", async () => {
  const factory = await import("../dist/index.js");

  assert.equal(factory.FACTORY_PACKAGE_NAME, packageJson.name);
  assert.equal(factory.FACTORY_PACKAGE_VERSION, packageJson.version);
});

test("declares the production CLI entry points", () => {
  assert.deepEqual(packageJson.bin, { factory: "./dist/cli.js", "software-factory": "./dist/cli.js" });
  assert.deepEqual(packageJson.files, ["dist", "README.md", "workflows", "prompts"]);
});
