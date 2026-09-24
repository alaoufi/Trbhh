// Read-only CJ probe for the exact product row linked at /cj/12.
// This never refreshes tokens, writes the database, reserves stock, or creates orders.
const { PrismaClient } = require('@prisma/client');
const { createDecipheriv } = require('node:crypto');

const db = new PrismaClient({ log: [] });
const base = (process.env.CJ_API_BASE || 'https://developers.cjdropshipping.com/api2.0/v1').replace(/\/+$/, '');
const hexKey = process.env.SUPPLIER_TOKEN_ENCRYPTION_KEY || '';
const checks = [];
const check = (name, ok, detail = '') => checks.push({ name, ok: !!ok, ...(detail ? { detail } : {}) });
const safe = (v, max = 160) => typeof v === 'string' ? v.slice(0, max) : null;
const number = v => { const n = typeof v === 'number' ? v : Number(v); return Number.isFinite(n) ? n : null; };
function decrypt(sealed) {
  if (!/^[a-f\d]{64}$/i.test(hexKey)) throw Error('encryption_key_unavailable');
  const [version, iv64, tag64, body64, extra] = String(sealed || '').split('.');
  if (version !== 'v1' || !iv64 || !tag64 || !body64 || extra !== undefined) throw Error('stored_token_invalid');
  const iv = Buffer.from(iv64, 'base64url'), tag = Buffer.from(tag64, 'base64url');
  if (iv.length !== 12 || tag.length !== 16) throw Error('stored_token_invalid');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(hexKey, 'hex'), iv);
  decipher.setAAD(Buffer.from('cj:auth')); decipher.setAuthTag(tag);
  const token = JSON.parse(Buffer.concat([decipher.update(Buffer.from(body64, 'base64url')), decipher.final()]).toString('utf8'));
  if (!token.accessToken) throw Error('stored_token_invalid');
  return token.accessToken;
}
async function main() {
  try {
    const gates = await db.$queryRawUnsafe("SELECT k,v FROM site_settings WHERE k IN ('commerce_purchasing_enabled','commerce_payments_enabled')");
    const flags = Object.fromEntries(gates.map(x => [x.k, String(x.v)]));
    check('purchase_and_payment_gates_off', ['0','false',''].includes(flags.commerce_purchasing_enabled || '0') && ['0','false',''].includes(flags.commerce_payments_enabled || '0') && process.env.SUPPLIER_ALLOW_LIVE_ORDERS !== 'true');
    if (!checks[0].ok) throw Error('purchase_gate_not_off');

    const productRows = await db.$queryRawUnsafe('SELECT id,cj_product_id,cj_variant_id,cj_sku,name,name_ar,image,images,details_json FROM cj_products WHERE id=12 LIMIT 1');
    const product = productRows[0];
    check('linked_catalog_product_12_exists', !!product, product ? `CJ PID ${safe(product.cj_product_id, 64)}` : 'row_missing');
    if (!product) throw Error('product_12_not_found');
    const authRows = await db.$queryRawUnsafe('SELECT sealed_tokens,access_expires_at FROM cj_auth WHERE id=1 LIMIT 1');
    const auth = authRows[0];
    let token = null;
    try { token = decrypt(auth?.sealed_tokens); } catch {}
    const valid = !!token && auth?.access_expires_at && new Date(auth.access_expires_at).getTime() > Date.now();
    check('stored_access_token_valid_without_refresh', valid, valid ? 'valid' : 'missing_or_expired');
    if (!valid) throw Error('stored_access_token_missing_or_expired');

    let lastApiAt = 0;
    const api = async (path, method = 'GET', body) => {
      const gap = 1150 - (Date.now() - lastApiAt);
      if (gap > 0) await new Promise(resolve => setTimeout(resolve, gap));
      lastApiAt = Date.now();
      const response = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', 'CJ-Access-Token': token }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
      const envelope = await response.json().catch(() => ({}));
      if (!response.ok || envelope.result === false) throw Error(`cj_http_${response.status}`);
      return envelope.data;
    };
    const rawProduct = await api(`/product/query?pid=${encodeURIComponent(product.cj_product_id)}`);
    check('live_product_matches_linked_pid', !!rawProduct && String(rawProduct.pid || rawProduct.productId || '') === String(product.cj_product_id), safe(rawProduct?.productNameEn || rawProduct?.productName || 'name_unavailable'));
    const rawVariants = await api(`/product/variant/query?pid=${encodeURIComponent(product.cj_product_id)}`);
    const variants = Array.isArray(rawVariants) ? rawVariants : [];
    const normalize = v => ({ vid: String(v.vid || v.variantId || v.id || ''), sku: String(v.variantSku || v.sku || ''), name: safe(v.variantNameEn || v.variantName || v.nameEn || v.variantKey), key: safe(v.variantKey || v.variantKeyEn || v.variantProperty), price: number(v.variantSellPrice ?? v.sellPrice ?? v.sellprice), image: safe(v.variantImage || v.bigImg || v.bigimg || v.img, 1000), attributes: Object.fromEntries(Object.entries(v).filter(([,x]) => ['string','number','boolean'].includes(typeof x)).slice(0,30)) });
    const mapped = variants.map(normalize).filter(v => v.vid);
    check('all_live_variants_loaded', mapped.length > 0 && mapped.length === variants.length, `${mapped.length} variants`);
    const saved = product.details_json ? JSON.parse(product.details_json) : {};
    const storedVariants = Array.isArray(saved.variants) ? saved.variants : [];
    const chosen = mapped.find(v => v.vid === String(product.cj_variant_id || storedVariants[0]?.vid)) || mapped.find(v => v.price > 0);
    const alternate = chosen && mapped.find(v => v.vid !== chosen.vid && v.price > 0);
    check('selected_live_variant_exists', !!chosen, chosen ? `VID ${chosen.vid}` : 'no_valid_variant');
    if (!chosen || !alternate) throw Error('insufficient_live_variants');
    check('variant_has_valid_price_and_identity', !!chosen.vid && chosen.price > 0 && !!chosen.sku, `${chosen.sku || 'SKU missing'}; ${chosen.price ?? 'price missing'} USD`);

    const inventory = async vid => {
      const rows = await api(`/product/stock/queryByVid?vid=${encodeURIComponent(vid)}`);
      return Array.isArray(rows) ? rows.map(r => ({ vid: String(r.vid || ''), country: safe(r.countryCode, 2)?.toUpperCase() || '', warehouse: safe(r.areaEn || r.areaEnName || r.countryNameEn), cjStock: number(r.cjInventory ?? r.cjInventoryNum) || 0 })) : [];
    };
    const selectedStockRows = await inventory(chosen.vid);
    const usableStock = selectedStockRows.filter(r => r.vid === chosen.vid && /^[A-Z]{2}$/.test(r.country) && r.cjStock > 0);
    const stock = usableStock.reduce((n,r) => n + r.cjStock, 0);
    check('inventory_rows_match_exact_vid', selectedStockRows.length > 0 && selectedStockRows.every(r => r.vid === chosen.vid), `${selectedStockRows.length} rows`);
    check('selected_variant_has_cj_managed_stock', stock > 0, `${stock} units across ${usableStock.length} warehouses`);
    const freightByOrigin = [];
    for (const origin of [...new Set(usableStock.map(row => row.country))]) {
      const freight = await api('/logistic/freightCalculate', 'POST', { startCountryCode: origin, endCountryCode: 'SA', products: [{ vid: chosen.vid, quantity: 1 }] });
      if (Array.isArray(freight)) freightByOrigin.push(...freight.map(option => ({ ...option, _origin: origin })));
    }
    const quotes = freightByOrigin.filter(x => String(x.logisticName || x.logisticAisle || '').trim() && number(x.logisticPrice) >= 0);
    check('freight_quote_available_for_sa', quotes.length > 0, `${quotes.length} routes`);
    const quote = quotes.map(x => ({ name: safe(x.logisticName || x.logisticAisle), priceUsd: number(x.logisticPrice), additionalUsd: Math.max(0, (number(x.totalPostageFee) ?? number(x.logisticPrice)) - number(x.logisticPrice)), deliveryDays: safe(x.logisticAging, 40) })).sort((a,b) => a.priceUsd - b.priceUsd)[0];
    check('freight_quote_has_actual_price', !!quote && Number.isFinite(quote.priceUsd) && quote.priceUsd >= 0, quote ? `${quote.name}: $${quote.priceUsd}; ${quote.deliveryDays || 'delivery days unavailable'}` : 'no_valid_price');

    const alternateStockRows = await inventory(alternate.vid);
    const altStock = alternateStockRows.filter(r => r.vid === alternate.vid && /^[A-Z]{2}$/.test(r.country) && r.cjStock > 0).reduce((n,r) => n + r.cjStock, 0);
    const selectedImage = chosen.image || safe(rawProduct.productImage || rawProduct.bigImage || rawProduct.img, 1000);
    const alternateImage = alternate.image || safe(rawProduct.productImage || rawProduct.bigImage || rawProduct.img, 1000);
    check('alternate_variant_refreshes_price_image_and_stock_payload', chosen.vid !== alternate.vid && chosen.price > 0 && alternate.price > 0 && typeof selectedImage === 'string' && typeof alternateImage === 'string' && Number.isSafeInteger(stock) && Number.isSafeInteger(altStock) && (chosen.price !== alternate.price || selectedImage !== alternateImage || stock !== altStock), `selected ${chosen.vid}: $${chosen.price}, image ${selectedImage ? 'available' : 'missing'}, stock ${stock}; alternate ${alternate.vid}: $${alternate.price}, image ${alternateImage ? 'available' : 'missing'}, stock ${altStock}`);

    process.stdout.write(JSON.stringify({ product: { internalId: '12', pid: String(product.cj_product_id), name: safe(rawProduct.productNameEn || rawProduct.productName), variantCount: mapped.length }, selected: { vid: chosen.vid, sku: chosen.sku, name: chosen.name, optionKey: chosen.key, priceUsd: chosen.price, image: selectedImage, attributes: chosen.attributes, stock, warehouses: usableStock, freight: quote }, alternate: { vid: alternate.vid, sku: alternate.sku, name: alternate.name, priceUsd: alternate.price, image: alternateImage, stock: altStock }, gates: { commerce_purchasing_enabled: flags.commerce_purchasing_enabled || '0', commerce_payments_enabled: flags.commerce_payments_enabled || '0', SUPPLIER_ALLOW_LIVE_ORDERS: process.env.SUPPLIER_ALLOW_LIVE_ORDERS || 'unset' }, checks, passed: checks.filter(x => x.ok).length, total: checks.length }, null, 2) + '\n');
    if (checks.some(x => !x.ok)) process.exitCode = 1;
  } finally { await db.$disconnect(); }
}
main().catch(error => { process.stdout.write(JSON.stringify({ error: String(error?.message || 'probe_failed').replace(/[^a-zA-Z0-9_ -]/g, '').slice(0,100), checks, passed: checks.filter(x => x.ok).length, total: 12 }, null, 2) + '\n'); process.exitCode = 1; }).finally(() => db.$disconnect().catch(() => {}));
