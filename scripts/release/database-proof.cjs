#!/usr/bin/env node
'use strict';

/**
 * Private, read-only release evidence. This never imports or resets a database.
 *
 * node database-proof.cjs dump                         > protected.sql
 * node database-proof.cjs snapshot                     > protected-before.json
 * node database-proof.cjs summary protected-before.json
 * node database-proof.cjs verify protected-before.json protected-after.json
 * node database-proof.cjs verify-restore protected-before.json isolated-restore.json
 * node database-proof.cjs verify-schema
 *
 * Keep SQL and manifests in a mode-0700 directory OUTSIDE the checkout. Redirect
 * with umask 077 and shell pipefail. Never upload them as a public CI artifact.
 * Only summary/verify stdout is suitable for a CI log. PKs and protected values
 * are SHA-256 fingerprints, not their plaintext. These are integrity evidence,
 * not encryption: manifests still belong in private storage.
 *
 * dump/snapshot require @prisma/client in the current app container. summary and
 * verify use Node builtins only, so they can run on the host without Prisma.
 */
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const { readFileSync } = require('node:fs');

const FORMAT = 'trbhh-database-proof-v1';
const PAGE_SIZE = 2000;
const REQUIRED_TABLES = ['users', 'ads'];
// Explicit columns make a new additive column compatible with an old manifest.
// Missing optional columns are recorded. Existing protected columns may never
// disappear. Do not silently exclude another field to make verification pass.
const PROTECTED = {
  users: ['userName', 'name', 'phoneNumber', 'email', 'password', 'two_factor_secret', 'two_factor_recovery_codes', 'is_admin', 'balance', 'reserved', 'balance_halala', 'reserved_halala', 'points', 'merged_into', 'archived_at', 'ban'],
  ads: ['title', 'user_id', 'profile_id', 'price', 'price_type', 'rent_period', 'city_id', 'area_id', 'category_id', 'status', 'state', 'data_archive', 'adsSpecial', 'expires_at', 'store_only', 'trbhh_until', 'urgent_until'],
  stores: ['user_id', 'store_name', 'store_username', 'store_password', 'handle', 'status', 'sub_until', 'sub_plan', 'on_trial', 'auto_renew', 'plus_until', 'show_until', 'show_on_platform', 'home_featured'],
  profiles: ['user_id', 'type', 'name', 'store_id', 'paid_until'],
  uploads: ['file_name', 'file_original_name', 'file_size', 'type', 'extension'],
  photos: ['other_id', 'photo_path'],
  site_settings: ['k', 'v'],
  // Reading a chat changes is_read; message contents and participants must not
  // change merely because an application image was replaced.
  chats: ['sender_id', 'reciver_id', 'message', 'type_from_user', 'type_to_user', 'chat_id'],
  chat_messages: ['from_user', 'to_user', 'from_type', 'to_type'],
  chat_ads: ['ads_id', 'ads_user', 'user_id', 'message'],
  admin_message_threads: ['admin_id', 'member_id', 'status', 'archived_at', 'archived_by'],
  admin_roles: ['user_id', 'role'],
  admin_perms: ['user_id', 'perm'],
  auth_mfa: ['user_id', 'secret', 'recovery_hashes', 'last_step', 'version'],
  // All current columns of financial records are protected; there are no
  // financial schema additions in this release. A schema mismatch fails closed.
  wallet_txns: '*',
  wallet_topups: '*',
  wallet_bank_accounts: '*',
  wallet_withdrawal_requests: '*',
  member_service_orders: '*',
  identity_orders: '*',
  store_products: '*',
  favorites: '*',
};

const VOLATILE_COLUMNS = new Set(['created_at', 'updated_at', 'modified_at', 'last_seen', 'last_seen_at', 'seen', 'seen_at', 'read_at', 'last_login_at', 'views', 'clicks']);
class ProofError extends Error {}
function fail(message) { throw new ProofError(message); }
function assert(condition, message) { if (!condition) fail(message); }
function quoteIdentifier(value) {
  assert(typeof value === 'string' && /^[A-Za-z0-9_]+$/.test(value), 'Unsupported database identifier.');
  return '`' + value + '`';
}
function normalized(value) {
  if (value === null || value === undefined) return ['null'];
  if (typeof value === 'bigint') return ['integer', value.toString()];
  if (value instanceof Date) return ['date', value.toISOString()];
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return ['bytes', Buffer.from(value).toString('hex')];
  if (Array.isArray(value)) return ['array', value.map(normalized)];
  if (typeof value === 'object') {
    if (value.constructor && value.constructor.name === 'Decimal') return ['decimal', value.toString()];
    return ['object', Object.keys(value).sort().map((key) => [key, normalized(value[key])])];
  }
  return [typeof value, String(value)];
}
function fingerprint(value) { return createHash('sha256').update(JSON.stringify(normalized(value))).digest('hex'); }
function safeCount(value) {
  const n = Number(value);
  assert(Number.isSafeInteger(n) && n >= 0, 'Row count is outside the supported safe integer range.');
  return n;
}
function connection() {
  let url;
  try { url = new URL(process.env.DATABASE_URL || ''); } catch { fail('A valid DATABASE_URL is required.'); }
  assert(url.protocol === 'mysql:' && url.hostname && url.username && !url.hash, 'An explicit MySQL connection is required.');
  let username, password, database;
  try {
    username = decodeURIComponent(url.username);
    password = decodeURIComponent(url.password);
    database = decodeURIComponent(url.pathname.slice(1));
  } catch { fail('Invalid URL encoding in database connection.'); }
  assert(database && !database.includes('/') && !database.includes('\0'), 'An explicit database name is required.');
  assert(!username.includes('\0') && !password.includes('\0'), 'Invalid connection credential encoding.');
  return { url, username, password, database, host: url.hostname.replace(/^\[|\]$/g, ''), port: url.port || '3306' };
}

async function dump() {
  const conn = connection();
  // These only tune Prisma's pool. Silently ignoring TLS/socket/transport options
  // could dump a different endpoint or weaken the configured connection.
  const ignoredPoolOptions = new Set(['connection_limit', 'pool_timeout', 'connect_timeout']);
  assert([...conn.url.searchParams.keys()].every((key) => ignoredPoolOptions.has(key)), 'Dump cannot safely represent these DATABASE_URL options; provide a compatible transport-specific backup method.');
  const args = [
    '--protocol=TCP', '--host=' + conn.host, '--port=' + conn.port,
    '--user=' + conn.username, '--single-transaction', '--quick', '--hex-blob',
    '--no-tablespaces', '--default-character-set=utf8mb4', '--routines', '--triggers', '--events',
    '--databases', conn.database,
  ];
  // A missing binary is the only fallback. A connection or SQL failure must not
  // be masked by another binary or a checked-in historical database.
  for (const bin of ['mysqldump', 'mariadb-dump']) {
    const result = await new Promise((resolve) => {
      const child = spawn(bin, args, { env: { ...process.env, MYSQL_PWD: conn.password }, stdio: ['ignore', 'inherit', 'pipe'] });
      const errorHash = createHash('sha256');
      let stderrBytes = 0;
      child.stderr.on('data', (chunk) => { stderrBytes += chunk.length; errorHash.update(chunk); });
      child.once('error', (error) => resolve({ missing: error.code === 'ENOENT', failed: true }));
      child.once('close', (code, signal) => resolve({ code, signal, stderrBytes, errorDigest: stderrBytes ? errorHash.digest('hex') : null }));
    });
    if (result.missing) continue;
    if (result.failed || result.code !== 0) {
      // Tool stderr may contain credentials or connection strings. Report only
      // exit status and a diagnostic digest, never the original error text.
      process.stderr.write(JSON.stringify({ operation: 'dump', ok: false, exitCode: result.code ?? null, signal: result.signal ?? null, diagnosticSha256: result.errorDigest ?? null }) + '\n');
      fail('Live database dump failed; the partial output is not a backup.');
    }
    process.stderr.write(JSON.stringify({ operation: 'dump', ok: true, warningOutputPresent: result.stderrBytes > 0 }) + '\n');
    return;
  }
  fail('Neither mysqldump nor mariadb-dump is installed.');
}

async function snapshot() {
  const conn = connection();
  // Loaded only in snapshot mode. Query logs stay off: Prisma errors can include
  // values or connection details, so the top-level handler is deliberately terse.
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient({ log: [], datasources: { db: { url: process.env.DATABASE_URL } } });
  try {
    return await prisma.$transaction(async (tx) => {
      const [info] = await tx.$queryRawUnsafe('SELECT DATABASE() AS db, VERSION() AS version, UTC_TIMESTAMP() AS observed_at');
      assert(info && info.db === conn.database, 'Connected database differs from the configured database.');
      const tableRows = await tx.$queryRawUnsafe("SELECT TABLE_NAME AS name, ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME");
      const columns = await tx.$queryRawUnsafe('SELECT TABLE_NAME AS t,COLUMN_NAME AS c,COLUMN_TYPE AS type,IS_NULLABLE AS nullable,COLUMN_DEFAULT AS def FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,ORDINAL_POSITION');
      const primary = await tx.$queryRawUnsafe("SELECT TABLE_NAME AS t,COLUMN_NAME AS c FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND CONSTRAINT_NAME='PRIMARY' ORDER BY TABLE_NAME,ORDINAL_POSITION");
      const names = new Set(tableRows.map((r) => r.name));
      REQUIRED_TABLES.forEach((name) => assert(names.has(name), 'Required core database table is unavailable.'));
      const byColumn = new Map();
      const byPk = new Map();
      for (const r of columns) { if (!byColumn.has(r.t)) byColumn.set(r.t, []); byColumn.get(r.t).push(r); }
      for (const r of primary) { if (!byPk.has(r.t)) byPk.set(r.t, []); byPk.get(r.t).push(r.c); }
      const notes = [];
      const tables = {};
      for (const row of tableRows) {
        const name = row.name;
        const table = quoteIdentifier(name);
        const available = (byColumn.get(name) || []).map((r) => r.c);
        const pkColumns = byPk.get(name) || [];
        const configured = PROTECTED[name];
        const protectedColumns = configured === '*' ? available.filter((c) => !VOLATILE_COLUMNS.has(c)) : (configured || []).filter((c) => available.includes(c));
        if (Array.isArray(configured)) {
          const missing = configured.filter((c) => !available.includes(c));
          if (missing.length) notes.push({ table: name, kind: 'optional_protected_columns_absent', columns: missing });
        }
        const [countRow] = await tx.$queryRawUnsafe('SELECT COUNT(*) AS n FROM ' + table);
        const count = safeCount(countRow.n);
        const proof = { count, engine: row.engine, primaryKeyColumns: pkColumns, primaryKeys: [], protectedColumns, rowFingerprints: {} };
        if (!pkColumns.length) {
          notes.push({ table: name, kind: 'no_primary_key_count_only' });
          assert(!REQUIRED_TABLES.includes(name), 'Required core table has no primary key.');
        } else {
          const selection = [...new Set([...pkColumns, ...protectedColumns])].map(quoteIdentifier).join(',');
          const order = pkColumns.map(quoteIdentifier).join(',');
          let last = null;
          for (;;) {
            const where = last ? ' WHERE (' + order + ') > (' + pkColumns.map(() => '?').join(',') + ')' : '';
            const rows = await tx.$queryRawUnsafe('SELECT ' + selection + ' FROM ' + table + where + ' ORDER BY ' + order + ' LIMIT ' + PAGE_SIZE, ...(last || []));
            for (const record of rows) {
              const key = fingerprint(pkColumns.map((c) => record[c]));
              assert(!(key in proof.rowFingerprints), 'Unexpected duplicate primary key fingerprint.');
              proof.primaryKeys.push(key);
              if (protectedColumns.length) proof.rowFingerprints[key] = fingerprint(protectedColumns.map((c) => [c, record[c]]));
            }
            if (rows.length < PAGE_SIZE) break;
            last = pkColumns.map((c) => rows[rows.length - 1][c]);
          }
          assert(proof.primaryKeys.length === count && new Set(proof.primaryKeys).size === count, 'Inconsistent table snapshot.');
          proof.primaryKeys.sort();
        }
        tables[name] = proof;
      }
      for (const name of Object.keys(PROTECTED)) if (!names.has(name)) notes.push({ table: name, kind: 'optional_table_absent' });
      const controls = await operationalControls(tx, names, byColumn);
      const authColumn = (byColumn.get('users') || []).find((r) => r.c === 'auth_session_version');
      return {
        format: FORMAT,
        capturedAt: new Date().toISOString(),
        databaseIdentitySha256: fingerprint([conn.host, conn.port, info.db]),
        serverVersion: String(info.version),
        observedAt: info.observed_at instanceof Date ? info.observed_at.toISOString() : String(info.observed_at),
        snapshotIsolation: 'RepeatableRead',
        nonTransactionalTables: tableRows.filter((r) => String(r.engine).toLowerCase() !== 'innodb').map((r) => r.name),
        authSchema: {
          sessionVersionColumn: !!authColumn,
          sessionVersionType: authColumn ? authColumn.type : null,
          sessionVersionNullable: authColumn ? authColumn.nullable === 'YES' : null,
          sessionVersionDefaultZero: authColumn ? ['0', "'0'"].includes(String(authColumn.def)) : null,
          mfaTable: names.has('auth_mfa'),
          limitsTable: names.has('auth_security_limits'),
        },
        controls,
        tables,
        notes,
      };
    }, { isolationLevel: 'RepeatableRead', maxWait: 30000, timeout: 300000 });
  } finally { await prisma.$disconnect(); }
}

async function operationalControls(tx, names, byColumn) {
  const out = { archiveAutoDeleteEnabled: null, adLifetimeDays: null, requireAdminMfa: null, autoRenewEnabled: null, expiredArchivedCandidates: null, oldAdArchiveCandidates: null, expiredFeaturedCandidates: null, enrolledMfaAccounts: null };
  if (names.has('site_settings')) {
    const rows = await tx.$queryRawUnsafe("SELECT k,v FROM site_settings WHERE k IN ('archive_autodelete_on','ad_lifetime_days','auth_require_admin_mfa','autorenew_on')");
    const settings = new Map(rows.map((r) => [r.k, r.v]));
    const bool = (k) => ['1', 'true', 'on', 'yes'].includes(String(settings.get(k) || '').toLowerCase());
    const days = Number(settings.get('ad_lifetime_days') || 0);
    out.archiveAutoDeleteEnabled = bool('archive_autodelete_on');
    out.adLifetimeDays = Number.isFinite(days) && days >= 0 ? days : null;
    out.requireAdminMfa = settings.get('auth_require_admin_mfa') === '1';
    out.autoRenewEnabled = bool('autorenew_on');
  }
  const adColumns = new Set((byColumn.get('ads') || []).map((r) => r.c));
  if (adColumns.has('data_archive')) {
    // Match the application's JS Date parsing for legacy ISO/date strings.
    const rows = await tx.$queryRawUnsafe("SELECT data_archive FROM ads WHERE data_archive IS NOT NULL AND data_archive <> ''");
    const cutoff = Date.now() - 180 * 86400000;
    out.expiredArchivedCandidates = rows.filter((r) => Number.isFinite(Date.parse(String(r.data_archive))) && Date.parse(String(r.data_archive)) < cutoff).length;
  }
  if (['status', 'state', 'store_only', 'data_archive', 'bumped_at', 'created_at'].every((c) => adColumns.has(c)) && out.adLifetimeDays !== null) {
    if (out.adLifetimeDays === 0) out.oldAdArchiveCandidates = 0;
    else {
      const cutoff = new Date(Date.now() - out.adLifetimeDays * 86400000);
      const [row] = await tx.$queryRawUnsafe("SELECT COUNT(*) AS n FROM ads WHERE status=1 AND state='active' AND store_only=0 AND (data_archive IS NULL OR data_archive='') AND (bumped_at < ? OR bumped_at IS NULL) AND (created_at < ? OR created_at IS NULL)", cutoff, cutoff);
      out.oldAdArchiveCandidates = safeCount(row.n);
    }
  }
  if (['adsSpecial', 'expires_at'].every((c) => adColumns.has(c))) {
    const [row] = await tx.$queryRawUnsafe("SELECT COUNT(*) AS n FROM ads WHERE adsSpecial='checked' AND expires_at IS NOT NULL AND expires_at < UTC_TIMESTAMP()");
    out.expiredFeaturedCandidates = safeCount(row.n);
  }
  if (names.has('auth_mfa')) {
    const [row] = await tx.$queryRawUnsafe('SELECT COUNT(*) AS n FROM auth_mfa');
    out.enrolledMfaAccounts = safeCount(row.n);
  }
  return out;
}

function readManifest(file) {
  assert(file, 'A private manifest path is required.');
  let value;
  try { value = JSON.parse(readFileSync(file, 'utf8')); } catch { fail('Cannot read a valid private manifest.'); }
  assert(value && value.format === FORMAT && value.tables && /^[a-f0-9]{64}$/.test(value.databaseIdentitySha256 || ''), 'Unsupported database manifest.');
  for (const name of REQUIRED_TABLES) assert(value.tables[name], 'Manifest is missing a required core table.');
  for (const [name, table] of Object.entries(value.tables)) {
    quoteIdentifier(name);
    safeCount(table.count);
    assert(Array.isArray(table.primaryKeyColumns) && Array.isArray(table.primaryKeys) && Array.isArray(table.protectedColumns) && table.rowFingerprints && typeof table.rowFingerprints === 'object', 'Invalid table proof.');
    assert(table.primaryKeys.every((k) => /^[a-f0-9]{64}$/.test(k)) && new Set(table.primaryKeys).size === table.primaryKeys.length, 'Invalid primary key proof.');
    assert(!table.primaryKeyColumns.length || table.primaryKeys.length === table.count, 'Incomplete primary key proof.');
    if (table.protectedColumns.length && table.primaryKeyColumns.length) assert(table.primaryKeys.every((key) => /^[a-f0-9]{64}$/.test(table.rowFingerprints[key] || '')), 'Incomplete protected field proof.');
  }
  return value;
}

/** Check the exact new auth schema; a running HTTP server is insufficient. */
async function verifySchema() {
  const conn = connection();
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient({ log: [], datasources: { db: { url: process.env.DATABASE_URL } } });
  try {
    const [identity] = await prisma.$queryRawUnsafe('SELECT DATABASE() AS db');
    assert(identity && identity.db === conn.database, 'Connected database differs from the configured database.');
    const rows = await prisma.$queryRawUnsafe("SELECT TABLE_NAME AS t,COLUMN_NAME AS c,COLUMN_TYPE AS type,IS_NULLABLE AS nullable,COLUMN_DEFAULT AS def,COLUMN_KEY AS pk FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('users','auth_mfa','auth_security_limits')");
    const columns = new Map(rows.map((r) => [r.t + '.' + r.c, r]));
    const indexes = await prisma.$queryRawUnsafe("SELECT INDEX_NAME AS name,COLUMN_NAME AS c,SEQ_IN_INDEX AS seq FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='auth_security_limits'");
    const expected = {
      'users.auth_session_version': ['varchar(64)', '0'],
      'auth_mfa.user_id': ['bigint unsigned', undefined, true],
      'auth_mfa.secret': ['text'],
      'auth_mfa.recovery_hashes': ['text'],
      'auth_mfa.last_step': ['bigint', '-1'],
      'auth_mfa.version': ['varchar(64)'],
      'auth_mfa.created_at': ['datetime'],
      'auth_security_limits.k': ['varchar(128)', undefined, true],
      'auth_security_limits.hits': ['int', '0'],
      'auth_security_limits.expires_at': ['datetime'],
    };
    const checks = {};
    for (const [key, [type, defaultValue, primaryKey]] of Object.entries(expected)) {
      const actual = columns.get(key);
      // MariaDB/MySQL older versions expose integer display widths; widths do
      // not alter storage type. Preserve varchar lengths and signedness.
      const normalizedType = actual ? String(actual.type).toLowerCase().replace(/\b(bigint|int)\(\d+\)/g, '$1') : '';
      const normalizedDefault = actual ? String(actual.def).replace(/^'(.*)'$/, '$1') : '';
      checks[key] = !!actual && normalizedType === type && actual.nullable === 'NO' && (defaultValue === undefined || normalizedDefault === defaultValue) && (!primaryKey || actual.pk === 'PRI');
    }
    checks.auth_security_limits_expiry_index = indexes.some((r) => r.c === 'expires_at' && Number(r.seq) === 1);
    return { ok: Object.values(checks).every(Boolean), checks };
  } finally { await prisma.$disconnect(); }
}
function summary(value) {
  return {
    format: FORMAT, capturedAt: value.capturedAt, serverVersion: value.serverVersion,
    tableCount: Object.keys(value.tables).length,
    counts: Object.fromEntries(Object.entries(value.tables).map(([name, table]) => [name, table.count])),
    authSchema: value.authSchema, controls: value.controls,
    nonTransactionalTables: value.nonTransactionalTables,
    tablesWithoutPrimaryKey: Object.entries(value.tables).filter(([, table]) => !table.primaryKeyColumns.length).map(([name]) => name),
    noteCount: Array.isArray(value.notes) ? value.notes.length : 0,
  };
}
function verify(before, after, isolatedRestore = false) {
  const failures = [];
  const changes = [];
  if (!isolatedRestore && before.databaseIdentitySha256 !== after.databaseIdentitySha256) failures.push({ kind: 'database_identity_changed' });
  for (const [name, oldTable] of Object.entries(before.tables)) {
    const next = after.tables[name];
    if (!next) { failures.push({ table: name, kind: 'table_missing' }); continue; }
    if (JSON.stringify(oldTable.primaryKeyColumns) !== JSON.stringify(next.primaryKeyColumns)) {
      failures.push({ table: name, kind: 'primary_key_schema_changed' }); continue;
    }
    const newKeys = new Set(next.primaryKeys);
    const oldKeys = new Set(oldTable.primaryKeys);
    const missing = oldTable.primaryKeys.filter((key) => !newKeys.has(key));
    const added = next.primaryKeys.filter((key) => !oldKeys.has(key));
    if (missing.length) failures.push({ table: name, kind: 'primary_keys_missing', count: missing.length });
    if (next.count < oldTable.count) failures.push({ table: name, kind: 'row_count_decreased', count: oldTable.count - next.count });
    if (JSON.stringify(oldTable.protectedColumns) !== JSON.stringify(next.protectedColumns)) {
      failures.push({ table: name, kind: 'protected_columns_changed' });
    } else if (oldTable.protectedColumns.length && oldTable.primaryKeyColumns.length) {
      const changed = oldTable.primaryKeys.filter((key) => newKeys.has(key) && oldTable.rowFingerprints[key] !== next.rowFingerprints[key]);
      if (changed.length) failures.push({ table: name, kind: 'protected_rows_changed', count: changed.length });
    }
    if (next.count !== oldTable.count || added.length || missing.length) changes.push({ table: name, before: oldTable.count, after: next.count, addedPrimaryKeys: added.length, missingPrimaryKeys: missing.length });
  }
  const addedTables = Object.keys(after.tables).filter((name) => !before.tables[name]);
  return { ok: failures.length === 0, isolatedRestore, sameDatabase: before.databaseIdentitySha256 === after.databaseIdentitySha256, comparedTables: Object.keys(before.tables).length, addedTables, changes, failures, afterAuthSchema: after.authSchema, afterControls: after.controls };
}

async function main() {
  const [mode, first, second] = process.argv.slice(2);
  if (mode === 'dump') return dump();
  if (mode === 'snapshot') { process.stdout.write(JSON.stringify(await snapshot()) + '\n'); return; }
  if (mode === 'summary') { process.stdout.write(JSON.stringify(summary(readManifest(first)), null, 2) + '\n'); return; }
  if (mode === 'verify-schema') {
    const result = await verifySchema();
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (mode === 'verify' || mode === 'verify-restore') {
    const result = verify(readManifest(first), readManifest(second), mode === 'verify-restore');
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    if (!result.ok) process.exitCode = 1;
    return;
  }
  fail('Usage: database-proof.cjs dump | snapshot | summary FILE | verify BEFORE AFTER | verify-restore BEFORE RESTORED | verify-schema');
}

main().catch((error) => {
  // Never serialize a Prisma/child error: it can contain connection credentials,
  // protected row values, SQL fragments or private filesystem paths.
  process.stderr.write('Database proof failed. ' + (error instanceof ProofError ? error.message + ' ' : '') + 'No success evidence was produced; keep output private and do not proceed with this release.\n');
  process.exitCode = 1;
});
