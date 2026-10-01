# Backprop — engineering handoff

Updated October 1, 2026. Repository: https://github.com/ammar-adam/butter-ramphackathon

## What we are building

Backprop recommends the next ingredient order for a bakery or café. The pitch is: **“Your bakery orders ingredients from habit. Backprop recommends the next order from data.”** The hackathon is 90 minutes; prioritize a reliable, legible demo over a large model or a production procurement platform.

The important distinction is purchases versus demand. Ramp invoices establish what was bought and its price. Square completed orders multiplied by recipe quantities establish ingredient usage. Ordering recommendations also need stock counts, incoming stock, supplier lead times, review intervals, pack sizes and shelf life.

The intended loop is:

1. Read Ramp bills and normalize ingredient units/prices.
2. Read Square sales for one location and map products to recipes.
3. Forecast usage and uncertainty.
4. Compute useful whole-case quantities from inventory and supplier constraints.
5. Review/edit the proposed order.
6. Eventually create an unsubmitted Ramp procurement draft. **Step 6 is not implemented against Ramp.** Current drafts are browser-session objects with CSV export.

Ramp staff also highlighted international businesses and entity structures. We added a Canadian owner's CAD reporting view over local-currency orders, grouped by franchisee, legal entity and location. A franchisee is not the same thing as a legal entity; consolidated reporting must not merge commitments or account permissions.

## Latest user decisions and exact stopping point

- Build V1 with the replenishment loop, international reporting and franchise/entity hierarchy.
- Replace the initial generic UI; use a Ramp-style workspace and populated sample data.
- User signed into Ramp's demo and requested real Ramp/Square sandbox integration.
- The Ramp developer-app page had no app. We staged “Backprop,” received explicit approval to accept developer terms and enable read-only bills access, and clicked Create app. Ramp then required email verification. **App/credential creation was not confirmed complete.**
- Square developer portal opened at sign-in. No Square token was obtained.
- The user then explicitly stopped integration work and asked for this GitHub handoff so their friend could finish it.
- **No Ramp/Square credentials were copied, stored or committed. No real bill/sales import succeeded. No external purchase order/payment was submitted.**

## What works now

### Owner overview

- 100 generated café records, three franchisees (45 / 33 / 22 cafés), six legal entities and four countries.
- Filters for franchisee and legal entity; location search and café drill-down.
- Native CAD, USD, INR and PKR order totals; reporting totals computed by converting currency buckets, not adding incompatible amounts.
- Illustrative exchange-rate scenario from -5% to +5% CAD strength. It changes the CAD reporting budget, not local prices or order quantities.
- Export of the scoped network plan to CSV.

### Café ordering workspace

- Butter, flour and milk; Croissant, Brioche and Sourdough recipes.
- 84 days of synthetic sales ending September 30, 2026. Each location scales that sample history and stock; they are not 100 independent real datasets.
- Historical usage chart, seven-day forecast, 80% simulation range.
- Weekend demand slider recalculates the café's recommendations and its network budget.
- Editable inventory, incoming deliveries, expiry, supplier lead/review days, case sizes/prices, usual orders, cost assumptions and recipe usage.
- Review/edit all ingredient case quantities, export CSV, or save a local draft.
- Drafts remain associated with one entity and café; supplier metadata is preserved on each line. Real multi-supplier procurement grouping remains future work.

### Data and Ramp-style workspace

- 18 synthetic invoice lines per selected café, in that café's native currency.
- Read adapters for Ramp bills and Square completed orders.
- CSV imports, product-to-recipe mapping, invoice review, applying a compatible invoice unit price to a case price.
- Case contents are never inferred from a vague invoice description.
- Importing an invoice does not count it as stock received.
- Session-only sandbox connection form that verifies read access before claiming a connection.
- The “Ramp workspace” is our UI mock, not an embedded or connected Ramp dashboard. Its drafts are explicitly local only.

## Stack and setup

React 19 + TypeScript, Vinext/Vite 8, Tailwind 4, existing Radix/shadcn controls, Lucide icons, and Cloudflare's worker runtime. Node 24.4+ is recommended. No application database is used.

```sh
npm ci
npm run dev
```

The dev URL is http://127.0.0.1:5173/. A clean clone defaults to the portable execution profile. Windows is supported; the app was developed on Windows. If a global npm shim fails, invoke your Node installation's `npm-cli.js` directly; this was an environment-specific workaround, not an app requirement.

```sh
npx tsc --noEmit
node --test --experimental-strip-types tests/forecast-engine.test.ts tests/currency-planning.test.ts tests/regression.test.ts
npm run build
```

`app/chatgpt-auth.ts` reads identity headers expected from the Sites dispatcher. Portable local development supplies a mock identity through `build/sites-vite-plugin.ts`. **Do not expose the local development server or trust client-supplied identity headers on a public host.** To deploy elsewhere, replace that trust boundary with real authentication/authorization and adapt the Cloudflare environment binding.

`.openai/hosting.json` contains a previously registered private Site ID, not an API credential. No Site deployment was completed. The Sites plugin disappeared from the local environment before the GitHub handoff, so its publishing helper was unavailable. This repository remains runnable with its checked-in framework scripts.

## Code map

| File | Responsibility |
| --- | --- |
| `app/page.tsx` | App state, network filters/rollups, per-location overrides, draft review, mock Ramp tables |
| `app/globals.css` | Redesigned responsive workspace styling |
| `components/order-planner.tsx` | Demand chart, forecast explanation, scenario slider, assumption/recipe editor |
| `components/data-sources.tsx` | CSV import, recipe mapping, invoice review, live import buttons |
| `components/sandbox-connect.tsx` | Sandbox credentials form; password fields clear after success |
| `components/backprop-controls.tsx` | Shared selectors, tables, CSV download, money/date formatting |
| `lib/forecast-engine.ts` | Deterministic seasonal scenarios and case optimization |
| `lib/demo-data.ts` | Base sales, recipes, stock and example purchases |
| `lib/entity-data.ts` | Franchisee/entity/location hierarchy |
| `lib/network-planning.ts` | Per-location synthetic data and fixed local prices; cached network forecasts |
| `lib/currency-planning.ts` | Conversion convention, validated rollups and FX sensitivity |
| `lib/csv-import.ts` | CSV quoting, validation, native currencies, safe CSV export |
| `lib/integration-adapters.ts` | Read-only Ramp and Square API adapters |
| `lib/integration-auth.ts` | Server environment allowlist and Ramp client-credential token exchange |
| `lib/sandbox-session.ts` | Per-user, short-lived server-memory credentials; lost on worker restart |
| `app/api/integrations/route.ts` | Authenticated status, imports and sandbox connection verification |
| `tests/` | Forecast, currency and network regression tests |

No business data or API tokens are persisted in browser storage. UI edits, imports and draft objects are in React memory. Refresh resets that data. Server sandbox credentials are separate, user-keyed memory with an eight-hour ceiling; worker eviction/restart can clear them sooner.

## Forecast and money semantics

The model is deliberately small and inspectable: 200 deterministic resampled weekly demand paths preserve the observed weekday pattern. Weekend uplift is *additional* to the historical weekend pattern. No TimesFM model is installed or called.

For each path, the engine simulates stock use, expiries, incoming deliveries and the new supplier order. It chooses an integer case quantity to balance emergency buying premiums and overage costs, considering useful demand within shelf life. The maximum protection horizon is 14 days. Missing dates are unknown; recorded sold-out products flag censored demand rather than fabricating lost sales.

The cost-ratio target is `shortageCost / (shortageCost + overageCost)`. Purchase cost is displayed separately. `shortageCost` is an extra ingredient procurement premium, not bakery product margin.

**Do not label modeled overage as literal food waste or realized savings.** `expectedWaste` is a legacy field name for ordered-stock overage: expired order stock plus stock still left at the review horizon. The engine separately returns `expectedExpiryWaste` and `expectedLeftover`, and corresponding usual-order fields. Butter can have leftovers that remain usable for weeks. UI comparison labels reflect that distinction.

Base sample bakery (before location scaling), forecast October 1, zero extra weekend demand: butter median four-day use is 34.596 kg; usable stock 7 kg; recommended six cases / 30 kg at USD 315. The initial sketch's five-case arithmetic is not used. Toronto Central has a 0.72 demand multiplier and different CAD prices, so its baseline is four butter cases and CAD 504 across all three ingredients. At +100% weekend demand, its full order becomes CAD 878 (7 butter, 9 flour, 3 milk cases).

FX assumptions are explicitly synthetic: CAD 1 = USD 0.72 = INR 60 = PKR 200, dated October 1, 2026. Convert `amount / rate[from] * rate[to]`. Local case prices are a separate illustrative table, not a live conversion or supplier quote. Cross-border payment, currency exchange execution, taxes, shipping and hedging are out of scope.

## Finish Ramp integration

1. Open https://demo.ramp.com/settings/ramp-developer/apps. Check whether “Backprop” was created after email verification; reuse it instead of creating duplicates.
2. Enable the app's client-credentials flow and allow `bills:read`. Add `entities:read` only if implementing explicit entity lookup. Do not request write/payment scopes for invoice import.
3. Use the existing sandbox client ID/secret or an access token. In the app: Data sources → Set up Ramp. The form calls our authenticated POST route and keeps verified sandbox credentials in server memory.
4. Alternatively configure server secrets `RAMP_CLIENT_ID`, `RAMP_CLIENT_SECRET`, `RAMP_ENVIRONMENT=sandbox`, or `RAMP_ACCESS_TOKEN`. `.env.example` documents the names. Check your runtime's actual environment loading; the server merges named Cloudflare bindings and `process.env`.
5. `withRampReadToken` exchanges client credentials at `https://demo-api.ramp.com/developer/v1/token` using Basic authentication and form fields `grant_type=client_credentials&scope=bills:read`.
6. `fetchRampPurchases` reads `/developer/v1/bills`, preserves `entity_id`, validates same-origin pagination and normalizes inventory-line minor-unit money. Ordinary financial line items can lack quantity/unit/unit price and must remain reviewable.
7. Map real Ramp entity IDs to the corresponding café/legal entity before adopting prices. Invoice issue date is not delivery date.
8. Verify import with an actual inventory bill. A sandbox with no inventory bills may legitimately return no usable ingredients; add appropriate test fixtures through authorized sandbox tools rather than pretending a connection supplied our samples.

The parser currently uses inventory accounting selections named `INVENTORY_ITEM` and `UNIT_OF_MEASURE`. Units such as “Kilogram” need an explicit normalization mapping to `kg`; do not guess pack contents. The current UI accepts only exact known ingredient names, canonical units and matching local currency for price application.

For write-back, research/authenticate the actual Ramp procurement API or MCP tool schema first. Draft procurement requests are distinct from bills. **Do not POST bills as a substitute for a purchase-order draft; that can start payable workflows. Do not submit/approve/pay during the demo.** There is currently no real Ramp MCP client, procurement draft call or write-back implementation.

Official references:
- https://docs.ramp.com/developer-api/v1/authorization
- https://support.ramp.com/accessing-the-developer-api/
- https://docs.ramp.com/llms-api.txt
- https://docs.ramp.com/developer-api/v1/pagination

## Finish Square integration

1. Sign into https://developer.squareup.com/apps, select the application, then Sandbox → Credentials.
2. Use its existing sandbox token. Default sandbox tokens may have broad access even though our code only reads. A scoped authorization needs `ORDERS_READ` and `MERCHANT_PROFILE_READ` for current behavior; catalog enrichment would also need `ITEMS_READ`.
3. Data sources → Set up Square accepts the token and optional location ID. Multiple active locations require an explicit location choice.
4. Server configuration alternative: `SQUARE_ACCESS_TOKEN`, `SQUARE_ENVIRONMENT=sandbox`, `SQUARE_LOCATION_ID`.
5. The adapter reads `/v2/locations` and POSTs read-only searches to `/v2/orders/search` for completed orders, cursor-paginates, and aggregates quantities by local calendar date using the location's timezone.
6. Confirm location assignment in Backprop, map product names to the three recipes, and import. Imported history replaces only the selected café's sales for the session. The forecast starts on the day after its latest imported sale.
7. Current code does not net returns/refunds or infer missing trading days. Sample product mappings must be replaced for real menu/catalog items.

Official references:
- https://developer.squareup.com/docs/build-basics/access-tokens
- https://developer.squareup.com/reference/square/orders-api/search-orders
- https://developer.squareup.com/reference/square/locations-api/list-locations

## Known gaps to address before real data or a public deployment

These are intentionally handed over, not silently represented as complete:

1. **Authorization:** GET checks a ChatGPT identity. Shared environment tokens are not additionally restricted to an owner/business allowlist. The initial planned Site audience was owner-private, but any other deployment needs explicit server-side authorization. The ownership selectors are not tenant security. Separate franchisees need separate authorized connections.
2. **Partial-day Square data:** The current checked-in adapter includes the current local day's completed orders. Exclude the current local calendar day (using the location timezone) before feeding daily forecasts; otherwise an incomplete trading day appears as low demand. A suitable fix is `localDate(order.closed_at) < localDate(now)`, with an explicit message about exclusion.
3. **Invoice assignment:** Unknown/null Ramp entity IDs need explicit review. The current UI uses a selected entity ID to gate price buttons but the underlying `applyPrice` function should repeat the full entity/currency/unit/positive-price validation. Improve ID-to-entity mapping and unit normalization.
4. **Input response validation:** Validate live import response arrays before updating React state. Current client code assumes the shape returned by our adapter.
5. **Credential lifecycle:** Session tokens disappear on isolate restart and have an eight-hour ceiling. Ramp access-token expiry is returned by exchange but not tracked by the session store; handle expiry/re-exchange cleanly. Environment-token mode needs documented expiry handling too.
6. **Persistence and audit:** No durable account connections, imports, inventory events, drafts, approvals or history. Refreshing the page restores sample UI state.
7. **Real procurement:** No Ramp draft creation or submission, supplier delivery addresses, taxes, delivery charges, actual supplier minimums, or cross-entity permission enforcement.
8. **Forecast validation:** Seasonal scenarios are a baseline, not a calibrated production forecast. Backtest, account for censored demand and trend, verify sales completeness, and choose overage costs appropriate to usable carry-over.
9. **WebMCP:** One optional feature-detected browser tool `read_backprop_plan` reads current recommendations. No supported browser tool-call validation was available; it is not a deployed MCP server or Ramp MCP connection.

## Validation and quick demo

- 21 forecast/currency/network tests passed, including 100-café totals, scope isolation, zero-order behavior, expiry, stockout timing, case rounding and FX sensitivity.
- Separate adapter fixtures checked token absence, money normalization, unsafe pagination rejection, truncation, timezone aggregation and location selection. Those scratch fixture scripts were not part of the initial app test suite; add maintained adapter tests while connecting the real accounts.
- TypeScript passed after the connection-form code was added.
- A production build passed before the final session-connection UI additions; see the final handoff status for whether the latest build was rerun.
- Browser checks verified the owner overview, scenario recomputation, order review and saving a local entity-bound draft. A PKR server/client formatting mismatch was fixed by explicit two-decimal display. Mobile styles exist but were not exhaustively tested.

Demo flow: Overview → select a franchisee/entity → open a café → Order planner → raise weekend demand → explain the case change → Review café order → edit a quantity → Save demo draft → inspect Ramp workspace → export CSV. Then show how CAD-strength assumptions change the owner reporting budget without changing a local supplier commitment.

Keep the boundary explicit to judges: **the calculation and local workflow are functional; the initial records, FX rates and Ramp-style workspace are simulated until the real adapters are connected.**
