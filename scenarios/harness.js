// Runs the three services in-process from `root` and drives load; prints a JSON report.
// usage: node harness.js <root> '<json options>'
const path = require("node:path");
const [root, optionsJson] = process.argv.slice(2);
const options = JSON.parse(optionsJson || "{}");
const load = require(path.join(__dirname, "..", "loadgen", "loadgen.js"));

const listen = (app) => new Promise((r) => { const s = app.listen(0, () => r(s)); });
const url = (s) => `http://127.0.0.1:${s.address().port}`;
const mod = (svc) => require(path.join(root, "services", svc, "src", "app.js"));

(async () => {
  const sink = () => {};
  const pay = await listen(mod("payments").createApp({ logSink: sink }));
  const paymentsUrl = (options.env && options.env.orders && options.env.orders.PAYMENTS_URL) || url(pay);
  const ord = await listen(mod("orders").createApp({ paymentsUrl, logSink: sink }));
  const gw = await listen(mod("gateway").createApp({ ordersUrl: url(ord), paymentsUrl: url(pay), logSink: sink }));
  const report = await load.run({
    mode: "baseline", target: url(gw), duration: options.duration || 4, rate: 60, seed: options.seed || 11,
    notesNumeric: options.notesNumeric || 0,
  });
  console.log(JSON.stringify(report));
  process.exit(0);
})();
