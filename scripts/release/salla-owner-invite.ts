import {constants, createCipheriv, createPublicKey, publicEncrypt, randomBytes, type KeyObject} from 'node:crypto';
import type {PrismaClient} from '@prisma/client';
import {commerceConfigFromRows, type SettingRow} from '../../src/lib/commerce/config';
import {supplierConfig} from '../../src/lib/suppliers/config';
import {issueMerchantInvitation} from '../../src/lib/suppliers/merchant-oauth';

const TARGET_SUPPLIER = 2n;
const TARGET_NAME = 'شعبيات الأولين';
const AAD = Buffer.from('trbhh:salla-owner-invitation:v1');
const SAFE_FAILURES = new Set([
  'owner_invitation_unsafe_environment', 'owner_invitation_purchase_gate', 'owner_invitation_automatic_orders',
  'owner_invitation_target_mismatch', 'owner_invitation_target_profile', 'owner_invitation_target_connected',
  'owner_invitation_issuer_ambiguous', 'owner_invitation_issuer_unauthorized',
  'supplier_origin_config', 'supplier_oauth_config', 'supplier_connection_unavailable',
  'supplier_merchant_already_connected', 'supplier_oauth_generation', 'supplier_merchant_invitation_invalid',
]);
type Db = Pick<PrismaClient, '$queryRaw' | '$transaction'>;
type Environment = Record<string, string | undefined>;

export function reportPublicKey(env: Environment): KeyObject {
  try {
    const raw = env.SALLA_AUDIT_REPORT_PUBLIC_KEY_B64;
    if (typeof raw !== 'string' || raw.length > 12000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) throw Error();
    const key = createPublicKey(Buffer.from(raw, 'base64'));
    if (key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength || 0) < 2048) throw Error();
    return key;
  } catch { throw Error('report_encryption_key_invalid'); }
}

export function encryptReport(report: unknown, key: KeyObject) {
  const dataKey = randomBytes(32), iv = randomBytes(12);
  try {
    const cipher = createCipheriv('aes-256-gcm', dataKey, iv);
    cipher.setAAD(AAD);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(report), 'utf8'), cipher.final()]);
    return {
      kind: 'salla_owner_invitation_encrypted', version: 1, algorithm: 'RSA-OAEP-SHA256+A256GCM',
      wrappedKey: publicEncrypt({key, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256'}, dataKey).toString('base64'),
      iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), aad: AAD.toString('base64'), ciphertext: ciphertext.toString('base64'),
    };
  } finally { dataKey.fill(0); }
}

/** Fixed, approved target only. No provider requests, schema synchronization or publication. */
export async function runOwnerInvitation(db: Db, env: Environment = process.env) {
  const config = supplierConfig(env);
  if (config.origin !== 'https://trbhh.sa' || config.liveOrders || env.SUPPLIER_ALLOW_LIVE_ORDERS !== 'false') throw Error('owner_invitation_unsafe_environment');
  const rows = await db.$queryRaw<SettingRow[]>`SELECT k,v FROM site_settings WHERE k IN ('commerce_enabled','commerce_purchasing_enabled','commerce_payments_enabled')`;
  const commerce = commerceConfigFromRows(rows);
  if (commerce.enabled || commerce.purchasingEnabled || commerce.paymentsEnabled) throw Error('owner_invitation_purchase_gate');
  const [automaticOrders] = await db.$queryRaw<{id: bigint}[]>`SELECT supplier_id AS id FROM supplier_integration_profiles WHERE auto_orders_enabled<>0 LIMIT 1`;
  if (automaticOrders) throw Error('owner_invitation_automatic_orders');
  const [supplier] = await db.$queryRaw<{id: bigint; name: string; active: number}[]>`SELECT id,name,active FROM commerce_suppliers WHERE id=${TARGET_SUPPLIER}`;
  if (!supplier || supplier.id !== TARGET_SUPPLIER || supplier.name !== TARGET_NAME || supplier.active !== 1) throw Error('owner_invitation_target_mismatch');
  const [profile] = await db.$queryRaw<{provider: string; mode: string; maintenance: number; sync_enabled: number; auto_orders_enabled: number}[]>`SELECT provider,mode,maintenance,sync_enabled,auto_orders_enabled FROM supplier_integration_profiles WHERE supplier_id=${TARGET_SUPPLIER}`;
  if (profile && (profile.provider !== 'salla' || profile.mode !== 'development' || profile.maintenance !== 0 || profile.sync_enabled !== 0 || profile.auto_orders_enabled !== 0)) throw Error('owner_invitation_target_profile');
  const [connection] = await db.$queryRaw<{id: bigint}[]>`SELECT id FROM supplier_connections WHERE supplier_id=${TARGET_SUPPLIER} LIMIT 1`;
  if (connection) throw Error('owner_invitation_target_connected');

  // Only the unique real issuer of a prior consumed Salla flow may issue this operation.
  // A full administrator is a strict subset of hasAction(...,'suppliers','edit').
  // Calling hasAction here would invoke ensureSchema and possibly role seeds; this
  // deliberately narrower read-only check cannot grant permissions to staff or visitors.
  const issuers = await db.$queryRaw<{admin_id: bigint}[]>`SELECT DISTINCT o.admin_id FROM supplier_oauth_states o JOIN supplier_connections c ON c.supplier_id=o.supplier_id AND c.provider='salla' WHERE o.consumed_at IS NOT NULL LIMIT 2`;
  if (issuers.length !== 1 || !/^[1-9]\d{0,14}$/.test(String(issuers[0].admin_id))) throw Error('owner_invitation_issuer_ambiguous');
  const adminId = issuers[0].admin_id;
  const [admin] = await db.$queryRaw<{id: bigint; is_admin: number}[]>`SELECT id,is_admin FROM users WHERE id=${adminId}`;
  if (!admin || admin.id !== adminId || admin.is_admin !== 1) throw Error('owner_invitation_issuer_unauthorized');
  const result = await issueMerchantInvitation(db, TARGET_SUPPLIER, adminId, config);
  return {
    version: 1, issuedAt: new Date().toISOString(), supplierId: String(TARGET_SUPPLIER), targetStore: TARGET_NAME,
    issuerAdminId: String(adminId), url: result.url, expiresAt: result.expiresAt.toISOString(),
    purchasingEnabled: false, paymentsEnabled: false, liveOrdersEnabled: false, productsPublished: false,
  };
}

type MainDependencies = {db?: PrismaClient; output?: (value: string) => void; error?: (value: string) => void};
export async function main(env: Environment = process.env, dependencies: MainDependencies = {}): Promise<number> {
  const output = dependencies.output || ((value: string) => process.stdout.write(value));
  const error = dependencies.error || ((value: string) => process.stderr.write(value));
  let key: KeyObject;
  try { key = reportPublicKey(env); }
  catch { error('Salla owner invitation refused: encrypted report key required.\n'); return 1; }
  let db: PrismaClient | undefined, report: unknown, code = 0;
  try {
    // Resolve only inside the live application container; never emit Prisma error logs.
    const Prisma = dependencies.db ? null : require('@prisma/client');
    db = dependencies.db || new Prisma.PrismaClient({log: []});
    report = await runOwnerInvitation(db!, env);
  } catch (failure) {
    const safeCode = failure instanceof Error && SAFE_FAILURES.has(failure.message) ? failure.message : 'owner_invitation_failed';
    report = {version: 1, errors: [safeCode], purchaseAttempted: false, productsPublished: false};
    code = 1;
  } finally {
    if (db) try { await db.$disconnect(); } catch { /* Never log SQL or credentials. */ }
  }
  try { output(`${JSON.stringify(encryptReport(report, key))}\n`); }
  catch { error('Salla owner invitation report encryption failed.\n'); code = 1; }
  return code;
}
