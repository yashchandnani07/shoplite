// Structured JSON logs, request-id propagation, Prometheus metrics and an optional
// telemetry shipper that forwards request/error events to CausalDeploy.
// Log line: {ts, level, service, msg, request_id?, ...fields}.
const crypto = require("node:crypto");

function createLogger(service, sink = (line) => process.stdout.write(line + "\n")) {
  const emit = (level) => (msg, fields = {}) =>
    sink(JSON.stringify({ ts: new Date().toISOString(), level, service, msg, ...fields }));
  return { info: emit("info"), warn: emit("warn"), error: emit("error") };
}

function stackFrames(err) {
  const frames = (e) =>
    String((e && e.stack) || "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("at "))
      .map((l) => l.slice(3));
  const out = [...frames(err), ...frames(err && err.cause)].slice(0, 8);
  // never ship an empty stack: the error line itself is still evidence
  return out.length ? out : [`${err && err.name}: ${err && err.message}`];
}

class Metrics {
  constructor(service) {
    this.service = service;
    this.counts = new Map();
    this.duration = new Map();
  }
  observe(route, method, status, ms) {
    const key = `${method}|${route}|${status}`;
    this.counts.set(key, (this.counts.get(key) || 0) + 1);
    this.duration.set(key, (this.duration.get(key) || 0) + ms);
  }
  render() {
    const lines = [
      "# TYPE http_requests_total counter",
      "# TYPE http_request_duration_ms_sum counter",
    ];
    for (const [key, n] of this.counts) {
      const [method, route, status] = key.split("|");
      const labels = `service="${this.service}",method="${method}",route="${route}",status="${status}"`;
      lines.push(`http_requests_total{${labels}} ${n}`);
      lines.push(`http_request_duration_ms_sum{${labels}} ${this.duration.get(key).toFixed(2)}`);
    }
    return lines.join("\n") + "\n";
  }
}

// Batches telemetry and POSTs it to CausalDeploy. Never throws into the request path.
class Shipper {
  constructor({ url, apiKey, repo, service, env = "prod", fetchImpl = fetch, intervalMs = 5000 }) {
    Object.assign(this, { url, apiKey, repo, service, env, fetchImpl });
    this.buffer = [];
    this.timer = url && apiKey ? setInterval(() => this.flush(), intervalMs).unref() : null;
  }
  push(event) {
    if (!this.timer) return;
    this.buffer.push({
      type: "telemetry", repo: this.repo, service: this.service, env: this.env,
      ts: new Date().toISOString(), ...event,
    });
    if (this.buffer.length >= 100) this.flush();
  }
  async flush() {
    if (!this.buffer.length) return;
    const batch = this.buffer.splice(0, this.buffer.length);
    try {
      await this.fetchImpl(`${this.url}/api/v1/events`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": this.apiKey },
        body: JSON.stringify(batch),
      });
    } catch {
      /* telemetry is best effort */
    }
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
  }
}

function instrument(app, { service, logger, metrics, shipper }) {
  app.use((req, res, next) => {
    req.id = req.headers["x-request-id"] || crypto.randomUUID();
    res.setHeader("x-request-id", req.id);
    const start = process.hrtime.bigint();
    res.on("finish", () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      const route = req.route ? req.baseUrl + req.route.path : "unmatched";
      if (route !== "/metrics" && route !== "/health") metrics.observe(route, req.method, res.statusCode, ms);
      logger.info("request", {
        request_id: req.id, method: req.method, route, status: res.statusCode,
        latency_ms: Math.round(ms * 100) / 100,
      });
      if (shipper && route !== "/metrics" && route !== "/health") {
        shipper.push({
          kind: "request", request_id: req.id, endpoint: `${req.method} ${route}`,
          status_code: res.statusCode, latency_ms: ms,
        });
      }
    });
    next();
  });
  app.get("/metrics", (_req, res) => res.type("text/plain").send(metrics.render()));
  app.get("/health", (_req, res) => res.json({ ok: true, service }));
}

function errorHandler({ logger, shipper }) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, _next) => {
    const frames = stackFrames(err);
    logger.error("unhandled error", {
      request_id: req.id, error_type: err.name, message: err.message, stack: frames,
      endpoint: `${req.method} ${req.route ? req.baseUrl + req.route.path : req.path}`,
    });
    if (shipper) {
      shipper.push({
        kind: "error", request_id: req.id, error_type: err.name, message: err.message,
        stack: frames, endpoint: `${req.method} ${req.path}`, status_code: 500,
      });
    }
    res.status(err.status || 500).json({ error: err.expose ? err.message : "internal error" });
  };
}

// Calls another service, propagating the request id so logs correlate across services.
async function callJson(url, { method = "GET", body, requestId, fetchImpl = fetch } = {}) {
  const res = await fetchImpl(url, {
    method,
    headers: { "content-type": "application/json", "x-request-id": requestId || "" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

module.exports = { createLogger, Metrics, Shipper, instrument, errorHandler, callJson, stackFrames };
