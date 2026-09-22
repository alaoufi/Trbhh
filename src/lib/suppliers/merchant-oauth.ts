import 'server-only';
import {createHmac, timingSafeEqual} from 'node:crypto';
import type {CommerceDb} from '@/lib/commerce/types';
import {assertOAuthConfig, type SupplierConfig} from './config';
import {digest} from './crypto';
import {boundedJson} from './http';

const INVITATION_LIFETIME_MS = 24 * 60 * 60 * 1000;
const CONTEXT_LIFETIME_MS = 10 * 60 * 1000;
type Purpose = 'invitation' | 'context';
export type MerchantInvitation = {
  supplierId: string;
  adminId: string;
  expectedName: string;
  generation: number;
  expiresAt: number;
};
export type MerchantContext = MerchantInvitation & {stateHash: string};

function signature(body: string, purpose: Purpose, config: SupplierConfig): Buffer {
  assertOAuthConfig(config);
  const key = createHmac('sha256', Buffer.from(config.encryptionKey, 'hex'))
    .update(`trbhh:salla:merchant-${purpose}:v1`).digest();
  return createHmac('sha256', key).update(body).digest();
}

function sign(value: MerchantInvitation | MerchantContext, purpose: Purpose, config: SupplierConfig): string {
  const body = Buffer.from(JSON.stringify(value)).toString('base64url');
  return `v1.${body}.${signature(body, purpose, config).toString('hex')}`;
}

function parse(token: string, purpose: Purpose, config: SupplierConfig): MerchantInvitation | MerchantContext {
  try {
    if (typeof token !== 'string' || token.length > 4096) throw new Error();
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== 'v1' || !/^[A-Za-z0-9_-]+$/.test(parts[1]) || !/^[a-f0-9]{64}$/.test(parts[2])) throw new Error();
    if (!timingSafeEqual(signature(parts[1], purpose, config), Buffer.from(parts[2], 'hex'))) throw new Error();
    const value = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const lifetime = purpose === 'invitation' ? INVITATION_LIFETIME_MS : CONTEXT_LIFETIME_MS;
    if (!value || typeof value !== 'object' || !/^[1-9]\d{0,14}$/.test(value.supplierId) || !/^[1-9]\d{0,14}$/.test(value.adminId)
      || typeof value.supplierId !== 'string' || typeof value.adminId !== 'string'
      || typeof value.expectedName !== 'string' || !value.expectedName.trim() || value.expectedName.length > 255 || /[\u0000-\u001f]/.test(value.expectedName)
      || !Number.isSafeInteger(value.generation) || value.generation < 1 || value.generation > 2147483646
      || !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= Date.now() || value.expiresAt > Date.now() + lifetime
      || (purpose === 'context' && (typeof value.stateHash !== 'string' || !/^[a-f0-9]{64}$/.test(value.stateHash)))) throw new Error();
    return value;
  } catch {
    throw new Error('supplier_merchant_invitation_invalid');
  }
}

export function parseMerchantInvitation(token: string, config: SupplierConfig): MerchantInvitation {
  return parse(token, 'invitation', config);
}

export function parseMerchantContext(token: string, state: string, config: SupplierConfig): MerchantContext {
  const value = parse(token, 'context', config) as MerchantContext;
  if (!/^[a-f0-9]{64}$/.test(state) || value.stateHash !== digest(state)) throw new Error('supplier_merchant_context_invalid');
  return value;
}

/** Issuance invalidates earlier invitations without touching any existing connection. */
export async function issueMerchantInvitation(db: CommerceDb, supplierId: bigint, adminId: bigint, config: SupplierConfig) {
  assertOAuthConfig(config);
  if (!/^[1-9]\d{0,14}$/.test(String(supplierId)) || !/^[1-9]\d{0,14}$/.test(String(adminId))) throw new Error('supplier_merchant_invitation_invalid');
  const expiresAt = new Date(Date.now() + INVITATION_LIFETIME_MS);
  const invitation = await db.$transaction(async tx => {
    const [supplier] = await tx.$queryRaw<{name: string; active: number}[]>`SELECT name,active FROM commerce_suppliers WHERE id=${supplierId} FOR UPDATE`;
    if (!supplier || supplier.active !== 1 || !supplier.name.trim() || supplier.name.length > 255 || /[\u0000-\u001f]/.test(supplier.name)) throw new Error('supplier_connection_unavailable');
    const [storedProfile] = await tx.$queryRaw<{provider: string; maintenance: number; oauth_generation: number}[]>`SELECT provider,maintenance,oauth_generation FROM supplier_integration_profiles WHERE supplier_id=${supplierId} FOR UPDATE`;
    if (storedProfile && (storedProfile.provider !== 'salla' || storedProfile.maintenance !== 0)) throw new Error('supplier_connection_unavailable');
    const connections = await tx.$queryRaw<{id: bigint; oauth_scope_version:number}[]>`SELECT id,oauth_scope_version FROM supplier_connections WHERE supplier_id=${supplierId} ORDER BY id LIMIT 2 FOR UPDATE`;
    if (connections.length > 1) throw new Error('supplier_merchant_already_connected');
    if (!storedProfile) await tx.$executeRaw`INSERT INTO supplier_integration_profiles(supplier_id,provider,maintenance,sync_enabled,auto_orders_enabled,mode,oauth_generation) VALUES(${supplierId},'salla',0,0,0,'development',0)`;
    const profile = storedProfile || {provider: 'salla', maintenance: 0, oauth_generation: 0};
    if (!Number.isSafeInteger(profile.oauth_generation) || profile.oauth_generation < 0 || profile.oauth_generation >= 2147483645) throw new Error('supplier_oauth_generation');
    await tx.$executeRaw`UPDATE supplier_integration_profiles SET oauth_generation=oauth_generation+1,oauth_invite_expires_at=${expiresAt},oauth_last_error='' WHERE supplier_id=${supplierId}`;
    return {supplierId: String(supplierId), adminId: String(adminId), expectedName: supplier.name, generation: profile.oauth_generation + 1, expiresAt: expiresAt.getTime()};
  });
  const token = sign(invitation, 'invitation', config);
  return {invitation: token, url: `${config.origin}/api/integrations/salla/authorize?invite=${encodeURIComponent(token)}`, expiresAt: new Date(invitation.expiresAt)};
}

/** Call only after the owner submits the same-origin confirmation form; GET never consumes an invitation. */
export async function startMerchantOAuth(db: CommerceDb, token: string, config: SupplierConfig) {
  const invitation = parseMerchantInvitation(token, config);
  const {beginOAuth} = await import('./connections');
  const result = await beginOAuth(db, BigInt(invitation.supplierId), BigInt(invitation.adminId), config, {expectedGeneration: invitation.generation});
  const state = new URL(result.url).searchParams.get('state') || '';
  if (!/^[a-f0-9]{64}$/.test(state)) throw new Error('supplier_oauth_state');
  const context: MerchantContext = {...invitation, expiresAt: Date.now() + CONTEXT_LIFETIME_MS, stateHash: digest(state)};
  return {...result, context: sign(context, 'context', config)};
}

function normalizedName(value: string): string {
  return value.normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/\s+/g, ' ').trim();
}

/** Provider-authenticated merchant ID is authoritative. The intended name and non-demo host are additional safeguards. */
export async function verifyInvitedMerchant(accessToken: string, merchantId: string, expectedName: string, fetcher: typeof fetch = fetch): Promise<void> {
  try {
    const response = await fetcher('https://api.salla.dev/admin/v2/store/info', {method: 'GET', headers: {Authorization: `Bearer ${accessToken}`, Accept: 'application/json'}, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000)});
    const body = await boundedJson(response) as {success?: boolean; data?: {id?: unknown; name?: unknown; domain?: unknown; type?: unknown}};
    const store = body?.data;
    if (body.success !== true || !store || !(typeof store.id === 'string' || Number.isSafeInteger(store.id)) || String(store.id) !== merchantId
      || typeof store.name !== 'string' || normalizedName(store.name) !== normalizedName(expectedName) || typeof store.domain !== 'string') throw new Error();
    if (typeof store.type === 'string' && ['demo', 'development'].includes(store.type.trim().toLowerCase())) throw new Error();
    const url = new URL(store.domain);
    if (url.protocol !== 'https:' || url.username || url.password || url.hostname.toLowerCase() === 'demostore.salla.sa' || url.hostname.toLowerCase().endsWith('.demostore.salla.sa')) throw new Error();
  } catch {
    throw new Error('supplier_merchant_identity_mismatch');
  }
}
