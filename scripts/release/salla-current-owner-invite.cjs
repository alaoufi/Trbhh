'use strict';

const {
  constants,
  createCipheriv,
  createHmac,
  createPublicKey,
  publicEncrypt,
  randomBytes,
} = require('node:crypto');

const TARGET_SUPPLIER_ID = 1n;
const TARGET_NAME = 'شعبيات الأولين';
const TARGET_STORE_URL = 'https://shabiat24.com';
const REPORT_AAD = Buffer.from('trbhh:salla-current-owner-invitation:v1');
const INVITATION_LIFETIME_MS = 24 * 60 * 60 * 1000;

function assertEnvironment(env) {
  if (env.SUPPLIER_PUBLIC_ORIGIN !== 'https://trbhh.sa'
    || env.SUPPLIER_ALLOW_LIVE_ORDERS !== 'false'
    || !/^[a-fA-F0-9]{64}$/.test(env.SUPPLIER_TOKEN_ENCRYPTION_KEY || '')) {
    throw new Error('owner_invitation_unsafe_environment');
  }
}

function enabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function signInvitation(payload, env) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const key = createHmac('sha256', Buffer.from(env.SUPPLIER_TOKEN_ENCRYPTION_KEY, 'hex'))
    .update('trbhh:salla:merchant-invitation:v1').digest();
  const signature = createHmac('sha256', key).update(body).digest('hex');
  return `v1.${body}.${signature}`;
}

function buildInvitation(input, env, now = new Date()) {
  assertEnvironment(env);
  const expiresAt = new Date(now.getTime() + INVITATION_LIFETIME_MS);
  const payload = {...input, expiresAt: expiresAt.getTime()};
  const token = signInvitation(payload, env);
  return {
    issuedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    url: `${env.SUPPLIER_PUBLIC_ORIGIN}/api/integrations/salla/authorize?invite=${encodeURIComponent(token)}`,
  };
}

function rsaPublicKey(value) {
  try {
    if (typeof value !== 'string' || value.length > 12000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error();
    const key = createPublicKey(Buffer.from(value, 'base64'));
    if (key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength || 0) < 2048) throw new Error();
    return key;
  } catch {
    throw new Error('report_encryption_key_invalid');
  }
}

function encryptOwnerReport(report, key) {
  const dataKey = randomBytes(32);
  const iv = randomBytes(12);
  try {
    const cipher = createCipheriv('aes-256-gcm', dataKey, iv);
    cipher.setAAD(REPORT_AAD);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(report), 'utf8'), cipher.final()]);
    return {
      kind: 'salla_current_owner_invitation_encrypted', version: 1,
      algorithm: 'RSA-OAEP-SHA256+A256GCM',
      wrappedKey: publicEncrypt({key, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256'}, dataKey).toString('base64'),
      iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'),
      aad: REPORT_AAD.toString('base64'), ciphertext: ciphertext.toString('base64'),
    };
  } finally {
    dataKey.fill(0);
  }
}

async function issueCurrentOwnerInvitation(db, env = process.env, now = new Date()) {
  assertEnvironment(env);
  return db.$transaction(async tx => {
    const flags = await tx.$queryRaw`SELECT k,v FROM site_settings WHERE k IN ('commerce_enabled','commerce_purchasing_enabled','commerce_payments_enabled')`;
    if (flags.some(row => enabled(row.v))) throw new Error('owner_invitation_purchase_gate');
    const [automatic] = await tx.$queryRaw`SELECT supplier_id AS id FROM supplier_integration_profiles WHERE auto_orders_enabled<>0 LIMIT 1`;
    if (automatic) throw new Error('owner_invitation_automatic_orders');
    const [supplier] = await tx.$queryRaw`SELECT s.id,s.name,s.active,o.store_url FROM commerce_suppliers s JOIN supplier_onboarding o ON o.supplier_id=s.id WHERE s.id=${TARGET_SUPPLIER_ID} FOR UPDATE`;
    if (!supplier || supplier.id !== TARGET_SUPPLIER_ID || supplier.name !== TARGET_NAME || supplier.active !== 1 || supplier.store_url !== TARGET_STORE_URL) {
      throw new Error('owner_invitation_target_mismatch');
    }
    const [profile] = await tx.$queryRaw`SELECT provider,mode,maintenance,sync_enabled,auto_orders_enabled,oauth_generation FROM supplier_integration_profiles WHERE supplier_id=${TARGET_SUPPLIER_ID} FOR UPDATE`;
    if (!profile || profile.provider !== 'salla' || profile.mode !== 'development' || profile.maintenance !== 0
      || profile.sync_enabled !== 0 || profile.auto_orders_enabled !== 0
      || !Number.isSafeInteger(profile.oauth_generation) || profile.oauth_generation < 0 || profile.oauth_generation >= 2147483645) {
      throw new Error('owner_invitation_target_profile');
    }
    const [connections] = await tx.$queryRaw`SELECT COUNT(*) AS count FROM supplier_connections WHERE supplier_id=${TARGET_SUPPLIER_ID}`;
    if (!connections || BigInt(connections.count) !== 0n) throw new Error('owner_invitation_target_connected');
    const [products] = await tx.$queryRaw`SELECT COUNT(*) AS count FROM supplier_products WHERE supplier_id=${TARGET_SUPPLIER_ID}`;
    const [catalog] = await tx.$queryRaw`SELECT COUNT(*) AS count FROM commerce_product_suppliers WHERE supplier_id=${TARGET_SUPPLIER_ID}`;
    if (!products || !catalog || BigInt(products.count) !== 0n || BigInt(catalog.count) !== 0n) throw new Error('owner_invitation_target_catalog');
    const issuers = await tx.$queryRaw`SELECT DISTINCT admin_id FROM supplier_oauth_states WHERE consumed_at IS NOT NULL LIMIT 2`;
    if (issuers.length !== 1 || !/^[1-9]\d{0,14}$/.test(String(issuers[0].admin_id))) throw new Error('owner_invitation_issuer_ambiguous');
    const adminId = issuers[0].admin_id;
    const [admin] = await tx.$queryRaw`SELECT id,is_admin FROM users WHERE id=${adminId}`;
    if (!admin || admin.id !== adminId || admin.is_admin !== 1) throw new Error('owner_invitation_issuer_unauthorized');
    const changed = await tx.$executeRaw`UPDATE supplier_integration_profiles SET oauth_generation=oauth_generation+1 WHERE supplier_id=${TARGET_SUPPLIER_ID} AND oauth_generation=${profile.oauth_generation}`;
    if (changed !== 1) throw new Error('owner_invitation_generation_conflict');
    const invitation = buildInvitation({
      supplierId: String(TARGET_SUPPLIER_ID), adminId: String(adminId), expectedName: TARGET_NAME,
      generation: profile.oauth_generation + 1,
    }, env, now);
    return {
      version: 1, ...invitation, supplierId: String(TARGET_SUPPLIER_ID), issuerAdminId: String(adminId),
      targetStore: TARGET_NAME, storeUrl: TARGET_STORE_URL,
      purchasingEnabled: false, paymentsEnabled: false, liveOrdersEnabled: false, productsPublished: false,
    };
  });
}

async function main(env = process.env, dependencies = {}) {
  const output = dependencies.output || (value => process.stdout.write(value));
  const error = dependencies.error || (value => process.stderr.write(value));
  let publicKey;
  try {
    publicKey = rsaPublicKey(env.SALLA_AUDIT_REPORT_PUBLIC_KEY_B64);
  } catch {
    error('Salla current owner invitation refused: encrypted report key required.\n');
    return 1;
  }
  let db = dependencies.db;
  let created = false;
  try {
    if (!db) {
      const {PrismaClient} = require('@prisma/client');
      db = new PrismaClient({log: []});
      created = true;
    }
    const report = await issueCurrentOwnerInvitation(db, env);
    output(`${JSON.stringify(encryptOwnerReport(report, publicKey))}\n`);
    return 0;
  } catch (failure) {
    const safe = failure instanceof Error && /^owner_invitation_[a-z_]+$/.test(failure.message)
      ? failure.message : 'owner_invitation_failed';
    output(`${JSON.stringify(encryptOwnerReport({version: 1, errors: [safe], productsPublished: false}, publicKey))}\n`);
    return 1;
  } finally {
    if (created) try { await db.$disconnect(); } catch {}
  }
}

module.exports = {buildInvitation, encryptOwnerReport, issueCurrentOwnerInvitation, main, rsaPublicKey};

if (require.main === module) {
  main().then(code => { process.exitCode = code; }).catch(() => { process.exitCode = 1; });
}
