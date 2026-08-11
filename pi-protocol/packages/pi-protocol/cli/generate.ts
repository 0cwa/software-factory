import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { parseProtocolManifest } from "../contract/index.ts";
import { generateProtocolTypes } from "./generator.ts";

export async function runGenerateCli(argv = process.argv.slice(2)): Promise<number> {
  const check = argv.includes("--check");
  const packageDir = resolve(positional(argv)[0] ?? process.cwd());
  const packageJson = JSON.parse(readBounded(join(packageDir, "package.json"), 1_048_576)) as { piProtocol?: { generated?: string } };
  const outputArg = option(argv, "--output") ?? packageJson.piProtocol?.generated ?? "protocol.generated.ts";
  const output = contained(packageDir, outputArg);
  const definition = parseProtocolManifest(readBounded(join(packageDir, "pi.protocol.json"), 1_048_576));
  const generated = generateProtocolTypes(definition);
  if (check) {
    let actual = "";
    try { actual = readBounded(output, 2_097_152); } catch { /* reported as drift */ }
    if (actual !== generated) { console.error(`Generated artifact drift: ${relative(packageDir, output)}`); return 1; }
  } else {
    atomicWrite(output, generated);
    console.log(`Generated ${relative(packageDir, output)} (${definition.contractDigest})`);
  }
  const catalogArg = option(argv, "--catalog");
  if (catalogArg) {
    const catalog = contained(packageDir, catalogArg);
    const source = `${JSON.stringify({
      schemaVersion: 1,
      node: definition.manifest.node,
      contractDigest: definition.contractDigest,
      provides: definition.manifest.provides.map((provide) => ({ name: provide.name, description: provide.description, tags: provide.tags ?? [], effects: provide.effects ?? [] })),
    }, null, 2)}\n`;
    if (check) {
      let actual = "";
      try { actual = readBounded(catalog, 2_097_152); } catch { /* reported as drift */ }
      if (actual !== source) { console.error(`Generated catalog drift: ${relative(packageDir, catalog)}`); return 1; }
    } else atomicWrite(catalog, source);
  }
  return 0;
}

function positional(argv: string[]): string[] {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index++) {
    if (["--output", "--catalog"].includes(argv[index]!)) { index += 1; continue; }
    if (!argv[index]!.startsWith("--")) values.push(argv[index]!);
  }
  return values;
}
function option(argv: string[], name: string): string | undefined { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : undefined; }
function contained(root: string, path: string): string {
  if (!path || path.length > 512 || isAbsolute(path)) throw new Error(`${path || "output"} must be a bounded relative path`);
  const target = resolve(root, path);
  const rel = relative(root, target);
  if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("Generated output escapes package directory");
  return target;
}
function atomicWrite(path: string, source: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${crypto.randomUUID()}`;
  try { writeFileSync(temporary, source, { encoding: "utf8", flag: "wx" }); renameSync(temporary, path); }
  finally { try { rmSync(temporary); } catch { /* renamed or absent */ } }
}
function readBounded(path: string, maxBytes: number): string { const stat = statSync(path); if (!stat.isFile() || stat.size > maxBytes) throw new Error("Input exceeds size limit"); return readFileSync(path, "utf8"); }
