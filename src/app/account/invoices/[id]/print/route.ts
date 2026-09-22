import {requireUser} from '@/lib/auth';
import {prisma} from '@/lib/prisma';
import {readFinanceInvoice} from '@/lib/finance/documents';
import {printableFinanceInvoice} from '@/lib/finance/exports';
import {recordFinanceExport} from '@/lib/finance/service';
import {monthOfDate} from '@/lib/finance/reports';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  const session=await requireUser(),{id}=await params;
  if(!/^[1-9]\d{0,14}$/.test(id))return new Response('غير موجود',{status:404});
  const invoice=await readFinanceInvoice(prisma,id,session.uid);
  if(!invoice)return new Response('غير موجود',{status:404});
  await recordFinanceExport(prisma,BigInt(session.uid),monthOfDate(invoice.at),'print','customer-invoice:'+id);
  return new Response(printableFinanceInvoice(invoice,false),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'; base-uri 'none'"}});
}
