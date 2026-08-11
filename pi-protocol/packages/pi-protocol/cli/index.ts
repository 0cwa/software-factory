import { runCheckCli } from "./check.ts";
import { runDoctorCli } from "./doctor.ts";
import { runGenerateCli } from "./generate.ts";

export async function runProtocolCli(argv = process.argv.slice(2)): Promise<number> {
  const [command, ...rest] = argv;
  if (command === "check") return runCheckCli(rest);
  if (command === "generate") return runGenerateCli(rest);
  if (command === "doctor") return runDoctorCli(rest);
  console.error("Usage: pi-protocol <check|generate|doctor> [options]");
  return 1;
}
