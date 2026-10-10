import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdir, utimes, stat } from "node:fs/promises";
import { newJobId, jobDir, sweepOld } from "@/lib/jobs";

test("newJobId is 32 lowercase hex chars", () => {
  assert.match(newJobId(), /^[0-9a-f]{32}$/);
});

test("jobDir returns a path under the archive-dl temp root", () => {
  const id = newJobId();
  assert.equal(jobDir(id), path.join(os.tmpdir(), "archive-dl", id));
});

test("jobDir rejects path-traversal and malformed ids", () => {
  for (const bad of ["../etc", "..", "abc", "A".repeat(32), "../../x", "0".repeat(32) + "/x"]) {
    assert.throws(() => jobDir(bad), /invalid job id/);
  }
});

test("sweepOld removes dirs older than maxAge, keeps fresh ones", async () => {
  const oldId = newJobId();
  const freshId = newJobId();
  const oldDir = jobDir(oldId);
  const freshDir = jobDir(freshId);
  await mkdir(oldDir, { recursive: true });
  await mkdir(freshDir, { recursive: true });
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  await utimes(oldDir, twoHoursAgo, twoHoursAgo);

  await sweepOld(60 * 60 * 1000); // 1h TTL

  await assert.rejects(stat(oldDir), "old dir should be removed");
  await (async () => { await stat(freshDir); })(); // fresh dir still exists (no throw)
});
