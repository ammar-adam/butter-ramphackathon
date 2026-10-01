export type Currency = 'CAD' | 'USD' | 'INR' | 'PKR';
export type RateTable = {
  base: 'CAD'; asOf: string; kind: 'illustrative'; unitsPerCAD: Record<Currency, number>;
};
/** Fixed demonstration assumptions, deliberately rounded. NOT market quotes.
 * Convention: unitsPerCAD[C] is units of currency C for one CAD.
 * Cross-rate: amount / unitsPerCAD[from] * unitsPerCAD[to].
 */
export const ILLUSTRATIVE_RATES: RateTable = Object.freeze({
  base: 'CAD', asOf: '2026-10-01', kind: 'illustrative',
  unitsPerCAD: Object.freeze({ CAD: 1, USD: 0.72, INR: 60, PKR: 200 })
});
const CURRENCIES: Currency[] = ['CAD', 'USD', 'INR', 'PKR'];
export type PlanningLine = {
  entityId: string; franchiseeId: string; locationId: string; currency: Currency; localCost: number;
};
export type LocalTotals = Partial<Record<Currency, number>>;
export type EntityRollup = { entityId: string; franchiseeId: string; locationIds: string[]; localTotals: LocalTotals; reportingTotal: number };
export type FranchiseeRollup = { franchiseeId: string; entityIds: string[]; localTotals: LocalTotals; reportingTotal: number };
export type PlanningTotals = { localTotals: LocalTotals; reportingTotal: number; reportingCurrency: Currency;
  entities: EntityRollup[]; franchisees: FranchiseeRollup[]; rateAsOf: string; rateKind: 'illustrative' };
function currency(value: Currency) {
  if (!CURRENCIES.includes(value)) throw new Error('Unsupported currency; use CAD, USD, INR or PKR.');
}
function amount(value: number) {
  // Zero is accepted because empty orders and empty rollups are valid.
  if (!Number.isFinite(value) || value < 0) throw new Error('Money amounts must be finite and nonnegative.');
}
function rates(table: RateTable) {
  if (table.base !== 'CAD' || table.kind !== 'illustrative' || table.unitsPerCAD.CAD !== 1)
    throw new Error('Use a CAD-base illustrative rate table with CAD=1.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(table.asOf) || !Number.isFinite(Date.parse(table.asOf + 'T00:00:00Z')) || new Date(table.asOf + 'T00:00:00Z').toISOString().slice(0, 10) !== table.asOf)
    throw new Error('Rate date must be a valid YYYY-MM-DD date.');
  for (const c of CURRENCIES) if (!Number.isFinite(table.unitsPerCAD[c]) || table.unitsPerCAD[c] <= 0)
    throw new Error('Every currency rate must be finite and positive.');
}
export function convertMoney(value: number, from: Currency, to: Currency, table: RateTable = ILLUSTRATIVE_RATES): number {
  amount(value); currency(from); currency(to); rates(table);
  const result = value / table.unitsPerCAD[from] * table.unitsPerCAD[to];
  if (!Number.isFinite(result)) throw new Error('Converted amount exceeds numeric limits.');
  return result;
}
/** Intl chooses currency minor units; arithmetic retains precision until display. */
export function formatMoney(value: number, c: Currency, locale = 'en-CA'): string {
  amount(value); currency(c);
  return new Intl.NumberFormat(locale, { style: 'currency', currency: c, currencyDisplay: 'code' }).format(value);
}
function add(totals: LocalTotals, c: Currency, value: number) {
  const next = (totals[c] || 0) + value;
  amount(next); totals[c] = next;
}
function reporting(totals: LocalTotals, c: Currency, table: RateTable) {
  const total = CURRENCIES.reduce((s, from) => s + convertMoney(totals[from] || 0, from, c, table), 0);
  amount(total); return total;
}
/** Analytical rollups only. Each legal entity retains its own order grouping;
 * owner totals do not authorize payments or combine purchase orders. */
export function aggregatePlanning(lines: PlanningLine[], reportingCurrency: Currency = 'CAD', table: RateTable = ILLUSTRATIVE_RATES): PlanningTotals {
  currency(reportingCurrency); rates(table);
  const localTotals: LocalTotals = {}, entities = new Map<string, EntityRollup>(), franchisees = new Map<string, FranchiseeRollup>();
  const locations = new Map<string, string>();
  for (const line of lines) {
    amount(line.localCost); currency(line.currency);
    for (const key of ['entityId', 'franchiseeId', 'locationId'] as const)
      if (typeof line[key] !== 'string' || !line[key].trim()) throw new Error(`${key} is required.`);
    let entity = entities.get(line.entityId);
    if (entity && entity.franchiseeId !== line.franchiseeId) throw new Error('One legal entity cannot belong to multiple franchisees.');
    if (locations.has(line.locationId) && locations.get(line.locationId) !== line.entityId) throw new Error('One location cannot belong to multiple legal entities.');
    locations.set(line.locationId, line.entityId);
    if (!entity) { entity = { entityId: line.entityId, franchiseeId: line.franchiseeId, locationIds: [], localTotals: {}, reportingTotal: 0 }; entities.set(line.entityId, entity); }
    let franchisee = franchisees.get(line.franchiseeId);
    if (!franchisee) { franchisee = { franchiseeId: line.franchiseeId, entityIds: [], localTotals: {}, reportingTotal: 0 }; franchisees.set(line.franchiseeId, franchisee); }
    if (!entity.locationIds.includes(line.locationId)) entity.locationIds.push(line.locationId);
    if (!franchisee.entityIds.includes(line.entityId)) franchisee.entityIds.push(line.entityId);
    add(localTotals, line.currency, line.localCost); add(entity.localTotals, line.currency, line.localCost); add(franchisee.localTotals, line.currency, line.localCost);
  }
  for (const group of entities.values()) { group.locationIds.sort(); group.reportingTotal = reporting(group.localTotals, reportingCurrency, table); }
  for (const group of franchisees.values()) { group.entityIds.sort(); group.reportingTotal = reporting(group.localTotals, reportingCurrency, table); }
  return { localTotals, reportingTotal: reporting(localTotals, reportingCurrency, table), reportingCurrency,
    entities: [...entities.values()].sort((a, b) => a.entityId.localeCompare(b.entityId)),
    franchisees: [...franchisees.values()].sort((a, b) => a.franchiseeId.localeCompare(b.franchiseeId)), rateAsOf: table.asOf, rateKind: table.kind };
}
/** CAD strengthens when one CAD buys 5% more foreign currency. CAD stays 1.
 * Only reporting budgets change: quantities, demand and local costs are untouched.
 * This is a scenario shock, not a probability interval or a hedging proposal. */
export function fxSensitivity(lines: PlanningLine[], table: RateTable = ILLUSTRATIVE_RATES, shock = 0.05) {
  rates(table);
  if (!Number.isFinite(shock) || shock < 0 || shock >= 1) throw new Error('FX shock must be a fraction in [0,1).');
  const shifted = (factor: number): RateTable => ({ ...table, unitsPerCAD: {
    CAD: 1, USD: table.unitsPerCAD.USD * factor, INR: table.unitsPerCAD.INR * factor, PKR: table.unitsPerCAD.PKR * factor } });
  const baseline = aggregatePlanning(lines, 'CAD', table);
  return { shock, baseline, strongerCAD: aggregatePlanning(lines, 'CAD', shifted(1 + shock)), weakerCAD: aggregatePlanning(lines, 'CAD', shifted(1 - shock)) };
}
