const test = require("node:test");
const assert = require("node:assert");
const { planner } = require("../loadgen");

test("planner is deterministic per seed and covers the edge cases", () => {
  const a = planner(7), b = planner(7);
  const seqA = Array.from({ length: 200 }, a), seqB = Array.from({ length: 200 }, b);
  assert.deepStrictEqual(seqA, seqB);
  const currencies = new Set(seqA.filter((r) => r.body && r.body.currency).map((r) => r.body.currency));
  assert.deepStrictEqual([...currencies].sort(), ["EUR", "GBP", "USD"]);
  assert.ok(seqA.some((r) => r.body && r.body.method && r.body.method.type === "wallet"));
});
