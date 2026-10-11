#!/usr/bin/env node
// Weighted traffic generator with record/replay.
//   --mode baseline|spike|replay   --target URL   --duration SECONDS
//   --rate RPS (default 10, spike x5)   --record FILE   --replay FILE
//   --report FILE   --max-error-rate 0.01   --seed N   --notes-numeric FRACTION
const fs = require("node:fs");

function parseArgs(argv) {
  const out = { mode: "baseline", target: "http://localhost:4001", duration: 30, rate: 10, seed: 1 };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i].replace(/^--/, "").replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const v = argv[i + 1];
    out[k] = ["duration", "rate", "seed", "maxErrorRate", "notesNumeric"].includes(k) ? Number(v) : v;
  }
  return out;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PRODUCTS = ["p1", "p2", "p3", "p4"];
// Weighted endpoint mix. `edge` flows exercise payment edge cases (currencies, wallets, big carts).
const MIX = [
  { w: 30, make: () => ({ method: "GET", path: "/products" }) },
  { w: 15, make: (r) => ({ method: "GET", path: `/products/${pick(r, PRODUCTS)}` }) },
  { w: 25, make: (r) => order(r, { currency: "USD", method: { type: "card" } }) },
  { w: 8, make: (r) => order(r, { currency: "EUR", method: { type: "wallet" } }) },
  { w: 5, make: (r) => order(r, { currency: "GBP", method: { type: "card" } }, 6) },
  { w: 5, make: (r) => order(r, { currency: "USD", method: { type: "wallet" } }, 3, "p2") },
  { w: 7, make: () => ({ method: "GET", path: "/orders" }) },
  { w: 3, make: () => ({ method: "GET", path: "/orders/does-not-exist", expect: 404 }) },
  { w: 2, make: () => ({ method: "POST", path: "/orders", body: { items: [] }, expect: 400 }) },
];

function pick(r, arr) {
  return arr[Math.floor(r() * arr.length)];
}

function order(r, extra, maxQty = 3, product) {
  const items = [{ productId: product || pick(r, PRODUCTS), quantity: 1 + Math.floor(r() * maxQty) }];
  return { method: "POST", path: "/orders", body: { items, ...extra } };
}

// Traffic shift: a fraction of orders carry numeric `notes` (a client bug we want to surface).
function shifted(next, fraction, r) {
  return () => {
    const req = next();
    if (req.method === "POST" && req.path === "/orders" && req.body.items.length && r() < fraction) {
      return { ...req, body: { ...req.body, notes: 12345 } };
    }
    return req;
  };
}

function planner(seed) {
  const r = rng(seed);
  const total = MIX.reduce((s, m) => s + m.w, 0);
  return () => {
    let x = r() * total;
    for (const m of MIX) {
      if ((x -= m.w) < 0) return m.make(r);
    }
    return MIX[0].make(r);
  };
}

async function fire(target, req) {
  const start = performance.now();
  try {
    const res = await fetch(target + req.path, {
      method: req.method,
      headers: { "content-type": "application/json", "x-request-id": `lg-${Math.random().toString(36).slice(2)}` },
      body: req.body ? JSON.stringify(req.body) : undefined,
    });
    await res.arrayBuffer();
    const expected = req.expect || (req.method === "POST" && req.path === "/orders" ? 201 : 200);
    return { status: res.status, ok: res.status === expected, ms: performance.now() - start };
  } catch {
    return { status: 0, ok: false, ms: performance.now() - start };
  }
}

async function run(opts) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let next;
  if (opts.mode === "replay") {
    const recorded = fs.readFileSync(opts.replay, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    let i = 0;
    next = () => recorded[i++ % recorded.length];
  } else {
    next = planner(opts.seed);
    if (opts.notesNumeric) next = shifted(next, opts.notesNumeric, rng(opts.seed + 1));
  }
  const rate = opts.mode === "spike" ? opts.rate * 5 : opts.rate;
  const recording = opts.record ? fs.createWriteStream(opts.record) : null;
  const results = [];
  const inflight = new Set();
  const end = Date.now() + opts.duration * 1000;
  while (Date.now() < end) {
    const req = next();
    if (recording) recording.write(JSON.stringify(req) + "\n");
    const p = fire(opts.target, req).then((r) => {
      results.push(r);
      inflight.delete(p);
    });
    inflight.add(p);
    await sleep(1000 / rate);
  }
  await Promise.all(inflight);
  if (recording) recording.end();
  const lat = results.map((r) => r.ms).sort((a, b) => a - b);
  const failed = results.filter((r) => !r.ok).length;
  return {
    mode: opts.mode,
    requests: results.length,
    errors: failed,
    error_rate: results.length ? failed / results.length : 0,
    p50_ms: lat[Math.floor(lat.length * 0.5)] || 0,
    p95_ms: lat[Math.floor(lat.length * 0.95)] || 0,
  };
}

module.exports = { planner, rng, parseArgs, run };

if (require.main === module) {
  const opts = parseArgs(process.argv.slice(2));
  run(opts).then((report) => {
    console.log(JSON.stringify(report));
    if (opts.report) fs.writeFileSync(opts.report, JSON.stringify(report, null, 2));
    if (opts.maxErrorRate !== undefined && report.error_rate > opts.maxErrorRate) process.exit(1);
  });
}
