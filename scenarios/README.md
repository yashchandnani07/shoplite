# Scenario library

Ten failure scenarios (28 variants) with machine-readable ground truth. Each one is a set of
commits that is injected as a real pull request, merged to `main` and deployed by `deploy.yml`.

| ID | What it tests | Split | Variants |
|---|---|---|---|
| S1 | Payment-validation refactor throws on a valid input | tune | 3 |
| S2 | Two functions changed in one file, one on the failing path | test | 3 |
| S3 | Deployment bundles 5 commits, one culprit | tune | 1 |
| S4 | Bug in orders, symptom in payments | test | 3 |
| S5 | Dependency bump (money-utils) breaks formatting | tune | 3 |
| S6 | Config-only change (no code diff), honest "not a code bug" | test | 3 |
| S7 | Latent commit, triggered later by a traffic pattern | test | 3 |
| S8 | Recurrence of the S1 pattern in another service (memory) | tune | 3 |
| S9 | Refactor renames/moves the culprit function (expected partial failure) | test | 3 |
| S10 | Culprit alongside unrelated flaky endpoint errors | test | 3 |

`tune` scenarios may be used to fit ranking weights, `test` scenarios are held out.

## Files

`S<n>.yaml`: `variants` (template variables), `commits[].edits` (exact-match find/replace or
`create`), `commits[].culprit`, `ground_truth` (culprit function or file, affected services,
expected fix), `expect` (error-rate thresholds used by the verifier).

## Commands

```bash
node scenarios/inject.js S1 --variant 0 --dry-run     # show the diff only
node scenarios/inject.js S1 --variant 0 --load 120    # PR -> merge -> deploy -> drive load
node scenarios/verify.js [S1 ...]                     # verify ground-truth labels (below)
```

`verify.js` applies each variant to a scratch copy and checks that (1) CI would still pass
(`npm test`), (2) the unmodified app is healthy under the baseline load, (3) the modified app
breaks under load as the scenario's `expect` says. `scenarios/test` checks every variant applies
cleanly to the current tree, so scenarios cannot silently rot.
