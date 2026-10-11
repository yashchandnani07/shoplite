const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execSync } = require("node:child_process");
const L = require("../lib");

const ROOT = path.join(__dirname, "..", "..");

test("there are ten scenarios with ground truth, a split, and a culprit commit", () => {
  const ids = L.listScenarios();
  assert.deepStrictEqual(ids, ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10"]);
  for (const id of ids) {
    const s = L.loadScenario(id);
    assert.ok(["tune", "test"].includes(s.split), id);
    assert.ok(s.ground_truth && s.ground_truth.affected_services.length > 0, id);
    assert.strictEqual(s.commits.filter((c) => c.culprit).length, 1, id);
  }
  const total = ids.reduce((n, id) => n + L.loadScenario(id).variants.length, 0);
  assert.ok(total >= 25, `variants: ${total}`);
});

test("every variant applies cleanly to the current tree (each find matches exactly once)", () => {
  for (const id of L.listScenarios()) {
    const scenario = L.loadScenario(id);
    scenario.variants.forEach((_, v) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scn-"));
      try {
        execSync(`rsync -a --exclude node_modules --exclude .git "${ROOT}/" "${dir}/"`);
        L.apply(dir, L.resolve(scenario, v));
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});
