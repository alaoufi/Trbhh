import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FinanceInvoiceView } from '@/components/finance/finance-invoice-view';
import { printableFinanceInvoice } from '@/lib/finance/exports';
import type { FinanceInvoice, FiscalSnapshotV2 } from '@/lib/finance/types';

function document(enabled: boolean | undefined): FinanceInvoice {
  const snapshot: FiscalSnapshotV2 = {
    version: 2, issuer: { name: 'جهة الإصدار', address: 'الرياض', taxNumber: '300000000000003' },
    customer: { name: 'العميل', address: 'جدة' }, currency: 'SAR',
    lines: [{ key: '8', title: 'سلعة', quantity: 1, unitPriceMinor: 10000, priceBasis: 'inclusive', component: 'product', discountMinor: 0, vatBps: 0, netMinor: 10000, vatMinor: 0, grossMinor: 10000 }],
    netMinor: 10000, vatMinor: 0, totalMinor: 10000, paidMinor: 10000,
    sourceOrderId: '2', sourceReceiptId: '3', policyReference: 'saved-policy', policyId: '4', policyRequestId: '5', orderSnapshotFingerprint: 'saved-fingerprint', derivation: 'sale',
    ...(enabled === undefined ? {} : { vatControl: { enabled } }),
  };
  return { id: '1', orderId: '2', receiptId: '3', number: 'INV-2026-001', kind: 'invoice', parentId: null, status: 'issued', at: '2026-09-24T09:00:00Z', issuedAt: '2026-09-24T09:00:00Z', totalMinor: 10000, netMinor: 10000, vatMinor: 0, snapshot, reason: '', source: { id: '2', memberId: '6', customerName: 'العميل', status: 'paid', createdAt: '2026-09-24T08:00:00Z', paidAt: '2026-09-24T09:00:00Z', subtotalMinor: 10000, shippingMinor: 0, totalMinor: 10000, currency: 'SAR', items: [{ productId: '8', title: 'سلعة', quantity: 1, unitMinor: 10000, totalMinor: 10000 }], suppliers: [] } };
}

describe('immutable VAT-off invoice presentation', () => {
  it('prints the exact dynamically selected CJ attributes in customer and admin copies',()=>{
    const invoice=document(false),snapshot=invoice.snapshot as FiscalSnapshotV2;
    snapshot.lines[0].variantSnapshot={key:'vid-8401',vid:'vid-8401',sku:'SKU-BLK-XL',attributes:{Color:'Black',Size:'XL',Voltage:'220V',Plug:'EU'}};
    const customer=renderToStaticMarkup(createElement(FinanceInvoiceView,{invoice,internal:false}));
    const admin=renderToStaticMarkup(createElement(FinanceInvoiceView,{invoice,internal:true}));
    const pdf=printableFinanceInvoice(invoice,false);
    for(const output of [customer,admin,pdf])for(const value of ['Black','XL','220V','EU','SKU-BLK-XL','vid-8401'])expect(output).toContain(value);
  });
  it.each([false, true])('shows explicit non-added VAT without a registration claim (internal=%s)', internal => {
    const html = renderToStaticMarkup(createElement(FinanceInvoiceView, { invoice: document(false), internal }));
    expect(html).toContain('ضريبة القيمة المضافة غير مضافة على هذا المستند');
    expect(html).not.toContain('الرقم الضريبي');
    expect(html).not.toContain('300000000000003');
    expect(html).not.toContain('شامل الضريبة');
    expect(html).toContain('100.00');
  });
  it('prints the same saved OFF decision, without changing the document', () => {
    const invoice = document(false), before = JSON.stringify(invoice);
    const html = printableFinanceInvoice(invoice, false);
    expect(html).toContain('ضريبة القيمة المضافة غير مضافة على هذا المستند');
    expect(html).not.toContain('الرقم الضريبي');
    expect(html).not.toContain('300000000000003');
    expect(html).toContain('100.00');
    expect(JSON.stringify(invoice)).toBe(before);
  });
  it.each([undefined, true])('does not reinterpret legacy or enabled zero-rate documents as OFF (%s)', enabled => {
    const invoice = document(enabled);
    const html = renderToStaticMarkup(createElement(FinanceInvoiceView, { invoice, internal: false }));
    expect(html).not.toContain('ضريبة القيمة المضافة غير مضافة على هذا المستند');
    expect(html).toContain('300000000000003');
    expect(html).toContain('شامل الضريبة');
    expect(printableFinanceInvoice(invoice, false)).toContain('300000000000003');
  });
});
