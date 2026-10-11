# ShopLite

Demo target application for [CausalDeploy](https://github.com/akkki007/deploy-agent): a small
multi-service shop that we deploy for real and break in controlled, ground-truth-labelled ways.

```
client -> gateway :4001 -> orders :4002 -> payments :4003      shared: money-utils, shoplite-obs
```

| Service | Endpoints |
|---|---|
| gateway | `GET /products`, `GET /products/:id`, `POST /orders`, `GET /orders`, `GET /orders/:id`, `POST /orders/:id/cancel`, `GET /payments/:id`, `POST /payments/:id/refund` |
| orders | same order/product routes (`GET /products?q=` searches by name), calls payments |
| payments | `POST /payments` (`payment/validation.js::validatePayment`), `GET /payments`, `GET /payments/:id`, `POST /payments/:id/refund` |
| all | `GET /health`, `GET /metrics` (Prometheus text) |

Every service logs one JSON object per line and propagates `x-request-id`, so one request can be
followed across all three. With `CAUSALDEPLOY_URL` + `CAUSALDEPLOY_API_KEY` set, request and error
telemetry (with stack frames) is batched to CausalDeploy `POST /api/v1/events`.

## Run

```bash
npm install && npm test
docker compose up --build            # gateway on :4001 (GATEWAY_PORT to change)
node loadgen/loadgen.js --mode baseline --target http://localhost:4001 --duration 30
```

## Pipelines

| Workflow | Trigger | What |
|---|---|---|
| `ci.yml` | PR, push | tests + image build |
| `deploy.yml` | push to `main` | test, build+push images to GHCR, deploy to the prod host, record a GitHub Deployment (`sha_from..sha_to` in the payload) |
| `health-check.yml` | every 5 min | probe prod, post a `health` event to CausalDeploy |
| `verify.yml` | `workflow_call` / manual | bring up staging from any ref and run the baseline load; used by CausalDeploy to verify fixes |

Scenarios, injector and ground truth: [`scenarios/`](scenarios/README.md). Seeded history: [`docs/history.md`](docs/history.md).

## Request flow

`POST /orders` -> gateway forwards to orders -> orders prices the cart and calls payments -> payments validates and captures.
