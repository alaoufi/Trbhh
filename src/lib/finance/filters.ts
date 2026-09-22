import { monthOfDate } from './reports';
import type { FinanceChangeRequest, FinanceData, FinanceInvoice, FinanceQuery, StatementMovement, SupplierBalance } from './types';

const dateFormatter = new Intl.DateTimeFormat('ar-SA', { day: 'numeric', month: 'short', year: 'numeric', calendar: 'gregory', timeZone: 'Asia/Riyadh' });
export function formatFinanceRecordDate(value: string | null): string {
  return value && Number.isFinite(Date.parse(value)) ? dateFormatter.format(new Date(value)) : 'غير محدد';
}
export function financeMatchesText(query: FinanceQuery, ...values: (string | number | null)[]): boolean {
  return !query.q || values.filter(value => value !== null).join(' ').toLocaleLowerCase('ar').includes(query.q.toLocaleLowerCase('ar'));
}
/** The accounting period is invoice.at; issuedAt remains the immutable issuance timestamp. */
export function financeInvoiceMatches(invoice: FinanceInvoice, query: FinanceQuery): boolean {
  return monthOfDate(invoice.at) === query.month
    && (!query.supplierId || invoice.source.suppliers.some(supplier => supplier.supplierId === query.supplierId))
    && (!query.status || invoice.status === query.status)
    && financeMatchesText(query, invoice.id, invoice.number, invoice.orderId, invoice.at, formatFinanceRecordDate(invoice.at), invoice.source.customerName, invoice.totalMinor / 100, invoice.source.suppliers.map(supplier => supplier.supplierName).join(' '));
}
export function financeSupplierMatches(supplier: SupplierBalance, query: FinanceQuery): boolean {
  return (!query.supplierId || supplier.id === query.supplierId) && financeMatchesText(query, supplier.id, supplier.name);
}
export function financeMovementMatches(movement: StatementMovement, query: FinanceQuery): boolean {
  return (!query.status || movement.status === query.status) && financeMatchesText(query, movement.id, movement.label, movement.orderId, movement.reference);
}

export const financeExportScope = 'يشمل التصدير القسم المعروض والمصرّح به فقط. تُصفّى صفوف التفاصيل مثل الشاشة؛ وتبقى إجماليات القسم محسوبة على مصادر الفترة.';

/** Request lists and exports share the same source and period filters. */
export function financeChangeMatches(request:FinanceChangeRequest,query:FinanceQuery,data:FinanceData):boolean {
  const kind=query.section==='returns'?'return':query.section==='tax'?'tax_settings':query.section==='close'?'reopen_period':null;
  const invoice=data.invoices.find(row=>row.id===request.targetId);
  return (!kind||request.kind===kind)
    && (request.kind==='reopen_period'?request.targetId===query.month:monthOfDate(request.at)===query.month)
    && (!query.status||request.status===query.status)
    && (!query.supplierId||Boolean(invoice?.source.suppliers.some(row=>row.supplierId===query.supplierId)))
    && financeMatchesText(query,request.id,request.targetId,request.reason,request.approvalReason,request.makerId,request.checkerId,request.at,formatFinanceRecordDate(request.at),request.result?.number??null,invoice?.number??null,invoice?.source.customerName??null,invoice?.source.suppliers.map(row=>row.supplierName).join(' ')??null);
}
