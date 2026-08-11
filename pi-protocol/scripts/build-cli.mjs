import { build } from "esbuild";
import { mkdir } from "node:fs/promises";

await mkdir("packages/pi-protocol/dist", { recursive: true });
await build({
  entryPoints: ["packages/pi-protocol/cli/bin.ts"],
  outfile: "packages/pi-protocol/dist/pi-protocol.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  banner: { js: "#!/usr/bin/env node" },
  sourcemap: false,
  legalComments: "none",
});
