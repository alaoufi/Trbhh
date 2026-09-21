'use strict';

/** Read-only live diagnosis. No refresh, OAuth, SQL writes, publication or orders.
 * Credentials stay inside the live app process. Stdout is an encrypted envelope.
 * Verified provider documentation:
 * https://docs.salla.dev/merchants/user-info
 * https://docs.salla.dev/5394261e0 (store/info)
 * https://docs.salla.dev/5394168e0 (products)
 */
const crypto = require('node:crypto');
const TARGET_STORE = 'شعبيات الأولين';
const URLS = Object.freeze({
  identity: 'https://accounts.salla.sa/oauth2/user/info',
  store: 'https://api.salla.dev/admin/v2/store/info',
  products: 'https://api.salla.dev/admin/v2/products?page=1&per_page=1',
});
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_CONNECTION_CHECKS = 5;
const AAD = Buffer.from('trbhh:salla-connection-inspection:v1');

function text(value, max = 255) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max) : null;
}
function identifier(value) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) return null;
  const result = typeof value === 'bigint' || typeof value === 'number' || typeof value === 'string' ? String(value) : '';
  return /^[1-9]\d{0,29}$/.test(result) ? result : null;
}
function timestamp(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function count(value) {
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'string' && /^\d+$/.test(value)) {
    const number = Number(value);
    if (Number.isSafeInteger(number) && number >= 0) return number;
  }
  return null;
}
function safeUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    // Never retain a query/fragment: provider/store URLs may contain credentials.
    return url.origin + url.pathname;
  } catch { return null; }
}
function storeName(value) {
  return (text(value) || '').normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/\s+/g, ' ').trim();
}
function targetMatches(value) { return storeName(value) === storeName(TARGET_STORE); }

function reportPublicKey(env) {
  try {
    const raw = env.SALLA_AUDIT_REPORT_PUBLIC_KEY_B64;
    if (typeof raw !== 'string' || raw.length > 12000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) throw Error();
    const key = crypto.createPublicKey(Buffer.from(raw, 'base64'));
    if (key.asymmetricKeyType !== 'rsa' || key.asymmetricKeyDetails.modulusLength < 2048) throw Error();
    return key;
  } catch { throw Error('report_encryption_key_invalid'); }
}
function encryptReport(report, key) {
  const dataKey = crypto.randomBytes(32), iv = crypto.randomBytes(12);
  try {
    const cipher = crypto.createCipheriv('aes-256-gcm', dataKey, iv);
    cipher.setAAD(AAD);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(report), 'utf8'), cipher.final()]);
    return {
      kind: 'salla_connection_inspection_encrypted', version: 1,
      algorithm: 'RSA-OAEP-SHA256+A256GCM',
      wrappedKey: crypto.publicEncrypt({key, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256'}, dataKey).toString('base64'),
      iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'),
      aad: AAD.toString('base64'), ciphertext: ciphertext.toString('base64'),
    };
  } finally { dataKey.fill(0); }
}
function decryptStoredTokens(row, rawKey) {
  try {
    if (!/^[a-fA-F0-9]{64}$/.test(rawKey || '') || typeof row.encrypted_tokens !== 'string' || row.encrypted_tokens.length > 50000) throw Error();
    const parts = row.encrypted_tokens.split('.');
    if (parts.length !== 4 || parts[0] !== 'v1') throw Error();
    const iv = Buffer.from(parts[1], 'base64url'), tag = Buffer.from(parts[2], 'base64url');
    if (iv.length !== 12 || tag.length !== 16 || !identifier(row.supplier_id) || !identifier(row.external_store_id)) throw Error();
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(rawKey, 'hex'), iv);
    decipher.setAAD(Buffer.from(`salla:${row.supplier_id}:${row.external_store_id}`));
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64url')), decipher.final()]);
    let value;
    try { value = JSON.parse(plain.toString('utf8')); } finally { plain.fill(0); }
    if (typeof value?.accessToken !== 'string' || !value.accessToken || value.accessToken.length > 16384 || typeof value.refreshToken !== 'string' || !value.refreshToken || value.refreshToken.length > 16384) throw Error();
    return {accessToken: value.accessToken, refreshTokenPresent: true};
  } catch { throw Error('stored_token_decryption_failed'); }
}

async function providerGet(kind, token, fetcher = fetch) {
  const url = URLS[kind];
  if (!url) throw Error('audit_endpoint_not_allowed');
  let response;
  try {
    response = await fetcher(url, {method: 'GET', headers: {Authorization: `Bearer ${token}`, Accept: 'application/json'}, credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000)});
  } catch { return {ok: false, httpStatus: null, error: 'provider_request_failed'}; }
  const httpStatus = response.status;
  if (!response.ok) {
    try { await response.body?.cancel(); } catch { /* No provider error body is read. */ }
    return {ok: false, httpStatus, error: `provider_http_${httpStatus}`};
  }
  const reader = response.body?.getReader();
  if (!reader) return {ok: false, httpStatus, error: 'provider_response_invalid'};
  try {
    const chunks = []; let size = 0;
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); return {ok: false, httpStatus, error: 'provider_response_too_large'}; }
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || body.success !== true || typeof body !== 'object' || Array.isArray(body)) return {ok: false, httpStatus, error: 'provider_response_invalid'};
    return {ok: true, httpStatus, body};
  } catch { return {ok: false, httpStatus, error: 'provider_response_invalid'}; }
  finally { reader.releaseLock(); }
}
function outcome(result) { return {ok: result.ok, httpStatus: result.httpStatus, error: result.ok ? null : result.error}; }
function storeProjection(data) {
  return {id: identifier(data?.id), name: text(data?.name), domain: safeUrl(data?.domain), status: text(data?.status, 32), currency: text(data?.currency, 3)};
}
function productProjection(data) {
  if (!data || !identifier(data.id) || !text(data.name)) return null;
  const amount = data.price?.amount;
  const price = (typeof amount === 'number' || typeof amount === 'string') && /^\d+(?:\.\d{1,6})?$/.test(String(amount)) && Number.isFinite(Number(amount)) ? String(amount) : null;
  return {id: identifier(data.id), name: text(data.name), price, currency: text(data.price?.currency, 3), quantity: count(data.quantity), unlimitedQuantity: data.unlimited_quantity === true, available: data.is_available === true};
}
async function inspectConnection(row, env, fetcher) {
  const result = {connectionId: identifier(row.id), supplierId: identifier(row.supplier_id), storedStoreId: identifier(row.external_store_id), accessTokenPresent: false, refreshTokenPresent: false, refreshTokenValidity: 'not_tested_read_only', tokenValid: null, connected: false, targetStoreMatch: false, storeId: null, store: null, productCount: null, productFetched: false, product: null, errors: []};
  if (!row.encrypted_tokens) { result.errors.push('stored_token_missing'); return result; }
  if (row.refresh_claim) { result.errors.push('token_refresh_in_progress'); return result; }
  let tokens;
  try { tokens = decryptStoredTokens(row, env.SUPPLIER_TOKEN_ENCRYPTION_KEY); }
  catch { result.errors.push('stored_token_decryption_failed'); return result; }
  result.accessTokenPresent = true; result.refreshTokenPresent = tokens.refreshTokenPresent;
  // GET even if local expiry has passed: this proves the provider's current state.
  // Never invoke accessTokenForConnection, whose refresh would mutate credentials.
  const identity = await providerGet('identity', tokens.accessToken, fetcher);
  result.identityApi = outcome(identity);
  if (!identity.ok) {
    result.tokenValid = identity.httpStatus === 401 ? false : null;
    result.errors.push(identity.error); return result;
  }
  result.tokenValid = true;
  result.storeId = identifier(identity.body.data?.merchant?.id);
  if (!result.storeId || result.storeId !== result.storedStoreId) { result.errors.push('merchant_identity_mismatch'); return result; }
  const store = await providerGet('store', tokens.accessToken, fetcher);
  result.storeApi = outcome(store);
  if (store.ok) {
    result.store = storeProjection(store.body.data);
    if (result.store.id !== result.storeId) { result.errors.push('store_identity_mismatch'); return result; }
    if (!targetMatches(result.store.name)) { result.errors.push('target_store_name_mismatch'); return result; }
    result.targetStoreMatch = true;
  } else { result.errors.push(`store_${store.error}`); return result; }
  const products = await providerGet('products', tokens.accessToken, fetcher);
  result.productsApi = outcome(products);
  if (!products.ok) { result.errors.push(`products_${products.error}`); return result; }
  if (!Array.isArray(products.body.data) || products.body.data.length > 1) { result.errors.push('products_response_invalid'); return result; }
  result.productCount = count(products.body.pagination?.total);
  result.product = productProjection(products.body.data[0]);
  result.productFetched = result.product !== null;
  if (products.body.data.length && !result.product) result.errors.push('product_sample_invalid');
  if (result.productCount === null) result.errors.push('product_total_missing');
  result.connected = row.status === 'connected' && store.ok && result.errors.length === 0;
  return result;
}

async function inspect(db, env = process.env, fetcher = fetch) {
  const report = {version: 1, observedAt: new Date().toISOString(), targetStore: TARGET_STORE, readOnly: true, tokenRefreshAttempted: false, purchaseAttempted: false, productsPublished: false, errors: []};
  // All statements are static SELECTs. Never select registration, contact or raw event payloads.
  const flags = await db.$queryRawUnsafe("SELECT k,v FROM site_settings WHERE k IN ('commerce_purchasing_enabled','commerce_payments_enabled','commerce_enabled')");
  const settings = new Map(flags.map(row => [row.k, row.v]));
  report.flags = Object.fromEntries(['commerce_purchasing_enabled','commerce_payments_enabled','commerce_enabled'].map(key => [key, {configured: settings.has(key), enabled: settings.get(key) === '1'}]));
  report.flags.SUPPLIER_ALLOW_LIVE_ORDERS = {configured: Boolean(env.SUPPLIER_ALLOW_LIVE_ORDERS), enabled: env.SUPPLIER_ALLOW_LIVE_ORDERS === 'true', explicitlyFalse: env.SUPPLIER_ALLOW_LIVE_ORDERS === 'false'};
  report.environment = Object.fromEntries(['SALLA_CLIENT_ID','SALLA_CLIENT_SECRET','SUPPLIER_TOKEN_ENCRYPTION_KEY','SALLA_WEBHOOK_SECRET','SUPPLIER_RECONCILE_SECRET'].map(key => [key, Boolean(env[key])]));
  const origin = safeUrl(env.SUPPLIER_PUBLIC_ORIGIN);
  // Client ID is an OAuth public identifier; never include its companion secret.
  report.publicConfig = {clientId: text(env.SALLA_CLIENT_ID,255), origin};
  report.callbackUrl = origin ? `${origin.replace(/\/$/, '')}/api/integrations/salla/callback` : null;
  report.webhookUrl = origin ? `${origin.replace(/\/$/, '')}/api/integrations/salla/webhooks` : null;
  const suppliers = await db.$queryRawUnsafe("SELECT s.id,s.name,s.active,p.provider,p.maintenance,p.sync_enabled,p.auto_orders_enabled,p.mode,p.last_sync_at FROM commerce_suppliers s LEFT JOIN supplier_integration_profiles p ON p.supplier_id=s.id WHERE p.provider='salla' OR s.name LIKE '%شعبيات%' ORDER BY s.id LIMIT 101");
  report.suppliersTruncated = suppliers.length > 100;
  report.suppliers = suppliers.slice(0,100).map(row => ({id: identifier(row.id), name: text(row.name), targetNameMatch: targetMatches(row.name), active: row.active === 1, provider: text(row.provider,16), maintenance: row.maintenance === 1, syncEnabled: row.sync_enabled === 1, autoOrdersEnabled: row.auto_orders_enabled === 1, mode: text(row.mode,16), lastSyncAt: timestamp(row.last_sync_at)}));
  const rows = await db.$queryRawUnsafe("SELECT c.id,c.supplier_id,c.external_store_id,c.status,c.encrypted_tokens,c.expires_at,c.refresh_claim,c.refresh_claimed_at,c.version FROM supplier_connections c WHERE c.provider='salla' ORDER BY c.id LIMIT 101");
  report.connectionsTruncated = rows.length > 100;
  report.connections = rows.slice(0,100).map(row => ({id: identifier(row.id), supplierId: identifier(row.supplier_id), storeId: identifier(row.external_store_id), status: text(row.status,32), encryptedTokenPresent: Boolean(row.encrypted_tokens), expiresAt: timestamp(row.expires_at), expiredByStoredTime: timestamp(row.expires_at) ? new Date(row.expires_at).getTime() <= Date.now() : null, refreshClaimPresent: Boolean(row.refresh_claim), refreshClaimedAt: timestamp(row.refresh_claimed_at), version: count(row.version)}));
  const targetIds = new Set(report.suppliers.filter(row => row.targetNameMatch).map(row => row.id));
  const namedTargets = rows.filter(row => targetIds.has(identifier(row.supplier_id)));
  // A merchant may have been linked to a temporary supplier label. Check the
  // provider's store name for remaining connections, never their catalog until
  // that name matches the requested store. Prioritize the local name match.
  const targets = [...namedTargets, ...rows.filter(row => !targetIds.has(identifier(row.supplier_id)) && row.encrypted_tokens)];
  if (targets.length > MAX_CONNECTION_CHECKS) report.errors.push('target_connection_limit');
  report.checks = [];
  for (const row of targets.slice(0,MAX_CONNECTION_CHECKS)) report.checks.push(await inspectConnection(row, env, fetcher));
  report.targetConnectionIds = report.checks.filter(check => check.targetStoreMatch).map(check => check.connectionId);
  if (!report.targetConnectionIds.length && !targetIds.size) report.errors.push('target_supplier_not_found');
  else if (!report.targetConnectionIds.length && !namedTargets.length) report.errors.push('target_connection_missing');
  const events = await db.$queryRawUnsafe("SELECT connection_id,status,COUNT(*) AS total,MAX(processed_at) AS last_processed_at FROM supplier_webhook_events GROUP BY connection_id,status LIMIT 101");
  report.webhookEvents = events.slice(0,100).map(row => ({connectionId: identifier(row.connection_id), status: text(row.status,24), count: count(row.total), lastProcessedAt: timestamp(row.last_processed_at)}));
  const products = await db.$queryRawUnsafe("SELECT connection_id,COUNT(*) AS total,SUM(active=1) AS active_total,SUM(visible=1) AS visible_total,MAX(last_sync_at) AS last_sync_at FROM supplier_products GROUP BY connection_id LIMIT 101");
  report.localCatalog = products.slice(0,100).map(row => ({connectionId: identifier(row.connection_id), count: count(row.total), activeCount: count(row.active_total), visibleCount: count(row.visible_total), lastSyncAt: timestamp(row.last_sync_at)}));
  const attempts = await db.$queryRawUnsafe("SELECT supplier_id,COUNT(*) AS total,SUM(consumed_at IS NOT NULL) AS consumed_total,SUM(consumed_at IS NULL AND expires_at>UTC_TIMESTAMP(3)) AS pending_total,MAX(expires_at) AS latest_expiry FROM supplier_oauth_states GROUP BY supplier_id LIMIT 101");
  report.oauthAttempts = attempts.slice(0,100).map(row => ({supplierId: identifier(row.supplier_id), count: count(row.total), consumedCount: count(row.consumed_total), unexpiredPendingCount: count(row.pending_total), latestExpiry: timestamp(row.latest_expiry)}));
  return report;
}

async function main(env = process.env, dependencies = {}) {
  let key;
  try { key = reportPublicKey(env); }
  catch { process.stderr.write('Salla inspection refused: encrypted report key required.\n'); process.exitCode = 1; return; }
  let db, report;
  try {
    db = dependencies.db || new (require('@prisma/client').PrismaClient)({log: []});
    report = await inspect(db, env, dependencies.fetcher || fetch);
  } catch {
    report = {version: 1, observedAt: new Date().toISOString(), readOnly: true, errors: ['inspection_failed'], tokenRefreshAttempted: false, purchaseAttempted: false, productsPublished: false};
    process.exitCode = 1;
  } finally {
    if (db) try { await db.$disconnect(); } catch { /* No raw database errors. */ }
  }
  try { process.stdout.write(`${JSON.stringify(encryptReport(report,key))}\n`); }
  catch { process.stderr.write('Salla inspection report encryption failed.\n'); process.exitCode = 1; }
}

module.exports = {TARGET_STORE, URLS, reportPublicKey, encryptReport, decryptStoredTokens, providerGet, productProjection, targetMatches, inspectConnection, inspect, main};
if (require.main === module || module.id === '[stdin]' && process.argv[1] === '-') void main();
