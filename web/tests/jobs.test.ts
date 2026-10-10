import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { newJobId, jobDir } from "@/lib/jobs";

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
