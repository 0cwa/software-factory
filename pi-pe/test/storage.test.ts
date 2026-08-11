import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createGeneratedManifest } from "../src/generated/manifest.ts";
import { PipelineRepository } from "../src/storage/repository.ts";
import { fixture } from "./helpers.ts";

test("repository writes readable artifacts and can restore an exact snapshot", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-pe-storage-"));
  const repository = new PipelineRepository(root);
  const spec = await fixture("mapped.pipeline.json");
  await repository.persist(spec, createGeneratedManifest(spec));
  const before = await repository.snapshot(spec.id);
  assert(before?.pipeline?.endsWith("\n"));
  assert.equal((await repository.readAll())[0].id, "mapped");

  const changed = { ...spec, name: "Changed", updatedAt: new Date().toISOString() };
  await repository.persist(changed, createGeneratedManifest(changed));
  assert.equal((await repository.read(spec.id) as { name: string }).name, "Changed");
  await repository.restore(spec.id, before);
  assert.equal((await repository.read(spec.id) as { name: string }).name, "Mapped example");

  await repository.writeIndex([{ id: "mapped", target: "pi_pe_pipeline_mapped.run", status: "enabled", registered: true, issues: [] }]);
  const index = JSON.parse(await readFile(join(root, "index.json"), "utf8"));
  assert.equal(index.schemaVersion, 1);
  assert.equal(index.pipelines[0].id, "mapped");
});

test("repository rejects path-like IDs and deletion is confined", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-pe-storage-safe-"));
  const repository = new PipelineRepository(root);
  await assert.rejects(() => repository.delete("../escape"), /Unsafe/);
  const spec = await fixture("mapped.pipeline.json");
  await repository.persist(spec, createGeneratedManifest(spec));
  assert.equal(await repository.delete(spec.id), true);
  assert.equal(await repository.delete(spec.id), false);
  await assert.rejects(() => access(join(root, "pipelines", spec.id)));
});

test("repository refuses symlinked pipeline state directories", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-pe-storage-symlink-"));
  const outside = await mkdtemp(join(tmpdir(), "pi-pe-storage-outside-"));
  const repository = new PipelineRepository(root);
  await repository.initialize();
  await mkdir(join(outside, "mapped"));
  await symlink(join(outside, "mapped"), join(root, "pipelines", "mapped"), "dir");
  const spec = await fixture("mapped.pipeline.json");
  await assert.rejects(() => repository.persist(spec, createGeneratedManifest(spec)), /not a symlink/);
});
