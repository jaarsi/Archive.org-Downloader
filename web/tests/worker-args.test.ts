import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWorkerArgs } from "@/lib/worker";

test("builds argv without credentials and with flags only when set", () => {
  const argv = buildWorkerArgs({
    urls: ["https://archive.org/details/x"],
    resolution: 3, format: "pdf", meta: false, printDisabled: false,
    out: "/tmp/archive-dl/abc", jobId: "a".repeat(32),
  });
  assert.ok(!argv.includes("--meta"));
  assert.ok(!argv.includes("--print-disabled"));
  assert.equal(argv[0], "worker.py");
  // no secret ever shows up in argv
  assert.ok(!argv.join(" ").includes("password"));
});

test("emits one --url per book, preserving order", () => {
  const urls = [
    "https://archive.org/details/a",
    "https://archive.org/details/b",
    "https://archive.org/details/c",
  ];
  const argv = buildWorkerArgs({
    urls, resolution: 3, format: "pdf", meta: false, printDisabled: false,
    out: "/tmp/x", jobId: "a".repeat(32),
  });
  assert.equal(argv.filter((a) => a === "--url").length, 3);
  // each url appears right after a --url flag, in order
  const seen = argv.filter((_, i) => argv[i - 1] === "--url");
  assert.deepEqual(seen, urls);
});

test("includes optional flags when set", () => {
  const argv = buildWorkerArgs({
    urls: ["https://archive.org/details/x"],
    resolution: 0, format: "jpg", meta: true, printDisabled: true,
    out: "/tmp/x", jobId: "b".repeat(32),
  });
  assert.ok(argv.includes("--meta"));
  assert.ok(argv.includes("--print-disabled"));
  assert.deepEqual(["jpg", "0"], [argv[argv.indexOf("--format") + 1], argv[argv.indexOf("--resolution") + 1]]);
});
