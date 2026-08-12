import { relative, resolve, sep } from "node:path";

const BASIC_ENVIRONMENT_KEYS = new Set(["PATH", "PATHEXT", "LANG", "LC_ALL", "LC_CTYPE", "TERM", "TMPDIR", "TEMP", "TMP"]);

/** Build a deliberately small environment for helper processes. */
export function safeSubprocessEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if ((BASIC_ENVIRONMENT_KEYS.has(key) || key.startsWith("LC_")) && value !== undefined) environment[key] = value;
  }
  // Git and provider configuration must not be inherited from the host.
  environment.HOME = "/nonexistent";
  environment.XDG_CONFIG_HOME = "/nonexistent";
  return environment;
}

/** Environment used by every Git invocation owned by the factory. */
export function safeGitEnvironment(): NodeJS.ProcessEnv {
  const environment = safeSubprocessEnvironment();
  environment.GIT_CONFIG_NOSYSTEM = "1";
  return environment;
}

export function isCanonicalPathInside(root: string, candidate: string): boolean {
  const relativePath = relative(resolve(root), resolve(candidate));
  return relativePath === "" || (relativePath !== ".." && !relativePath.startsWith(`..${sep}`) && !relativePath.startsWith("/"));
}
