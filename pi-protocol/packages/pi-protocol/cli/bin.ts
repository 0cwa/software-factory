import { basename } from "node:path";
import { runCheckCli } from "./check.ts";
import { runDoctorCli } from "./doctor.ts";
import { runGenerateCli } from "./generate.ts";
import { runProtocolCli } from "./index.ts";

const name = basename(process.argv[1] ?? "pi-protocol");
const argv = process.argv.slice(2);
process.exitCode = name.endsWith("-check") ? await runCheckCli(argv)
  : name.endsWith("-generate") ? await runGenerateCli(argv)
  : name.endsWith("-doctor") ? await runDoctorCli(argv)
  : await runProtocolCli(argv);
