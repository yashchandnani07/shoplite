#!/usr/bin/env node
// Injector: turns a scenario into a real PR on main (which deploys), then optionally drives load.
//   node scenarios/inject.js S1 [--variant 0] [--dry-run] [--no-merge] [--load 120] [--target URL]
// Requires `git` and an authenticated `gh` for the real run. --dry-run applies the edits to a
// scratch copy and prints the diff.
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const L = require("./lib");

const ROOT = path.join(__dirname, "..");

function sh(cmd, cwd = ROOT) {
  return execSync(cmd, { cwd, encoding: "utf8" }).trim();
}

function parse(argv) {
  const a = { id: argv[0], variant: 0, flags: new Set() };
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === "--variant") a.variant = Number(argv[++i]);
    else if (argv[i] === "--load") a.load = Number(argv[++i]);
    else if (argv[i] === "--target") a.target = argv[++i];
    else a.flags.add(argv[i]);
  }
  return a;
}

function main() {
  const args = parse(process.argv.slice(2));
  if (!args.id) throw new Error(`usage: inject.js <${L.listScenarios().join("|")}> [options]`);
  const scenario = L.resolve(L.loadScenario(args.id), args.variant);
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
  const branch = `scenario/${scenario.id.toLowerCase()}-v${args.variant}-${stamp}`;

  if (args.flags.has("--dry-run")) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "inject-"));
    sh(`rsync -a --exclude .git --exclude node_modules "${ROOT}/" "${dir}/"`);
    sh("git init -q && git add -A && git -c user.name=x -c user.email=x@x commit -qm base", dir);
    L.apply(dir, scenario);
    console.log(sh("git diff", dir) || "(no diff: config-only scenario touches no tracked code)");
    return;
  }

  sh("git checkout -q main && git pull -q");
  sh(`git checkout -q -b ${branch}`);
  const culprits = [];
  L.apply(ROOT, scenario, (commit, i) => {
    sh("git add -A");
    sh(`git commit -q -m ${JSON.stringify(commit.message)}`);
    if (commit.culprit) culprits.push({ index: i, sha: sh("git rev-parse HEAD"), message: commit.message });
  });
  sh(`git push -q -u origin ${branch}`);
  const body = `Scenario ${scenario.id}: ${scenario.title}\n\nGround truth: ${JSON.stringify(scenario.ground_truth)}`;
  const pr = sh(`gh pr create --base main --head ${branch} --title ${JSON.stringify(`[${scenario.id}] ${scenario.title}`)} --body ${JSON.stringify(body)}`);
  console.log(JSON.stringify({ scenario: scenario.id, branch, pr, culprits, ground_truth: scenario.ground_truth }, null, 2));
  if (args.flags.has("--no-merge")) return;
  sh(`gh pr merge ${pr} --merge --delete-branch`);
  sh("git checkout -q main && git pull -q");
  if (args.load) {
    const target = args.target || process.env.SHOPLITE_URL || "http://localhost:4001";
    console.log(sh(`node loadgen/loadgen.js --mode baseline --target ${target} --duration ${args.load}`));
  }
}

main();
