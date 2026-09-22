import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FinanceWorkspace } from '@/components/finance/finance-workspace';
import { FinanceInvoiceView } from '@/components/finance/finance-invoice-view';
import { buildFinanceReport, parseFinanceQuery } from '@/lib/finance/reports';
import { calculateFiscalLines } from '@/lib/finance/calculations';
import type { FinanceData, FinanceOrder } from '@/lib/finance/types';

/** All identities, amounts and references below are synthetic and clearly labeled in the preview. */
export function financeFixtureData(): FinanceData {
  const suppliers = [{ id: '101', name: 'متجر السهل · تجريبي' }, { id: '102', name: 'مؤسسة مدار · تجريبي' }, { id: '103', name: 'رواد التقنية · تجريبي' }, { id: '104', name: 'بيت الحرفة · تجريبي' }];
  const values = [287500, 172500, 92000, 345000, 138000, 230000, 57500, 195500];
  const costs = [180000, 110000, 60000, 240000, 90000, 140000, 32000, 120000];
  const titles = ['آلة قهوة احترافية', 'طاولة عمل خشبية', 'طابعة ملصقات حرارية', 'مجموعة أدوات تقنية', 'كرسي مكتب مريح', 'جهاز تغليف حراري', 'حقيبة أدوات تنظيم', 'شاشة عرض مكتبية'];
  const orders: FinanceOrder[] = values.map((total, index) => {
    const supplier = suppliers[index % suppliers.length];
    const at = `2026-09-${String(5 + index * 2).padStart(2, '0')}T09:00:00+03:00`;
    return { id: String(2101 + index), memberId: String(901 + index), customerName: `عميل اختبار ${index + 1}`, status: 'paid', createdAt: at, paidAt: at, subtotalMinor: total - 2500, shippingMinor: 2500, totalMinor: total, currency: 'SAR', items: [{ productId: String(301 + index), title: titles[index], quantity: 1, unitMinor: total - 2500, totalMinor: total - 2500 }], suppliers: [{ supplierId: supplier.id, supplierName: supplier.name, productId: String(301 + index), amountMinor: costs[index] }] };
  });
  return {
    ready: true, suppliers, orders, refunds: [],
    receipts: orders.map((order, index) => ({ id: `receipt-${index + 1}`, orderId: order.id, amountMinor: order.totalMinor + (index === 7 ? 1 : 0), currency: 'SAR', provider: 'fixture', reference: `TEST-PAY-00${index + 1}`, at: order.paidAt! })),
    accruals: orders.map((order, index) => ({ id: `accrual-${index + 1}`, orderId: order.id, productId: order.items[0].productId, supplierId: order.suppliers[0].supplierId, amountMinor: costs[index], at: order.paidAt!, eligibleAt: index > 4 ? null : order.paidAt!, dueAt: index > 4 ? null : `2026-09-${String(index < 2 ? 15 : 23 + index).padStart(2, '0')}T12:00:00+03:00`, holdReason: index > 4 ? 'بانتظار إثبات اكتمال شروط التسليم والتسوية' : '' })),
    invoices: orders.map((order, index) => ({ id: `invoice-${index + 1}`, orderId: order.id, receiptId: `receipt-${index + 1}`, number: null, kind: 'invoice' as const, parentId: null, status: 'pending_policy' as const, at: order.paidAt!, totalMinor: order.totalMinor + (index === 7 ? 1 : 0), netMinor: null, vatMinor: null, snapshot: null, source: order, reason: 'بيانات اختبار — سياسة الإصدار غير معتمدة' })),
    expenses: [
      { id: 'expense-1', category: 'marketing', description: 'حملة إعلانية تجريبية', netMinor: 82000, vatMinor: 12300, totalMinor: 94300, paidMinor: 94300, at: '2026-09-08T12:00:00+03:00', dueAt: '2026-09-08T12:00:00+03:00', reference: 'TEST-EXP-001', reversalOf: null },
      { id: 'expense-2', category: 'hosting', description: 'خدمات استضافة شهرية تجريبية', netMinor: 12500, vatMinor: 1875, totalMinor: 14375, paidMinor: 14375, at: '2026-09-10T12:00:00+03:00', dueAt: '2026-09-10T12:00:00+03:00', reference: 'TEST-EXP-002', reversalOf: null },
      { id: 'expense-3', category: 'shipping', description: 'مستند شحن تجريبي بانتظار السداد', netMinor: 18000, vatMinor: 2700, totalMinor: 20700, paidMinor: 0, at: '2026-09-15T12:00:00+03:00', dueAt: '2026-09-26T12:00:00+03:00', reference: 'TEST-EXP-003', reversalOf: null },
      { id: 'expense-4', category: 'payment_fees', description: 'رسوم تحصيل تجريبية', netMinor: 15500, vatMinor: 2325, totalMinor: 17825, paidMinor: 17825, at: '2026-09-18T12:00:00+03:00', dueAt: '2026-09-18T12:00:00+03:00', reference: 'TEST-EXP-004', reversalOf: null },
    ],
    settlements: [
      { id: 'settlement-1', supplierId: '101', amountMinor: 180000, at: '2026-09-16T12:00:00+03:00', status: 'approved', reference: 'TEST-BANK-0001', reason: 'تحويل خارجي افتراضي موثق لأغراض المعاينة', lines: [{ accrualId: 'accrual-1', amountMinor: 180000 }], reversalOf: null },
      { id: 'settlement-2', supplierId: '102', amountMinor: 110000, at: '2026-09-21T12:00:00+03:00', status: 'draft', reference: '', reason: 'مسودة اختبار تنتظر مراجعة التحويل الخارجي', lines: [{ accrualId: 'accrual-2', amountMinor: 110000 }], reversalOf: null },
    ],
    budgets: [{ month: '2026-09', category: 'sales', plannedMinor: 1800000 }, { month: '2026-09', category: 'supplier_cost', plannedMinor: 1100000 }, { month: '2026-09', category: 'marketing', plannedMinor: 100000 }, { month: '2026-09', category: 'hosting', plannedMinor: 15000 }, { month: '2026-09', category: 'shipping', plannedMinor: 15000 }, { month: '2026-09', category: 'payment_fees', plannedMinor: 20000 }],
    periods: [{month:'2026-08',closedAt:'2026-09-02T12:00:00+03:00',checks:['payment','refunds','suppliers','invoices','expenses','differences','review'],reason:'إقفال تجريبي للمراجعة البصرية',version:2}],
    requests: [
      {id:'request-1',kind:'return',targetId:'invoice-1',payload:{lines:[{key:'301',quantity:1}]},status:'pending',makerId:'999',checkerId:null,reason:'طلب مرتجع تجريبي موثق من الفاتورة الأصلية',approvalReason:'',at:'2026-09-22T10:00:00+03:00',decidedAt:null,result:{totalMinor:285000,vatMinor:37174,supplierMinor:180000}},
      {id:'request-2',kind:'tax_settings',targetId:'tax',payload:{effectiveFrom:'2026-10-01',issuer:{name:'جهة إصدار تجريبية',taxNumber:'300000000000003',address:'عنوان اختبار فقط'},vatBps:1500,policyReference:'TEST-POLICY-1'},status:'pending',makerId:'998',checkerId:null,reason:'اختبار مراجعة إعدادات الضريبة المستقبلية',approvalReason:'',at:'2026-09-22T10:00:00+03:00',decidedAt:null,result:null},
      {id:'request-3',kind:'reopen_period',targetId:'2026-08',payload:{expectedVersion:2},status:'pending',makerId:'998',checkerId:null,reason:'تصحيح مصدر تجريبي بعد مراجعة المستندات',approvalReason:'',at:'2026-09-22T10:00:00+03:00',decidedAt:null,result:null},
    ],
    taxPolicies: [],
    audit: [{ id: 'audit-1', at: '2026-09-21T12:00:00+03:00', actorId: '999', action: 'تجهيز تسوية تجريبية', entity: 'تسوية', entityId: 'settlement-2', reason: 'المعاينة المحلية فقط' }, { id: 'audit-2', at: '2026-09-18T12:00:00+03:00', actorId: '999', action: 'تسجيل مصروف تجريبي', entity: 'مصروف', entityId: 'expense-4', reason: 'المعاينة المحلية فقط' }],
  };
}

export function renderFinanceFixture(pathname: string, entries: Record<string, string>): string {
  const data = financeFixtureData();
  // Explicitly synthetic issued example, preserving original source order totals.
  const original=data.invoices[0];
  const net=Math.round(original.source.items[0].totalMinor/1.15), shippingNet=Math.round(original.source.shippingMinor/1.15);
  const totals=calculateFiscalLines([{key:'301',title:original.source.items[0].title,quantity:1,unitNetMinor:net,discountMinor:0,vatBps:1500,supplierId:'101',supplierMinor:180000},{key:'shipping',title:'الشحن التجريبي',quantity:1,unitNetMinor:shippingNet,discountMinor:0,vatBps:1500}]);
  data.invoices[0]={...original,number:'TEST-INV-001',status:'issued',netMinor:totals.netMinor,vatMinor:totals.vatMinor,totalMinor:totals.totalMinor,snapshot:{version:1,issuer:{name:'جهة إصدار اختبارية',taxNumber:'300000000000003',address:'عنوان اختبار فقط'},customer:{name:original.source.customerName,address:'عنوان عميل تجريبي'},currency:'SAR',lines:totals.lines,netMinor:totals.netMinor,vatMinor:totals.vatMinor,totalMinor:totals.totalMinor,paidMinor:totals.totalMinor,sourceOrderId:original.orderId,sourceReceiptId:original.receiptId,policyReference:'TEST-POLICY-0'},reason:'مستند اختبار؛ ليس فاتورة حقيقية'};
  const invoiceId = entries.invoiceId || (pathname.startsWith('/admin/finance/invoices/') ? decodeURIComponent(pathname.split('/').pop() || '') : undefined);
  if (invoiceId) {
    const invoice = data.invoices.find(item => item.id === invoiceId);
    return invoice ? renderToStaticMarkup(createElement(FinanceInvoiceView, { invoice, internal: entries.view !== 'customer' })) : '<p>لا يوجد مستند تجريبي بهذا الرقم.</p>';
  }
  const query = parseFinanceQuery({ month: '2026-09', ...entries }, new Date('2026-09-22T12:00:00+03:00'));
  const report = buildFinanceReport(data, query, new Date('2026-09-22T12:00:00+03:00'));
  return renderToStaticMarkup(createElement(FinanceWorkspace, { report, canEdit: true, canApprove: true, canClose: true, canExport: true, canRefund:true, canCancel:true, canManageTax:true, canReopen:true, canReconcile:true, currentUserId:'999', visibleSections:['overview','suppliers','settlements','budget','month-end','cashflow','close','invoices','reconciliation','tax','ledger','expenses','returns'], viewFinance:true, viewSettlements:true, viewReconciliation:true, actionKey: '4ae04525-d45c-4d94-b880-116cf6d014c1' }));
}
