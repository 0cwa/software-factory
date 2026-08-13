import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, relative } from "node:path";
import { promisify } from "node:util";
import { build } from "esbuild";

const execFileAsync = promisify(execFile);
const root = resolve(new URL("..", import.meta.url).pathname);
const lockPath = join(root, "provider", "source-lock.json");
const lock = JSON.parse(await readFile(lockPath, "utf8"));
const output = resolve(process.env.FACTORY_PROVIDER_OUTPUT_DIR ?? join(root, "dist"));
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_TAR_LIST_BYTES = 4 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 120_000;

function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function sha512(bytes) { return createHash("sha512").update(bytes).digest("base64"); }
function digestBytes(bytes) { return `sha256:${sha256(bytes)}`; }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
function contractDigest(manifest) { return digestBytes(Buffer.from(JSON.stringify(canonical(manifest)))); }
function assert(condition, message) { if (!condition) throw new Error(message); }

async function download(url, expectedSha256, expectedSha512) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: "follow" });
      assert(response.ok, `Archive download failed with HTTP ${response.status}: ${url}`);
      const declared = Number(response.headers.get("content-length") ?? 0);
      assert(!declared || declared <= MAX_ARCHIVE_BYTES, `Archive is larger than ${MAX_ARCHIVE_BYTES} bytes`);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert(bytes.byteLength <= MAX_ARCHIVE_BYTES, `Archive is larger than ${MAX_ARCHIVE_BYTES} bytes`);
      if (expectedSha256) assert(digestBytes(bytes) === expectedSha256, `Archive sha256 mismatch for ${url}`);
      if (expectedSha512) assert(`sha512-${sha512(bytes)}` === expectedSha512, `Archive sha512 mismatch for ${url}`);
      return bytes;
    } catch (error) { lastError = error; if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1))); }
  }
  throw lastError;
}

function safeTarEntry(name, rootName) {
  assert(name && !name.startsWith("/") && !name.includes("\\0"), `Unsafe archive entry ${JSON.stringify(name)}`);
  const parts = name.split("/").filter(Boolean);
  assert(parts[0] === rootName && !parts.includes(".."), `Archive entry escapes expected root: ${name}`);
  assert(parts.every((part) => part !== "." && !part.includes("\\0")), `Unsafe archive entry ${name}`);
}
async function extractArchive(bytes, expectedRoot, destination) {
  await mkdir(destination, { recursive: true, mode: 0o700 });
  const archive = join(destination, "archive.tgz");
  await writeFile(archive, bytes, { mode: 0o600 });
  const listed = await execFileAsync("tar", ["-tzf", archive], { maxBuffer: MAX_TAR_LIST_BYTES, timeout: FETCH_TIMEOUT_MS, encoding: "utf8" });
  const entries = listed.stdout.split("\n").filter(Boolean);
  assert(entries.length > 0, "Archive is empty");
  for (const entry of entries) safeTarEntry(entry, expectedRoot);
  await mkdir(join(destination, "extract"), { recursive: true, mode: 0o700 });
  await execFileAsync("tar", ["-xzf", archive, "--no-same-owner", "--no-same-permissions", "-C", join(destination, "extract")], { timeout: FETCH_TIMEOUT_MS, maxBuffer: MAX_TAR_LIST_BYTES });
  const rootPath = join(destination, "extract", expectedRoot);
  const rootStat = await stat(rootPath);
  assert(rootStat.isDirectory(), `Archive root ${expectedRoot} is not a directory`);
  return rootPath;
}
async function assertTreeSafe(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    assert(!entry.name.includes("\\0"), "Archive contains an invalid name");
    assert(!entry.isSymbolicLink(), `Archive contains a symlink: ${relative(directory, path)}`);
    if (entry.isDirectory()) await assertTreeSafe(path);
    else assert(entry.isFile(), `Archive contains a non-regular entry: ${relative(directory, path)}`);
  }
}
async function treeDigest(directory) {
  const rows = [];
  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) {
      const path = join(current, entry.name);
      const rel = relative(directory, path).replaceAll("\\", "/");
      if (entry.isDirectory()) await visit(path);
      else rows.push(`F\\0${rel}\\0${sha256(await readFile(path))}\\n`);
    }
  }
  await visit(directory);
  return digestBytes(Buffer.from(rows.join("")));
}
async function selectedSourceDigest(piRoot, selectedFiles) {
  const rows = [];
  for (const path of Object.keys(selectedFiles).sort()) {
    const digest = digestBytes(await readFile(join(piRoot, path)));
    rows.push(`F\\0${path}\\0${digest}\\n`);
  }
  return digestBytes(Buffer.from(rows.join("")));
}
async function verifySelectedSource(piRoot) {
  for (const [path, expected] of Object.entries(lock.piDev.selectedFiles)) {
    const actual = digestBytes(await readFile(join(piRoot, path)));
    assert(actual === expected, `Selected Pi-Dev source mismatch for ${path}`);
  }
  assert(await treeDigest(piRoot) === lock.piDev.sourceTreeDigest, "Pi-Dev source tree digest mismatch");
  assert(await selectedSourceDigest(piRoot, lock.piDev.selectedFiles) === lock.piDev.selectedSourceDigest, "Pi-Dev selected source digest mismatch");
}
async function createIsolatedProtocolAdapter(protocolRoot) {
  const sourcePath = join(protocolRoot, "sdk/agent-session.ts");
  let source = await readFile(sourcePath, "utf8");
  source = source.replace(
    "    getAgentDir?: () => string;\n    DefaultResourceLoader?: new (options: {\n      cwd: string;\n      agentDir?: string;\n      systemPromptOverride?: () => string;\n      appendSystemPromptOverride?: (base: string[]) => string[];\n    }) => { reload(): Promise<void> };",
    "    getAgentDir?: () => string;\n    SettingsManager: { inMemory(): unknown };\n    DefaultResourceLoader?: new (options: {\n      cwd: string;\n      agentDir: string;\n      settingsManager: unknown;\n      noExtensions: boolean;\n      noSkills: boolean;\n      noPromptTemplates: boolean;\n      noThemes: boolean;\n      noContextFiles: boolean;\n      systemPromptOverride?: () => string;\n      appendSystemPromptOverride?: (base: string[]) => string[];\n    }) => { reload(): Promise<void> };",
  );
  source = source.replace(
    "    ...(typeof sessionOptions.agentDir === \"string\"\n      ? { agentDir: sessionOptions.agentDir }\n      : sdk.getAgentDir ? { agentDir: sdk.getAgentDir() } : {}),\n  };",
    "    agentDir: typeof sessionOptions.agentDir === \"string\" ? sessionOptions.agentDir : sdk.getAgentDir ? sdk.getAgentDir() : process.cwd(),\n    settingsManager: sessionOptions.settingsManager ?? sdk.SettingsManager.inMemory(),\n    noExtensions: true,\n    noSkills: true,\n    noPromptTemplates: true,\n    noThemes: true,\n    noContextFiles: true,\n  };",
  );
  source = source.replace(
    "      sessionManager: sessionOptions.sessionManager ?? sdk.SessionManager.create(sessionOptions.cwd ?? process.cwd()),\n      customTools,",
    "      sessionManager: sessionOptions.sessionManager ?? sdk.SessionManager.inMemory(sessionOptions.cwd ?? process.cwd()),\n      settingsManager: sessionOptions.settingsManager ?? sdk.SettingsManager.inMemory(),\n      customTools,",
  );
  assert(source.includes("noExtensions: true") && source.includes("SettingsManager.inMemory"), "Protocol SDK isolation adaptation was not applied");
  const adaptedPath = join(protocolRoot, "sdk/agent-session-factory.ts");
  await writeFile(adaptedPath, source, { mode: 0o600 });
  return { sourcePath, adaptedPath };
}
function projectedManifest(fullManifest) {
  return { ...fullManifest, provides: fullManifest.provides.filter((provide) => provide.name === "scout" || provide.name === "architect") };
}
function projectedProfiles(profiles) {
  return { ...profiles, agents: Object.fromEntries(["scout", "architect"].map((role) => [role, profiles.agents[role]])) };
}
function projectedAgentBridge(source) {
  const imports = 'import { architectDefinition, scoutDefinition } from "../src/roles/index.ts";';
  assert(source.includes(imports.replace("architectDefinition, scoutDefinition", "architectDefinition, reviewerDefinition, scoutDefinition, securityReviewerDefinition, workerDefinition")), "Pinned Pi-Dev agent bridge imports changed");
  let projected = source.replace(
    'import { architectDefinition, reviewerDefinition, scoutDefinition, securityReviewerDefinition, workerDefinition } from "../src/roles/index.ts";',
    imports,
  );
  const definitions = /const definitions: Record<AgentRole, AgentDefinition<AgentRequestBase, AgentOutputBase>> = \{[\s\S]*?\n\};/;
  assert(definitions.test(projected), "Pinned Pi-Dev agent bridge definitions changed");
  projected = projected.replace(definitions, `const definitions = {\n  scout: scoutDefinition,\n  architect: architectDefinition,\n} as const;`);
  const executorSignature = "function createProfileAgentExecutor<\n  Request extends AgentRequestBase,\n  Output extends AgentOutputBase,\n>(definition: AgentDefinition<Request, Output>): ProtocolAgentExecutor {";
  assert(projected.includes(executorSignature), "Pinned Pi-Dev agent executor signature changed");
  projected = projected.replace(executorSignature, "function createProfileAgentExecutor<\n  Request extends AgentRequestBase,\n  Output extends AgentOutputBase,\n>(definition: AgentDefinition<Request, Output>, deploymentCwd: string, deploymentAgentDir?: string): ProtocolAgentExecutor {");
  const profileOptions = `    agentByProvide: { [definition.role]: definition.role },\n    toPromptByAgent:`;
  assert(projected.includes(profileOptions), "Pinned Pi-Dev profile executor options changed");
  projected = projected.replace(profileOptions, `    agentByProvide: { [definition.role]: definition.role },\n    sessionOptionsByAgent: () => ({\n      cwd: deploymentCwd,\n      ...(deploymentAgentDir ? { agentDir: deploymentAgentDir } : {}),\n    }),\n    toPromptByAgent:`);
  assert(projected.includes("export function createAgentExecutors()"), "Pinned Pi-Dev executor factory changed");
  projected = projected.replace("export function createAgentExecutors(): Record<string, ProtocolAgentExecutor> {", "export function createAgentExecutors(deploymentCwd: string, deploymentAgentDir?: string): Record<string, ProtocolAgentExecutor> {");
  projected = projected.replace("[role, createProfileAgentExecutor(definition)]", "[role, createProfileAgentExecutor(definition, deploymentCwd, deploymentAgentDir)]");
  assert(projected.includes("sessionOptionsByAgent") && projected.includes("cwd: deploymentCwd") && !projected.includes("reviewerDefinition"), "Two-role Pi-Dev bridge cwd projection was not narrow");
  return projected;
}
async function writeDeploymentAssets(piRoot, outputDirectory, manifest, profiles) {
  const assets = join(outputDirectory, "provider-assets");
  await mkdir(join(assets, "prompts"), { recursive: true, mode: 0o755 });
  await writeFile(join(assets, "pi.protocol.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(assets, "pi.agents.json"), `${JSON.stringify(projectedProfiles(profiles), null, 2)}\n`);
  for (const prompt of ["scout.md", "architect.md"]) {
    await writeFile(join(assets, "prompts", prompt), await readFile(join(piRoot, "prompts", prompt)));
  }
  return assets;
}
function adaptedManifestSource() {
  return `import { readFileSync } from "node:fs";\nimport { join } from "node:path";\nimport { fileURLToPath } from "node:url";\nimport { parseProtocolManifest, type ProtocolProvideContract } from "@kybernetria/pi-protocol/contract";\nimport { parsePiAgentProfiles, resolvePiAgentProfiles, type ResolvedPiAgentProfile } from "@kybernetria/pi-protocol/pi/agents";\nimport type { AgentRole } from "./definition.ts";\n\nexport const MANIFEST_BASE_DIR = fileURLToPath(new URL("./provider-assets", import.meta.url));\nexport const protocolDefinition = parseProtocolManifest(readFileSync(join(MANIFEST_BASE_DIR, "pi.protocol.json"), "utf8"));\nexport const agentProfiles = resolvePiAgentProfiles(parsePiAgentProfiles(readFileSync(join(MANIFEST_BASE_DIR, "pi.agents.json"), "utf8")), MANIFEST_BASE_DIR);\nexport const protocolNodeId = protocolDefinition.manifest.node.id;\nexport function agentProfileFor(role: AgentRole): ResolvedPiAgentProfile { const profile = agentProfiles.agents[role]; if (!profile) throw new Error(\`Private deployment profile is missing agent \${role}\`); return profile; }\nexport function provideContractFor(role: AgentRole): ProtocolProvideContract { const provide = protocolDefinition.manifest.provides.find((candidate) => candidate.name === role); if (!provide) throw new Error(\`Public contract is missing provide \${role}\`); return provide; }\n`;
}

const { mkdtemp } = await import("node:fs/promises");
const temp = await mkdtemp(join(tmpdir(), "factory-provider-"));
try {
  const piArchive = await download(lock.piDev.archive, lock.piDev.archiveSha256);
  const protocolArchive = await download(lock.protocol.release, lock.protocol.archiveSha256, lock.protocol.integrity);
  const piRoot = await extractArchive(piArchive, `pi-dev-${lock.piDev.commit}`, temp);
  const protocolRoot = await extractArchive(protocolArchive, "package", join(temp, "protocol"));
  await assertTreeSafe(piRoot); await assertTreeSafe(protocolRoot); await verifySelectedSource(piRoot);
  assert(await treeDigest(protocolRoot) === lock.protocol.sourceTreeDigest, "Protocol source tree digest mismatch");
  const protocolAdapter = await createIsolatedProtocolAdapter(protocolRoot);
  const fullManifest = JSON.parse(await readFile(join(piRoot, "pi.protocol.json"), "utf8"));
  const profiles = JSON.parse(await readFile(join(piRoot, "pi.agents.json"), "utf8"));
  const projected = projectedManifest(fullManifest);
  const stage = join(temp, "stage");
  await cp(piRoot, stage, { recursive: true, errorOnExist: true });
  await writeFile(join(stage, "src/runtime/manifest.ts"), adaptedManifestSource(), { mode: 0o600 });
  const exactAgentBridge = await readFile(join(piRoot, "protocol/agents.ts"), "utf8");
  const projectedAgentBridgeSource = projectedAgentBridge(exactAgentBridge);
  const projectedAgentBridgePath = join(stage, "protocol/agents.projected.ts");
  await writeFile(projectedAgentBridgePath, projectedAgentBridgeSource, { mode: 0o600 });
  await writeFile(join(stage, "projected-manifest.json"), `${JSON.stringify(projected, null, 2)}\n`, { mode: 0o600 });
  await mkdir(output, { recursive: true, mode: 0o755 });
  await rm(join(output, "provider-host.js"), { force: true });
  await rm(join(output, "provider-provenance.json"), { force: true });
  await rm(join(output, "provider-manifest.json"), { force: true });
  await rm(join(output, "provider-assets"), { recursive: true, force: true });
  await writeDeploymentAssets(piRoot, output, projected, profiles);
  await writeFile(join(output, "provider-manifest.json"), `${JSON.stringify(projected, null, 2)}\n`);

  const result = await build({
    entryPoints: [join(root, "scripts", "provider-host.ts")],
    outfile: join(output, "provider-host.js"), bundle: true, format: "esm", platform: "node", target: "node22",
    absWorkingDir: root, sourcemap: false, legalComments: "none", minify: false,
    external: ["@earendil-works/pi-coding-agent", "@earendil-works/pi-ai", "@earendil-works/pi-tui"],
    plugins: [{ name: "archive-source-aliases", setup(buildApi) {
      buildApi.onResolve({ filter: /^@factory\// }, (args) => {
        const map = { "@factory/pi-dev-agents": projectedAgentBridgePath, "@factory/pi-dev-manifest": join(stage, "src/runtime/manifest.ts"), "@factory/projected-manifest": join(stage, "projected-manifest.json") };
        const path = map[args.path]; assert(path, `Unknown archive source alias ${args.path}`); return { path };
      });
      buildApi.onResolve({ filter: /^@kybernetria\/pi-protocol\/pi\/agents$/ }, () => ({ path: protocolAdapter.adaptedPath }));
      buildApi.onResolve({ filter: /^ajv(?:\/|$)/ }, (args) => {
        const suffix = args.path.slice("ajv".length).replace(/^\//, "");
        return { path: join(root, "node_modules/ajv", suffix || "dist/ajv.js") };
      });
      buildApi.onResolve({ filter: /^@kybernetria\// }, (args) => {
        const suffix = args.path.slice("@kybernetria/pi-protocol".length).replace(/^\//, "");
        const entry = { "": "index.ts", core: "core/index.ts", contract: "contract/index.ts", provenance: "provenance/index.ts", conformance: "conformance/index.ts", pi: "tool/index.ts", "pi/agents": "sdk/agent-session.ts" }[suffix];
        assert(entry, `Unsupported Protocol import ${args.path}`);
        return { path: join(protocolRoot, entry) };
      });
    } }],
  });
  assert(result.errors.length === 0, "Provider bundle reported build errors");
  const bundlePath = join(output, "provider-host.js");
  const bundleText = (await readFile(bundlePath, "utf8"))
    .replaceAll(/(?:\.\.\/)+tmp\/factory-provider-[^/]+\//g, "archive-source/")
    .replaceAll(/\/tmp\/factory-provider-[^/]+\//g, "archive-source/");
  await writeFile(bundlePath, bundleText);
  const bundleBytes = Buffer.from(bundleText);
  const projectedBytes = await readFile(join(output, "provider-manifest.json"));
  const assets = {};
  for (const path of ["pi.protocol.json", "pi.agents.json", "prompts/scout.md", "prompts/architect.md"]) assets[path] = digestBytes(await readFile(join(output, "provider-assets", path)));
  const provenance = {
    schemaVersion: 2,
    piDev: { commit: lock.piDev.commit, archive: lock.piDev.archive, archiveSha256: lock.piDev.archiveSha256, sourceTreeDigest: lock.piDev.sourceTreeDigest, selectedSourceDigest: lock.piDev.selectedSourceDigest, selectedFiles: lock.piDev.selectedFiles },
    protocol: { version: lock.protocol.version, release: lock.protocol.release, integrity: lock.protocol.integrity, archiveSha256: lock.protocol.archiveSha256, sourceTreeDigest: lock.protocol.sourceTreeDigest },
    contractIdentity: { fullContractDigest: contractDigest(fullManifest), projectedContractDigest: contractDigest(projected), fullManifestDigest: digestBytes(Buffer.from(JSON.stringify(canonical(fullManifest)))), projectedManifestDigest: digestBytes(Buffer.from(JSON.stringify(canonical(projected)))) },
    transformations: [
      { input: "src/runtime/manifest.ts", inputDigest: digestBytes(await readFile(join(piRoot, "src/runtime/manifest.ts"))), operation: "deployment-only asset path adapter", outputDigest: digestBytes(await readFile(join(stage, "src/runtime/manifest.ts"))) },
      { input: "sdk/agent-session.ts", inputDigest: digestBytes(await readFile(protocolAdapter.sourcePath)), operation: "deployment-only ambient resource isolation adapter: in-memory settings/resource loader and SessionManager.inMemory", outputDigest: digestBytes(await readFile(protocolAdapter.adaptedPath)) },
      { input: "protocol/agents.ts", inputDigest: digestBytes(Buffer.from(exactAgentBridge)), operation: "mechanical two-role projected definitions adapter: retain exact executor factory and prepare/parse behavior; replace only role imports and the definitions map with scout and architect; pass validated deployment cwd and optional agent dir through sessionOptionsByAgent", outputDigest: digestBytes(Buffer.from(projectedAgentBridgeSource)), projectedRoles: ["scout", "architect"] },
    ],
    assets, bundle: { path: "provider-host.js", digest: digestBytes(bundleBytes), bytes: bundleBytes.byteLength },
    projectedManifest: { path: "provider-manifest.json", digest: digestBytes(projectedBytes), bytes: projectedBytes.byteLength, provides: ["scout", "architect"] },
    modelPolicy: { scout: profiles.agents.scout.modelPolicy, architect: profiles.agents.architect.modelPolicy },
    build: { mechanism: "esbuild", target: "node22", externalRuntime: ["@earendil-works/pi-coding-agent", "@earendil-works/pi-ai", "@earendil-works/pi-tui"] },
  };
  await writeFile(join(output, "provider-provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`);
  console.log(`generated ${join(output, "provider-host.js")}`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
