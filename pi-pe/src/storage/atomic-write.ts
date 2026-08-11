import { open, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

export async function atomicWriteFile(path: string, content: string, mode = 0o600): Promise<void> {
  const directory = dirname(path);
  const temporary = join(directory, `.${path.split(/[\\/]/).at(-1)}.${process.pid}.${randomUUID()}.tmp`);
  const handle = await open(temporary, "wx", mode);
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, path);
    await syncDirectory(directory);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function syncDirectory(directory: string): Promise<void> {
  let handle;
  try {
    handle = await open(directory, "r");
    await handle.sync();
  } catch {
    // Some platforms do not support fsync on directories.
  } finally {
    await handle?.close().catch(() => undefined);
  }
}
