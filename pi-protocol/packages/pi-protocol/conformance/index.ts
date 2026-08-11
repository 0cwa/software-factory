import { readFileSync, realpathSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { parseProtocolManifest } from "../contract/index.ts";
import type { ProtocolDefinition } from "../contract/types.ts";
import { parsePiAgentProfiles, resolvePiAgentProfiles } from "../sdk/agent-profile.ts";
import { generateProtocolTypes } from "../cli/generator.ts";

export type ConformanceIssueCode =
  | "MANIFEST_MISSING" | "MANIFEST_INVALID" | "PACKAGE_INVALID"
  | "DEPENDENCY_MISSING" | "DEPENDENCY_INCOMPATIBLE" | "PROFILE_INVALID"
  | "GENERATED_MISSING" | "GENERATED_DRIFT" | "DISCOVERY_LIMIT";

export interface ConformanceIssue {
  readonly severity: "error" | "warning";
  readonly code: ConformanceIssueCode;
  readonly packageDir: string;
  readonly message: string;
}
export interface ProtocolPackageConformanceResult {
  readonly packageDir: string;
  readonly packageName?: string;
  readonly definition?: ProtocolDefinition;
  readonly issues: readonly ConformanceIssue[];
  readonly ok: boolean;
}
export interface CheckProtocolPackageOptions { requireDependency?: boolean; }
export interface DiscoverProtocolPackagesOptions { maxDepth?: number; maxDirectories?: number; }

export function checkProtocolPackage(packageDir: string, options: CheckProtocolPackageOptions = {}): ProtocolPackageConformanceResult {
  const directory = realpathSync(packageDir);
  const issues: ConformanceIssue[] = [];
  let packageJson: Record<string, unknown> | undefined;
  try {
    packageJson = strictObject(JSON.parse(readBounded(join(directory, "package.json"), 1_048_576)), "package.json");
    if (typeof packageJson.name !== "string" || !/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(packageJson.name) || packageJson.name.length > 214) throw new Error("package name is invalid");
    if (typeof packageJson.version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(packageJson.version)) throw new Error("package version is invalid");
  } catch (error) {
    issues.push(issue("error", "PACKAGE_INVALID", directory, message(error)));
  }

  let definition: ProtocolDefinition | undefined;
  try {
    definition = parseProtocolManifest(readBounded(join(directory, "pi.protocol.json"), 1_048_576));
  } catch (error) {
    issues.push(issue("error", statSafe(join(directory, "pi.protocol.json")) ? "MANIFEST_INVALID" : "MANIFEST_MISSING", directory, message(error)));
  }

  if (packageJson && packageJson.name !== "@kybernetria/pi-protocol" && options.requireDependency !== false) {
    const dependencies = { ...object(packageJson.dependencies), ...object(packageJson.peerDependencies), ...object(packageJson.devDependencies) };
    const range = dependencies["@kybernetria/pi-protocol"];
    if (typeof range !== "string") issues.push(issue("error", "DEPENDENCY_MISSING", directory, "@kybernetria/pi-protocol dependency is required"));
    else if (!compatibleDependency(range)) issues.push(issue("error", "DEPENDENCY_INCOMPATIBLE", directory, `Unsupported @kybernetria/pi-protocol range ${range}`));
  }

  const profilePath = join(directory, "pi.agents.json");
  if (statSafe(profilePath)) {
    try { resolvePiAgentProfiles(parsePiAgentProfiles(readBounded(profilePath, 1_048_576)), directory); }
    catch (error) { issues.push(issue("error", "PROFILE_INVALID", directory, message(error))); }
  }

  if (definition) {
    try {
      const generatedPath = configuredGeneratedPath(packageJson, directory);
      if (generatedPath) {
        const expected = generateProtocolTypes(definition);
        if (!statSafe(generatedPath)) issues.push(issue("error", "GENERATED_MISSING", directory, `Missing generated artifact ${relative(directory, generatedPath)}`));
        else if (readBounded(generatedPath, 2_097_152) !== expected) issues.push(issue("error", "GENERATED_DRIFT", directory, `Generated artifact drift: ${relative(directory, generatedPath)}`));
      }
    } catch (error) { issues.push(issue("error", "PACKAGE_INVALID", directory, message(error))); }
  }

  return Object.freeze({
    packageDir: directory,
    ...(typeof packageJson?.name === "string" ? { packageName: packageJson.name } : {}),
    ...(definition ? { definition } : {}),
    issues: Object.freeze(issues),
    ok: !issues.some((entry) => entry.severity === "error"),
  });
}

export function assertProtocolPackageConformance(packageDir: string, options: CheckProtocolPackageOptions = {}): ProtocolPackageConformanceResult {
  const result = checkProtocolPackage(packageDir, options);
  if (!result.ok) throw new Error(result.issues.filter((entry) => entry.severity === "error").map((entry) => `${entry.code}: ${entry.message}`).join("\n"));
  return result;
}

export async function discoverProtocolPackages(root: string, options: DiscoverProtocolPackagesOptions = {}): Promise<readonly string[]> {
  const realRoot = realpathSync(root);
  const maxDepth = bounded(options.maxDepth, 16, 1, 64);
  const maxDirectories = bounded(options.maxDirectories, 10_000, 1, 100_000);
  const output: string[] = [];
  const seen = new Set<string>();
  const queue = [{ directory: realRoot, depth: 0 }];
  while (queue.length) {
    const next = queue.shift()!;
    if (seen.size >= maxDirectories) throw new Error("Recursive protocol package discovery exceeded directory limit");
    let real: string;
    try { real = realpathSync(next.directory); } catch { continue; }
    if (!within(realRoot, real) || seen.has(real)) continue;
    seen.add(real);
    if (statSafe(join(real, "pi.protocol.json"))) output.push(real);
    if (next.depth >= maxDepth) continue;
    for (const entry of (await readdir(real, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if ([".git", "node_modules", "dist", "out", "coverage", "archive"].includes(entry.name)) continue;
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      queue.push({ directory: join(real, entry.name), depth: next.depth + 1 });
    }
  }
  return Object.freeze(output.sort());
}

export async function checkProtocolTree(root: string, options: CheckProtocolPackageOptions & DiscoverProtocolPackagesOptions = {}): Promise<readonly ProtocolPackageConformanceResult[]> {
  const packages = await discoverProtocolPackages(root, options);
  return Object.freeze(packages.map((directory) => checkProtocolPackage(directory, options)));
}

function configuredGeneratedPath(packageJson: Record<string, unknown> | undefined, directory: string): string | undefined {
  const config = object(packageJson?.piProtocol);
  if (typeof config.generated !== "string") return undefined;
  if (!config.generated || config.generated.length > 512 || isAbsolute(config.generated)) throw new Error("piProtocol.generated must be a bounded relative path");
  const path = resolve(directory, config.generated);
  if (!within(directory, path)) throw new Error("piProtocol.generated escapes package directory");
  return path;
}
function compatibleDependency(range: string): boolean {
  const value = range.trim();
  return /^(?:file:|link:|workspace:)/.test(value)
    || /^https:\/\/github\.com\/Kybernetria\/pi-protocol\/releases\/download\/v4\.\d+\.\d+\/.+\.tgz$/.test(value)
    || /(?:^|[<>=~^|\s])4(?:\.\d+)?(?:\.\d+)?/.test(value);
}
function readBounded(path: string, maxBytes: number): string {
  const stat = statSync(path);
  if (!stat.isFile() || stat.size > maxBytes) throw new Error(`${basename(path)} exceeds size limit`);
  return readFileSync(path, "utf8");
}
function strictObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function statSafe(path: string): boolean { try { return statSync(path).isFile(); } catch { return false; } }
function within(root: string, candidate: string): boolean { const path = relative(root, candidate); return path === "" || (!path.startsWith("..") && !isAbsolute(path)); }
function bounded(value: number | undefined, fallback: number, min: number, max: number): number { const out = value ?? fallback; if (!Number.isSafeInteger(out) || out < min || out > max) throw new Error("Invalid conformance discovery limit"); return out; }
function issue(severity: ConformanceIssue["severity"], code: ConformanceIssueCode, packageDir: string, message: string): ConformanceIssue { return Object.freeze({ severity, code, packageDir, message: message.slice(0, 1_024) }); }
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
