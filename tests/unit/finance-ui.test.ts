import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { FinanceData, FinanceInvoice, FinanceSection } from '@/lib/finance/types';

vi.mock('@/app/admin/finance/actions', () => ({
  restoreFinanceDraftInvoice: async () => {},
  approveFinanceRequest: async () => {}, cancelFinanceRequest: async () => {}, requestFinanceReturn: async () => {}, requestFinanceReturnReversal: async () => {}, requestFinanceTaxSettings: async () => {}, requestFinancePeriodReopen: async () => {}, cancelFinanceSettlement: async () => {}, cancelFinanceDraftInvoice: async () => {}, reviewFinanceReconciliation: async () => {},
  approveFinanceSettlement: async () => {}, captureFinanceInvoices: async () => {}, closeFinanceMonth: async () => {},
  prepareFinanceSettlement: async () => {}, recordFinanceExpense: async () => {}, releaseFinanceAccrual: async () => {},
  reverseFinanceExpense: async () => {}, reverseFinanceSettlement: async () => {}, saveFinanceBudget: async () => {},
}));
import { FinanceInvoiceView } from '@/components/finance/finance-invoice-view';
import { FinanceWorkflowPanel } from '@/components/finance/finance-workflows';
import { FinanceWorkspace } from '@/components/finance/finance-workspace';
import { buildFinanceReport, monthOfDate } from '@/lib/finance/reports';

const invoice: FinanceInvoice = {
  id: 'inv-1', orderId: 'order-1', receiptId: 'receipt-1', number: null, kind: 'invoice', parentId: null,
  status: 'pending_policy', at: '2026-09-10T09:00:00Z', totalMinor: 11500, netMinor: null, vatMinor: null, snapshot: null,
  reason: 'بانتظار اعتماد السياسة',
  source: {
    id: 'order-1', memberId: 'customer-1', customerName: 'عميل تجريبي', status: 'paid', createdAt: '2026-09-10T08:00:00Z', paidAt: '2026-09-10T09:00:00Z', subtotalMinor: 11500, shippingMinor: 0, totalMinor: 11500, currency: 'SAR',
    items: [{ productId: 'product-1', title: 'منتج محفوظ وقت البيع', quantity: 1, unitMinor: 11500, totalMinor: 11500 }],
    suppliers: [{ supplierId: 'supplier-1', supplierName: 'اسم المورد الداخلي السري', productId: 'product-1', amountMinor: 8888 }],
  },
};
function data(): FinanceData {
  return { ready: true, orders: [invoice.source], receipts: [{ id: 'receipt-1', orderId: 'order-1', amountMinor: 11500, currency: 'SAR', provider: 'fixture', reference: 'BANK-001', at: invoice.at }], refunds: [], suppliers: [{ id: 'supplier-1', name: 'مورد تجريبي' }], accruals: [{ id: 'accrual-1', orderId: 'order-1', productId: 'product-1', supplierId: 'supplier-1', amountMinor: 8888, at: invoice.at, eligibleAt: null, dueAt: null, holdReason: 'لم تستكمل الشروط' }], invoices: [invoice], expenses: [], settlements: [], budgets: [], periods: [], audit: [] };
}
function renderSection(section: FinanceSection, source = data(), flags = { canEdit: true, canApprove: true, canClose: true, canExport: true }) {
  const report = buildFinanceReport(source, { month: '2026-09', section, mode: 'accountant' }, new Date('2026-09-22T10:00:00Z'));
  return renderToStaticMarkup(createElement(FinanceWorkspace, { report, ...flags, actionKey: 'd0fb8672-aa6b-41ee-8383-2526b28f6c80' }));
}

describe('finance invoice disclosure', () => {
  it('never renders internal supplier identity, cost, references or controls in the customer copy', () => {
    const customer = renderToStaticMarkup(createElement(FinanceInvoiceView, { invoice, internal: false }));
    expect(customer).toContain('عميل تجريبي');
    expect(customer).toContain('منتج محفوظ وقت البيع');
    expect(customer).toContain('115.00 ر.س');
    expect(customer).not.toContain('اسم المورد الداخلي السري');
    expect(customer).not.toContain('88.88');
    expect(customer).not.toContain('receipt-1');
    expect(customer).not.toContain('/admin/commerce/');
    expect(customer).not.toContain('مراجع الإدارة الداخلية');
  });
  it('keeps pending tax values visibly unknown in both document variants', () => {
    for (const internal of [true, false]) {
      const html = renderToStaticMarkup(createElement(FinanceInvoiceView, { invoice, internal }));
      expect(html).toContain('ليس فاتورة ضريبية مُصدرة');
      expect(html.match(/غير مكتمل/g)).toHaveLength(2);
      expect(html).not.toMatch(/>15\.00 ر\.س</);
      expect(html).not.toContain('ر.س ر.س');
    }
  });
  it('includes source evidence and supplier costs in the internal copy', () => {
    const html = renderToStaticMarkup(createElement(FinanceInvoiceView, { invoice, internal: true }));
    expect(html).toContain('اسم المورد الداخلي السري');
    expect(html).toContain('88.88 ر.س');
    expect(html).toContain('receipt-1');
    expect(html).toContain('/admin/commerce/orders/order-1');
    expect(html).toContain('view=customer');
  });
  it('uses the authenticated customer print endpoint and hides export controls when denied', () => {
    const customer = renderToStaticMarkup(createElement(FinanceInvoiceView, { invoice, internal: false, printHref: '/account/invoices/inv-1?print=1' }));
    expect(customer).toContain('/account/invoices/inv-1?print=1');
    expect(customer).not.toContain('/admin/');
    const viewer = renderToStaticMarkup(createElement(FinanceInvoiceView, { invoice, internal: true, canExport: false }));
    expect(viewer).not.toContain('/admin/finance/export');
  });
});

describe('finance workspace review flows', () => {
  it('retains date and mode in navigation and makes source links discoverable', () => {
    const html = renderSection('overview');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('section=suppliers&amp;month=2026-09&amp;mode=accountant');
    expect(html).toContain('ما معنى هذا الرقم؟');
    expect(html).toContain('/admin/commerce/orders/order-1');
    expect(html).toContain('غير مكتمل');
  });
  it('hides expense write controls and exports from read-only viewers', () => {
    const html = renderSection('expenses', data(), { canEdit: false, canApprove: false, canClose: false, canExport: false });
    expect(html).not.toContain('name="net"');
    expect(html).not.toContain('name="paid"');
    expect(html).not.toContain('/admin/finance/export');
    expect(html).toContain('المصروفات المسجلة');
  });
  it('disables saving into a closed month and requires an explicit expense date and tax value', () => {
    const source = data();
    source.periods.push({ month: '2026-09', closedAt: '2026-10-01T09:00:00Z', checks: [], reason: 'مراجعة مكتملة' });
    const html = renderSection('expenses', source);
    expect(html).toContain('هذا الشهر مقفل');
    expect(html).toContain('name="occurredAt"');
    expect(html).toContain('name="vat"');
    expect(html).toMatch(/<button[^>]+disabled=""[^>]*>تسجيل المصروف<\/button>/);
  });
  it('shows the seven close checks but blocks close with unresolved financial sources', () => {
    const html = renderSection('close');
    for (const name of ['payment', 'refunds', 'suppliers', 'invoices', 'expenses', 'differences', 'review']) expect(html).toContain(`name="checks" value="${name}"`);
    expect(html).toMatch(/<button[^>]+disabled=""[^>]*>اعتماد إقفال/);
    expect(html).toContain('ما يمنع الإقفال');
  });
  it('uses stable, distinct UUID keys for independent review forms', () => {
    const source = data();
    source.accruals.push({ ...source.accruals[0], id: 'accrual-2' });
    const html = renderSection('suppliers', source);
    const keys = [...html.matchAll(/name="requestKey" value="([^"]+)"/g)].map(match => match[1]);
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
    for (const key of keys) expect(key).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-a[\da-f]{3}-[\da-f]{12}$/);
    const second = renderSection('suppliers', source);
    for (const key of keys) expect(second).toContain(key);
  });
  it('shows the draft source rows and explicit transfer confirmation before approval', () => {
    const source = data();
    source.settlements.push({ id: 'settlement-1', supplierId: 'supplier-1', amountMinor: 8888, at: invoice.at, status: 'draft', reference: '', reason: 'مراجعة تجريبية', lines: [{ accrualId: 'accrual-1', amountMinor: 8888 }], reversalOf: null });
    const html = renderSection('settlements', source);
    expect(html).toContain('هذه معاينة لمسودة');
    expect(html).toContain('/admin/commerce/orders/order-1');
    expect(html).toContain('name="reference"');
    expect(html).toContain('name="confirm"');
    expect(html).toContain('التحويل تم خارج النظام');
    const editor = renderSection('settlements', source, { canEdit: true, canApprove: false, canClose: false, canExport: false });
    expect(editor).not.toContain('name="confirm"');
  });
});

describe('finance request controls and preserved records',()=>{
 function workflow(section:FinanceSection,extra:Record<string,unknown>={},source=data()) {
  return renderToStaticMarkup(createElement(FinanceWorkflowPanel,{report:buildFinanceReport(source,{month:'2026-09',section,mode:'accountant'}),actionKey:'preview-actions',...extra}));
 }
 function requestData():FinanceData {
  return {...data(),requests:[{id:'31',kind:'return',targetId:invoice.id,payload:{lines:[{key:'product-1',quantity:1}]},status:'pending',makerId:'9',checkerId:null,reason:'return evidence',approvalReason:'',at:invoice.at,decidedAt:null,result:{totalMinor:11500,vatMinor:1500}}]};
 }
 it('a reviewer sees creator and server-derived amounts but no unauthorized mutation forms',()=>{
  const html=workflow('returns',{},requestData());
  expect(html).toContain('المنشئ #9');expect(html).toContain('115.00');expect(html).toContain('15.00');
  expect(html).not.toContain('<form');expect(html).not.toContain('حفظ طلب المرتجع');expect(html).not.toContain('اعتماد الطلب بعد المراجعة');
 });
 it('creation does not imply checker or cancellation controls',()=>{
  const html=workflow('returns',{canCreate:true},requestData());
  expect(html).toContain('إنشاء طلب مرتجع');expect(html).not.toContain('اعتماد الطلب بعد المراجعة');expect(html).not.toContain('إلغاء الطلب مع الاحتفاظ');
 });
 it('a maker approval requires clear independent-checker warning and confirmation',()=>{
  const html=workflow('returns',{canApprove:true,currentUserId:'9'},requestData());
  expect(html).toContain('إذا وجد معتمد آخر سيُرفض الاعتماد الذاتي');expect(html).toContain('أقر بأن اعتماد طلبي');expect(html).toContain('type="checkbox" required=""');expect(html).toContain('name="kind" value="return"');
 });
 it('a completed request shows decision identity and cannot be approved or cancelled again',()=>{
  const source=requestData();source.requests![0]={...source.requests![0],status:'approved',checkerId:'10',approvalReason:'checked source',decidedAt:invoice.at,result:{number:'CN-0001',mode:'independent_checker'}};
  const html=workflow('returns',{canApprove:true,canCancel:true},source);
  expect(html).toContain('CN-0001');expect(html).toContain('#10');expect(html).toContain('checked source');expect(html).not.toContain('<form');
 });
 it('tax settings are not assumed and cannot be changed with approve-only permission',()=>{
  const reader=workflow('tax',{canApprove:true});expect(reader).not.toContain('name="vatPercent"');
  const manager=workflow('tax',{canManageTax:true});expect(manager).toContain('name="vatPercent"');expect(manager).not.toMatch(/name="vatPercent"[^>]*value="/);expect(manager).toContain('ليس إثباتًا للامتثال الضريبي');
 });
 it('requires explicit policy selections with no defaults, including when an earlier policy exists',()=>{
  const source=data();source.taxPolicies=[{id:'1',requestId:'2',at:invoice.at,effectiveFrom:'2026-09-01',issuer:{name:'Previous issuer',taxNumber:'300000000000003',address:'Previous address'},vatBps:1500,policyReference:'previous-policy'}];
  const html=workflow('tax',{canManageTax:true},source),formHtml=html.slice(html.indexOf('<form'));
  for(const field of ['priceBasis','itemScope','shippingPriceBasis','discountTreatment','rounding','policyRollover']){
   const select=formHtml.match(new RegExp(`<select(?=[^>]*name="${field}")[^>]*>[\\s\\S]*?</select>`))?.[0];expect(select).toContain('required=""');
   expect(select).toMatch(/<option(?=[^>]*value="")(?=[^>]*selected="")[^>]*>/);expect(select?.match(/selected=""/g)).toHaveLength(1);
  }
  for(const field of ['issuerName','issuerTaxNumber','issuerAddress','vatPercent','automationDelegateId']){expect(formHtml).toContain(`name="${field}"`);expect(formHtml).not.toMatch(new RegExp(`<input(?=[^>]*name="${field}")(?=[^>]*value="[^"]+")[^>]*>`));}
  expect(formHtml).not.toContain('name="shippingVatPercent"');
  expect(html).toContain('بيانات حساب موظف موجود');expect(html).toContain('لم تُحدد سياسة حساب للإصدار المستقبلي');
  const reader=workflow('tax',{canApprove:true},source);expect(reader).not.toContain('name="automationDelegateId"');
 });
 it('starts VAT OFF, allows a blank registration number and exposes explicit registration evidence with one central rate',()=>{
  const html=workflow('tax',{canManageTax:true});
  const select=html.match(/<select(?=[^>]*name="vatEnabled")[^>]*>[\s\S]*?<\/select>/)?.[0];
  expect(select).toMatch(/<option(?=[^>]*value="off")(?=[^>]*selected="")[^>]*>/);
  expect(html).not.toMatch(/<input(?=[^>]*name="issuerTaxNumber")(?=[^>]*required)[^>]*>/);
  expect(html).toContain('name="registrationConfirmed"');expect(html).toContain('name="registrationEffectiveFrom"');expect(html).toContain('name="registrationThreshold"');
  expect(html).toContain('value="375000"');expect(html).not.toContain('name="shippingVatPercent"');expect(html).toContain('لا يُفعّل التنبيه الضريبة تلقائيًا');
 });
 it('prefills the explicit current approved policy so a threshold-only proposal preserves all other decisions',()=>{
  const source=data();source.taxPolicies=[{id:'7',requestId:'8',at:invoice.at,effectiveFrom:'2026-09-01',issuer:{name:'Approved issuer',taxNumber:'300000000000003',address:'Approved address'},vatBps:1525,policyReference:'existing-approved-reference',calculationPolicy:{version:2,priceBasis:'exclusive',itemScope:'uniform_catalog',shippingPriceBasis:'inclusive',shippingVatBps:1525,discountTreatment:'before_tax',rounding:'line_half_up',policyRollover:'hold_for_review',automationDelegateId:'42',vatControl:{enabled:true,registrationConfirmed:true,registrationEffectiveFrom:'2026-09-01',registrationThresholdMinor:41000000}}}];
  const html=workflow('tax',{canManageTax:true},source),formHtml=html.slice(html.indexOf('<form'));
  for(const value of ['Approved issuer','Approved address','300000000000003','15.25','410000','existing-approved-reference'])expect(formHtml).toContain(`value="${value}"`);
  expect(formHtml.match(/<select(?=[^>]*name="vatEnabled")[^>]*>[\s\S]*?<\/select>/)?.[0]).toMatch(/<option(?=[^>]*value="on")(?=[^>]*selected="")[^>]*>/);
  expect(formHtml).toMatch(/<input(?=[^>]*name="registrationConfirmed")(?=[^>]*checked="")[^>]*>/);
  expect(formHtml).toContain('name="reason"');expect(formHtml).not.toContain('value="375000"');
 });
 it('shows the full proposed calculation and automation policy for independent review',()=>{
  const source=data();source.requests=[{id:'32',kind:'tax_settings',targetId:'tax',payload:{effectiveFrom:'2026-10-01',issuer:{name:'Issuer',taxNumber:'300000000000003',address:'Address'},vatBps:1500,policyReference:'future-policy',calculationPolicy:{version:2,priceBasis:'inclusive',itemScope:'uniform_catalog',shippingPriceBasis:'exclusive',shippingVatBps:525,discountTreatment:'before_tax',rounding:'line_half_up',policyRollover:'hold_for_review',automationDelegateId:'42'}},status:'pending',makerId:'9',checkerId:null,reason:'policy evidence',approvalReason:'',at:invoice.at,decidedAt:null,result:null}];
  const html=workflow('tax',{canApprove:true},source);
  for(const text of ['شامل الضريبة','غير شامل الضريبة','نسبة موحدة على جميع منتجات الكتالوج','5.25%','قبل احتساب الضريبة','تقريب كل بند إلى أقرب هللة؛ النصف للأعلى','إيقاف الإصدار للمراجعة عند تغير السياسة','الموظف المفوض #42'])expect(html).toContain(text);
  expect(html).toContain('اعتماد الطلب بعد المراجعة');
 });
 it('offers a source-only full reversal for issued credit notes, independently of approval controls',()=>{
  const source=data();source.invoices.push({...invoice,id:'credit-1',kind:'credit_note',parentId:'inv-1',status:'issued',number:'CN-001',snapshot:{version:1,issuer:{name:'Issuer',taxNumber:'300000000000003',address:'Address'},customer:{name:'Customer',address:'Address'},currency:'SAR',lines:[],netMinor:10000,vatMinor:1500,totalMinor:11500,paidMinor:11500,sourceOrderId:'order-1',sourceReceiptId:'receipt-1',policyReference:'fixture'}});
  source.invoices.push({...source.invoices[1],id:'credit-draft',status:'pending_policy',number:null});
  const html=workflow('returns',{canCreate:true},source);
  expect(html).toContain('طلب عكس الإشعار الدائن بالكامل');expect(html).toContain('name="creditNoteId" value="credit-1"');expect(html).toContain('name="invoiceId" value="inv-1"');expect(html).not.toContain('value="credit-draft"');
  expect(html).not.toContain('name="totalMinor"');expect(html).not.toContain('name="snapshot"');expect(html).not.toContain('اعتماد الطلب بعد المراجعة');
  expect(workflow('returns',{canApprove:true},source)).not.toContain('name="creditNoteId"');
 });
 it('identifies credit reversal requests for the checker rather than labelling them as a new credit',()=>{
  const source=requestData();source.requests![0]={...source.requests![0],payload:{lines:[],reversalOf:'credit-1'},result:{number:'DN-0001',totalMinor:11500,vatMinor:1500}};
  const html=workflow('returns',{canApprove:true},source);
  expect(html).toContain('عكس الإشعار الدائن بالكامل');expect(html).toContain('/admin/finance/invoices/credit-1');expect(html).toContain('الإشعار المدين: DN-0001');expect(html).not.toContain('الإشعار الدائن: DN-0001');
 });
 it('reopening a closed period is available with reopen permission independently of close',()=>{
  const source={...data(),periods:[{month:'2026-09',closedAt:invoice.at,checks:[],reason:'period closed',version:4}]};
  const html=workflow('close',{canReopen:true},source);expect(html).toContain('إرسال طلب إعادة فتح');expect(html).toContain('name="expectedVersion" value="4"');expect(html).not.toContain('disabled=""');
  expect(workflow('close',{},source)).not.toContain('إرسال طلب إعادة فتح');
 });
 it('cancelled draft invoice stays visible without claiming it is issued or pending policy',()=>{
  const html=renderToStaticMarkup(createElement(FinanceInvoiceView,{invoice:{...invoice,status:'cancelled'},internal:false}));
  expect(html).toContain('مسودة ملغاة');expect(html).toContain('ليست فاتورة صادرة');expect(html).not.toContain('>مُصدر<');expect(html).not.toContain('سجل مالي بانتظار اعتماد');
 });
 it('audit JSON is rendered as escaped text with actor connection metadata',()=>{
  const source={...data(),audit:[{id:'1',at:invoice.at,actorId:'9',action:'budget_saved',entity:'budget',entityId:'1',reason:'review',before:{text:'<script>alert(1)</script>'},after:{plannedMinor:100},ip:'127.0.0.1',sessionFingerprint:'hash-only',payload:{mode:'sole_approver',makerId:'9',checkerId:'9'}}]};
  const html=renderSection('ledger',source);expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>alert');expect(html).toContain('hash-only');expect(html).toContain('127.0.0.1');expect(html).toContain('sole_approver');
 });
});

it('restoring a cancelled draft requires both creation and cancellation controls',()=>{
 const source={...data(),invoices:[{...invoice,status:'cancelled' as const}]};
 const report=buildFinanceReport(source,{month:'2026-09',section:'invoices',mode:'accountant'});
 const render=(canEdit:boolean,canCancel:boolean)=>renderToStaticMarkup(createElement(FinanceWorkspace,{report,canEdit,canCancel,canApprove:false,canClose:false,canExport:false,actionKey:'restore-fixture'}));
 expect(render(true,false)).not.toContain('استعادة المسودة للمراجعة');expect(render(false,true)).not.toContain('استعادة المسودة للمراجعة');
 expect(render(true,true)).toContain('استعادة المسودة للمراجعة');
 const closedSource={...source,periods:[{month:monthOfDate(new Date()),closedAt:invoice.at,checks:[],reason:'closed'}]};
 const closed=renderToStaticMarkup(createElement(FinanceWorkspace,{report:buildFinanceReport(closedSource,{month:'2026-09',section:'invoices',mode:'accountant'}),canEdit:true,canCancel:true,canApprove:false,canClose:false,canExport:false,actionKey:'restore-fixture'}));
 expect(closed).toMatch(new RegExp('<button[^>]*disabled=""[^>]*>استعادة المسودة</button>'));
});
