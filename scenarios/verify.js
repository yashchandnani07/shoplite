// Verifies ground-truth labels: for every scenario variant, apply it to a scratch copy,
// check CI would pass (npm test), then confirm the failure shows up under load.
//   node scenarios/verify.js [S1 S2 ...]
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, execSync } = require("node:child_process");
const L = require("./lib");

const ROOT = path.join(__dirname, "..");

function scratchCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shoplite-scn-"));
  // node_modules is copied as-is: workspace packages are relative symlinks into the copy's lib/
  execSync(`rsync -a --exclude .git "${ROOT}/" "${dir}/"`);
  return dir;
}

function harness(root, options) {
  const out = execFileSync("node", [path.join(__dirname, "harness.js"), root, JSON.stringify(options)], {
    encoding: "utf8",
  });
  return JSON.parse(out.trim().split("\n").pop());
}

function verifyOne(id, variant) {
  const scenario = L.resolve(L.loadScenario(id), variant);
  const dir = scratchCopy();
  try {
    L.apply(dir, scenario);
    let ci = "pass";
    try {
      execSync("npm test", { cwd: dir, stdio: "ignore" });
    } catch {
      ci = "FAIL";
    }
    const base = harness(ROOT, {});
    const options = { env: scenario.env_override };
    if (scenario.traffic_shift) options.notesNumeric = Number(scenario.traffic_shift.notes_numeric);
    const baselineAfter = scenario.traffic_shift ? harness(dir, {}) : null;
    const broken = harness(dir, options);
    const e = scenario.expect;
    const checks = {
      ci_passes: ci === "pass",
      healthy_before: base.error_rate < 0.01,
      fails_under_load: e.min_error_rate !== undefined ? broken.error_rate >= e.min_error_rate
        : broken.error_rate >= e.shifted_min_error_rate && baselineAfter.error_rate <= e.baseline_max_error_rate,
    };
    return { id, variant, error_rate: Number(broken.error_rate.toFixed(3)), ...checks, ok: Object.values(checks).every(Boolean) };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  const ids = process.argv.length > 2 ? process.argv.slice(2) : L.listScenarios();
  let failed = 0;
  for (const id of ids) {
    const n = L.loadScenario(id).variants.length;
    for (let v = 0; v < n; v++) {
      const r = verifyOne(id, v);
      console.log(JSON.stringify(r));
      if (!r.ok) failed++;
    }
  }
  process.exit(failed ? 1 : 0);
}

module.exports = { verifyOne };
