import { test } from "node:test";
import assert from "node:assert/strict";
import { createGate } from "@/lib/gate";

test("gate allows up to max concurrent, rejects beyond, frees on release", () => {
  const g = createGate(2);
  assert.equal(g.tryAcquire(), true);
  assert.equal(g.tryAcquire(), true);
  assert.equal(g.tryAcquire(), false); // at capacity
  g.release();
  assert.equal(g.tryAcquire(), true); // freed slot
});

test("release never drops below zero", () => {
  const g = createGate(1);
  g.release();
  g.release();
  assert.equal(g.tryAcquire(), true);
  assert.equal(g.tryAcquire(), false);
});
