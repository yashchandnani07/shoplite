const express = require("express");
const obs = require("shoplite-obs");

// Public API: validates input shape, forwards to orders / payments with the request id.
function createApp({ ordersUrl = "http://orders:4002", paymentsUrl = "http://payments:4003",
  fetchImpl = fetch, logSink, shipper } = {}) {
  const app = express();
  const logger = obs.createLogger("gateway", logSink);
  const metrics = new obs.Metrics("gateway");
  app.use(express.json());
  obs.instrument(app, { service: "gateway", logger, metrics, shipper });

  const forward = (base, path, method = "GET") => async (req, res, next) => {
    try {
      const target = typeof path === "function" ? path(req) : path;
      const out = await obs.callJson(`${base}${target}`, {
        method, body: method === "GET" ? undefined : req.body, requestId: req.id, fetchImpl,
      });
      res.status(out.status).json(out.data);
    } catch (err) {
      next(err);
    }
  };

  app.get("/products", forward(ordersUrl, "/products"));
  app.get("/products/:id", forward(ordersUrl, (r) => `/products/${encodeURIComponent(r.params.id)}`));
  app.post("/orders", forward(ordersUrl, "/orders", "POST"));
  app.get("/orders", forward(ordersUrl, "/orders"));
  app.get("/orders/:id", forward(ordersUrl, (r) => `/orders/${encodeURIComponent(r.params.id)}`));
  app.post("/orders/:id/cancel",
    forward(ordersUrl, (r) => `/orders/${encodeURIComponent(r.params.id)}/cancel`, "POST"));
  app.get("/payments/:id", forward(paymentsUrl, (r) => `/payments/${encodeURIComponent(r.params.id)}`));
  app.post("/payments/:id/refund",
    forward(paymentsUrl, (r) => `/payments/${encodeURIComponent(r.params.id)}/refund`, "POST"));

  app.use(obs.errorHandler({ logger, shipper }));
  return app;
}

module.exports = { createApp };
