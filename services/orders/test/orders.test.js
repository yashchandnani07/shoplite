const test = require("node:test");
const assert = require("node:assert");
const { priceOrder } = require("../src/pricing");
const { createApp } = require("../src/app");

const listen = (app) => new Promise((r) => { const s = app.listen(0, () => r(s)); });

test("priceOrder totals with tax in cents", () => {
  const p = priceOrder([{ productId: "p2", quantity: 2 }]); // 2 x 34.50
  assert.strictEqual(p.subtotalCents, 6900);
  assert.strictEqual(p.totalCents, 7452);
});

test("priceOrder rejects unknown products", () => {
  assert.throws(() => priceOrder([{ productId: "zzz", quantity: 1 }]), /unknown product/);
});

test("order flow with a stubbed payments service", async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push([url, opts.method, opts.headers["x-request-id"]]);
    return { status: 201, json: async () => ({ id: "pay_1" }) };
  };
  const server = await listen(createApp({ fetchImpl, logSink: () => {} }));
  const b = `http://127.0.0.1:${server.address().port}`;
  const r = await fetch(`${b}/orders`, {
    method: "POST", headers: { "content-type": "application/json", "x-request-id": "rid-7" },
    body: JSON.stringify({ items: [{ productId: "p1", quantity: 1 }] }),
  });
  const order = await r.json();
  assert.strictEqual(r.status, 201);
  assert.strictEqual(order.status, "paid");
  assert.deepStrictEqual(calls[0], ["http://payments:4003/payments", "POST", "rid-7"]);
  assert.strictEqual((await fetch(`${b}/orders/${order.id}`)).status, 200);
  const cancelled = await fetch(`${b}/orders/${order.id}/cancel`, { method: "POST" });
  assert.strictEqual((await cancelled.json()).status, "cancelled");
  assert.strictEqual((await fetch(`${b}/orders/missing`)).status, 404);
  server.close();
});

test("empty cart is rejected", async () => {
  const server = await listen(createApp({ logSink: () => {} }));
  const r = await fetch(`http://127.0.0.1:${server.address().port}/orders`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: [] }),
  });
  assert.strictEqual(r.status, 400);
  server.close();
});
