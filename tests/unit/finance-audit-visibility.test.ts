import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ExcelJS from 'exceljs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FinanceAudit, FinanceData, FinanceReport } from '@/lib/finance/types';

const mocks = vi.hoisted(() => ({ access: vi.fn(), read: vi.fn(), exportAudit: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/access-control/guards', () => ({
  requireAccess: async () => ({ uid: 9 }), readActorAccess: mocks.access,
  accessActor: async () => ({ userId: 9, ip: null, sessionFingerprint: null }),
}));
vi.mock('@/lib/finance/read-model', () => ({ readFinanceData: mocks.read }));
vi.mock('@/lib/finance/documents', () => ({ readFinanceInvoice: vi.fn(), customerInvoice: vi.fn() }));
vi.mock('@/lib/finance/service', () => ({ recordFinanceExport: mocks.exportAudit }));
// Inspect precisely what the server passes to the renderer, before any UI visibility flags.
vi.mock('@/components/finance/finance-workspace', () => ({
  FinanceWorkspace: ({ report }: { report: FinanceReport }) => createElement('pre', null, JSON.stringify(report.data.audit)),
}));
import { redactFinanceAudit } from '@/lib/finance/audit-visibility';
import FinancePage from '@/app/admin/finance/page';
import { GET } from '@/app/admin/finance/export/route';

const secret = 'PRIVATE-INVOICE-CUSTOMER-ADDRESS';
function row(entity = 'invoice', extra: Partial<FinanceAudit> = {}): FinanceAudit {
  return { id: '1', at: '2026-09-15T12:00:00Z', actorId: '9', action: 'invoice_issued', entity, entityId: '31', reason: secret,
    before: { customer: secret }, after: { snapshot: { customer: secret } }, payload: { original: secret }, ip: '127.0.0.1', sessionFingerprint: 'hash-only', ...extra };
}
function data(audit: FinanceAudit[] = [row()]): FinanceData {
  return { ready: true, orders: [], receipts: [], refunds: [], suppliers: [], accruals: [], expenses: [], settlements: [], invoices: [], budgets: [], periods: [], audit, requests: [] };
}
const keys = (...grants: string[]) => new Set(['audit:view', ...grants]);
beforeEach(() => { vi.clearAllMocks(); mocks.access.mockResolvedValue({ ready: true, keys: keys('audit:export'), roles: [] }); mocks.read.mockResolvedValue(data()); });

describe('financial audit source visibility', () => {
  it('keeps metadata for auditors but strips private reasons and all JSON fields', () => {
    const source = data(); const result = redactFinanceAudit(source, keys());
    expect(result.audit[0]).toEqual({ id: '1', at: '2026-09-15T12:00:00Z', actorId: '9', action: 'invoice_issued', entity: 'invoice', entityId: '31', reason: '', ip: '127.0.0.1', sessionFingerprint: 'hash-only' });
    expect(JSON.stringify(result.audit)).not.toContain(secret);
    expect(source.audit[0].reason).toBe(secret);
  });
  it('removes audit rows entirely without audit view', () => {
    expect(redactFinanceAudit(data(), new Set(['invoices:view'])).audit).toEqual([]);
  });
  it.each([
    ['invoice', 'invoices:view'], ['settlement', 'settlements:view'], ['accrual', 'settlements:view'],
    ['expense', 'expenses:view'], ['budget', 'budget:view'], ['refund', 'returns:view'], ['tax_policy', 'tax:view'],
  ])('requires the actual source view for %s', (entity, grant) => {
    const source = data([row(entity)]);
    expect(JSON.stringify(redactFinanceAudit(source, keys('finance:view')).audit)).not.toContain(secret);
    expect(redactFinanceAudit(source, keys(grant)).audit[0]).toEqual(source.audit[0]);
  });
  it('fails closed for unknown entities and missing request identities even with broad grants', () => {
    const grants = keys('finance:view', 'invoices:view', 'returns:view', 'tax:view', 'settlements:view', 'budget:view', 'expenses:view', 'periods:view', 'reconciliation:view');
    expect(JSON.stringify(redactFinanceAudit(data([row('future_source'), row('change')]), grants).audit)).not.toContain(secret);
  });
  it('resolves change kind from the saved request rather than the audit JSON claim', () => {
    const source = data([row('change', { payload: { kind: 'return', original: secret } })]);
    source.requests = [{ id: '31', kind: 'tax_settings', targetId: 'tax', payload: { effectiveFrom: '2026-10-01', issuer: { name: 'Issuer', taxNumber: '300000000000003', address: secret }, vatBps: 1500, policyReference: 'policy' }, status: 'pending', makerId: '9', checkerId: null, reason: secret, approvalReason: '', at: '2026-09-15T12:00:00Z', decidedAt: null, result: null }];
    expect(JSON.stringify(redactFinanceAudit(source, keys('returns:view')).audit)).not.toContain(secret);
    expect(redactFinanceAudit(source, keys('tax:view')).audit[0].reason).toBe(secret);
  });
  it('requires both financial totals and periods view for closing/reopening payloads', () => {
    const source = data([row('period')]);
    for (const grant of ['periods:view', 'finance:view']) expect(JSON.stringify(redactFinanceAudit(source, keys(grant)).audit)).not.toContain(secret);
    expect(redactFinanceAudit(source, keys('periods:view', 'finance:view')).audit[0].reason).toBe(secret);
  });
  it('does not reveal a reconciliation snapshot through reconciliation view alone', () => {
    expect(JSON.stringify(redactFinanceAudit(data([row('reconciliation')]), keys('reconciliation:view')).audit)).not.toContain(secret);
  });
  it('export audit details use a registered stored section and reject unknown sections', () => {
    expect(redactFinanceAudit(data([row('report', { payload: { section: 'invoice:31', private: secret } })]), keys('invoices:view')).audit[0].reason).toBe(secret);
    expect(JSON.stringify(redactFinanceAudit(data([row('report', { payload: { section: 'unknown', private: secret } })]), keys('finance:view')).audit)).not.toContain(secret);
  });
});

describe('audit page and exports apply redaction before rendering and filtering', () => {
  it('passes only source-authorized audit fields into the server-rendered workspace', async () => {
    const page = await FinancePage({ searchParams: Promise.resolve({ section: 'ledger', month: '2026-09' }) });
    const html = renderToStaticMarkup(page);
    expect(html).toContain('invoice_issued'); expect(html).toContain('hash-only'); expect(html).not.toContain(secret);
    expect(mocks.access).toHaveBeenCalledOnce();
    mocks.access.mockResolvedValue({ ready: true, keys: keys('invoices:view'), roles: [] });
    expect(renderToStaticMarkup(await FinancePage({ searchParams: Promise.resolve({ section: 'ledger', month: '2026-09' }) }))).toContain(secret);
  });
  it.each(['print', 'xlsx'])('removes private reasons from %s exports and search matching', async format => {
    const response = await GET(new Request(`https://example.test/admin/finance/export?section=ledger&month=2026-09&format=${format}`));
    if (format === 'print') expect(await response.text()).not.toContain(secret);
    else {
      const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await response.arrayBuffer());
      expect(JSON.stringify(workbook.worksheets.map(sheet => sheet.getSheetValues()))).not.toContain(secret);
    }
    const filtered = await GET(new Request(`https://example.test/admin/finance/export?section=ledger&month=2026-09&format=print&q=${secret}`));
    expect(await filtered.text()).not.toContain('invoice_issued');
  });
});
