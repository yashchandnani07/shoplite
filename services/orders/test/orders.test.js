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
    const orderId = opts.body ? JSON.parse(opts.body).orderId : undefined;
    return { status: 201, json: async () => ({ id: "pay_1", orderId }) };
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

test("product search filters by name", async () => {
  const server = await listen(createApp({ logSink: () => {} }));
  const r = await fetch(`http://127.0.0.1:${server.address().port}/products?q=key`);
  assert.deepStrictEqual((await r.json()).products.map((p) => p.id), ["p1"]);
  server.close();
});

test("a payment for another order is rejected with 502", async () => {
  const fetchImpl = async () => ({ status: 201, json: async () => ({ id: "pay_x", orderId: "ord_other" }) });
  const server = await listen(createApp({ fetchImpl, logSink: () => {} }));
  const r = await fetch(`http://127.0.0.1:${server.address().port}/orders`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ items: [{ productId: "p1", quantity: 1 }] }),
  });
  assert.strictEqual(r.status, 502);
  server.close();
});

test("priceOrder over several products", () => {
  const p = priceOrder([{ productId: "p2", quantity: 1 }, { productId: "p3", quantity: 1 }]);
  assert.strictEqual(p.subtotalCents, 28350);
  assert.strictEqual(p.totalCents, 30618);
});

test("notes are kept and cancel records a reason", async () => {
  const fetchImpl = async (_u, opts) => ({
    status: 201, json: async () => ({ id: "pay_2", orderId: opts.body ? JSON.parse(opts.body).orderId : undefined }),
  });
  const server = await listen(createApp({ fetchImpl, logSink: () => {} }));
  const b = `http://127.0.0.1:${server.address().port}`;
  const h = { "content-type": "application/json" };
  const o = await (await fetch(`${b}/orders`, { method: "POST", headers: h,
    body: JSON.stringify({ items: [{ productId: "p4", quantity: 1 }], notes: "gift" }) })).json();
  assert.strictEqual(o.notes, "gift");
  const c = await (await fetch(`${b}/orders/${o.id}/cancel`, { method: "POST", headers: h,
    body: JSON.stringify({ reason: "changed_mind" }) })).json();
  assert.strictEqual(c.cancelReason, "changed_mind");
  server.close();
});
