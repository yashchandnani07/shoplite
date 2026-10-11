# Seeded history and historical incidents

The history is real: 13 pull requests merged with merge commits (not squashed), 70+ commits by
several identities, plus noise (docs, refactors, CI, dependency bumps). Three incidents were
introduced and later fixed; CausalDeploy uses them as ground truth and as incident memory.

| # | Symptom in production | Culprit commit | Culprit function | Fix commit |
|---|---|---|---|---|
| H1 | `POST /orders` returns 402 for carts above 300 (`amount exceeds limit`) | `be346a4b4689d082ff4cbdfffb47b25191d37611` | `services/payments/src/payment/validation.js::validateAmount` | `9ef9311c1d65c2bacfa043d681a148fb5fc0631d` |
| H2 | `POST /orders` returns 402; payments answers 422 `amount mismatch` for most cart totals | `3a8d73258607472ecf963825d16c35bbead5b7f2` | `lib/money-utils/src/index.js::toCents` (dependency bump to 2.0.0) | `4739d5cdfb0e82abceff5baddb6b32033407b926` |
| H3 | `POST /orders` returns 502 `payment does not belong to order` after the first payment | `bf83c94bc5ff1eb174304fd9281abd1bafa86959` | `services/payments/src/app.js::POST /payments` handler | `e8a4d05a4f24aa71fd7e3e38c15b192d9b00bc9d` |

Why tests did not catch them: H1 tests used amounts under the ceiling, H2 fixtures were changed to
values that survive truncation (19.5), H3 only tested requests with an explicit key.
