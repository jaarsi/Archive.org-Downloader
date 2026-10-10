import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { rm } from "node:fs/promises";

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
