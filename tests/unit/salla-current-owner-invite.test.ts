import {constants, createDecipheriv, generateKeyPairSync, privateDecrypt} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {describe, expect, it, vi} from 'vitest';
import {
  buildInvitation,
  encryptOwnerReport,
  issueCurrentOwnerInvitation,
} from '../../scripts/release/salla-current-owner-invite.cjs';

const env: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  SUPPLIER_PUBLIC_ORIGIN: 'https://trbhh.sa',
  SUPPLIER_ALLOW_LIVE_ORDERS: 'false',
  SUPPLIER_TOKEN_ENCRYPTION_KEY: 'ab'.repeat(32),
};

function database(overrides: Partial<Record<string, unknown[]>> = {}) {
  const query = vi.fn()
    .mockResolvedValueOnce(overrides.flags ?? [])
    .mockResolvedValueOnce(overrides.automatic ?? [])
    .mockResolvedValueOnce(overrides.supplier ?? [{id: 1n, name: 'شعبيات الأولين', active: 1, store_url: 'https://shabiat24.com'}])
    .mockResolvedValueOnce(overrides.profile ?? [{provider: 'salla', mode: 'development', maintenance: 0, sync_enabled: 0, auto_orders_enabled: 0, oauth_generation: 4}])
    .mockResolvedValueOnce(overrides.connections ?? [{count: 0n}])
    .mockResolvedValueOnce(overrides.products ?? [{count: 0n}])
    .mockResolvedValueOnce(overrides.catalog ?? [{count: 0n}])
    .mockResolvedValueOnce(overrides.issuers ?? [{admin_id: 7n}])
    .mockResolvedValueOnce(overrides.admin ?? [{id: 7n, is_admin: 1}]);
  const transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({$queryRaw: query, $executeRaw: vi.fn().mockResolvedValueOnce(1)}));
  return {$queryRaw: query, $transaction: transaction};
}

describe('current real-store owner invitation', () => {
  it('issues only for supplier 1 after the empty-catalog quarantine gates pass', async () => {
    const db = database();
    const report = await issueCurrentOwnerInvitation(db, env, new Date('2026-09-22T13:00:00.000Z'));
    expect(report).toMatchObject({
      supplierId: '1', targetStore: 'شعبيات الأولين', storeUrl: 'https://shabiat24.com',
      purchasingEnabled: false, paymentsEnabled: false, liveOrdersEnabled: false, productsPublished: false,
    });
    expect(report.url).toMatch(/^https:\/\/trbhh\.sa\/api\/integrations\/salla\/authorize\?invite=v1\./);
    expect(db.$transaction).toHaveBeenCalledOnce();
  });

  it.each([
    {connections: [{count: 1n}]},
    {products: [{count: 1n}]},
    {catalog: [{count: 1n}]},
    {supplier: [{id: 1n, name: 'شعبيات الأولين', active: 1, store_url: 'https://wrong.example'}]},
  ])('refuses unsafe target state %#', async overrides => {
    const db = database(overrides);
    await expect(issueCurrentOwnerInvitation(db, env, new Date('2026-09-22T13:00:00.000Z'))).rejects.toThrow();
    expect(db.$transaction).toHaveBeenCalledOnce();
  });

  it('requires all commerce and live-order gates to remain explicitly disabled', async () => {
    const db = database({flags: [{k: 'commerce_purchasing_enabled', v: '1'}]});
    await expect(issueCurrentOwnerInvitation(db, env, new Date())).rejects.toThrow('owner_invitation_purchase_gate');
    await expect(issueCurrentOwnerInvitation(database(), {...env, SUPPLIER_ALLOW_LIVE_ORDERS: 'true'}, new Date())).rejects.toThrow('owner_invitation_unsafe_environment');
  });

  it('reports a safe stage code instead of raw database diagnostics', async () => {
    const db = {$transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      $queryRaw: vi.fn().mockRejectedValue(new Error('private database detail')),
      $executeRaw: vi.fn(),
    }))};
    await expect(issueCurrentOwnerInvitation(db, env, new Date())).rejects.toThrow('owner_invitation_schema_flags');
  });

  it('reports a safe transaction checkpoint when Prisma rejects outside a query', async () => {
    const db = {$transaction: vi.fn().mockRejectedValue(new Error('private transaction detail'))};
    await expect(issueCurrentOwnerInvitation(db, env, new Date())).rejects.toThrow('owner_invitation_checkpoint_transaction');
  });

  it('creates a 24-hour signed token and encrypts the only report containing it', () => {
    const invitation = buildInvitation({supplierId: '1', adminId: '7', expectedName: 'شعبيات الأولين', generation: 5}, env, new Date('2026-09-22T13:00:00.000Z'));
    expect(invitation.expiresAt).toBe('2026-09-23T13:00:00.000Z');
    const {publicKey, privateKey} = generateKeyPairSync('rsa', {modulusLength: 2048});
    const envelope = encryptOwnerReport(invitation, publicKey);
    const key = privateDecrypt({key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256'}, Buffer.from(envelope.wrappedKey, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
    decipher.setAAD(Buffer.from(envelope.aad, 'base64'));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    const decoded = JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]).toString('utf8'));
    expect(decoded.url).toBe(invitation.url);
    expect(JSON.stringify(envelope)).not.toContain('authorize?invite=');
  });
});

describe('current owner invitation workflow gate', () => {
  it('is manual, branch-scoped, backup-verified and runs only the reviewed script', () => {
    const workflow = readFileSync('.github/workflows/integration-readiness.yml', 'utf8');
    expect(workflow).toContain("github.ref == 'refs/heads/codex/salla-customer-scope-sandbox-order-20260922'");
    expect(workflow).toContain("5dad593a7580de4fe0ec8d275283a33c321b36db");
    expect(workflow).toContain("35720454989");
    expect(workflow).toContain('SALLA_AUDIT_REPORT_PUBLIC_KEY_B64');
    expect(workflow).toContain('actions/runs/$BACKUP_RUN_ID');
    expect(workflow).toContain('salla-current-owner-invite.cjs');
    expect(workflow).toContain('NODE_PATH=/app/node_modules');
    expect(workflow).toContain('docker exec -u 0');
    expect(workflow).not.toMatch(/docker compose up|git reset|git checkout/);
  });
});
