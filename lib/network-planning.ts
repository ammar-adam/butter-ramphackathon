import { demoIngredients, demoSales } from './demo-data';
import type { Ingredient, SaleRow } from './demo-data';
import { cafeLocations, legalEntities, franchisees, scopedLocations, entityForLocation } from './entity-data';
import type { LocalCurrency, LocationScope, CafeLocation, LegalEntity, Franchisee } from './entity-data';
import { forecastIngredient } from './forecast-engine';
import type { ForecastResult } from './forecast-engine';
import { aggregatePlanning } from './currency-planning';
import type { PlanningLine } from './currency-planning';

/** Illustrative local supplier case prices, explicitly entered; never inferred from FX. */
export const illustrativeCasePrices: Record<LocalCurrency, Record<string, number>> = {
  CAD: { butter: 71, flour: 34, milk: 25 },
  USD: { butter: 52.5, flour: 25, milk: 18 },
  INR: { butter: 2900, flour: 1050, milk: 780 },
  PKR: { butter: 12000, flour: 3800, milk: 3600 },
};
function locationRecord(locationId: string) {
  const location = cafeLocations.find(l => l.id === locationId);
  const entity = entityForLocation(locationId);
  if (!location || !entity) throw new Error(`Unknown café location: ${locationId}`);
  return { location, entity };
}
export function getLocationIngredients(locationId: string): Ingredient[] {
  const { location, entity } = locationRecord(locationId);
  return demoIngredients.map(base => {
    const packPrice = illustrativeCasePrices[entity.currency][base.id];
    const priceRatio = packPrice / base.packPrice;
    return { ...base, recipes: { ...base.recipes }, supplier: `${base.id === 'flour' ? 'Millstone Foods' : 'Meadow Dairy'} · ${entity.country} (sample)`,
      packPrice, onHand: Number((base.onHand * location.demandMultiplier).toFixed(2)),
      incoming: Number((base.incoming * location.demandMultiplier).toFixed(2)),
      usualCases: Math.max(0, Math.round(base.usualCases * location.demandMultiplier)),
      shortageCost: base.shortageCost * priceRatio, overageCost: base.overageCost * priceRatio };
  });
}
export function getLocationSales(locationId: string): SaleRow[] {
  const { location } = locationRecord(locationId);
  return demoSales.map(row => ({ ...row, quantity: Math.round(row.quantity * location.demandMultiplier) }));
}
export interface NetworkLocationRow {
  location: CafeLocation; entity: LegalEntity; franchisee: Franchisee;
  currency: LocalCurrency; totalCost: number; cases: number; totalUsualCost: number;
  forecasts: { ingredient: Ingredient; forecast: ForecastResult }[];
}
const forecastCache = new Map<string, { ingredient: Ingredient; forecast: ForecastResult }[]>();
export function buildNetworkPlan(options: LocationScope & { weekendUplift: number; forecastDate: string }) {
  const planningLines: PlanningLine[] = [];
  const locations: NetworkLocationRow[] = scopedLocations(options).map(location => {
    const entity = legalEntities.find(e => e.id === location.entityId)!;
    const franchisee = franchisees.find(f => f.id === entity.franchiseeId)!;
    const key = `${entity.currency}:${location.demandMultiplier}:${options.weekendUplift}:${options.forecastDate}`;
    let forecasts = forecastCache.get(key);
    if (!forecasts) {
      const sales = getLocationSales(location.id);
      forecasts = getLocationIngredients(location.id).map(ingredient => ({ ingredient, forecast: forecastIngredient(sales, ingredient, options) }));
      // A bounded cache keeps consecutive selector and scenario changes inexpensive.
      if (forecastCache.size >= 512) forecastCache.clear();
      forecastCache.set(key, forecasts);
    }
    // Clone ingredient metadata because identical currency/multipliers can have different suppliers.
    const ingredients = getLocationIngredients(location.id);
    const localForecasts = forecasts.map((entry, i) => ({ ingredient: ingredients[i], forecast: entry.forecast }));
    const totalCost = localForecasts.reduce((sum, entry) => sum + entry.forecast.recommendedCost, 0);
    const totalUsualCost = localForecasts.reduce((sum, entry) => sum + entry.ingredient.usualCases * entry.ingredient.packPrice, 0);
    planningLines.push({ entityId: entity.id, franchiseeId: franchisee.id, locationId: location.id, currency: entity.currency, localCost: totalCost });
    return { location, entity, franchisee, currency: entity.currency, totalCost, totalUsualCost, cases: localForecasts.reduce((sum, entry) => sum + entry.forecast.recommendedCases, 0), forecasts: localForecasts };
  });
  return { locations, planningLines, rollup: aggregatePlanning(planningLines), explanation: networkExplanation };
}
export const networkExplanation = 'All 100 café records, demand patterns, inventories and local supplier prices are synthetic. Location demand is the sample bakery history multiplied by its displayed demand multiplier and rounded to whole products. Local prices come from an illustrative currency-specific case-price table, not FX conversion. Stock, incoming quantities and usual case orders scale with location demand. Modeled loss reduction compares emergency purchase premiums and overage; it is not realized savings. Commitments remain separated by legal entity.';
