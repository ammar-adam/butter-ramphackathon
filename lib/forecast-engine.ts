export type SaleRow = { date: string; product: string; quantity: number; soldOut?: boolean };
export type Ingredient = {
  id: string; name: string; unit: 'kg' | 'L' | 'units'; supplier: string;
  packSize: number; packPrice: number; onHand: number; incoming: number; incomingDay: number;
  leadDays: number; reviewDays: number; shelfDays: number; stockExpiryDays: number;
  usualCases: number; shortageCost: number; overageCost: number; recipes: Record<string, number>;
};
export type ForecastResult = {
  daily: { date: string; median: number; low: number; high: number }[];
  scenarios: { daily: number[]; coverageDemand: number }[];
  recommendedCases: number; recommendedQuantity: number; recommendedCost: number;
  coverageDemand: number; coverageRange: { low: number; high: number }; buffer: number;
  usableStock: number; incomingEligible: number; targetQuantile: number;
  preArrivalShortage: number; shelfLimited: boolean; expectedWaste: number;
  expectedExpiryWaste: number; expectedLeftover: number; usualExpectedExpiryWaste: number; usualExpectedLeftover: number;
  usualExpectedWaste: number; expectedShortage: number; usualExpectedShortage: number;
  modeledCostReduction: number; rationale: string[]; warnings: string[];
};
const DAY = 86400000;
function dateValue(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Dates must use YYYY-MM-DD.');
  const n = Date.parse(value + 'T00:00:00Z');
  if (!Number.isFinite(n) || new Date(n).toISOString().slice(0, 10) !== value) throw new Error('Invalid calendar date.');
  return n;
}
const quantile = (values: number[], p: number): number => {
  if (!values.length) return 0;
  const a = [...values].sort((x, y) => x - y), index = (a.length - 1) * p;
  const lo = Math.floor(index), hi = Math.ceil(index);
  return a[lo] + (a[hi] - a[lo]) * (index - lo);
};
const sum = (a: number[]) => a.reduce((s, n) => s + n, 0);

/**
 * Bounded demo model, not a fitted predictive model. Recorded sales dates represent
 * open trading days; absent dates are unknown, not zero. Zero product sales on a
 * recorded trading day are zero. Weekly block resampling preserves observed
 * co-movement; missing weekdays fall back to weekday medians, then overall median.
 * Sales marked soldOut are censored demand: retained without an invented uplift,
 * and called out as a lower-bound risk. No normal-distribution assumption is made.
 * Inventory is FIFO by expiry. Incoming stock is assumed to have shelfDays of life
 * from arrival. Lead days are calendar days. ShelfDays=1 means usable on arrival.
 * Overage is expired order units plus order units left at the review horizon;
 * this is a conservative write-off/holding proxy, not a literal waste forecast.
 * Shortage cost is emergency buying premium per ingredient unit, never bakery
 * lost margin. Purchase cost is displayed separately, not added to that premium.
 */
export function forecastIngredient(sales: SaleRow[], ingredient: Ingredient,
  options: { weekendUplift: number; forecastDate: string }): ForecastResult {
  const start = dateValue(options.forecastDate);
  const nonnegative = ['packPrice', 'onHand', 'incoming', 'incomingDay', 'leadDays', 'reviewDays', 'stockExpiryDays', 'usualCases', 'shortageCost', 'overageCost'] as const;
  for (const key of nonnegative) if (!Number.isFinite(ingredient[key]) || ingredient[key] < 0) throw new Error(`${key} must be finite and nonnegative.`);
  for (const key of ['incomingDay', 'leadDays', 'reviewDays', 'shelfDays', 'stockExpiryDays', 'usualCases'] as const)
    if (!Number.isInteger(ingredient[key])) throw new Error(`${key} must be a whole number.`);
  if (!Number.isFinite(ingredient.packSize) || ingredient.packSize <= 0 || ingredient.shelfDays < 1) throw new Error('Pack size and shelf life must be positive.');
  if (!Number.isFinite(options.weekendUplift) || options.weekendUplift < 0 || options.weekendUplift > 5) throw new Error('Weekend uplift must be between 0 and 5 (a fraction).');
  if (!ingredient.recipes || Object.values(ingredient.recipes).some(v => !Number.isFinite(v) || v < 0)) throw new Error('Recipe quantities must be finite and nonnegative.');
  const warnings: string[] = [];
  const totals = new Map<number, number>();
  let censored = false, future = false;
  for (const row of sales) {
    const d = dateValue(row.date);
    if (!Number.isFinite(row.quantity) || row.quantity < 0 || typeof row.product !== 'string') throw new Error('Sales quantities must be finite and nonnegative.');
    if (d >= start) { future = true; continue; }
    const recipe = ingredient.recipes[row.product] || 0;
    totals.set(d, (totals.get(d) || 0) + row.quantity * recipe);
    if (recipe > 0 && row.soldOut) censored = true;
  }
  if (future) warnings.push('Rows on or after the forecast date were excluded to prevent future-data leakage.');
  if (censored) warnings.push('Sold-out sales are censored: actual demand may be higher than recorded sales.');
  const horizon = Math.min(14, Math.max(1, ingredient.leadDays + ingredient.reviewDays));
  if (ingredient.leadDays + ingredient.reviewDays > 14) warnings.push('Protection period exceeds the 14-day forecast; recommendation covers only these 14 days.');
  const targetQuantile = ingredient.shortageCost + ingredient.overageCost > 0
    ? ingredient.shortageCost / (ingredient.shortageCost + ingredient.overageCost) : 0.5;
  const usableStock = ingredient.stockExpiryDays > 0 ? ingredient.onHand : 0;
  const incomingEligible = ingredient.incomingDay < horizon ? ingredient.incoming : 0;
  if (ingredient.incoming > 0 && !incomingEligible) warnings.push('Incoming stock arrives after the protection period and is excluded.');
  const dates = Array.from({ length: 14 }, (_, n) => new Date(start + n * DAY).toISOString().slice(0, 10));
  const byWeekday: number[][] = Array.from({ length: 7 }, () => []);
  const weeks = new Map<number, Map<number, number>>();
  for (const [d, value] of totals) {
    const weekday = new Date(d).getUTCDay();
    byWeekday[weekday].push(value);
    const monday = d - ((weekday + 6) % 7) * DAY;
    if (!weeks.has(monday)) weeks.set(monday, new Map());
    weeks.get(monday)!.set(weekday, value);
  }
  const baseline = quantile([...totals.values()], 0.5);
  const fallback = byWeekday.map(a => a.length ? quantile(a, 0.5) : baseline);
  if (!totals.size) warnings.push('No historical sales before the forecast date; demand is zero and no order is recommended.');
  else if (totals.size < 14) warnings.push('Fewer than 14 trading days: uncertainty estimates are illustrative.');
  if (totals.size && byWeekday.some(a => !a.length)) warnings.push('Unobserved weekdays use the overall median; missing dates are not assumed to be zero sales.');
  const blocks = [...weeks.entries()].sort((a, b) => a[0] - b[0]).map(x => x[1]);
  let seed = 17041;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const scenarios = Array.from({ length: 200 }, () => {
    let block: Map<number, number> | undefined;
    const daily = dates.map((_, day) => {
      const weekday = new Date(start + day * DAY).getUTCDay();
      if (day === 0 || weekday === 1) block = blocks.length ? blocks[Math.floor(random() * blocks.length)] : undefined;
      const demand = block?.get(weekday) ?? fallback[weekday];
      return demand * (weekday === 0 || weekday === 6 ? 1 + options.weekendUplift : 1);
    });
    return { daily, coverageDemand: sum(daily.slice(0, horizon)) };
  });
  const daily = dates.map((date, day) => ({ date, median: quantile(scenarios.map(s => s.daily[day]), 0.5), low: quantile(scenarios.map(s => s.daily[day]), 0.1), high: quantile(scenarios.map(s => s.daily[day]), 0.9) }));
  type Lot = { amount: number; expiry: number; order: boolean };
  function evaluate(cases: number) {
    let waste = 0, expiryWaste = 0, leftover = 0, shortage = 0, early = 0;
    for (const scenario of scenarios) {
      const lots: Lot[] = usableStock ? [{ amount: usableStock, expiry: ingredient.stockExpiryDays, order: false }] : [];
      let scenarioWaste = 0;
      for (let day = 0; day < horizon; day++) {
        for (const lot of lots) if (lot.expiry <= day) { if (lot.order) scenarioWaste += lot.amount; lot.amount = 0; }
        if (day === ingredient.incomingDay && incomingEligible) lots.push({ amount: incomingEligible, expiry: day + ingredient.shelfDays, order: false });
        if (day === ingredient.leadDays && cases) lots.push({ amount: cases * ingredient.packSize, expiry: day + ingredient.shelfDays, order: true });
        lots.sort((a, b) => a.expiry - b.expiry || Number(a.order) - Number(b.order));
        let need = scenario.daily[day];
        for (const lot of lots) { const take = Math.min(need, lot.amount); lot.amount -= take; need -= take; }
        shortage += need;
        if (day < ingredient.leadDays) early += need;
      }
      // Classify units expiring exactly at the next review as expiry waste.
      for (const lot of lots) if (lot.order && lot.expiry <= horizon) { scenarioWaste += lot.amount; lot.amount = 0; }
      expiryWaste += scenarioWaste;
      const scenarioLeftover = sum(lots.filter(l => l.order).map(l => l.amount));
      leftover += scenarioLeftover;
      scenarioWaste += scenarioLeftover;
      waste += scenarioWaste;
    }
    waste /= scenarios.length; shortage /= scenarios.length; early /= scenarios.length;
    return { waste, expiryWaste: expiryWaste / scenarios.length, leftover: leftover / scenarios.length, shortage, early, loss: waste * ingredient.overageCost + shortage * ingredient.shortageCost };
  }
  const demandValues = scenarios.map(s => s.coverageDemand);
  const coverageDemand = quantile(demandValues, 0.5);
  const shelfUsage = scenarios.map(s => sum(s.daily.slice(ingredient.leadDays, Math.min(horizon, ingredient.leadDays + ingredient.shelfDays))));
  // No case can be useful beyond maximum observed demand in its shelf window.
  // Integer rounding permits at most one partial case above that bound.
  const maxCases = Math.min(10000, Math.ceil(Math.max(...shelfUsage) / ingredient.packSize));
  if (maxCases === 10000) warnings.push('Case search is bounded at 10,000 cases; check pack size and demand units.');
  let recommendedCases = 0, best = evaluate(0), unconstrainedCases = 0;
  // Convex piecewise-linear FIFO loss: binary-search discrete slope, then examine
  // neighbors. This avoids 200 x 14 x 10,000 brute-force evaluations.
  let left = 0, right = maxCases;
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (evaluate(mid + 1).loss < evaluate(mid).loss - 1e-9) left = mid + 1; else right = mid;
  }
  for (const cases of [...new Set([0, left, Math.max(0, left - 1), Math.min(maxCases, left + 1)])]) {
    const result = evaluate(cases);
    if (result.loss < best.loss - 1e-9 || (Math.abs(result.loss - best.loss) <= 1e-9 && cases < recommendedCases)) { best = result; recommendedCases = cases; }
  }
  unconstrainedCases = Math.max(0, Math.ceil((quantile(demandValues, targetQuantile) - usableStock - incomingEligible) / ingredient.packSize));
  const shelfLimited = unconstrainedCases > maxCases;
  const usual = evaluate(ingredient.usualCases);
  const modeledCostReduction = usual.loss > 0 ? Math.max(0, (usual.loss - best.loss) / usual.loss * 100) : 0;
  const rationale = [
    `Order ${recommendedCases} cases (${recommendedCases * ingredient.packSize} ${ingredient.unit}) for a ${horizon}-day protection period.`,
    `Balance emergency purchase premium against overage at a ${Math.round(targetQuantile * 100)}% target demand quantile.`,
    `Observed weekly demand patterns are resampled together; weekend uplift adds ${Math.round(options.weekendUplift * 100)}% only to future Saturdays and Sundays.`
  ];
  if (best.early > 0) rationale.push(`${best.early.toFixed(2)} ${ingredient.unit} of expected shortage occurs before this order can arrive; expedite separately.`);
  if (shelfLimited) rationale.push('Shelf life limits useful ordering below the unbounded protection-period target.');
  return { daily, scenarios, recommendedCases, recommendedQuantity: recommendedCases * ingredient.packSize,
    recommendedCost: recommendedCases * ingredient.packPrice, coverageDemand,
    coverageRange: { low: quantile(demandValues, 0.1), high: quantile(demandValues, 0.9) },
    buffer: Math.max(0, quantile(demandValues, targetQuantile) - coverageDemand), usableStock,
    incomingEligible, targetQuantile, preArrivalShortage: best.early, shelfLimited,
    expectedWaste: best.waste, usualExpectedWaste: usual.waste, expectedShortage: best.shortage,
    expectedExpiryWaste: best.expiryWaste, expectedLeftover: best.leftover,
    usualExpectedExpiryWaste: usual.expiryWaste, usualExpectedLeftover: usual.leftover,
    usualExpectedShortage: usual.shortage, modeledCostReduction, rationale, warnings };
}
