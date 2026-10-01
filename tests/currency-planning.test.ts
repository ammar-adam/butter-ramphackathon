import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregatePlanning, convertMoney, formatMoney, fxSensitivity, ILLUSTRATIVE_RATES } from '../lib/currency-planning.ts';
import type { PlanningLine, Currency } from '../lib/currency-planning.ts';
const lines: PlanningLine[] = [
  { entityId: 'e1', franchiseeId: 'f1', locationId: 'c1', currency: 'USD', localCost: 72 },
  { entityId: 'e2', franchiseeId: 'f1', locationId: 'c2', currency: 'INR', localCost: 6000 },
  { entityId: 'e3', franchiseeId: 'f2', locationId: 'c3', currency: 'PKR', localCost: 20000 },
  { entityId: 'e3', franchiseeId: 'f2', locationId: 'c3', currency: 'CAD', localCost: 100 }
];
test('documented CAD cross-rates convert and round-trip all four currencies', () => {
  assert.equal(convertMoney(72, 'USD', 'CAD'), 100);
  assert.equal(convertMoney(6000, 'INR', 'PKR'), 20000);
  for (const c of ['CAD', 'USD', 'INR', 'PKR'] as Currency[]) assert.ok(Math.abs(convertMoney(convertMoney(125, c, 'CAD'), 'CAD', c) - 125) < 1e-10);
});
test('mixed local costs convert before owner aggregation; legal entities stay separate', () => {
  const r = aggregatePlanning(lines);
  assert.equal(r.reportingTotal, 400);
  assert.deepEqual(r.localTotals, { USD: 72, INR: 6000, PKR: 20000, CAD: 100 });
  assert.equal(r.entities.length, 3);
  assert.equal(r.franchisees[0].reportingTotal, 200);
  assert.deepEqual(r.franchisees[0].entityIds, ['e1', 'e2']);
  assert.equal(r.entities[2].reportingTotal, 200);
  assert.equal(r.rateKind, 'illustrative');
  assert.equal(r.rateAsOf, '2026-10-01');
});
test('100 cafe network preserves franchisee and entity ownership without mutating input', () => {
  const network = Array.from({ length: 100 }, (_, i): PlanningLine => ({ entityId: `entity-${Math.floor(i / 5)}`, franchiseeId: `owner-${Math.floor(i / 10)}`, locationId: `cafe-${i}`, currency: 'CAD', localCost: 10 }));
  const before = JSON.stringify(network), r = aggregatePlanning(network);
  assert.equal(r.reportingTotal, 1000); assert.equal(r.entities.length, 20); assert.equal(r.franchisees.length, 10);
  assert.ok(r.entities.every(e => e.locationIds.length === 5 && e.reportingTotal === 50));
  assert.ok(r.franchisees.every(f => f.entityIds.length === 2 && f.reportingTotal === 100));
  assert.equal(JSON.stringify(network), before);
});
test('invalid amounts, currencies, dates and nonpositive FX fail explicitly', () => {
  for (const value of [-1, NaN, Infinity]) assert.throws(() => convertMoney(value, 'CAD', 'USD'));
  assert.throws(() => convertMoney(1, 'EUR' as Currency, 'CAD'));
  assert.throws(() => convertMoney(1, 'CAD', 'USD', { ...ILLUSTRATIVE_RATES, unitsPerCAD: { ...ILLUSTRATIVE_RATES.unitsPerCAD, USD: 0 } }));
  assert.throws(() => convertMoney(1, 'CAD', 'USD', { ...ILLUSTRATIVE_RATES, asOf: '2026-02-30' }));
  assert.equal(convertMoney(0, 'CAD', 'USD'), 0);
});
test('ownership conflicts cannot silently combine legal-entity order groups', () => {
  assert.throws(() => aggregatePlanning([lines[0], { ...lines[0], franchiseeId: 'another' }]));
  assert.throws(() => aggregatePlanning([lines[0], { ...lines[0], entityId: 'another' }]));
  assert.throws(() => aggregatePlanning([{ ...lines[0], entityId: '' }]));
});
test('5% FX shocks change reporting budgets only and leave CAD costs fixed', () => {
  const r = fxSensitivity(lines);
  assert.ok(Math.abs(r.strongerCAD.reportingTotal - (100 + 300 / 1.05)) < 1e-9);
  assert.ok(Math.abs(r.weakerCAD.reportingTotal - (100 + 300 / 0.95)) < 1e-9);
  assert.deepEqual(r.strongerCAD.localTotals, r.baseline.localTotals);
  assert.deepEqual(r.weakerCAD.localTotals, r.baseline.localTotals);
  assert.throws(() => fxSensitivity(lines, ILLUSTRATIVE_RATES, 1));
});
test('Intl handles minor-unit display; no arithmetic rounding before aggregation', () => {
  assert.equal(formatMoney(12.345, 'CAD'), new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', currencyDisplay: 'code' }).format(12.345));
  const r = aggregatePlanning([{ ...lines[0], localCost: 0.001 }, { ...lines[0], localCost: 0.001 }]);
  assert.equal(r.localTotals.USD, 0.002);
  assert.equal(aggregatePlanning([]).reportingTotal, 0);
});

