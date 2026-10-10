import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWorkerArgs } from "@/lib/worker";

test("builds argv without credentials and with flags only when set", () => {
  const argv = buildWorkerArgs({
    url: "https://archive.org/details/x",
    resolution: 3, format: "pdf", meta: false, printDisabled: false,
    out: "/tmp/archive-dl/abc", jobId: "a".repeat(32),
  });
  assert.ok(!argv.includes("--meta"));
  assert.ok(!argv.includes("--print-disabled"));
  assert.deepEqual(argv.slice(0, 2), ["worker.py", "--url"]);
  // no secret ever shows up in argv
  assert.ok(!argv.join(" ").includes("password"));
});

test("includes optional flags when set", () => {
  const argv = buildWorkerArgs({
    url: "https://archive.org/details/x",
    resolution: 0, format: "jpg", meta: true, printDisabled: true,
    out: "/tmp/x", jobId: "b".repeat(32),
  });
  assert.ok(argv.includes("--meta"));
  assert.ok(argv.includes("--print-disabled"));
  assert.deepEqual(["jpg", "0"], [argv[argv.indexOf("--format") + 1], argv[argv.indexOf("--resolution") + 1]]);
});
