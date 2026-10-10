import { test } from "node:test";
import assert from "node:assert/strict";
import { createLineBuffer } from "@/lib/sse";

test("emits only complete lines, holds partials across chunks", () => {
  const b = createLineBuffer();
  assert.deepEqual(b.push('{"a":1}\n{"b"'), ['{"a":1}']);
  assert.deepEqual(b.push(':2}\n'), ['{"b":2}']);
});

test("drops blank lines and returns nothing for a partial-only chunk", () => {
  const b = createLineBuffer();
  assert.deepEqual(b.push("\n\n"), []);
  assert.deepEqual(b.push("partial"), []);
  assert.deepEqual(b.flush(), ["partial"]);
});

test("flush returns nothing when buffer is empty", () => {
  const b = createLineBuffer();
  b.push("done\n");
  assert.deepEqual(b.flush(), []);
});
