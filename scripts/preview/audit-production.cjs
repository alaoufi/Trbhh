'use strict';

// Standalone aggregate diagnostic: node scripts/preview/audit-production.cjs
// DATABASE_URL is supplied by the operator; never import application startup,
// schema-sync, lifecycle helpers, settings, or log raw database results/errors.
// Flag counts overlap. These are inventory counts, not a public-visibility policy.
const GUARD_QUERY = 'SELECT @@session.transaction_read_only AS read_only';
const QUERIES = Object.freeze({
  ads: `SELECT COUNT(*) AS total,
    COUNT(CASE WHEN paused_by_owner <> 0 THEN 1 END) AS paused,
    COUNT(CASE WHEN publish_at > CURRENT_TIMESTAMP THEN 1 END) AS future,
    COUNT(CASE WHEN data_archive IS NOT NULL AND data_archive <> '' THEN 1 END) AS archived,
    COUNT(CASE WHEN data_delete IS NOT NULL AND data_delete <> '' THEN 1 END) AS deleted,
    COUNT(CASE WHEN store_only <> 0 THEN 1 END) AS store_only FROM ads`,
  adGroups: `SELECT CASE status WHEN 0 THEN '0' WHEN 1 THEN '1' WHEN 2 THEN '2' WHEN 3 THEN '3' ELSE 'other' END AS status_group,
    CASE CAST(state AS CHAR) WHEN '0' THEN '0' WHEN '1' THEN '1' ELSE 'other' END AS state_group,
    COUNT(*) AS n FROM ads GROUP BY status_group, state_group`,
  users: `SELECT COUNT(*) AS total,
    COUNT(CASE WHEN archived_at IS NOT NULL THEN 1 END) AS archived,
    COUNT(CASE WHEN ban = 'checked' THEN 1 END) AS banned FROM users`,
  stores: `SELECT COUNT(*) AS total,
    COUNT(CASE WHEN u.id IS NULL THEN 1 END) AS missing_owner
    FROM stores s LEFT JOIN users u ON u.id = s.user_id`,
  storeGroups: `SELECT CASE status WHEN 0 THEN '0' WHEN 1 THEN '1' WHEN 2 THEN '2' WHEN 3 THEN '3' ELSE 'other' END AS status_group,
    COUNT(*) AS n FROM stores GROUP BY status_group`,
  productLinks: `SELECT COUNT(*) AS total,
    COUNT(CASE WHEN s.id IS NULL THEN 1 END) AS missing_store,
    COUNT(CASE WHEN a.id IS NULL THEN 1 END) AS missing_ad,
    COUNT(CASE WHEN s.id IS NULL AND a.id IS NULL THEN 1 END) AS missing_both
    FROM store_products p LEFT JOIN stores s ON s.id = p.store_id LEFT JOIN ads a ON a.id = p.ad_id`,
});

function count(value) {
  if (!(typeof value === 'number' || typeof value === 'bigint' || (typeof value === 'string' && /^\d+$/.test(value)))) throw new Error('Invalid aggregate result');
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error('Invalid aggregate result');
  return number;
}
function summary(rows, fields) {
  if (!Array.isArray(rows) || rows.length !== 1 || !rows[0]) throw new Error('Invalid aggregate result');
  return Object.fromEntries(fields.map(field => [field, count(rows[0][field])]));
}
const statuses = Object.freeze(['0','1','2','3','other']);
function statusLabel(value) {
  for (let i = 0; i <= 3; i++) if (value === i || value === BigInt(i) || value === String(i)) return String(i);
  return 'other';
}
function stateLabel(value) {
  if (value === '0' || value === 0 || value === 0n) return 'inactive';
  if (value === '1' || value === 1 || value === 1n) return 'active';
  return 'other';
}
function shapeAggregates(raw) {
  const ads = summary(raw.ads, ['total','paused','future','archived','deleted','store_only']);
  const users = summary(raw.users, ['total','archived','banned']);
  const stores = summary(raw.stores, ['total','missing_owner']);
  const product_links = summary(raw.productLinks, ['total','missing_store','missing_ad','missing_both']);
  if (!Array.isArray(raw.adGroups) || !Array.isArray(raw.storeGroups)) throw new Error('Invalid aggregate result');
  ads.by_status_state = Object.fromEntries(statuses.map(label => [label, {inactive:0,active:0,other:0}]));
  stores.by_status = Object.fromEntries(statuses.map(label => [label, 0]));
  for (const row of raw.adGroups) {
    const group = ads.by_status_state[statusLabel(row.status_group)], state = stateLabel(row.state_group);
    group[state] = count(group[state] + count(row.n));
  }
  for (const row of raw.storeGroups) {
    const status = statusLabel(row.status_group);
    stores.by_status[status] = count(stores.by_status[status] + count(row.n));
  }
  return {version:1,ads,users,stores,product_links};
}

async function executeAudit(db) {
  // This standalone client has a one-connection pool. The session guard inside
  // the transaction fails closed if the connection was replaced or reset.
  await db.$executeRawUnsafe('SET SESSION TRANSACTION READ ONLY');
  return db.$transaction(async tx => {
    const guard = await tx.$queryRawUnsafe(GUARD_QUERY);
    if (!Array.isArray(guard) || guard.length !== 1 || ![1,1n,'1'].includes(guard[0]?.read_only)) throw new Error('Read-only guard failed');
    const raw = {};
    for (const [key, sql] of Object.entries(QUERIES)) raw[key] = await tx.$queryRawUnsafe(sql);
    return shapeAggregates(raw);
  }, {isolationLevel:'RepeatableRead',maxWait:10000,timeout:60000});
}

function clientOptions(databaseUrl) {
  try {
    const url = new URL(databaseUrl);
    if (url.protocol !== 'mysql:' || !url.hostname || url.pathname.length < 2 || url.hash) throw new Error();
    url.searchParams.set('connection_limit','1');
    return {datasources:{db:{url:url.toString()}},log:[]};
  } catch { throw new Error('Invalid audit configuration'); }
}
async function runCli({databaseUrl,createClient,write}) {
  let db, result, failed = false;
  try {
    db = createClient(clientOptions(databaseUrl));
    result = await executeAudit(db);
  } catch { failed = true; }
  finally {
    if (db) { try { await db.$disconnect(); } catch { failed = true; } }
  }
  write(JSON.stringify(failed ? {error:'production_audit_failed'} : result) + '\n');
  return failed ? 1 : 0;
}

module.exports = {GUARD_QUERY,QUERIES,shapeAggregates,executeAudit,clientOptions,runCli};
if (require.main === module || module.id === '[stdin]') {
  runCli({databaseUrl:process.env.DATABASE_URL,
    createClient:options => { const {PrismaClient} = require('@prisma/client'); return new PrismaClient(options); },
    write:text => process.stdout.write(text),
  }).then(code => {process.exitCode = code;}).catch(() => {process.exitCode = 1;});
}
