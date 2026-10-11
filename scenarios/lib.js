// Scenario loading and application. Used by the injector, the verifier and tests.
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");
const YAML = require("yaml");

const DIR = __dirname;

function listScenarios() {
  return fs.readdirSync(DIR).filter((f) => /^S\d+\.ya?ml$/.test(f)).sort((a, b) =>
    Number(a.slice(1).split(".")[0]) - Number(b.slice(1).split(".")[0])).map((f) => f.replace(/\.ya?ml$/, ""));
}

function loadScenario(id) {
  return YAML.parse(fs.readFileSync(path.join(DIR, `${id}.yaml`), "utf8"));
}

function fill(value, vars) {
  if (typeof value === "string") {
    return value.replace(/\{\{(\w+)\}\}/g, (_, k) => {
      if (!(k in vars)) throw new Error(`scenario variable ${k} not defined`);
      return String(vars[k]);
    });
  }
  if (Array.isArray(value)) return value.map((v) => fill(v, vars));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v, vars)]));
  }
  return value;
}

// Variant `i` of a scenario with all template variables substituted.
function resolve(scenario, variant = 0) {
  const vars = (scenario.variants || [{}])[variant];
  if (!vars) throw new Error(`${scenario.id} has no variant ${variant}`);
  return fill({ ...scenario, variants: undefined }, vars);
}

function applyEdit(root, edit) {
  const file = path.join(root, edit.file);
  if (edit.create !== undefined) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, edit.create);
    return;
  }
  const text = fs.readFileSync(file, "utf8");
  const n = text.split(edit.find).length - 1;
  if (n !== 1) throw new Error(`${edit.file}: expected exactly one match, found ${n}`);
  fs.writeFileSync(file, text.replace(edit.find, () => edit.replace));
}

// Applies commits to a working tree. `onCommit(commit, index)` runs after each commit's edits.
function apply(root, resolved, onCommit = () => {}) {
  resolved.commits.forEach((commit, i) => {
    for (const edit of commit.edits || []) applyEdit(root, edit);
    for (const cmd of commit.run || []) execSync(cmd, { cwd: root, stdio: "ignore" });
    onCommit(commit, i);
  });
}

module.exports = { listScenarios, loadScenario, resolve, apply, fill };
