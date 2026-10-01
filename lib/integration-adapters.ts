/** Server-only, read-only adapters. Never send Env or credentials to a browser. */
export type Env = Record<string, string | undefined>;
export type Options = { fetch?: typeof fetch; now?: Date; maxPages?: number };
export type Purchase = { date: string; ingredient: string; quantity: number | null; unit: string | null; unitPrice: number | null; currency: string | null; supplier: string; invoiceId: string; entityId: string | null; needsReview: boolean; source: 'Ramp' };
type Json = Record<string, any>;
const list = (value: unknown): Json[] => Array.isArray(value) ? value : [];
const str = (value: unknown): string => typeof value === 'string' ? value : '';
const number = (value: unknown): number | null => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && Number.isFinite(Number(value)) ? Number(value) : null;
function environment(value: string | undefined): 'sandbox' | 'production' {
  if (value && value !== 'sandbox' && value !== 'production') throw new Error('Environment must be sandbox or production.');
  return value === 'production' ? 'production' : 'sandbox';
}
export function integrationStatus(env: Env) {
  return {
    ramp: { configured: Boolean(env.RAMP_ACCESS_TOKEN?.trim()||(env.RAMP_CLIENT_ID?.trim()&&env.RAMP_CLIENT_SECRET?.trim())), environment: environment(env.RAMP_ENVIRONMENT), mode: 'read-only' },
    square: { configured: Boolean(env.SQUARE_ACCESS_TOKEN?.trim()), environment: environment(env.SQUARE_ENVIRONMENT), locationId: env.SQUARE_LOCATION_ID || null, mode: 'read-only' },
  };
}
function token(env: Env, key: string, provider: string) {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${provider} is not configured. Add its server-side access token.`);
  return value;
}
async function request(url: string, accessToken: string, provider: string, options: Options, body?: Json): Promise<Json> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await (options.fetch || fetch)(url, {
      method: body ? 'POST' : 'GET', redirect: 'error', signal: controller.signal,
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', ...(provider === 'Square' ? { 'Square-Version': '2026-09-16' } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error(`${provider} request failed (HTTP ${response.status}). Check credentials, environment and read permissions.`);
    const result = await response.json();
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error(`${provider} returned an invalid response.`);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    // Only emit errors created here; transport errors can contain URLs or credentials.
    if (message.startsWith(`${provider} request failed (HTTP`) || message === `${provider} returned an invalid response.`) throw error;
    throw new Error(`${provider} could not be reached or returned an unreadable response. Retry later.`);
  } finally { clearTimeout(timer); }
}
const pageLimit = (options: Options) => Math.min(50, Math.max(1, Math.floor(options.maxPages || 20)));
function selectionName(line: Json, type: string): string {
  const selected = list(line.accounting_field_selections).find(item => item.category_info?.type === type);
  return str(selected?.name) || str(selected?.display_name);
}
export async function fetchRampPurchases(env: Env, options: Options = {}) {
  const accessToken = token(env, 'RAMP_ACCESS_TOKEN', 'Ramp');
  const base = environment(env.RAMP_ENVIRONMENT) === 'production' ? 'https://api.ramp.com' : 'https://demo-api.ramp.com';
  let next: string | null = `${base}/developer/v1/bills`;
  const seen = new Set<string>(); const purchases: Purchase[] = []; const issues: string[] = [];
  let truncated = false;
  for (let page = 0; next && page < pageLimit(options); page++) {
    let url: URL;
    try { url = new URL(next); } catch { throw new Error('Ramp returned an invalid pagination URL.'); }
    if (url.origin !== base || url.username || url.password || url.pathname !== '/developer/v1/bills') throw new Error('Ramp returned an unsafe pagination URL.');
    if (seen.has(url.href)) throw new Error('Ramp returned a repeated pagination URL.');
    seen.add(url.href);
    const data = await request(url.href, accessToken, 'Ramp', options);
    if (!Array.isArray(data.data)) throw new Error('Ramp returned an invalid bills list.');
    for (const bill of list(data.data)) {
      if (bill.archived_at) continue;
      const inventory = list(bill.inventory_line_items);
      const normal = list(bill.line_items);
      for (const [line, isInventory] of [...inventory.map(line => [line, true] as const), ...normal.map(line => [line, false] as const)]) {
        const ingredient = selectionName(line, 'INVENTORY_ITEM') || str(line.memo) || 'Unmapped bill line';
        const unit = selectionName(line, 'UNIT_OF_MEASURE') || null;
        const quantity = isInventory ? number(line.quantity) : null;
        const money = isInventory ? line.unit_price : null;
        const amount = number(money?.amount); const conversion = number(money?.minor_unit_conversion_rate);
        const unitPrice = amount !== null && conversion !== null && conversion > 0 ? amount / conversion : null;
        const date = str(bill.issued_at).slice(0, 10) || str(bill.accounting_date).slice(0, 10);
        purchases.push({ date, ingredient, quantity, unit, unitPrice, currency: str(money?.currency_code || line.amount?.currency_code) || null,
          supplier: str(bill.vendor?.name) || 'Unknown supplier', invoiceId: str(bill.id), entityId: str(bill.entity_id) || null,
          needsReview: !isInventory || !unit || quantity === null || quantity <= 0 || unitPrice === null || !date || !selectionName(line, 'INVENTORY_ITEM'), source: 'Ramp' });
      }
    }
    next = data.page?.next || null;
    if (next !== null && typeof next !== 'string') throw new Error('Ramp returned invalid pagination metadata.');
  }
  if (next) { truncated = true; issues.push('Ramp page limit reached; purchase history is incomplete.'); }
  const reviewCount = purchases.filter(item => item.needsReview).length;
  if (reviewCount) issues.push(`${reviewCount} bill lines require ingredient, quantity, unit or price review. No units or missing quantities were inferred.`);
  return { purchases, issues, truncated };
}
export async function fetchSquareSales(env: Env, options: Options = {}) {
  const accessToken = token(env, 'SQUARE_ACCESS_TOKEN', 'Square');
  const base = environment(env.SQUARE_ENVIRONMENT) === 'production' ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com';
  const locationResponse = await request(`${base}/v2/locations`, accessToken, 'Square', options);
  const locations = list(locationResponse.locations).filter(location => location.status === 'ACTIVE');
  const location = env.SQUARE_LOCATION_ID ? locations.find(item => item.id === env.SQUARE_LOCATION_ID) : locations.length === 1 ? locations[0] : undefined;
  if (!location) throw new Error(env.SQUARE_LOCATION_ID ? 'Square location was not found among active accessible locations.' : 'Choose a Square location by setting SQUARE_LOCATION_ID; one active location is required.');
  const timeZone = str(location.timezone);
  if (!timeZone) throw new Error('Square location has no timezone; daily aggregation requires one.');
  let formatter: Intl.DateTimeFormat;
  try { formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }); } catch { throw new Error('Square location timezone is invalid.'); }
  const end = options.now || new Date(); const start = new Date(end.getTime() - 84 * 86400000);
  const totals = new Map<string, { date: string; product: string; quantity: number }>();
  const products = new Map<string, { id: string; name: string }>(); const seen = new Set<string>(); const seenOrders = new Set<string>(); const issues: string[] = [];
  let cursor: string | undefined; let truncated = false; let invalidLines = 0;
  for (let page = 0; page < pageLimit(options); page++) {
    const data = await request(`${base}/v2/orders/search`, accessToken, 'Square', options, {
      location_ids: [location.id], return_entries: false, limit: 1000, ...(cursor ? { cursor } : {}),
      query: { filter: { state_filter: { states: ['COMPLETED'] }, date_time_filter: { closed_at: { start_at: start.toISOString(), end_at: end.toISOString() } } }, sort: { sort_field: 'CLOSED_AT', sort_order: 'ASC' } },
    });
    if (data.errors?.length) throw new Error('Square rejected the orders query. Check location and read permissions.');
    for (const order of list(data.orders)) {
      if (order.state !== 'COMPLETED' || order.location_id !== location.id) continue;
      if (order.id && seenOrders.has(order.id)) continue;
      if (order.id) seenOrders.add(order.id);
      const closed = new Date(order.closed_at);
      if (!Number.isFinite(closed.getTime())) { invalidLines++; continue; }
      const parts = formatter.formatToParts(closed); const part = (type: string) => parts.find(item => item.type === type)?.value;
      const date = `${part('year')}-${part('month')}-${part('day')}`;
      for (const line of list(order.line_items)) {
        const quantity = number(line.quantity); const name = str(line.name); const id = str(line.catalog_object_id) || name;
        if (!id || quantity === null || quantity < 0) { invalidLines++; continue; }
        const product = name || id; const key = `${date}\u0000${id}`;
        products.set(id, { id, name: product });
        const previous = totals.get(key); totals.set(key, { date, product, quantity: (previous?.quantity || 0) + quantity });
      }
    }
    cursor = typeof data.cursor === 'string' && data.cursor ? data.cursor : undefined;
    if (!cursor) break;
    if (seen.has(cursor)) throw new Error('Square returned a repeated pagination cursor.');
    seen.add(cursor);
    if (page === pageLimit(options) - 1) truncated = true;
  }
  if (truncated) issues.push('Square page limit reached; sales history is incomplete.');
  if (invalidLines) issues.push(`${invalidLines} orders or lines were skipped because dates, product identities or quantities were invalid.`);
  issues.push('Only observed completed-order sales are returned. Absent days are not zero-filled; verify opening days and source coverage before forecasting. Refunds and returns are not netted from these quantities.');
  return { sales: [...totals.values()].sort((a, b) => a.date.localeCompare(b.date) || a.product.localeCompare(b.product)), location: { id: str(location.id), name: str(location.name), timezone: timeZone }, products: [...products.values()], issues, truncated, interval: { start: start.toISOString(), end: end.toISOString() } };
}
