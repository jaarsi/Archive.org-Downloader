import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { rm, readdir, stat } from "node:fs/promises";

const ROOT = path.join(os.tmpdir(), "archive-dl");
const ID_RE = /^[0-9a-f]{32}$/;

export function newJobId(): string {
  return randomBytes(16).toString("hex");
}

export function jobDir(id: string): string {
  if (!ID_RE.test(id)) throw new Error("invalid job id");
  return path.join(ROOT, id);
}

export async function cleanup(id: string): Promise<void> {
  await rm(jobDir(id), { recursive: true, force: true });
}

// Remove job dirs older than maxAgeMs. Swept opportunistically on each new
// download so abandoned/successful-but-undownloaded jobs don't pile up on a
// long-running (public) server. ponytail: sweep-on-request, not a cron.
export async function sweepOld(maxAgeMs: number): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(ROOT);
  } catch {
    return; // root doesn't exist yet
  }
  const now = Date.now();
  await Promise.all(
    entries.map(async (name) => {
      if (!ID_RE.test(name)) return;
      const dir = path.join(ROOT, name);
      try {
        const s = await stat(dir);
        if (now - s.mtimeMs > maxAgeMs) await rm(dir, { recursive: true, force: true });
      } catch {
        /* raced with another cleanup; ignore */
      }
    }),
  );
}
