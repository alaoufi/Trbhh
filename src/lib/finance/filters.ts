import { monthOfDate } from './reports';
import type { FinanceInvoice, FinanceQuery, StatementMovement, SupplierBalance } from './types';

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

export const financeExportScope = 'يشمل التصدير جميع أوراق التقرير. تُصفّى صفوف الفواتير والموردين والحركات مثل الشاشة؛ تبقى إجماليات الشهر والمورد والميزانية والمطابقة كاملة.';
