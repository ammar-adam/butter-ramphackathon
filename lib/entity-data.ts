// Synthetic ownership/demo selectors only. This is not tenant isolation or authorization.
export type LocalCurrency = 'CAD' | 'USD' | 'INR' | 'PKR';
export interface Franchisee { id: string; name: string }
export interface LegalEntity { id: string; name: string; franchiseeId: string; country: 'Canada' | 'United States' | 'India' | 'Pakistan'; currency: LocalCurrency }
export interface CafeLocation { id: string; name: string; entityId: string; region: string; demandMultiplier: number }
export interface LocationScope { franchiseeId?: string; entityId?: string; locationId?: string }
export const parentGroup = { id: 'maison-group', name: 'Maison Group', reportingCurrency: 'CAD' as const, synthetic: true };
export const franchisees: Franchisee[] = [
  { id: 'northstar', name: 'Northstar Café Partners' },
  { id: 'meridian', name: 'Meridian Hospitality' },
  { id: 'crescent', name: 'Crescent Café Ventures' },
];
export const legalEntities: LegalEntity[] = [
  { id: 'northstar-ca', name: 'Northstar Canada Café Ltd.', franchiseeId: 'northstar', country: 'Canada', currency: 'CAD' },
  { id: 'northstar-us', name: 'Northstar US Café LLC', franchiseeId: 'northstar', country: 'United States', currency: 'USD' },
  { id: 'meridian-ca', name: 'Meridian Canada Hospitality Ltd.', franchiseeId: 'meridian', country: 'Canada', currency: 'CAD' },
  { id: 'meridian-in', name: 'Meridian India Cafés Pvt. Ltd.', franchiseeId: 'meridian', country: 'India', currency: 'INR' },
  { id: 'crescent-pk', name: 'Crescent Pakistan Cafés (Pvt.) Ltd.', franchiseeId: 'crescent', country: 'Pakistan', currency: 'PKR' },
  { id: 'crescent-us', name: 'Crescent US Café LLC', franchiseeId: 'crescent', country: 'United States', currency: 'USD' },
];
const distribution: { entityId: string; count: number; cities: string[] }[] = [
  { entityId: 'northstar-ca', count: 28, cities: ['Toronto', 'Ottawa', 'Hamilton', 'Mississauga'] },
  { entityId: 'northstar-us', count: 17, cities: ['Seattle', 'Portland', 'Boston'] },
  { entityId: 'meridian-ca', count: 10, cities: ['Vancouver', 'Burnaby'] },
  { entityId: 'meridian-in', count: 23, cities: ['Mumbai', 'Pune', 'Bengaluru', 'Delhi'] },
  { entityId: 'crescent-pk', count: 16, cities: ['Lahore', 'Karachi', 'Islamabad'] },
  { entityId: 'crescent-us', count: 6, cities: ['Austin', 'Houston'] },
];
const neighborhoods = ['Central', 'Market Square', 'University', 'Riverside', 'Garden District', 'Station', 'Business Park', 'West End'];
export const cafeLocations: CafeLocation[] = distribution.flatMap(({ entityId, count, cities }, entityIndex) =>
  Array.from({ length: count }, (_, i) => {
    const region = cities[i % cities.length];
    const neighborhood = neighborhoods[Math.floor(i / cities.length) % neighborhoods.length];
    return { id: `${entityId}-${String(i + 1).padStart(3, '0')}`, name: `Maison ${region} · ${neighborhood}`, entityId, region, demandMultiplier: Number((0.72 + ((i * 7 + entityIndex * 11) % 35) / 50).toFixed(2)) };
  })
);
/** Filters intersect; inconsistent scopes return no locations. IDs never grant access. */
export function scopedLocations(scope: LocationScope = {}): CafeLocation[] {
  const entityIds = new Set(legalEntities.filter(e => !scope.franchiseeId || e.franchiseeId === scope.franchiseeId).map(e => e.id));
  return cafeLocations.filter(l => entityIds.has(l.entityId) && (!scope.entityId || l.entityId === scope.entityId) && (!scope.locationId || l.id === scope.locationId));
}
export function entityForLocation(locationId: string): LegalEntity | undefined {
  const location = cafeLocations.find(l => l.id === locationId);
  return legalEntities.find(e => e.id === location?.entityId);
}
export const procurementNotes = [
  'All records are synthetic. Ownership selectors describe reporting structure and do not implement permissions or tenant security.',
  'Maison Group reports in CAD. Local orders retain the legal entity’s CAD, USD, INR, or PKR currency. Group reporting requires a dated FX rate and must label converted amounts.',
  'A franchisee may share supplier comparisons and procurement suggestions across cafés. Each legal entity independently approves and issues its own order.',
  'Never combine commitments or purchase orders across legal entities. Within an entity, preserve location delivery quantities, addresses, and demand assumptions.',
  'This hierarchy supplies ownership and demand multipliers only; it does not establish local supplier prices, tax treatment, exchange rates, or actual purchasing authority.',
];
