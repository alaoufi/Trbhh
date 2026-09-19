import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { SignJWT } from 'jose';
import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@prisma/client';

const BASELINE = '27b804d13ba884fb7cd3704356eb38c5faa29ab4';
const DATABASE = process.env.UPGRADE_SALLA_FIXTURE==='1' ? 'trbhh_upgrade_salla_test' : 'trbhh_upgrade_test';
// Explicit release allowlist, checked against commerce/schema.ts, ad-categories/schema.ts
// and Prisma. Do not derive this from the observed database: extra/missing columns must fail.
const ADDITIVE_TABLE_COLUMNS: Record<string, string[]> = {
  supplier_integration_profiles: ['supplier_id','provider','oauth_generation','maintenance','sync_enabled','auto_orders_enabled','mode','last_sync_at','last_error'],
  supplier_connections: ['id','supplier_id','provider','external_store_id','status','encrypted_tokens','expires_at','refresh_claim','refresh_claimed_at','sync_claim','sync_claimed_at','version','created_at','updated_at'],
  supplier_oauth_states: ['state_hash','browser_hash','oauth_generation','admin_id','supplier_id','expires_at','consumed_at'],
  supplier_products: ['id','connection_id','supplier_id','external_id','sku','name','description','images','variants','options','categories','brand','public_price_minor','currency','quantity','available','source_updated_at','last_sync_at','sync_error','active','visible','featured','unit_cost_minor','selling_price_minor','pricing_policy','discount_minor','discount_bps','minimum_price_minor','minimum_margin_minor','commerce_product_id','revision'],
  supplier_price_history: ['id','supplier_product_id','actor_id','kind','old_public_minor','new_public_minor','old_cost_minor','new_cost_minor','old_selling_minor','new_selling_minor','created_at'],
  supplier_price_tiers: ['id','supplier_product_id','min_quantity','unit_cost_minor','active','created_at'],
  supplier_stock_reservations: ['submission_key','id','supplier_product_id','kind','quantity','remaining_quantity','held_quantity','unit_cost_minor','active','priority','created_at'],
  supplier_reservation_allocations: ['id','reservation_id','order_id','commerce_product_id','quantity','status'],
  supplier_orders: ['id','order_id','connection_id','supplier_id','external_order_id','idempotency_key','status','selling_minor','payable_minor','profit_minor','shipping_minor','currency','payment_status','request_snapshot','claim_token','attempts','last_error','created_at','updated_at'],
  supplier_shipments: ['id','supplier_order_id','external_id','carrier','tracking_number','status','fulfillment_status','source_updated_at','created_at','updated_at'],
  supplier_webhook_events: ['id','connection_id','event_key','event_type','resource_id','payload','status','attempts','next_attempt_at','claim_token','claimed_at','last_error','created_at','processed_at'],
  ad_category_definitions: ['subcategory_id', 'version', 'kind', 'price_enabled', 'goods_enabled', 'fields_json'],
  ad_category_values: ['ad_id', 'subcategory_id', 'definition_version', 'values_json'],
  ad_category_audit: ['id', 'actor_id', 'action', 'payload', 'created_at'],
  commerce_products: ['id', 'ad_id', 'title', 'price_minor', 'currency', 'stock_available', 'stock_reserved', 'approved', 'visible', 'enabled', 'created_at', 'updated_at'],
  commerce_orders: ['id', 'member_id', 'request_key', 'request_fingerprint', 'status', 'currency', 'subtotal_minor', 'shipping_fee_minor', 'total_minor', 'shipping', 'fulfillment_status', 'created_at', 'paid_at'],
  commerce_order_items: ['id', 'order_id', 'product_id', 'title', 'quantity', 'unit_price_minor', 'total_minor'],
  commerce_payment_attempts: ['id', 'order_id', 'provider', 'provider_ref', 'redirect_url', 'merchant_order_id', 'claim_token', 'amount_minor', 'currency', 'status', 'created_at', 'paid_at'],
  commerce_notifications: ['id', 'order_id', 'event', 'channel', 'recipient', 'payload', 'status', 'claim_token', 'last_error', 'created_at', 'claimed_at', 'sent_at'],
  commerce_audit_events: ['id', 'order_id', 'event', 'payload', 'created_at'],
  commerce_suppliers: ['id', 'name', 'contact_name', 'phone', 'email', 'address', 'registration_number', 'tax_number', 'settlement_terms', 'notes', 'api_base_url', 'api_credential_ref', 'active', 'api_enabled', 'created_at', 'updated_at'],
  commerce_product_suppliers: ['product_id', 'supplier_id', 'supplier_sku', 'unit_cost_minor', 'currency'],
  commerce_order_suppliers: ['order_id', 'product_id', 'supplier_id', 'supplier_name', 'supplier_sku', 'quantity', 'unit_cost_minor', 'total_cost_minor'],
  commerce_receipts: ['id', 'order_id', 'provider', 'provider_ref', 'amount_minor', 'currency', 'recorded_at'],
  commerce_supplier_accruals: ['id', 'order_id', 'product_id', 'supplier_id', 'amount_minor', 'currency', 'status', 'created_at'],
};
const request = vi.hoisted(() => ({ token: '' }));
// Only the HTTP cookie boundary is mocked. Schema, data, JWT and bcrypt are real.
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: request.token }) }) }));

type Column = { table_name: string; column_name: string; column_type: string; is_nullable: string; column_default: string | null; extra: string };
type Value = string | number | bigint | Date | null;
type Fixture = { table: string; keys: Record<string, Value> };
const quote = (name: string) => {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) throw new Error('Unexpected SQL identifier');
  return '`' + name + '`';
};
const stable = (value: unknown) => JSON.stringify(value, (_key, v) => typeof v === 'bigint' ? v.toString() : v);

describe.skipIf(process.env.UPGRADE_DB_TESTS !== '1')('baseline to candidate upgrade preserves existing data', () => {
  let db: PrismaClient;
  let permitted = false;
  const fixtures: Fixture[] = [];
  let baselineColumns: Column[];
  let before: Record<string, string[]>;
  let initialHash: string;

  async function columns() {
    return db.$queryRawUnsafe<Column[]>(
      'SELECT TABLE_NAME AS table_name,COLUMN_NAME AS column_name,COLUMN_TYPE AS column_type,IS_NULLABLE AS is_nullable,COLUMN_DEFAULT AS column_default,EXTRA AS extra FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,ORDINAL_POSITION');
  }
  async function snapshot(schema: Column[]): Promise<Record<string, string[]>> {
    const result: Record<string, string[]> = {};
    for (const table of [...new Set(schema.map((c) => c.table_name))]) {
      const fields = schema.filter((c) => c.table_name === table).map((c) => quote(c.column_name));
      const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT ${fields.join(',')} FROM ${quote(table)}`);
      result[table] = rows.map((row) => stable(row)).sort();
    }
    return result;
  }
  async function insert(table: string, row: Record<string, Value>, keys = ['id']) {
    const fields = Object.keys(row);
    await db.$executeRawUnsafe(`INSERT INTO ${quote(table)} (${fields.map(quote).join(',')}) VALUES (${fields.map(() => '?').join(',')})`, ...Object.values(row));
    fixtures.push({ table, keys: Object.fromEntries(keys.map((key) => [key, row[key]])) });
  }
  async function bootCandidate() {
    // The production helper promise is cached. A fresh module proves a second boot.
    vi.resetModules();
    const { ensureSchema } = await import('@/data/schema-sync');
    await ensureSchema();
  }
  async function assertLegacyData() {
    const now = await columns();
    for (const old of baselineColumns) {
      expect(now.find((c) => c.table_name === old.table_name && c.column_name === old.column_name), `old column ${old.table_name}.${old.column_name}`).toEqual(old);
    }
    expect(await snapshot(baselineColumns)).toEqual(before);
  }
  async function assertLegacyAuthentication() {
    const { verifyPassword, getSession } = await import('@/lib/auth');
    const { getAuthSecuritySettings } = await import('@/lib/settings');
    const member = await db.users.findUniqueOrThrow({ where: { id: 701n } });
    expect(member.password).toBe(initialHash);
    expect(await verifyPassword('1234', member.password)).toBe(true);
    expect(await getSession()).toMatchObject({ uid: 701, name: 'عضو اختبار الترقية', authVersion: '0' });
    expect(await getAuthSecuritySettings()).toEqual({ requireAdminMfa: false, passwordMinimum: 12 });
    expect(await db.site_settings.findUnique({ where: { k: 'auth_require_admin_mfa' } })).toBeNull();
  }

  beforeAll(async () => {
    const raw = process.env.UPGRADE_TEST_DATABASE_URL || '';
    const url = new URL(raw);
    if (url.protocol !== 'mysql:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.pathname !== '/' + DATABASE || url.search || process.env.DATABASE_URL !== raw) {
      throw new Error('Refusing anything other than the explicit isolated loopback upgrade database');
    }
    if ((process.env.AUTH_SECRET || '').length < 32) throw new Error('Provide a synthetic AUTH_SECRET of at least 32 characters');
    // The workflow materializes these exact historical files, never hand-written DDL.
    const baselinePath = resolve('.release-upgrade/schema-sync-baseline.ts');
    for (const [file, generated] of [['src/data/schema-sync.ts', baselinePath], ['prisma/schema.prisma', resolve('.release-upgrade/baseline.prisma')]]) {
      const expected = execFileSync('git', ['show', `${BASELINE}:${file}`], { encoding: 'utf8' }).replace(/\r\n/g, '\n');
      expect(readFileSync(generated, 'utf8').replace(/\r\n/g, '\n')).toBe(expected);
    }
    ({ prisma: db } = await import('@/lib/prisma'));
    const actual = await db.$queryRawUnsafe<{ name: string }[]>('SELECT DATABASE() AS name');
    if (actual[0]?.name !== DATABASE) throw new Error('Connected database does not match the upgrade test');
    const initialColumns = await columns();
    expect(initialColumns.some((c) => c.table_name === 'users' && c.column_name === 'password')).toBe(true);
    expect(initialColumns.some((c) => c.column_name === 'auth_session_version' || ['auth_mfa', 'auth_security_limits'].includes(c.table_name))).toBe(false);
    for (const table of [...new Set(initialColumns.map((c) => c.table_name))]) {
      const rows = await db.$queryRawUnsafe<{ total: bigint }[]>(`SELECT COUNT(*) AS total FROM ${quote(table)}`);
      if (Number(rows[0].total) !== 0) throw new Error('Upgrade test requires a completely empty disposable baseline database');
    }
    permitted = true;
    const created = new Date('2026-01-02T03:04:05Z');
    initialHash = (await bcrypt.hash('1234', 4)).replace(/^\$2[ab]\$/, '$2y$');
    await insert('countries', { id: 701, name: 'دولة صناعية', key: '000', send_sms: 0 });
    await insert('cities', { id: 701, name: 'منطقة صناعية', country_id: 701 });
    for (const id of [701, 702]) await insert('users', { id, userName: `upgrade-${id}`, name: id === 701 ? 'عضو اختبار الترقية' : 'إداري اختبار الترقية', password: initialHash, type: 'user', is_admin: id === 702 ? 1 : 0, email: `upgrade-${id}@example.test`, city_id: 701, balance: 123, reserved: 12, balance_halala: 12345, reserved_halala: 1200, two_factor_secret: 'inert-legacy-value', two_factor_recovery_codes: 'inert-legacy-recovery', created_at: created, updated_at: created });
    await insert('profiles', { id: 701, user_id: 701, type: 'personal', name: 'هوية محفوظة', is_default: 1, created_at: created });
    // Raw SQL needs the stored enum values; Prisma maps offer/active to عرض/1.
    await insert('ads', { id: 701, adsType: 'عرض', user_id: 701, city_id: 701, category_id: 0, title: 'إعلان صناعي محفوظ', detail: 'بيانات اختبار محلية فقط', video_path: '/synthetic/video.mp4', adsSpecial: 'no', state: '1', price: 123.45, profile_id: 701, created_at: created, updated_at: created });
    await insert('uploads', { id: 701, file_original_name: 'synthetic.png', file_name: 'uploads/synthetic.png', extension: 'png', type: 'image', file_size: 321, user_id: 701, phash: 'fedcba9876543210', created_at: created });
    await insert('photos', { id: 701, photo_path: '701', other_id: 701, created_at: created });
    await insert('stores', { id: 701, user_id: 701, logo: 701, store_name: 'متجر محفوظ', handle: 'upgrade-store', brand_color: '#123456', description: 'وصف محفوظ', sub_until: new Date('2030-01-01T00:00:00Z'), show_on_platform: 1, store_password: initialHash, created_at: created });
    await insert('store_products', { store_id: 701, ad_id: 701, created_at: created }, ['store_id', 'ad_id']);
    await insert('favorites', { id: 701, user_id: 702, ads_id: 701, profile_id: 701 });
    await insert('chat_messages', { id: 701, from_user: 701, to_user: 702, from_type: 'user', to_type: 'user', created_at: created });
    await insert('chats', { id: 701, sender_id: 701, reciver_id: 702, message: 'رسالة صناعية محفوظة، لا ترسل لأي شخص', chat_id: 701, created_at: created });
    await insert('site_settings', { k: 'upgrade_custom_setting', v: 'قيمة أصلية محفوظة' }, ['k']);
    await insert('site_settings', { k: 'sub_grace_days', v: '0' }, ['k']);
    await insert('admin_perms', { user_id: 702, perm: 'users:view' }, ['user_id', 'perm']);
    await insert('admin_roles', { user_id: 702, role: 'manager' }, ['user_id']);
    await insert('wallet_txns', { id: 701, user_id: 701, amount: 123, balance_after: 123, amount_halala: 12345, balance_after_halala: 12345, money_ref: 'synthetic-upgrade-only', reason: 'topup', created_at: created });
    await insert('wallet_topups', { id: 701, user_id: 701, amount: 123, amount_halala: 12345, receipt: 'uploads/synthetic-receipt.png', receipt_hash: 'a'.repeat(128), status: 1, source: 'transfer', provider_ref: 'synthetic-not-a-payment', paid_at: created, created_at: created });
    // Explicitly distinguish historical maintenance from the new upgrade.
    await insert('wallet_topups', { id: 702, user_id: 701, amount: 7, amount_halala: 700, receipt: 'uploads/synthetic-old.png', receipt_hash: 'abc123', status: 0, created_at: created });
    await insert('mod_log', { id: 701, user_id: 701, kind: 'duplicate', snippet: 'مكرّر مع #701', action: 'warned', created_at: created });
    await insert('mod_log', { id: 702, user_id: 701, kind: 'content', snippet: 'حظر إعلان نهائياً: مثال صناعي', action: 'banned', created_at: created });
    await insert('mod_log', { id: 703, user_id: 701, kind: 'account', snippet: 'account deleted at owner request', action: 'banned', created_at: created });
    const baseline = await import(baselinePath) as { ensureSchema(): Promise<void> };
    await baseline.ensureSchema();
    expect((await db.wallet_topups.findUniqueOrThrow({ where: { id: 702n } })).receipt_hash).toBeNull();
    expect((await db.mod_log.findUniqueOrThrow({ where: { id: 701 } })).ad_id).toBe(701n);
    expect((await db.mod_log.findUniqueOrThrow({ where: { id: 702 } })).action).toBe('ad_banned');
    expect((await db.mod_log.findUniqueOrThrow({ where: { id: 703 } })).action).toBe('account_deleted');
    baselineColumns = await columns();
    before = await snapshot(baselineColumns);
    request.token = await new SignJWT({ uid: 701, name: 'عضو اختبار الترقية', type: 'user' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  }, 90_000);

  afterAll(async () => {
    try {
      if (permitted) {
        const actual = await db.$queryRawUnsafe<{ name: string }[]>('SELECT DATABASE() AS name');
        if (actual[0]?.name !== DATABASE) throw new Error('Refusing cleanup outside the isolated upgrade database');
        // Delete only rows inserted here, never truncate/reset/drop a database.
        for (const { table, keys } of fixtures.reverse()) {
          await db.$executeRawUnsafe(`DELETE FROM ${quote(table)} WHERE ${Object.keys(keys).map((k) => quote(k) + ' = ?').join(' AND ')}`, ...Object.values(keys));
        }
      }
    } finally { if (db) await db.$disconnect(); }
  }, 30_000);

  it('preserves every old column and row through two real schema-sync boots', async () => {
    await bootCandidate();
    const added = (await columns()).filter((c) => !baselineColumns.some((old) => old.table_name === c.table_name && old.column_name === c.column_name));
    expect(added.map((c) => `${c.table_name}.${c.column_name}`).sort()).toEqual([
      'users.auth_session_version', 'auth_mfa.user_id', 'auth_mfa.secret', 'auth_mfa.recovery_hashes', 'auth_mfa.last_step', 'auth_mfa.version', 'auth_mfa.created_at', 'auth_security_limits.k', 'auth_security_limits.hits', 'auth_security_limits.expires_at',
      ...Object.entries(ADDITIVE_TABLE_COLUMNS).flatMap(([table, names]) => names.map((name) => `${table}.${name}`)),
    ].sort());
    expect(added.find((c) => c.table_name === 'users')).toMatchObject({ column_type: 'varchar(64)', is_nullable: 'NO', column_default: '0' });
    expect(added.find((c) => c.table_name === 'auth_mfa' && c.column_name === 'last_step')).toMatchObject({ column_type: 'bigint', is_nullable: 'NO', column_default: '-1' });
    const engines = await db.$queryRawUnsafe<{ name: string; engine: string }[]>("SELECT TABLE_NAME AS name,ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('auth_mfa','auth_security_limits') ORDER BY TABLE_NAME");
    expect(engines).toEqual([{ name: 'auth_mfa', engine: 'InnoDB' }, { name: 'auth_security_limits', engine: 'InnoDB' }]);
    const indexes = await db.$queryRawUnsafe<{ table_name: string; index_name: string; column_name: string; non_unique: number | bigint }[]>("SELECT TABLE_NAME AS table_name,INDEX_NAME AS index_name,COLUMN_NAME AS column_name,NON_UNIQUE AS non_unique FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('auth_mfa','auth_security_limits') ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX");
    expect(indexes.map((index) => ({ ...index, non_unique: Number(index.non_unique) }))).toEqual(expect.arrayContaining([
      { table_name: 'auth_mfa', index_name: 'PRIMARY', column_name: 'user_id', non_unique: 0 },
      { table_name: 'auth_security_limits', index_name: 'PRIMARY', column_name: 'k', non_unique: 0 },
      { table_name: 'auth_security_limits', index_name: 'auth_security_limits_expires_at_idx', column_name: 'expires_at', non_unique: 1 },
    ]));
    expect(await db.auth_mfa.count()).toBe(0);
    expect(await db.auth_security_limits.count()).toBe(0);
    expect((await db.users.findMany({ select: { auth_session_version: true } })).map((u) => u.auth_session_version)).toEqual(['0', '0']);
    await assertLegacyData();
    await assertLegacyAuthentication();

    await insert('auth_mfa', { user_id: 702, secret: 'synthetic-encrypted-field-preservation-only', recovery_hashes: '["synthetic-hash"]', last_step: 123456, version: 'existing-enrollment-version', created_at: new Date('2026-01-02T03:04:05Z') }, ['user_id']);
    await insert('auth_security_limits', { k: 'synthetic-upgrade-counter', hits: 7, expires_at: new Date('2030-01-01T00:00:00Z') }, ['k']);
    await db.users.update({ where: { id: 702n }, data: { auth_session_version: 'existing-password-version' } });
    const securityBefore = await snapshot(added.filter((c) => c.table_name !== 'users'));
    await bootCandidate();
    await assertLegacyData();
    expect(await snapshot(added.filter((c) => c.table_name !== 'users'))).toEqual(securityBefore);
    expect((await db.users.findUniqueOrThrow({ where: { id: 702n } })).auth_session_version).toBe('existing-password-version');
    await assertLegacyAuthentication();
  }, 90_000);
});
