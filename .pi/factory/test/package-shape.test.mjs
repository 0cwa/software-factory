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

test("checked-in provider inputs are projected and omit unused role assets", async () => {
  const provider = new URL("../provider/", import.meta.url);
  const profiles = JSON.parse(await readFile(new URL("pi.agents.json", provider), "utf8"));
  const manifest = JSON.parse(await readFile(new URL("pi-dev.protocol.json", provider), "utf8"));
  assert.deepEqual(Object.keys(profiles.agents).sort(), ["architect", "scout"]);
  assert.deepEqual(manifest.provides.map((provide) => provide.name), ["scout", "architect"]);
  for (const role of ["worker.md", "reviewer.md", "security-reviewer.md"]) await assert.rejects(() => readFile(new URL(role, provider)));
  for (const role of ["scout", "architect"]) {
    const prompt = profiles.agents[role].prompt;
    assert.match(prompt, /^\.\/prompts\/(scout|architect)\.md$/);
    assert.equal((await readFile(new URL(prompt, provider), "utf8")).length > 0, true);
  }
});

test("provider package surface contains only the projected two-role deployment assets", async () => {
  const assets = new URL("../dist/provider-assets/", import.meta.url);
  const manifest = JSON.parse(await readFile(new URL("pi.protocol.json", assets), "utf8"));
  const profiles = JSON.parse(await readFile(new URL("pi.agents.json", assets), "utf8"));
  assert.deepEqual(manifest.provides.map((provide) => provide.name), ["scout", "architect"]);
  assert.deepEqual(Object.keys(profiles.agents).sort(), ["architect", "scout"]);
  assert.deepEqual(profiles.agents.scout.modelPolicy, { class: "fast", specific: "openai-codex/gpt-5.6-luna", thinkingLevel: "low" });
  assert.deepEqual(profiles.agents.architect.modelPolicy, { class: "reasoning", specific: "openai-codex/gpt-5.6-sol", thinkingLevel: "high" });
  const provenance = JSON.parse(await readFile(new URL("../dist/provider-provenance.json", import.meta.url), "utf8"));
  assert.deepEqual(provenance.modelPolicy, { scout: profiles.agents.scout.modelPolicy, architect: profiles.agents.architect.modelPolicy });
  assert.deepEqual(await (await import("node:fs/promises")).readdir(new URL("prompts/", assets)), ["architect.md", "scout.md"]);
  const bundle = await readFile(new URL("../dist/provider-host.js", import.meta.url), "utf8");
  for (const flag of ["noExtensions", "noSkills", "noPromptTemplates", "noThemes", "noContextFiles"]) assert.match(bundle, new RegExp(`${flag}: true`));
  assert.match(bundle, /SessionManager\.inMemory\(sessionOptions\.cwd \?\? process\.cwd\(\)\)/);
  assert.match(bundle, /sessionOptionsByAgent/);
  assert.match(bundle, /cwd: deploymentCwd/);
  assert.match(bundle, /createAgentExecutors\(cwd/);
  for (const omittedRole of ["security_reviewer", "reviewerDefinition", "workerDefinition"]) assert.doesNotMatch(bundle, new RegExp(omittedRole));
});
