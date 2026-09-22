import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { FinanceInvoice, FinanceQuery, FinanceReport, SupplierBalance } from '@/lib/finance/types';

vi.mock('@/app/admin/finance/actions', () => ({
  approveFinanceSettlement: async () => {}, captureFinanceInvoices: async () => {}, closeFinanceMonth: async () => {},
  prepareFinanceSettlement: async () => {}, recordFinanceExpense: async () => {}, releaseFinanceAccrual: async () => {},
  reverseFinanceExpense: async () => {}, reverseFinanceSettlement: async () => {}, saveFinanceBudget: async () => {},
}));
import { FinanceWorkspace } from '@/components/finance/finance-workspace';
import { financeExportSheets, financeSectionExportSheets, printableFinanceReport } from '@/lib/finance/exports';
import { financeExportScope, formatFinanceRecordDate } from '@/lib/finance/filters';

function invoice(id: string, at: string, customer: string, supplierId: string, supplierName: string, totalMinor: number): FinanceInvoice {
  return {
    id, orderId: `order-${id}`, receiptId: `receipt-${id}`, number: `INV-${id}`, kind: 'invoice', parentId: null,
    at, status: 'pending_policy', totalMinor, netMinor: null, vatMinor: null, snapshot: null, reason: '',
    source: { id: `order-${id}`, memberId: `member-${id}`, customerName: customer, status: 'paid', createdAt: at, paidAt: at, subtotalMinor: totalMinor, shippingMinor: 0, totalMinor, currency: 'SAR', items: [{ productId: `product-${id}`, title: `منتج ${id}`, quantity: 1, unitMinor: totalMinor, totalMinor }], suppliers: [{ supplierId, supplierName, productId: `product-${id}`, amountMinor: 10000 }] },
  };
}
const invoices = [
  invoice('A', '2026-09-09T21:30:00Z', 'عميلة ألف', 's1', 'مدار Alpha Supply', 123456),
  invoice('B', '2026-09-11T10:00:00Z', 'عميل باء', 's2', 'بيت الحرفة', 76543),
  invoice('C', '2026-08-31T20:30:00Z', 'عميلة ألف', 's1', 'مدار Alpha Supply', 123456),
];
function supplier(id: string, name: string): SupplierBalance {
  return { id, name, openingMinor: 30000, accruedMinor: 10000, paidMinor: 5000, pendingMinor: 1000, remainingMinor: 35000, dueMinor: 34000, overdueMinor: 500, nextDueAt: null, lastSettlementAt: null };
}
function report(query: Partial<FinanceQuery> = {}): FinanceReport {
  return {
    query: { section: 'invoices', month: '2026-09', mode: 'accountant', ...query },
    metrics: [{ key: 'sales', label: 'إجمالي مصدر الشهر', valueMinor: 199999, explanation: 'مجموع الشهر قبل تصفية السجلات', href: '/source-sales' }], previousMetrics: [],
    suppliers: [supplier('s1', 'مدار Alpha Supply'), supplier('s2', 'بيت الحرفة')],
    movements: [
      { id: 'm1', at: invoices[0].at, label: 'قيمة طلب ألف', creditMinor: 10000, debitMinor: 0, balanceMinor: 10000, orderId: 'order-A', reference: 'BANK-ALPHA', href: '/source-m1', status: 'due' },
      { id: 'm2', at: invoices[1].at, label: 'قيمة طلب باء', creditMinor: 10000, debitMinor: 0, balanceMinor: 20000, orderId: 'order-B', reference: 'BANK-BETA', href: '/source-m2', status: 'held' },
    ],
    budget: [{ category: 'sales', label: 'المبيعات', plannedMinor: 250000, actualMinor: 199999, differenceMinor: 50001, usagePercent: 80 }],
    issues: [{ key: 'scope', severity: 'warning', message: 'مصادر غير مكتملة', href: '/source-issue' }],
    due7Minor: 34000, due30Minor: 35000, availableMinor: 50000, canClose: false,
    data: { ready: true, orders: invoices.map(item => item.source), receipts: [], refunds: [], suppliers: [{ id: 's1', name: 'مدار Alpha Supply' }, { id: 's2', name: 'بيت الحرفة' }], accruals: [], expenses: [], settlements: [], invoices, budgets: [], periods: [], audit: [] },
  };
}
function render(source: FinanceReport): string {
  return renderToStaticMarkup(createElement(FinanceWorkspace, { report: source, canEdit: false, canApprove: false, canClose: false, canExport: true, viewFinance: true, viewSettlements: true, actionKey: 'd0fb8672-aa6b-41ee-8383-2526b28f6c80' }));
}
function sheetRows(source: FinanceReport, name: string) { return financeExportSheets(source).find(sheet => sheet.name === name)!.rows; }
function displayedInvoiceIds(html: string): string[] {
  return [...html.matchAll(/href="\/admin\/finance\/invoices\/([^"]+)"/g)].map(match => match[1]);
}

describe('finance exports match the visible source records', () => {
  it.each([['budget', ['الميزانية']], ['invoices', ['الفواتير']], ['suppliers', ['الموردون','الحركات']], ['reconciliation', ['المطابقة']], ['overview', ['ملخص']], ['ledger', ['سجل التدقيق']]] as const)('exports only the authorized %s section', (section, names) => {
    expect(financeSectionExportSheets(report({section})).map(sheet=>sheet.name)).toEqual(names);
    if(section==='budget'||section==='ledger') {
      expect(printableFinanceReport(report({section}))).not.toContain('INV-A');
      expect(printableFinanceReport(report({section}))).not.toContain('BANK-ALPHA');
    }
  });
  it.each([
    ['supplier Arabic name', 'مدار', ['A']],
    ['supplier case-insensitive Latin name', 'alpha supply', ['A']],
    ['customer name', 'عميل باء', ['B']],
    ['invoice number', 'inv-a', ['A']],
    ['order reference', 'order-B', ['B']],
    ['raw accounting date', '2026-09-11', ['B']],
    ['displayed Riyadh accounting date', formatFinanceRecordDate(invoices[0].at), ['A']],
    ['amount in riyals', '1234.56', ['A']],
    ['no matching record', 'غير موجود', []],
  ])('applies identical invoice search for %s', (_label, q, expected) => {
    const source = report({ q });
    const displayed = displayedInvoiceIds(render(source));
    const exported = sheetRows(source, 'الفواتير').map(row => String(row[0]).replace('INV-', ''));
    expect(displayed).toEqual(expected);
    expect(exported).toEqual(displayed);
  });

  it('combines supplier, accounting period and status without using issuance date as period', () => {
    const source = report({ supplierId: 's1', status: 'pending_policy' });
    source.data = { ...source.data, invoices: source.data.invoices.map(item => ({ ...item, issuedAt: '2026-10-02T09:00:00Z' })) };
    expect(displayedInvoiceIds(render(source))).toEqual(['A']);
    expect(sheetRows(source, 'الفواتير').map(row => row[0])).toEqual(['INV-A']);
    const issued = { ...source, query: { ...source.query, status: 'issued' } };
    expect(displayedInvoiceIds(render(issued))).toEqual([]);
    expect(sheetRows(issued, 'الفواتير')).toEqual([]);
  });

  it('filters supplier rows by the same name search and supplier selection as the screen', () => {
    const source = report({ section: 'suppliers', q: 'ALPHA', supplierId: 's1' });
    const html = render(source);
    expect(sheetRows(source, 'الموردون').map(row => row[0])).toEqual(['مدار Alpha Supply']);
    expect(html).toContain('supplierId=s1');
    expect(html).not.toContain('supplierId=s2');
    expect(sheetRows(report({ section: 'suppliers', q: 'ALPHA', supplierId: 's2' }), 'الموردون')).toEqual([]);
  });

  it('filters statement rows without recalculating their historical running balance', () => {
    const source = report({ section: 'ledger', q: 'bank-beta', status: 'held' });
    const html = render(source);
    const exported = sheetRows(source, 'الحركات');
    expect(html).toContain('/source-m2');
    expect(html).not.toContain('/source-m1');
    expect(exported).toHaveLength(1);
    expect(exported[0][4]).toBe(200);
    expect(exported[0][5]).toBe('BANK-BETA');
    expect(sheetRows(report({ section: 'ledger', q: 'bank-beta', status: 'due' }), 'الحركات')).toEqual([]);
  });

  it('keeps all six sheets and source totals while documenting the detail-filter scope', () => {
    const original = report();
    const filtered = report({ q: 'not-found', section: 'suppliers' });
    expect(financeExportSheets(filtered)).toHaveLength(6);
    for (const name of ['ملخص', 'الميزانية', 'المطابقة']) expect(sheetRows(filtered, name)).toEqual(sheetRows(original, name));
    expect(sheetRows(filtered, 'ملخص')[0][1]).toBe(1999.99);
    expect(printableFinanceReport(filtered)).toContain(financeExportScope);
    expect(render(filtered)).toContain(financeExportScope);
  });
});
