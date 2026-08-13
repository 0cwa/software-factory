import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("..", import.meta.url);
const packageRoot = new URL("..", root);
const current = new URL("../dist/", import.meta.url);
const temp = await mkdtemp(join(tmpdir(), "factory-provider-verify-"));
const output = join(temp, "dist");
function digest(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
async function files(directory, prefix = "") {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...await files(path, relative));
    else if (entry.isFile()) result.push(relative);
    else throw new Error(`Provider output contains unsupported entry ${relative}`);
  }
  return result;
}
try {
  process.env.FACTORY_PROVIDER_OUTPUT_DIR = output;
  await import(new URL("../scripts/build-provider.mjs", import.meta.url));
  const expected = (await files(fileURLToPath(new URL("../dist/", import.meta.url)))).filter((path) => path.startsWith("provider-") || path.startsWith("provider-assets/"));
  const actual = await files(output);
  expected.sort(); actual.sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error(`Provider output file set differs: expected ${expected.join(",")}; actual ${actual.join(",")}`);
  for (const path of expected) {
    const left = await readFile(new URL(path, current));
    const right = await readFile(join(output, path));
    if (digest(left) !== digest(right) || !left.equals(right)) throw new Error(`Provider reproducibility mismatch for ${path}`);
  }
  const provenance = JSON.parse(await readFile(join(output, "provider-provenance.json"), "utf8"));
  if (Object.hasOwn(provenance, "generatedAt") || JSON.stringify(provenance).includes("/tmp/")) throw new Error("Provider provenance contains nondeterministic data");
  console.log(`provider verified: ${expected.length} deterministic files; bundle ${provenance.bundle.digest}`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
