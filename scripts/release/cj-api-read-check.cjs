// Bounded CJ API read check. No DB writes, imports, stock reservations or orders.
// Secrets stay in the existing app process and never enter the printed report.
const fs = require('node:fs');
const { performance } = require('node:perf_hooks');

const pid = '2610071122251607900';
const report = { format: 'cj-api-read-check-v1', commit: null, pid, checks: [], timings: [], product: null, shipping: [] };
let lastAt = 0;
async function request(base, path, method = 'GET', body, token) {
  const wait = 1200 - (Date.now() - lastAt);
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
  lastAt = Date.now();
  const started = performance.now();
  const response = await fetch(`${base}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { 'CJ-Access-Token': token } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000), redirect: 'error',
  });
  const data = await response.json().catch(() => null);
  const code = typeof data?.code === 'number' ? data.code : null;
  report.timings.push({ endpoint: path.split('?')[0], http: response.status, code, ms: Math.round(performance.now() - started) });
  if (!response.ok || code !== 200 || data?.result === false || data?.success === false || !(data?.result === true || data?.success === true)) throw Error('cj_read_failed');
  return data.data;
}

async function main() {
  try {
    const revision = fs.readFileSync('/app/RELEASE_COMMIT', 'utf8').trim();
    if (!/^[a-f0-9]{40}$/.test(revision)) throw Error('runtime_identity_unavailable');
    report.commit = revision;
    const base = (process.env.CJ_API_BASE || 'https://developers.cjdropshipping.com/api2.0/v1').replace(/\/+$/, '');
    const url = new URL(base);
    if (url.protocol !== 'https:' || !['developers.cjdropshipping.com', 'developers.cjdropshipping.cn'].includes(url.hostname) || url.username || url.password || url.search || url.hash || (url.port && url.port !== '443') || url.pathname !== '/api2.0/v1') throw Error('unexpected_cj_destination');
    const apiKey = (process.env.CJ_API_KEY || '').trim();
    if (!apiKey) throw Error('cj_key_unavailable');
    const auth = await request(base, '/authentication/getAccessToken', 'POST', { apiKey });
    if (typeof auth?.accessToken !== 'string' || !auth.accessToken) throw Error('cj_auth_invalid_response');
    const token = auth.accessToken;
    report.checks.push({ name: 'api_key_authentication', ok: true });

    const product = await request(base, `/product/query?pid=${encodeURIComponent(pid)}`, 'GET', undefined, token);
    if (String(product?.pid || product?.productId || '') !== pid) throw Error('product_identity_mismatch');
    const variants = Array.isArray(product.variants) ? product.variants : Array.isArray(product.stanProducts) ? product.stanProducts : [];
    const batch = await request(base, `/product/stock/getInventoryByPid?pid=${encodeURIComponent(pid)}`, 'GET', undefined, token);
    if (!Array.isArray(batch?.variantInventories)) throw Error('inventory_shape_mismatch');
    const stockByVid = new Map(batch.variantInventories.map(group => [String(group.vid), (Array.isArray(group.inventory) ? group.inventory : []).reduce((sum, row) => sum + Math.max(0, Number(row.totalInventory ?? row.totalInventoryNum ?? row.storageNum) || 0), 0)]));
    const eligible = variants.filter(v => /^[A-Za-z0-9_-]{1,64}$/.test(String(v.vid || v.variantId || v.id || '')) && Number(v.variantSellPrice ?? v.sellPrice) > 0);
    const selected = eligible.sort((a, b) => (stockByVid.get(String(b.vid || b.variantId || b.id)) || 0) - (stockByVid.get(String(a.vid || a.variantId || a.id)) || 0))[0];
    if (!selected) throw Error('no_valid_variant');
    const vid = String(selected.vid || selected.variantId || selected.id);
    const stock = await request(base, `/product/stock/queryByVid?vid=${encodeURIComponent(vid)}`, 'GET', undefined, token);
    if (!Array.isArray(stock)) throw Error('variant_inventory_shape_mismatch');
    const rows = stock.filter(row => String(row.vid) === vid && /^[A-Za-z]{2}$/.test(String(row.countryCode)) && Number(row.totalInventoryNum ?? row.storageNum) > 0);
    const quantity = rows.reduce((sum, row) => sum + Math.max(0, Number(row.totalInventoryNum ?? row.storageNum) || 0), 0);
    report.product = { vid, priceUsd: Number(selected.variantSellPrice ?? selected.sellPrice), variantCount: variants.length, stock: quantity };
    report.checks.push({ name: 'product_and_variant_identity', ok: true }, { name: 'pid_inventory_batch', ok: true }, { name: 'exact_vid_inventory', ok: true }, { name: 'selected_variant_in_stock', ok: quantity > 0 });
    if (!rows.length) return;
    const origin = String(rows[0].countryCode).toUpperCase();
    const freight = await request(base, '/logistic/freightCalculate', 'POST', { startCountryCode: origin, endCountryCode: 'SA', zip: '11564', products: [{ vid, quantity: 1 }] }, token);
    const options = Array.isArray(freight) ? freight : Array.isArray(freight?.freightList) ? freight.freightList : Array.isArray(freight?.list) ? freight.list : [];
    report.shipping = options.filter(row => typeof row.logisticName === 'string' && Number.isFinite(Number(row.logisticPrice)) && Number(row.logisticPrice) >= 0).slice(0, 10).map(row => ({ name: row.logisticName.slice(0, 80), priceUsd: Number(row.logisticPrice), origin, destination: 'SA', quantity: 1 }));
    report.checks.push({ name: 'saudi_freight_quote', ok: report.shipping.length > 0 });
  } catch (error) {
    // Only fixed diagnostic identifiers are emitted. Never serialize a response/auth object.
    const allowed = ['runtime_identity_unavailable', 'unexpected_cj_destination', 'cj_key_unavailable', 'cj_auth_invalid_response', 'cj_read_failed', 'product_identity_mismatch', 'inventory_shape_mismatch', 'no_valid_variant', 'variant_inventory_shape_mismatch'];
    report.checks.push({ name: allowed.includes(error?.message) ? error.message : 'probe_failed', ok: false });
  } finally {
    report.ok = report.checks.length > 0 && report.checks.every(check => check.ok);
    console.log(JSON.stringify(report));
    if (!report.ok) process.exitCode = 1;
  }
}
main();
