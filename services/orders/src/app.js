const crypto = require("node:crypto");
const express = require("express");
const { fromCents } = require("money-utils");
const obs = require("shoplite-obs");
const { PRODUCTS, byId } = require("./catalog");
const { priceOrder } = require("./pricing");

function createApp({ paymentsUrl = "http://payments:4003", fetchImpl = fetch, logSink, shipper } = {}) {
  const app = express();
  const orders = new Map();
  const logger = obs.createLogger("orders", logSink);
  const metrics = new obs.Metrics("orders");
  app.use(express.json());
  obs.instrument(app, { service: "orders", logger, metrics, shipper });

  app.get("/products", (req, res) => {
    const q = String(req.query.q || "").toLowerCase();
    const products = q ? PRODUCTS.filter((p) => p.name.toLowerCase().includes(q)) : PRODUCTS;
    res.json({ products });
  });

  app.get("/products/:id", (req, res) => {
    const product = byId(req.params.id);
    if (!product) return res.status(404).json({ error: "product not found" });
    res.json(product);
  });

  app.post("/orders", async (req, res, next) => {
    try {
      const { items, currency = "USD", method = { type: "card" } } = req.body || {};
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "items required" });
      }
      const priced = priceOrder(items);
      logger.info("order priced", { request_id: req.id, total_cents: priced.totalCents });
      const order = { id: `ord_${crypto.randomBytes(5).toString("hex")}`, status: "pending", ...priced };
      const paid = await obs.callJson(`${paymentsUrl}/payments`, {
        method: "POST", requestId: req.id, fetchImpl,
        body: {
          orderId: order.id, amount: fromCents(order.totalCents), amountCents: order.totalCents, currency, method,
        },
      });
      if (paid.status !== 201) {
        order.status = "payment_failed";
        orders.set(order.id, order);
        return res.status(402).json({ order, payment: paid.data });
      }
      if (paid.data.orderId !== order.id) {
        order.status = "payment_failed";
        orders.set(order.id, order);
        return res.status(502).json({ error: "payment does not belong to order", order });
      }
      order.status = "paid";
      order.paymentId = paid.data.id;
      orders.set(order.id, order);
      logger.info("order paid", { request_id: req.id, order_id: order.id });
      res.status(201).json(order);
    } catch (err) {
      next(err);
    }
  });

  app.get("/orders", (_req, res) => res.json({ orders: [...orders.values()] }));

  app.get("/orders/:id", (req, res) => {
    const order = orders.get(req.params.id);
    if (!order) return res.status(404).json({ error: "order not found" });
    res.json(order);
  });

  app.post("/orders/:id/cancel", async (req, res, next) => {
    try {
      const order = orders.get(req.params.id);
      if (!order) return res.status(404).json({ error: "order not found" });
      if (order.status !== "paid") return res.status(409).json({ error: "only paid orders can be cancelled" });
      await obs.callJson(`${paymentsUrl}/payments/${order.paymentId}/refund`, {
        method: "POST", requestId: req.id, fetchImpl,
      });
      order.status = "cancelled";
      res.json(order);
    } catch (err) {
      next(err);
    }
  });

  app.use(obs.errorHandler({ logger, shipper }));
  return app;
}

module.exports = { createApp };
