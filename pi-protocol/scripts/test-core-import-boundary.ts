import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import ts from "typescript";

const packageRoot = resolve("packages/pi-protocol");
const coreGraph = await collectRuntimeGraph(resolve(packageRoot, "core/index.ts"));
const rootGraph = await collectRuntimeGraph(resolve(packageRoot, "index.ts"));

for (const dependency of coreGraph.external) {
  assert.ok(!dependency.startsWith("@earendil-works/"), `core imports Pi coding-agent API: ${dependency}`);
  assert.ok(!dependency.startsWith("@mariozechner/"), `core imports Pi model/TUI API: ${dependency}`);
  assert.ok(!dependency.startsWith("ajv"), `core imports contract admission dependency: ${dependency}`);
  assert.ok(!dependency.startsWith("node:fs"), `core imports filesystem API: ${dependency}`);
}
for (const file of coreGraph.files) {
  assert.ok(!file.includes("/tool/"), `core reaches Pi tool code: ${file}`);
  assert.ok(!file.includes("/sdk/"), `core reaches Pi agent-session code: ${file}`);
  assert.ok(!file.endsWith("/extension.ts"), `core reaches Pi extension code: ${file}`);
  assert.ok(!file.endsWith("/contract/parse.ts") && !file.endsWith("/contract/validate.ts"), `core should not load Ajv manifest admission: ${file}`);
}
for (const dependency of rootGraph.external) {
  assert.ok(!dependency.startsWith("@earendil-works/"), `root eagerly imports Pi coding-agent API: ${dependency}`);
  assert.ok(!dependency.startsWith("@mariozechner/"), `root eagerly imports Pi model/TUI API: ${dependency}`);
}
for (const file of rootGraph.files) {
  assert.ok(!file.includes("/tool/"), `root eagerly reaches Pi tool code: ${file}`);
  assert.ok(!file.includes("/sdk/"), `root eagerly reaches Pi agent-session code: ${file}`);
  assert.ok(!file.endsWith("/extension.ts"), `root eagerly reaches Pi extension code: ${file}`);
}

for (const relative of ["tool/tool.ts", "tool/actions.ts", "tool/trace.ts", "sdk/index.ts", "sdk/agent-session.ts"]) {
  const source = await readFile(resolve(packageRoot, relative), "utf8");
  assert.ok(!source.includes('from "../index.ts"'), `${relative} must not couple back through the root barrel`);
}

console.log(`core import boundary is Pi-free (${coreGraph.files.size} internal modules); root is Pi-free (${rootGraph.files.size} modules)`);

async function collectRuntimeGraph(entry: string): Promise<{ files: Set<string>; external: Set<string> }> {
  const files = new Set<string>();
  const external = new Set<string>();
  const pending = [entry];
  while (pending.length > 0) {
    const file = pending.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    const sourceText = await readFile(file, "utf8");
    const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    for (const statement of source.statements) {
      const specifier = runtimeModuleSpecifier(statement);
      if (!specifier) continue;
      if (!specifier.startsWith(".")) {
        external.add(specifier);
        continue;
      }
      if (specifier.endsWith(".json")) continue;
      pending.push(resolve(dirname(file), specifier));
    }
  }
  return { files, external };
}

function runtimeModuleSpecifier(statement: ts.Statement): string | undefined {
  if (ts.isImportDeclaration(statement)) {
    const clause = statement.importClause;
    if (clause?.isTypeOnly) return undefined;
    if (clause && !clause.name && clause.namedBindings && ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.every((item) => item.isTypeOnly)) {
      return undefined;
    }
    return stringSpecifier(statement.moduleSpecifier);
  }
  if (ts.isExportDeclaration(statement)) {
    if (statement.isTypeOnly) return undefined;
    if (statement.exportClause && ts.isNamedExports(statement.exportClause) && statement.exportClause.elements.every((item) => item.isTypeOnly)) {
      return undefined;
    }
    return statement.moduleSpecifier ? stringSpecifier(statement.moduleSpecifier) : undefined;
  }
  return undefined;
}

function stringSpecifier(node: ts.Expression): string | undefined {
  return ts.isStringLiteral(node) ? node.text : undefined;
}
