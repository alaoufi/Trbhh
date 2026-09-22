import ExcelJS from 'exceljs';
import { prisma } from '@/lib/prisma';
import { requireFinance } from '@/lib/finance/permissions';
import { buildFinanceReport, parseFinanceQuery } from '@/lib/finance/reports';
import { readFinanceData } from '@/lib/finance/read-model';
import { readFinanceInvoice, customerInvoice } from '@/lib/finance/documents';
import { financeSectionExportSheets, printableFinanceInvoice, printableFinanceReport } from '@/lib/finance/exports';
import { recordFinanceExport } from '@/lib/finance/service';
import { accessActor, readActorAccess } from '@/lib/access-control/guards';
import { redactFinanceAudit } from '@/lib/finance/audit-visibility';
import { withFinanceAuditContext } from '@/lib/finance/audit-context';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  const url=new URL(request.url),format=url.searchParams.get('format');
  if(format!=='xlsx'&&format!=='print')return new Response('صيغة غير مدعومة',{status:400});
  const query=parseFinanceQuery(Object.fromEntries(url.searchParams));
  const invoiceId=url.searchParams.get('invoiceId');
  const session=await requireFinance(invoiceId?'invoices':query.section,'export');
  const actor=await accessActor(session);
  const auditExport=(month:string,target:string)=>withFinanceAuditContext({ip:actor.ip,sessionFingerprint:actor.sessionFingerprint},()=>recordFinanceExport(prisma,BigInt(session.uid),month,format,target));
  const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'; base-uri 'none'"};
  if(invoiceId){
    if(!/^[1-9]\d{0,14}$/.test(invoiceId)||format!=='print')return new Response('طلب غير صالح',{status:400});
    const invoice=await readFinanceInvoice(prisma,invoiceId);
    if(!invoice)return new Response('غير موجود',{status:404});
    await auditExport(invoice.at.slice(0,7),'invoice:'+invoiceId);
    const internal=url.searchParams.get('view')!=='customer';
    return new Response(printableFinanceInvoice(internal?invoice:customerInvoice(invoice),internal),{headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
  }
  const [access,data]=await Promise.all([readActorAccess(session.uid),readFinanceData(prisma)]);
  const report=buildFinanceReport(redactFinanceAudit(data,access.keys),query,new Date());
  await auditExport(query.month,query.section);
  if(format==='print')return new Response(printableFinanceReport(report),{headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
  const workbook=new ExcelJS.Workbook();workbook.creator='TRBHH';
  for(const sheet of financeSectionExportSheets(report)){
    const page=workbook.addWorksheet(sheet.name,{views:[{rightToLeft:true}]});
    page.addRow(sheet.headers);
    for(const row of sheet.rows)page.addRow(row); // Plain strings, never Excel formula objects.
    page.getRow(1).font={bold:true,color:{argb:'FF16294A'}};
    page.columns.forEach((column,index)=>{column.width=index===0?30:24;});
    page.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,page.rowCount),column:sheet.headers.length}};
  }
  const bytes=await workbook.xlsx.writeBuffer();
  return new Response(new Uint8Array(bytes),{headers:{...headers,'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="trbhh-finance-${query.month}.xlsx"`}});
}
