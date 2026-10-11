// Full path gateway -> orders -> payments, all in-process on ephemeral ports.
const test = require("node:test");
const assert = require("node:assert");
const gateway = require("../src/app");
const orders = require("../../orders/src/app");
const payments = require("../../payments/src/app");

const listen = (app) => new Promise((r) => { const s = app.listen(0, () => r(s)); });
const url = (s) => `http://127.0.0.1:${s.address().port}`;

test("a request through the gateway produces correlated logs in all 3 services", async () => {
  const logs = [];
  const sink = (line) => logs.push(JSON.parse(line));
  const pay = await listen(payments.createApp({ logSink: sink }));
  const ord = await listen(orders.createApp({ paymentsUrl: url(pay), logSink: sink }));
  const gw = await listen(gateway.createApp({ ordersUrl: url(ord), paymentsUrl: url(pay), logSink: sink }));

  const r = await fetch(`${url(gw)}/orders`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": "corr-1" },
    body: JSON.stringify({ items: [{ productId: "p3", quantity: 1 }], currency: "USD" }),
  });
  assert.strictEqual(r.status, 201);
  const order = await r.json();
  assert.strictEqual(order.totalCents, 26892);

  const services = new Set(logs.filter((l) => l.request_id === "corr-1").map((l) => l.service));
  assert.deepStrictEqual([...services].sort(), ["gateway", "orders", "payments"]);

  const metrics = await (await fetch(`${url(gw)}/metrics`)).text();
  assert.match(metrics, /http_requests_total\{service="gateway"/);
  assert.deepStrictEqual(await (await fetch(`${url(gw)}/health`)).json(), { ok: true, service: "gateway" });

  [gw, ord, pay].forEach((s) => s.close());
});

test("unhandled errors are logged with stack and request id, response is a 500", async () => {
  const logs = [];
  const gw = await listen(
    gateway.createApp({
      ordersUrl: "http://127.0.0.1:1", // connection refused
      logSink: (l) => logs.push(JSON.parse(l)),
    }),
  );
  const r = await fetch(`${url(gw)}/products`, { headers: { "x-request-id": "err-1" } });
  assert.strictEqual(r.status, 500);
  const err = logs.find((l) => l.level === "error");
  assert.strictEqual(err.request_id, "err-1");
  assert.ok(Array.isArray(err.stack) && err.stack.length > 0);
  gw.close();
});
