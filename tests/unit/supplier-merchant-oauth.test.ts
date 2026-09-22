import {afterEach, describe, expect, it, vi} from 'vitest';
import type {CommerceDb} from '@/lib/commerce/types';
import {supplierConfig} from '@/lib/suppliers/config';
import {completeOAuth, consumeOAuthState} from '@/lib/suppliers/connections';
import {digest, openTokens} from '@/lib/suppliers/crypto';
import {SALLA_REQUIRED_SCOPES} from '@/lib/suppliers/salla-oauth';
import {issueMerchantInvitation, parseMerchantContext, parseMerchantInvitation, startMerchantOAuth, verifyInvitedMerchant} from '@/lib/suppliers/merchant-oauth';

const config = supplierConfig({SUPPLIER_PUBLIC_ORIGIN: 'https://trbhh.sa', SALLA_CLIENT_ID: 'test-client', SALLA_CLIENT_SECRET: 'test-secret', SUPPLIER_TOKEN_ENCRYPTION_KEY: 'ab'.repeat(32)});
const storeName = 'شعبيات الأولين';
const transactionDb = (tx: object) => ({$transaction: vi.fn(fn => fn(tx))} as unknown as CommerceDb);
function issuer(profile: object | undefined = {provider: 'salla', maintenance: 0, oauth_generation: 0}, existing: object | undefined = undefined) {
  const tx = {$queryRaw: vi.fn().mockResolvedValueOnce([{name: storeName, active: 1}]).mockResolvedValueOnce(profile ? [profile] : []).mockResolvedValueOnce(existing ? [existing] : []), $executeRaw: vi.fn().mockResolvedValue(1)};
  return {tx, db: transactionDb(tx)};
}
async function invitation() {
  return issueMerchantInvitation(issuer().db, 2n, 1n, config);
}
async function ownerAttempt() {
  const issued = await invitation();
  const tx = {$queryRaw: vi.fn().mockResolvedValueOnce([{provider: 'salla', maintenance: 0, active: 1, oauth_generation: 1}]).mockResolvedValueOnce([]), $executeRaw: vi.fn().mockResolvedValue(1)};
  const result = await startMerchantOAuth(transactionDb(tx), issued.invitation, config);
  return {...result, state: new URL(result.url).searchParams.get('state')!};
}
const storeResponse = (patch: Record<string, unknown> = {}) => new Response(JSON.stringify({success: true, data: {id: 44, name: storeName, domain: 'https://salla.sa/alawaleen', ...patch}}));
afterEach(() => vi.useRealTimers());

describe('owner-forwardable Salla invitations', () => {
  it('rejects issuer IDs that cannot be safely checked by the existing numeric role API', async () => {
    const db = {$transaction: vi.fn()} as unknown as CommerceDb;
    await expect(issueMerchantInvitation(db, 2n, 9007199254740993n, config)).rejects.toThrow('supplier_merchant_invitation_invalid');
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('uses a signed expiring link without tokens, tied to supplier and issuing admin', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T12:00:00Z'));
    const issued = await invitation();
    expect(new URL(issued.url).pathname).toBe('/api/integrations/salla/authorize');
    expect(parseMerchantInvitation(issued.invitation, config)).toEqual({supplierId: '2', adminId: '1', expectedName: storeName, generation: 1, expiresAt: Date.now() + 86400000});
    expect(issued.url).not.toContain('test-secret');
    const pieces = issued.invitation.split('.');
    const payload = JSON.parse(Buffer.from(pieces[1], 'base64url').toString());
    payload.supplierId = '1';
    pieces[1] = Buffer.from(JSON.stringify(payload)).toString('base64url');
    expect(() => parseMerchantInvitation(pieces.join('.'), config)).toThrow();
    vi.advanceTimersByTime(86400000);
    expect(() => parseMerchantInvitation(issued.invitation, config)).toThrow();
  });

  it('creates only an inert missing profile and refuses a target already holding a connection', async () => {
    const missing = issuer(undefined);
    // Explicitly represent a missing profile; the helper default represents an existing one.
    missing.tx.$queryRaw.mockReset().mockResolvedValueOnce([{name: storeName, active: 1}]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await issueMerchantInvitation(missing.db, 2n, 1n, config);
    const statements = missing.tx.$executeRaw.mock.calls.map(([sql]) => sql.join('')).join('\n');
    expect(statements).toContain("'salla',0,0,0,'development',0");
    expect(statements).not.toContain('supplier_connections');
    const stale = issuer({provider: 'salla', maintenance: 0, oauth_generation: 3}, {id: 1n,oauth_scope_version:0});
    await expect(issueMerchantInvitation(stale.db, 1n, 1n, config)).resolves.toMatchObject({url:expect.stringContaining('/api/integrations/salla/authorize')});
    const demo = issuer({provider: 'salla', maintenance: 0, oauth_generation: 3}, {id: 1n,oauth_scope_version:1});
    await expect(issueMerchantInvitation(demo.db, 1n, 1n, config)).rejects.toThrow('supplier_merchant_already_connected');
    expect(demo.tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('consumes invitation generation once and rejects replay without creating another OAuth state', async () => {
    const issued = await invitation();
    let generation = 1;
    const tx = {
      $queryRaw: vi.fn(async (sql: TemplateStringsArray) => sql.join('').includes('supplier_connections') ? [] : [{provider: 'salla', active: 1, maintenance: 0, oauth_generation: generation}]),
      $executeRaw: vi.fn(async (sql: TemplateStringsArray) => {if (sql.join('').includes('oauth_generation=oauth_generation+1')) generation++; return 1;}),
    };
    const db = transactionDb(tx);
    const attempt = await startMerchantOAuth(db, issued.invitation, config);
    const state = new URL(attempt.url).searchParams.get('state')!;
    expect(parseMerchantContext(attempt.context, state, config).generation).toBe(2);
    const writes = tx.$executeRaw.mock.calls.length;
    await expect(startMerchantOAuth(db, issued.invitation, config)).rejects.toThrow('supplier_oauth_superseded');
    expect(tx.$executeRaw).toHaveBeenCalledTimes(writes);
  });

  it('rejects a connection added after invitation issuance without changing it', async () => {
    const issued = await invitation();
    const tx = {$queryRaw: vi.fn().mockResolvedValueOnce([{provider: 'salla', active: 1, maintenance: 0, oauth_generation: 1}]).mockResolvedValueOnce([{id: 99n,oauth_scope_version:1}]), $executeRaw: vi.fn()};
    await expect(startMerchantOAuth(transactionDb(tx), issued.invitation, config)).rejects.toThrow('supplier_merchant_already_connected');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('separates invitation and context signatures, expires callback context and binds its state', async () => {
    vi.useFakeTimers();
    const issued = await invitation();
    const attempt = await ownerAttempt();
    expect(() => parseMerchantContext(issued.invitation, attempt.state, config)).toThrow();
    expect(() => parseMerchantInvitation(attempt.context, config)).toThrow();
    expect(() => parseMerchantContext(attempt.context, 'e'.repeat(64), config)).toThrow('supplier_merchant_context_invalid');
    vi.advanceTimersByTime(600000);
    expect(() => parseMerchantContext(attempt.context, attempt.state, config)).toThrow();
  });

  it('binds the callback DB lookup to the signed admin, supplier, generation and browser', async () => {
    const attempt = await ownerAttempt();
    const context = parseMerchantContext(attempt.context, attempt.state, config);
    const tx = {$queryRaw: vi.fn().mockResolvedValue([]), $executeRaw: vi.fn()};
    const db = transactionDb(tx);
    await expect(consumeOAuthState(db, attempt.state, attempt.browser, 2n, context)).rejects.toThrow('supplier_merchant_context_invalid');
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    await expect(consumeOAuthState(db, attempt.state, attempt.browser, 1n, context)).rejects.toThrow('supplier_oauth_state');
    expect(tx.$queryRaw.mock.calls[0].slice(1)).toEqual([digest(attempt.state), digest(attempt.browser), 1n, 2n, 2]);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});

describe('merchant identity before connection persistence', () => {
  it.each([
    {id: 45},
    {name: 'متجر آخر'},
    {domain: 'https://demostore.salla.sa/dev-example'},
    {domain: 'https://child.demostore.salla.sa'},
    {domain: 'https://salla.sa/dev-example', type: 'demo'},
    {domain: 'https://example-store.sa', type: 'development'},
    {domain: 'https://user:password@salla.sa/store'},
    {domain: 'http://salla.sa/store'},
  ])('rejects mismatched or demo identity %j', async patch => {
    await expect(verifyInvitedMerchant('access', '44', storeName, vi.fn().mockResolvedValue(storeResponse(patch)))).rejects.toThrow('supplier_merchant_identity_mismatch');
  });

  it('accepts authenticated matching store info and never follows redirects', async () => {
    const fetcher = vi.fn().mockResolvedValue(storeResponse({name: 'شعبيات الاولين'}));
    await verifyInvitedMerchant('access', '44', storeName, fetcher);
    expect(fetcher.mock.calls[0][0]).toBe('https://api.salla.dev/admin/v2/store/info');
    expect(fetcher.mock.calls[0][1]).toMatchObject({method: 'GET', redirect: 'error', cache: 'no-store'});
  });

  it('consumes a valid state but never stores a wrong-store grant or changes existing demo credentials', async () => {
    const attempt = await ownerAttempt();
    const tx = {$queryRaw: vi.fn().mockResolvedValueOnce([{supplier_id: 2n}]).mockResolvedValueOnce([{store_url:'https://salla.sa/alawaleen'}]), $executeRaw: vi.fn().mockResolvedValue(1)};
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600})))
      .mockResolvedValueOnce(new Response(JSON.stringify({success: true, data: {merchant: {id: 44,name:storeName,domain:'https://salla.sa/alawaleen'}}})))
      .mockResolvedValueOnce(storeResponse({name: 'متجر تجريبي', domain: 'https://demostore.salla.sa/test'}));
    await expect(completeOAuth(transactionDb(tx), {state: attempt.state, browser: attempt.browser, adminId: 1n, code: 'code', scope:SALLA_REQUIRED_SCOPES.join(' '), merchantContext: attempt.context}, config, fetcher)).rejects.toThrow('supplier_merchant_identity_mismatch');
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw.mock.calls[0][0].join('')).toContain('UPDATE supplier_oauth_states SET consumed_at');
    expect(tx.$executeRaw.mock.calls.flat().join('')).not.toContain('new-access');
  });

  it('refuses a newly connected target in the final transaction after successful provider verification', async () => {
    const attempt = await ownerAttempt();
    const tx = {$queryRaw: vi.fn()
      .mockResolvedValueOnce([{supplier_id: 2n}])
      .mockResolvedValueOnce([{store_url:'https://salla.sa/alawaleen'}])
      .mockResolvedValueOnce([{provider: 'salla', active: 1, maintenance: 0}])
      .mockResolvedValueOnce([{state_hash: digest(attempt.state)}])
      .mockResolvedValueOnce([{id: 99n,external_store_id:'44',oauth_scope_version:1}]), $executeRaw: vi.fn().mockResolvedValue(1)};
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600})))
      .mockResolvedValueOnce(new Response(JSON.stringify({success: true, data: {merchant: {id: 44,name:storeName,domain:'https://salla.sa/alawaleen'}}})))
      .mockResolvedValueOnce(storeResponse());
    await expect(completeOAuth(transactionDb(tx), {state: attempt.state, browser: attempt.browser, adminId: 1n, code: 'code', scope:SALLA_REQUIRED_SCOPES.join(' '), merchantContext: attempt.context}, config, fetcher)).rejects.toThrow('supplier_merchant_already_connected');
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('persists only the verified merchant connection with connection-bound encrypted tokens', async () => {
    const attempt = await ownerAttempt();
    const tx = {$queryRaw: vi.fn()
      .mockResolvedValueOnce([{supplier_id: 2n}])
      .mockResolvedValueOnce([{store_url:'https://salla.sa/alawaleen'}])
      .mockResolvedValueOnce([{provider: 'salla', active: 1, maintenance: 0}])
      .mockResolvedValueOnce([{state_hash: digest(attempt.state)}])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]), $executeRaw: vi.fn().mockResolvedValue(1)};
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600})))
      .mockResolvedValueOnce(new Response(JSON.stringify({success: true, data: {merchant: {id: 44,name:storeName,domain:'https://salla.sa/alawaleen'}}})))
      .mockResolvedValueOnce(storeResponse());
    await expect(completeOAuth(transactionDb(tx), {state: attempt.state, browser: attempt.browser, adminId: 1n, code: 'code', scope:SALLA_REQUIRED_SCOPES.join(' '), merchantContext: attempt.context}, config, fetcher)).resolves.toBe(2n);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    const [sql, supplierId, merchantId, encrypted] = tx.$executeRaw.mock.calls[1];
    expect(sql.join('')).toContain('INSERT INTO supplier_connections');
    expect([supplierId, merchantId]).toEqual([2n, '44']);
    expect(openTokens(encrypted, 'salla:2:44', config.encryptionKey)).toEqual({accessToken: 'new-access', refreshToken: 'new-refresh'});
    expect(tx.$executeRaw.mock.calls.map(([query]) => query.join('')).join('\n')).not.toMatch(/supplier_products|commerce_products|commerce_purchasing_enabled/);
  });
});
