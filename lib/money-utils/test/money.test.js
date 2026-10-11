const test = require("node:test");
const assert = require("node:assert");
const m = require("../src");

test("toCents rounds to the nearest cent", () => {
  assert.strictEqual(m.toCents(19.5), 1950);
  assert.strictEqual(m.toCents("0.1"), 10);
});

test("formatMoney", () => assert.strictEqual(m.formatMoney(1999, "EUR"), "19.99 EUR"));

test("splitCents never loses a cent", () => {
  const parts = m.splitCents(100, 3);
  assert.deepStrictEqual(parts, [34, 33, 33]);
  assert.strictEqual(m.addCents(...parts), 100);
});

test("applyTax", () => assert.strictEqual(m.applyTax(1000, 0.2), 1200));

test("toCents(19.99) is 1999 (no float truncation)", () => assert.strictEqual(m.toCents(19.99), 1999));
