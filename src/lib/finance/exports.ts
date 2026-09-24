import type { FinanceInvoice, FinanceReport } from './types';
import { formatFinanceMoney, monthOfDate } from './reports';
import { financeExportScope, financeMatchesText, financeInvoiceMatches, financeMovementMatches, financeSupplierMatches,financeChangeMatches } from './filters';
export type FinanceSheet={name:string;headers:string[];rows:(string|number|null)[][]};
const money=(value:number|null)=>value===null?null:value/100;
export function financeExportSheets(report:FinanceReport):FinanceSheet[]{
  const {query,data}=report;
  return [
    {name:'ملخص',headers:['البند','المبلغ بالريال','التوضيح','المصدر'],rows:report.metrics.map(x=>[x.label,money(x.valueMinor),x.explanation,x.href])},
    {name:'الموردون',headers:['المورد','الرصيد الافتتاحي','المستحقات','المسدد','المتبقي','المعلق','المتأخر'],rows:report.suppliers.filter(x=>financeSupplierMatches(x,query)).map(x=>[x.name,money(x.openingMinor),money(x.accruedMinor),money(x.paidMinor),money(x.remainingMinor),money(x.pendingMinor),money(x.overdueMinor)])},
    {name:'الحركات',headers:['التاريخ','الحركة','له','عليه','الرصيد','المرجع','المصدر'],rows:report.movements.filter(x=>financeMovementMatches(x,query)).map(x=>[x.at,x.label,money(x.creditMinor),money(x.debitMinor),money(x.balanceMinor),x.reference,x.href])},
    {name:'الميزانية',headers:['البند','المخطط','الفعلي','الفرق','نسبة الصرف'],rows:report.budget.map(x=>[x.label,money(x.plannedMinor),money(x.actualMinor),money(x.differenceMinor),x.usagePercent])},
    {name:'المطابقة',headers:['الحالة','التوضيح','الفرق بالريال','المصدر'],rows:report.issues.map(x=>[x.severity==='error'?'يمنع الإقفال':'مراجعة',x.message,money(x.differenceMinor??null),x.href])},
    {name:'الفواتير',headers:['الرقم','الطلب','التاريخ','النوع','الحالة','قبل الضريبة','الضريبة','الإجمالي'],rows:data.invoices.filter(x=>financeInvoiceMatches(x,query)).map(x=>[x.number||x.id,x.orderId,x.at,x.kind,x.status,money(x.netMinor),money(x.vatMinor),money(x.totalMinor)])},
  ];
}
/** HTTP exports are scoped to one authorized section; the internal bundle is never sent wholesale. */
export function financeSectionExportSheets(report:FinanceReport):FinanceSheet[]{
  const {query,data}=report;
  const all=financeExportSheets(report);
  const select=(...names:string[])=>all.filter(sheet=>names.includes(sheet.name));
  switch(query.section){
    case 'overview':case 'cashflow':case 'month-end':return select('ملخص');
    case 'suppliers':case 'settlements':return select('الموردون','الحركات');
    case 'budget':return select('الميزانية');
    case 'invoices':return select('الفواتير');
    case 'reconciliation':return select('المطابقة');
    case 'returns':return [{name:'طلبات المرتجعات',headers:['الطلب المالي','الفاتورة الأصلية','التاريخ','الحالة','المنشئ','المراجع','السبب','إجمالي المرتجع','الضريبة','حصة المورد','الإشعار'],rows:(data.requests??[]).filter(row=>financeChangeMatches(row,query,data)).map(row=>[row.id,row.targetId,row.at,row.status,row.makerId,row.checkerId,row.reason,money(row.result?.totalMinor??null),money(row.result?.vatMinor??null),money(row.result?.supplierMinor??null),row.result?.number??null])}];
    case 'tax':return [{name:'الضريبة',headers:['البند','المبلغ بالريال','المصدر'],rows:report.metrics.filter(row=>row.key==='vat').map(row=>[row.label,money(row.valueMinor),row.href])},...select('الفواتير')];
    case 'expenses':return [{name:'المصروفات',headers:['التاريخ','المصروف','قبل الضريبة','الضريبة','الإجمالي','المدفوع','المرجع'],rows:data.expenses.filter(row=>monthOfDate(row.at)===query.month&&financeMatchesText(query,row.description,row.reference,row.id)).map(row=>{const sign=row.reversalOf?-1:1;return [row.at,row.description,money(sign*row.netMinor),money(sign*row.vatMinor),money(sign*row.totalMinor),money(sign*row.paidMinor),row.reference];})}];
    case 'ledger':return [{name:'سجل التدقيق',headers:['التاريخ','المستخدم','الإجراء','النوع','المستند','السبب'],rows:data.audit.filter(row=>monthOfDate(row.at)===query.month&&financeMatchesText(query,row.id,row.actorId,row.action,row.entityId,row.reason)).map(row=>[row.at,row.actorId,row.action,row.entity,row.entityId,row.reason])}];
    case 'close':return [];
  }
}
export function escapeFinanceHtml(value:unknown):string{return String(value??'غير مكتمل').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}
export function printableFinanceReport(report:FinanceReport):string{
  const sheets=financeSectionExportSheets(report);
  return printShell('تقرير تربح المالي — '+report.query.month,'<p>'+escapeFinanceHtml(financeExportScope)+'</p>'+sheets.map(sheet=>'<h2>'+escapeFinanceHtml(sheet.name)+'</h2><table><thead><tr>'+sheet.headers.map(h=>'<th>'+escapeFinanceHtml(h)+'</th>').join('')+'</tr></thead><tbody>'+sheet.rows.map(row=>'<tr>'+row.map(x=>'<td>'+escapeFinanceHtml(x)+'</td>').join('')+'</tr>').join('')+'</tbody></table>').join(''));
}
export function printableFinanceInvoice(invoice:FinanceInvoice,internal:boolean):string{
  const s=invoice.snapshot;
  const vatOff=s?.version===2&&s.vatControl?.enabled===false;
  const variantText=(value:unknown)=>{let row=value;if(typeof row==='string'){try{row=JSON.parse(row);}catch{return'';}}if(!row||typeof row!=='object'||Array.isArray(row))return'';const v=row as Record<string,unknown>,attrs=v.attributes&&typeof v.attributes==='object'&&!Array.isArray(v.attributes)?Object.entries(v.attributes as Record<string,unknown>).filter((entry):entry is [string,string]=>typeof entry[1]==='string'&&!!entry[1]).map(([key,text])=>key+': '+text):[];if(typeof v.vid==='string')attrs.unshift('VID: '+v.vid);if(typeof v.sku==='string')attrs.unshift('SKU: '+v.sku);return attrs.join(' · ');};
  const rows=s?s.lines.map(x=>[x.title+(variantText('variantSnapshot' in x?x.variantSnapshot:null)?'\n'+variantText('variantSnapshot' in x?x.variantSnapshot:null):''),x.quantity,formatFinanceMoney(x.netMinor),formatFinanceMoney(x.vatMinor),formatFinanceMoney(x.grossMinor)]):invoice.source.items.map(x=>[x.title+(variantText(x.variantSnapshot)?'\n'+variantText(x.variantSnapshot):''),x.quantity,'غير مكتمل','غير مكتمل',formatFinanceMoney(x.totalMinor)]);
  if(!s)rows.push(['الشحن المسجل ضمن إجمالي الطلب','—','غير مكتمل','غير مكتمل',formatFinanceMoney(invoice.source.shippingMinor)]);
  const parties=invoice.status==='cancelled'?'<p>مسودة ملغاة محفوظة للمراجعة — ليست فاتورة ضريبية مُصدرة، ولا يمكن اعتمادها.</p>':s?'<p>'+escapeFinanceHtml(s.issuer.name)+' — '+escapeFinanceHtml(s.issuer.address)+(vatOff?'':' — الرقم الضريبي: '+escapeFinanceHtml(s.issuer.taxNumber))+'</p>'+(vatOff?'<p>ضريبة القيمة المضافة غير مضافة على هذا المستند.</p>':''):'<p>بانتظار بيانات جهة الإصدار والسياسة الضريبية — ليس فاتورة ضريبية مُصدرة.</p>';
  const extra=internal?'<h2>مراجع داخلية</h2><p>مرجع المقبوض: '+escapeFinanceHtml(invoice.receiptId)+'</p><ul>'+invoice.source.suppliers.map(x=>'<li>'+escapeFinanceHtml(x.supplierName)+': '+escapeFinanceHtml(formatFinanceMoney(x.amountMinor))+'</li>').join('')+'</ul>':'';
  return printShell('تربح — '+(invoice.number||'سجل #'+invoice.id),parties+'<p>العميل: '+escapeFinanceHtml(s?.customer.name||invoice.source.customerName)+' — '+escapeFinanceHtml(s?.customer.address||'')+'</p><p>الطلب: '+escapeFinanceHtml(invoice.orderId)+' — التاريخ: '+escapeFinanceHtml(invoice.issuedAt || invoice.at)+'</p><table><thead><tr><th>المنتج</th><th>الكمية</th><th>'+(vatOff?'القيمة الصافية':'قبل الضريبة')+'</th><th>الضريبة</th><th>الإجمالي</th></tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+escapeFinanceHtml(x)+'</td>').join('')+'</tr>').join('')+'</tbody></table><p>إجمالي المستند: '+formatFinanceMoney(invoice.totalMinor)+' ريال سعودي</p><p>'+escapeFinanceHtml(invoice.reason)+'</p>'+extra);
}
function printShell(title:string,content:string):string{
  return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escapeFinanceHtml(title)+'</title><style>body{font:15px Tahoma,Arial;max-width:1120px;margin:32px auto;padding:24px;color:#16294a}h1{border-bottom:4px solid #f0b429;padding-bottom:16px}h2{margin-top:32px}table{border-collapse:collapse;width:100%;margin:16px 0}th,td{border:1px solid #ddd;text-align:right;padding:10px;overflow-wrap:anywhere;white-space:pre-line}th{background:#f6f3eb}p{line-height:1.9}.notice{background:#fff7df;padding:14px}@media print{body{margin:0;padding:0;font-size:10pt}.print-help{display:none}thead{display:table-header-group}tr{break-inside:avoid}h2{break-after:avoid}table{font-size:9pt}}</style></head><body><p class="print-help">للحفظ بصيغة PDF استخدم طباعة المتصفح ثم «حفظ كـ PDF».</p><h1>'+escapeFinanceHtml(title)+'</h1><p class="notice">الأرقام من السجلات المتاحة. «غير مكتمل» لا تعني صفرًا. الطباعة ليست اعتمادًا للفوترة الإلكترونية.</p>'+content+'</body></html>';
}
