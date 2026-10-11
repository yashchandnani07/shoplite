const test = require("node:test");
const assert = require("node:assert");
const { validatePayment } = require("../src/payment/validation");
const { createApp } = require("../src/app");

const listen = (app) => new Promise((r) => { const s = app.listen(0, () => r(s)); });
const base = (s) => `http://127.0.0.1:${s.address().port}`;

test("validatePayment accepts a valid payment and rejects bad ones", () => {
  const ok = { orderId: "o1", amount: 10, currency: "USD", method: { type: "card" } };
  assert.deepStrictEqual(validatePayment(ok), { valid: true, errors: [] });
  assert.strictEqual(validatePayment({ ...ok, currency: "JPY" }).valid, false);
  assert.strictEqual(validatePayment({ ...ok, amount: -1 }).valid, false);
  assert.strictEqual(validatePayment(null).valid, false);
});

test("capture, fetch and refund a payment", async () => {
  const server = await listen(createApp({ logSink: () => {} }));
  const b = base(server);
  const body = { orderId: "o1", amount: 19.5, currency: "EUR", method: { type: "wallet" } };
  const created = await fetch(`${b}/payments`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  assert.strictEqual(created.status, 201);
  const pay = await created.json();
  assert.strictEqual(pay.amountCents, 1950);
  assert.strictEqual((await fetch(`${b}/payments/${pay.id}`)).status, 200);
  assert.strictEqual((await fetch(`${b}/payments/${pay.id}/refund`, { method: "POST" })).status, 200);
  assert.strictEqual((await fetch(`${b}/payments/${pay.id}/refund`, { method: "POST" })).status, 409);
  assert.strictEqual((await fetch(`${b}/payments/nope`)).status, 404);
  server.close();
});

test("invalid payment is a 400 with reasons", async () => {
  const server = await listen(createApp({ logSink: () => {} }));
  const r = await fetch(`${base(server)}/payments`, {
    method: "POST", headers: { "content-type": "application/json" }, body: "{}",
  });
  assert.strictEqual(r.status, 400);
  assert.ok((await r.json()).errors.length > 0);
  server.close();
});

test("amount that disagrees with amountCents is a 422", async () => {
  const server = await listen(createApp({ logSink: () => {} }));
  const r = await fetch(`${base(server)}/payments`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderId: "o1", amount: 10, amountCents: 999, currency: "USD", method: { type: "card" } }),
  });
  assert.strictEqual(r.status, 422);
  server.close();
});

test("amounts above the ceiling are rejected", () => {
  const big = { orderId: "o1", amount: 40000, currency: "USD", method: { type: "card" } };
  assert.strictEqual(validatePayment(big).valid, false);
});

test("a 500 payment is within the ceiling", () => {
  const ok = { orderId: "o1", amount: 500, currency: "USD", method: { type: "card" } };
  assert.strictEqual(validatePayment(ok).valid, true);
});

test("the same idempotency key returns the original payment", async () => {
  const server = await listen(createApp({ logSink: () => {} }));
  const send = () => fetch(`${base(server)}/payments`, {
    method: "POST", headers: { "content-type": "application/json", "idempotency-key": "k-1" },
    body: JSON.stringify({ orderId: "o1", amount: 10, currency: "USD", method: { type: "card" } }),
  });
  const a = await (await send()).json();
  const b = await (await send()).json();
  assert.strictEqual(a.id, b.id);
  server.close();
});

test("payments without an idempotency key are distinct", async () => {
  const server = await listen(createApp({ logSink: () => {} }));
  const send = (orderId) => fetch(`${base(server)}/payments`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderId, amount: 10, currency: "USD", method: { type: "card" } }),
  });
  const a = await (await send("o1")).json();
  const b = await (await send("o2")).json();
  assert.notStrictEqual(a.id, b.id);
  server.close();
});
