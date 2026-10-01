# Backprop

Bakery replenishment prototype for the Ramp hackathon. Sales and recipes predict ingredient usage; stock, supplier lead times, pack sizes and shelf life shape the next order. Owners can inspect a synthetic 100-café network across Canada, the US, India and Pakistan, with local budgets converted to an illustrative CAD reporting view.

**Start with [context.md](context.md)** for the integration handoff, implementation map, and known gaps.

## Run locally

Use Node 24.4+ (the test suite uses Node 24 hooks).

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173/. The default dataset is synthetic and needs no credentials.

```sh
npx tsc --noEmit
node --test --experimental-strip-types tests/forecast-engine.test.ts tests/currency-planning.test.ts tests/regression.test.ts
npm run build
```

This uses React 19, TypeScript, Vinext/Vite, Tailwind and Cloudflare's local worker runtime. It is not a plain Next.js server; see the handoff before choosing a deployment platform.

## Current boundaries

- All initial café, sales, supplier, invoice and currency-rate data is synthetic.
- CSV imports and edits are per café and remain in memory for the browser session.
- The forecasting engine is a seasonal simulation baseline, not TimesFM.
- Ramp and Square read adapters and a sandbox connection form exist. Actual accounts were not connected or live-tested.
- Local draft orders and CSV export work. Nothing is submitted to Ramp or suppliers.
- No production authorization, multi-franchise account isolation, durable storage, or payment execution has been implemented.

Never commit API credentials. `.env*`, `.dev.vars*`, dependency caches, build output and local runtime state are ignored.
