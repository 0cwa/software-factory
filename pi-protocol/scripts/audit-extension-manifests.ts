import path from "node:path";
import { checkProtocolTree } from "../packages/pi-protocol/conformance/index.ts";

const rootArgument = process.argv[2];
if (!rootArgument) throw new Error("Usage: npm run audit:extensions -- /absolute/path/to/extensions");
const root = path.resolve(rootArgument);
const results = await checkProtocolTree(root);
for (const result of results) {
  console.log(`${result.ok ? "PASS" : "FAIL"} ${result.packageName ?? result.packageDir}`);
  for (const issue of result.issues) console.log(`  ${issue.severity.toUpperCase()} ${issue.code}: ${issue.message}`);
}
if (!results.length) {
  console.error(`FAIL No protocol extension packages found below ${root}`);
  process.exitCode = 1;
} else if (results.some((result) => !result.ok)) {
  process.exitCode = 1;
} else {
  console.log(`Verified ${results.length} recursively discovered protocol extension packages.`);
}
