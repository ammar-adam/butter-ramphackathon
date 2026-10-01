import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forecastIngredient } from '../lib/forecast-engine.ts';
import type { Ingredient, SaleRow } from '../lib/forecast-engine.ts';
const item: Ingredient = { id: 'flour', name: 'Flour', unit: 'kg', supplier: 'Mill', packSize: 5, packPrice: 10,
  onHand: 0, incoming: 0, incomingDay: 0, leadDays: 1, reviewDays: 6, shelfDays: 14, stockExpiryDays: 7,
  usualCases: 2, shortageCost: 8, overageCost: 2, recipes: { Bread: 1 } };
const sales: SaleRow[] = Array.from({ length: 28 }, (_, i) => ({ date: new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10), product: 'Bread', quantity: 10 }));
const options = { forecastDate: '2026-10-01', weekendUplift: 0 };
test('invalid dates, negative sales, zero packs and fractional cases are rejected', () => {
  assert.throws(() => forecastIngredient(sales, item, { ...options, forecastDate: '2026-02-30' }));
  assert.throws(() => forecastIngredient([{ ...sales[0], quantity: -1 }], item, options));
  assert.throws(() => forecastIngredient(sales, { ...item, packSize: 0 }, options));
  assert.throws(() => forecastIngredient(sales, { ...item, usualCases: 1.5 }, options));
});
test('shortage before arrival cannot be fixed by an ordinary order', () => {
  const r = forecastIngredient(sales, { ...item, leadDays: 3, reviewDays: 4 }, options);
  assert.equal(r.preArrivalShortage, 30);
  assert.equal(r.recommendedQuantity, 40);
  assert.equal(r.expectedShortage, 30);
  assert.ok(r.rationale.some(s => s.includes('expedite')));
});
test('incoming after protection horizon is ignored', () => {
  const base = forecastIngredient(sales, item, options);
  const r = forecastIngredient(sales, { ...item, incoming: 500, incomingDay: 7 }, options);
  assert.equal(r.incomingEligible, 0);
  assert.equal(r.recommendedCases, base.recommendedCases);
  assert.equal(r.expectedShortage, base.expectedShortage);
});
test('orders obey case sizes and account for shelf expiry', () => {
  const r = forecastIngredient(sales, { ...item, packSize: 12, shelfDays: 2 }, options);
  assert.equal(r.recommendedQuantity % 12, 0);
  assert.equal(r.recommendedCost, r.recommendedCases * item.packPrice);
  assert.ok(r.recommendedCases <= 2);
  assert.equal(r.shelfLimited, true);
  assert.ok(r.expectedWaste >= 0);
});
test('additional uplift changes only future weekends and is monotonic', () => {
  const a = forecastIngredient(sales, item, options), b = forecastIngredient(sales, item, { ...options, weekendUplift: 0.5 });
  for (let i = 0; i < 14; i++) {
    const weekday = new Date(a.daily[i].date + 'T00:00:00Z').getUTCDay();
    assert.equal(b.daily[i].median, a.daily[i].median * ([0, 6].includes(weekday) ? 1.5 : 1));
  }
  assert.ok(b.coverageDemand >= a.coverageDemand);
  assert.ok(b.recommendedCases >= a.recommendedCases);
  assert.deepEqual(a, forecastIngredient(sales, item, options));
});
test('missing history never invents demand', () => {
  const r = forecastIngredient([], item, options);
  assert.equal(r.recommendedCases, 0);
  assert.equal(r.coverageDemand, 0);
  assert.equal(r.expectedShortage, 0);
  assert.ok(r.daily.every(d => d.median === 0 && d.high === 0));
  assert.ok(r.warnings.some(s => s.includes('No historical sales')));
});
test('existing weekday pattern is retained and stock-out evidence is flagged', () => {
  const history = sales.map(s => ({ ...s, quantity: [0, 6].includes(new Date(s.date + 'T00:00:00Z').getUTCDay()) ? 20 : 10, soldOut: true }));
  const r = forecastIngredient(history, item, options);
  assert.equal(r.daily.find(d => new Date(d.date + 'T00:00:00Z').getUTCDay() === 6)?.median, 20);
  assert.ok(r.warnings.some(s => s.includes('censored')));
});
test('expired stock is excluded and timely incoming prevents shortage', () => {
  const expired = forecastIngredient(sales, { ...item, onHand: 500, stockExpiryDays: 0 }, options);
  assert.equal(expired.usableStock, 0);
  const incoming = forecastIngredient(sales, { ...item, incoming: 70, incomingDay: 0 }, options);
  assert.equal(incoming.recommendedCases, 0);
  assert.equal(incoming.expectedShortage, 0);
});
test('overage separates still-usable leftovers from order units expiring at review', () => {
  const longLife = forecastIngredient(sales, { ...item, packSize: 13 }, options);
  assert.equal(longLife.expectedExpiryWaste, 0);
  assert.ok(longLife.expectedLeftover > 0);
  assert.equal(longLife.expectedWaste, longLife.expectedLeftover);
  const expires = forecastIngredient(sales, { ...item, packSize: 13, shelfDays: 6 }, options);
  assert.equal(expires.expectedLeftover, 0);
  assert.equal(expires.expectedWaste, expires.expectedExpiryWaste);
  assert.ok(expires.expectedExpiryWaste > 0);
});

