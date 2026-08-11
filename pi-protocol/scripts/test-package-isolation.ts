import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const temporaryRoot = await mkdtemp(join(tmpdir(), "pi-protocol-package-"));
try {
  const packed = await exec("npm", ["pack", "--workspace", "@kybernetria/pi-protocol", "--pack-destination", temporaryRoot, "--json"], {
    cwd: resolve("."),
    maxBuffer: 2_000_000,
  });
  const packResult = JSON.parse(packed.stdout) as Array<{ filename: string; files: Array<{ path: string }> }>;
  assert.equal(packResult.length, 1);
  const fileNames = new Set(packResult[0].files.map((item) => item.path));
  for (const required of ["index.ts", "core/index.ts", "contract/index.ts", "contract/manifest.schema.json", "conformance/index.ts", "cli/check.ts", "dist/pi-protocol.mjs", "package.json"]) {
    assert.ok(fileNames.has(required), `package tarball is missing ${required}`);
  }

  const tarball = join(temporaryRoot, packResult[0].filename);
  const consumer = join(temporaryRoot, "consumer");
  await mkdir(consumer);
  await writeFile(join(consumer, "package.json"), JSON.stringify({ private: true, type: "module" }));
  await exec("npm", ["install", tarball, "--ignore-scripts", "--omit=dev", "--no-audit", "--no-fund"], {
    cwd: consumer,
    maxBuffer: 2_000_000,
  });

  const installedPackage = JSON.parse(await readFile(join(consumer, "node_modules/@kybernetria/pi-protocol/package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
  };
  assert.equal(installedPackage.dependencies?.ajv, "8.18.0");
  await assertMissing(join(consumer, "node_modules/@earendil-works/pi-coding-agent/package.json"));
  await assertMissing(join(consumer, "node_modules/@earendil-works/pi-ai/package.json"));
  await assertMissing(join(consumer, "node_modules/@earendil-works/pi-tui/package.json"));

  await writeFile(join(consumer, "smoke.ts"), `
    import { createProtocolFabric } from "@kybernetria/pi-protocol/core";
    import { parseProtocolManifest } from "@kybernetria/pi-protocol/contract";
    import { STANDARD_EFFECTS } from "@kybernetria/pi-protocol";
    import { checkProtocolPackage } from "@kybernetria/pi-protocol/conformance";
    const definition = parseProtocolManifest({
      $schema: "https://pi.dev/protocol/manifest-v1.schema.json",
      schemaVersion: 1,
      node: { id: "isolated", purpose: "Isolated package smoke test." },
      provides: [{ name: "ping", description: "Ping.", inputSchema: { type: "null" }, outputSchema: { const: "pong" } }]
    });
    if (!definition.contractDigest.startsWith("sha256:")) throw new Error("missing digest");
    if (!definition.provides.ping.validateOutput("pong").valid) throw new Error("validator failed");
    if (STANDARD_EFFECTS.length !== 11) throw new Error("root contract export failed");
    if (!createProtocolFabric()) throw new Error("core import failed");
    if (typeof checkProtocolPackage !== "function") throw new Error("conformance import failed");
  `);
  const tsxLoader = pathToFileURL(resolve("node_modules/tsx/dist/loader.mjs")).href;
  await exec(process.execPath, ["--import", tsxLoader, "smoke.ts"], { cwd: consumer, maxBuffer: 2_000_000 });

  const fixture = join(consumer, "extension");
  await mkdir(fixture);
  await writeFile(join(fixture, "package.json"), JSON.stringify({
    name: "@tests/isolated-extension",
    version: "1.0.0",
    dependencies: { "@kybernetria/pi-protocol": "^4.0.0" },
    piProtocol: { generated: "protocol.generated.ts" },
  }));
  await writeFile(join(fixture, "pi.protocol.json"), JSON.stringify({
    $schema: "https://pi.dev/protocol/manifest-v1.schema.json",
    schemaVersion: 1,
    node: { id: "isolated_cli", purpose: "Isolated CLI smoke test." },
    provides: [{ name: "ping", description: "Ping.", inputSchema: { type: "null" }, outputSchema: { const: "pong" } }],
  }));
  const cli = join(consumer, "node_modules/.bin/pi-protocol");
  await exec(cli, ["generate", fixture], { cwd: consumer, maxBuffer: 2_000_000 });
  await exec(cli, ["check", fixture], { cwd: consumer, maxBuffer: 2_000_000 });
  await exec(join(consumer, "node_modules/.bin/pi-protocol-check"), [fixture], { cwd: consumer, maxBuffer: 2_000_000 });
  await exec(cli, ["doctor", "--json"], { cwd: consumer, maxBuffer: 2_000_000 });

  console.log("package tarball and isolated module-root smoke tests work without optional Pi peers");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

async function assertMissing(path: string): Promise<void> {
  try {
    await readFile(path, "utf8");
    assert.fail(`optional dependency unexpectedly installed: ${path}`);
  } catch (error) {
    if (error instanceof assert.AssertionError) throw error;
  }
}
