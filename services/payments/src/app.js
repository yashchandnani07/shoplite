const express = require("express");
const { toCents, formatMoney } = require("money-utils");
const obs = require("shoplite-obs");
const { validatePayment } = require("./payment/validation");
const { PaymentStore } = require("./payment/store");

function createApp({ store = new PaymentStore(), logSink, shipper } = {}) {
  const app = express();
  const logger = obs.createLogger("payments", logSink);
  const metrics = new obs.Metrics("payments");
  app.use(express.json());
  obs.instrument(app, { service: "payments", logger, metrics, shipper });

  app.post("/payments", (req, res) => {
    const check = validatePayment(req.body);
    if (!check.valid) return res.status(400).json({ errors: check.errors });
    const cents = toCents(req.body.amount);
    const payment = store.create({
      orderId: req.body.orderId,
      amountCents: cents,
      currency: req.body.currency,
      display: formatMoney(cents, req.body.currency),
    });
    logger.info("payment captured", { request_id: req.id, payment_id: payment.id });
    res.status(201).json(payment);
  });

  app.get("/payments", (_req, res) => res.json({ payments: store.list() }));

  app.get("/payments/:id", (req, res) => {
    const payment = store.get(req.params.id);
    if (!payment) return res.status(404).json({ error: "payment not found" });
    res.json(payment);
  });

  app.post("/payments/:id/refund", (req, res) => {
    const payment = store.get(req.params.id);
    if (!payment) return res.status(404).json({ error: "payment not found" });
    if (payment.status === "refunded") return res.status(409).json({ error: "already refunded" });
    payment.status = "refunded";
    res.json(payment);
  });

  app.use(obs.errorHandler({ logger, shipper }));
  return app;
}

module.exports = { createApp };
