import { resolve } from "node:path";
import { checkProtocolPackage, checkProtocolTree } from "../conformance/index.ts";

export async function runCheckCli(argv = process.argv.slice(2)): Promise<number> {
  const recursive = argv.includes("--recursive");
  const json = argv.includes("--json");
  const paths = argv.filter((arg) => !arg.startsWith("--"));
  const targets = paths.length ? paths : [process.cwd()];
  const results = [];
  for (const target of targets) {
    const path = resolve(target);
    if (recursive) results.push(...await checkProtocolTree(path));
    else results.push(checkProtocolPackage(path));
  }
  if (json) console.log(JSON.stringify({ schemaVersion: 1, results }, null, 2));
  else for (const result of results) {
    console.log(`${result.ok ? "PASS" : "FAIL"} ${result.packageName ?? result.packageDir}`);
    for (const entry of result.issues) console.log(`  ${entry.severity.toUpperCase()} ${entry.code}: ${entry.message}`);
  }
  if (!results.length) { console.error("No protocol packages found"); return 1; }
  return results.every((result) => result.ok) ? 0 : 1;
}
