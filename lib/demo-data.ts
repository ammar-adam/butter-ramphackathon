// Entirely synthetic demonstration data. No real business records or forecasts.
export interface SaleRow { date: string; product: string; quantity: number; soldOut?: boolean }
export interface Ingredient {
  id: string; name: string; unit: 'kg' | 'L' | 'units'; supplier: string;
  packSize: number; packPrice: number; onHand: number; incoming: number;
  incomingDay: number; leadDays: number; reviewDays: number; shelfDays: number;
  stockExpiryDays: number; usualCases: number; shortageCost: number; overageCost: number;
  recipes: Record<string, number>;
}
export interface PurchaseRow {
  date: string; ingredient: string; quantity: number; unit: 'kg' | 'L' | 'units';
  unitPrice: number; currency: 'CAD' | 'USD' | 'INR' | 'PKR'; supplier: string; invoiceId: string; entityId?: string | null;
  needsReview: boolean; source: string;
}
const products = ['Croissant', 'Brioche', 'Sourdough'];
export const demoSales: SaleRow[] = Array.from({ length: 84 }, (_, day) => {
  const date = new Date(Date.UTC(2026, 6, 9 + day));
  const weekday = date.getUTCDay();
  const season = [1.26, 0.81, 0.88, 0.94, 1.01, 1.14, 1.36][weekday];
  return products.map((product, p) => ({
    date: date.toISOString().slice(0, 10), product,
    quantity: Math.round([185, 75, 62][p] * season * (1 + day * 0.0011) + Math.sin(day * 1.71 + p * 2.4) * [15, 9, 7][p]),
    soldOut: (day === 66 || day === 73) && p === 0,
  }));
}).flat();
export const demoIngredients: Ingredient[] = [
  { id: 'butter', name: 'Butter', unit: 'kg', supplier: 'Meadow Dairy (sample)', packSize: 5, packPrice: 52.5, onHand: 7, incoming: 0, incomingDay: 1, leadDays: 1, reviewDays: 3, shelfDays: 21, stockExpiryDays: 12, usualCases: 8, shortageCost: 34, overageCost: 10.5, recipes: { Croissant: 0.028, Brioche: 0.023, Sourdough: 0 } },
  { id: 'flour', name: 'Flour', unit: 'kg', supplier: 'Millstone Foods (sample)', packSize: 25, packPrice: 25, onHand: 38, incoming: 25, incomingDay: 1, leadDays: 1, reviewDays: 3, shelfDays: 60, stockExpiryDays: 42, usualCases: 4, shortageCost: 5, overageCost: 1, recipes: { Croissant: 0.065, Brioche: 0.09, Sourdough: 0.45 } },
  { id: 'milk', name: 'Milk', unit: 'L', supplier: 'Meadow Dairy (sample)', packSize: 12, packPrice: 18, onHand: 16, incoming: 0, incomingDay: 1, leadDays: 1, reviewDays: 3, shelfDays: 5, stockExpiryDays: 3, usualCases: 4, shortageCost: 6, overageCost: 1.5, recipes: { Croissant: 0.028, Brioche: 0.045, Sourdough: 0 } },
];
export const demoPurchases: PurchaseRow[] = [
  { date: '2026-09-21', ingredient: 'Butter', quantity: 40, unit: 'kg', unitPrice: 10.5, currency: 'USD', supplier: 'Meadow Dairy (sample)', invoiceId: 'SYN-1041', needsReview: false, source: 'Sample invoice' },
  { date: '2026-09-28', ingredient: 'Butter', quantity: 40, unit: 'kg', unitPrice: 10.5, currency: 'USD', supplier: 'Meadow Dairy (sample)', invoiceId: 'SYN-1048', needsReview: false, source: 'Sample invoice' },
  { date: '2026-09-28', ingredient: 'Flour', quantity: 100, unit: 'kg', unitPrice: 1, currency: 'USD', supplier: 'Millstone Foods (sample)', invoiceId: 'SYN-2048', needsReview: false, source: 'Sample invoice' },
  { date: '2026-09-29', ingredient: 'Milk', quantity: 48, unit: 'L', unitPrice: 1.5, currency: 'USD', supplier: 'Meadow Dairy (sample)', invoiceId: 'SYN-1049', needsReview: false, source: 'Sample invoice' },
];
