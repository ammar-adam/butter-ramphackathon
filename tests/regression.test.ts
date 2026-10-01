import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { forecastIngredient } from '../lib/forecast-engine.ts';
import { aggregatePlanning, convertMoney, fxSensitivity } from '../lib/currency-planning.ts';
import { demoIngredients, demoSales } from '../lib/demo-data.ts';
import { cafeLocations, legalEntities, scopedLocations } from '../lib/entity-data.ts';
// Application source uses bundler-style extensionless imports. This narrowly
// scoped Node24 test hook adds .ts only for unresolved relative module imports;
// production source/imports stay unchanged.
registerHooks({ resolve(specifier, context, nextResolve) {
  try { return nextResolve(specifier, context); }
  catch (error) {
    if (specifier.startsWith('./') && !/\.[a-z]+$/i.test(specifier) && (error as { code?: string }).code === 'ERR_MODULE_NOT_FOUND') return nextResolve(specifier + '.ts', context);
    throw error;
  }
} });
const { buildNetworkPlan, getLocationIngredients } = await import('../lib/network-planning.ts');
const options = { forecastDate: '2026-10-01', weekendUplift: 0 };
test('actual September history produces a coherent October butter decision and shelf decomposition', () => {
  assert.equal(demoSales.at(-1)?.date, '2026-09-30');
  const ingredient = demoIngredients[0], r = forecastIngredient(demoSales, ingredient, options);
  assert.equal(r.recommendedCases, 6);
  assert.equal(r.recommendedQuantity, 30);
  assert.equal(r.recommendedCost, 315);
  assert.equal(r.expectedExpiryWaste, 0);
  assert.ok(Math.abs(r.expectedWaste - r.expectedLeftover) < 1e-9);
  assert.ok(Math.abs(r.expectedShortage - r.preArrivalShortage) < 1e-9);
});
test('zero order under ample live stock has no newly ordered waste, including one-day shelves', () => {
  const r = forecastIngredient(demoSales, { ...demoIngredients[0], onHand: 1000, shelfDays: 1 }, options);
  assert.equal(r.recommendedCases, 0);
  assert.equal(r.expectedWaste, 0);
  assert.equal(r.expectedExpiryWaste, 0);
  assert.equal(r.expectedLeftover, 0);
  assert.equal(r.expectedShortage, 0);
});
test('network totals preserve each local case price and convert currency buckets only', () => {
  const plan = buildNetworkPlan(options);
  assert.equal(plan.locations.length, 100);
  assert.equal(plan.rollup.entities.length, legalEntities.length);
  let cad = 0;
  for (const row of plan.locations) {
    const local = row.forecasts.reduce((n, f) => n + f.forecast.recommendedCases * f.ingredient.packPrice, 0);
    assert.equal(row.totalCost, local);
    cad += convertMoney(local, row.currency, 'CAD');
    assert.equal(row.currency, row.entity.currency);
    assert.equal(row.franchisee.id, row.entity.franchiseeId);
  }
  assert.ok(Math.abs(cad - plan.rollup.reportingTotal) < 1e-7);
  assert.deepEqual(plan.rollup.localTotals, aggregatePlanning(plan.planningLines).localTotals);
  assert.ok(Object.keys(plan.rollup.localTotals).length === 4);
});
test('intersection filters isolate entities and contradictory scope returns empty totals', () => {
  const entity = legalEntities[0];
  const plan = buildNetworkPlan({ ...options, entityId: entity.id });
  assert.equal(plan.locations.length, scopedLocations({ entityId: entity.id }).length);
  assert.equal(plan.rollup.entities.length, 1);
  assert.ok(plan.planningLines.every(l => l.entityId === entity.id));
  const other = legalEntities.find(e => e.franchiseeId !== entity.franchiseeId)!;
  const empty = buildNetworkPlan({ ...options, entityId: entity.id, franchiseeId: other.franchiseeId });
  assert.equal(empty.locations.length, 0);
  assert.equal(empty.rollup.reportingTotal, 0);
  const single = buildNetworkPlan({ ...options, locationId: cafeLocations[0].id });
  assert.equal(single.locations.length, 1);
});
test('FX sensitivities preserve local commitments; local price scaling preserves cost ratio', () => {
  const plan = buildNetworkPlan(options), sensitivity = fxSensitivity(plan.planningLines);
  assert.deepEqual(sensitivity.strongerCAD.localTotals, plan.rollup.localTotals);
  assert.deepEqual(sensitivity.weakerCAD.localTotals, plan.rollup.localTotals);
  assert.ok(sensitivity.strongerCAD.reportingTotal <= plan.rollup.reportingTotal);
  assert.ok(sensitivity.weakerCAD.reportingTotal >= plan.rollup.reportingTotal);
  for (const location of cafeLocations) {
    const ingredients = getLocationIngredients(location.id);
    for (let i = 0; i < ingredients.length; i++) assert.ok(Math.abs(ingredients[i].shortageCost / ingredients[i].overageCost - demoIngredients[i].shortageCost / demoIngredients[i].overageCost) < 1e-10);
  }
});

